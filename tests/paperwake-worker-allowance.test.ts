import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {buildApp} from '../server/app.js';
import {adminPool,closeDatabase,withWorkspace} from '../server/core/db.js';
import {config} from '../server/core/config.js';
import {processOneCoreJob,setExtractionProvider} from '../server/core/worker.js';
import {setStorageForTests,type PrivateStorage} from '../server/core/storage.js';
import {assertPaperwakeTestDatabase} from './paperwake-test-database.js';
import {assertReservedInvoiceDispatch,InvoiceAllowancePaused} from '../server/core/worker-reservation-policy.js';
import {createOpenAIProvider} from '../server/core/openai-provider.js';
import {openAIExtraction} from '../server/core/openai-provider.js';
import {PDFDocument} from 'pdf-lib';
import {syntheticInvoicePdf} from '../server/core/invoice-sample.js';
import {createAIUsageObserver} from '../server/core/ai-usage.js';
import {AIProcessingPaused} from '../server/core/ai-cost-budget.js';

const environmentKeys=['STRIPE_MODE','FOLIO_BILLING_MOCK','PAPERWAKE_AI_TRIAL_MONTHLY_USD','PAPERWAKE_AI_PAID_MONTHLY_USD','PAPERWAKE_AI_GLOBAL_MONTHLY_USD'] as const;
const original=Object.fromEntries(environmentKeys.map(key=>[key,process.env[key]]));
const accounts:Array<{workspaceId:string;userId:string}>=[],objects=new Map<string,Buffer>();
let app:FastifyInstance,providerCalls=0;
const values={invoice_number:'0001042',supplier:'North Harbour Supplies Ltd',invoice_date:'2026-11-09',currency:'EUR',subtotal:'40.00',tax:'9.20',total:'49.20',line_items:[{product_code:'0012',description:'Printer paper, A4',quantity:'2',unit_price:'12.50',amount:'25.00'},{product_code:'0019',description:'Archive folders',quantity:'4',unit_price:'3.75',amount:'15.00'}]};
const storage:PrivateStorage={kind:'filesystem',async write(key,bytes){objects.set(key,Buffer.from(bytes));},async read(key){const bytes=objects.get(key);assert.ok(bytes);return Buffer.from(bytes);},async remove(key){objects.delete(key);}};
function mode(value:'mock'|'test'|'live'){
 process.env.STRIPE_MODE=value==='mock'?'test':value;
 process.env.FOLIO_BILLING_MOCK=value==='mock'?'true':'false';
}
function restoreEnvironment(){for(const key of environmentKeys)if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
function restoreProvider(){setExtractionProvider({configured:()=>true,async extract(){providerCalls++;return {engine:'ai',model:'owned-reservation-fixture',rawValues:structuredClone(values),normalizedValues:structuredClone(values),evidence:{},issues:[]};}});}
async function fixture(selected:'trial'|'mock'|'test'|'live'='trial'){
 mode(selected==='trial'?'test':selected);
 const signup=await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{name:'Owned reservation fixture',email:`reservation-${randomUUID()}@example.test`,password:'owned synthetic reservation password',workspaceName:'Owned reservation fixture',inviteCode:process.env.FOLIO_PREVIEW_INVITE_CODE}});
 assert.equal(signup.statusCode,201,signup.body);
 const account=signup.json(),workspaceId=account.workspace.id;accounts.push({workspaceId,userId:account.user.id});
 const headers={origin:config.origin,cookie:signup.cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')};
 if(selected!=='trial'){
  const plan={...account.workspace.plan,id:'standard',monthlyPages:500,billingMode:selected,subscriptionId:'sub_owned_reservation',periodStart:new Date(Date.now()-86400000).toISOString(),periodEnd:new Date(Date.now()+29*86400000).toISOString()};
  await adminPool.query('update workspaces set plan=$2 where id=$1',[workspaceId,JSON.stringify(plan)]);
 }
 const setup=await app.inject({method:'POST',url:'/api/invoices/setup',headers,payload:{}});assert.equal(setup.statusCode,200,setup.body);
 const intake=await app.inject({method:'POST',url:`/api/parsers/${setup.json().parser.id}/sample`,headers,payload:{}});assert.equal(intake.statusCode,202,intake.body);
 const {jobId,document}=intake.json();
 const reservation=(await adminPool.query('select * from usage_reservations where workspace_id=$1 and job_id=$2',[workspaceId,jobId])).rows[0];
 assert.equal(reservation.state,'reserved');assert.equal(reservation.billing_mode,selected==='trial'?null:selected);
 return {workspaceId,jobId,documentId:document.id,reservationId:reservation.id,allowanceKey:reservation.allowance_key,headers,parserId:setup.json().parser.id};
}
async function anotherTrial(f:Awaited<ReturnType<typeof fixture>>){
 const pdf=await PDFDocument.load(await syntheticInvoicePdf());pdf.setTitle(`Owned distinct trial ${randomUUID()}`);const bytes=Buffer.from(await pdf.save()),boundary=`owned-${randomUUID()}`;
 const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="trial.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 const uploaded=await app.inject({method:'POST',url:`/api/parsers/${f.parserId}/documents`,headers:{...f.headers,'content-type':`multipart/form-data; boundary=${boundary}`},payload});assert.equal(uploaded.statusCode,202,uploaded.body);
 const intake=uploaded.json(),reservation=(await adminPool.query('select * from usage_reservations where job_id=$1',[intake.jobId])).rows[0];assert.equal(reservation.allowance_kind,'trial');
 return {...f,jobId:intake.jobId,documentId:intake.document.id,reservationId:reservation.id,allowanceKey:reservation.allowance_key};
}
async function consumedTrialBudget(workspaceId:string){
 Object.assign(process.env,{PAPERWAKE_AI_TRIAL_MONTHLY_USD:'2',PAPERWAKE_AI_PAID_MONTHLY_USD:'25',PAPERWAKE_AI_GLOBAL_MONTHLY_USD:'10000'});
 for(let i=0;i<3;i++)await adminPool.query("insert into ai_usage_attempts(id,workspace_id,kind,operation_id,attempt) values($1,$2,'extraction',$3,1)",[randomUUID(),workspaceId,randomUUID()]);
}
async function state(f:Awaited<ReturnType<typeof fixture>>){
 const {rows:[job]}=await adminPool.query('select state,error,attempts from jobs where workspace_id=$1 and id=$2',[f.workspaceId,f.jobId]);
 const {rows:[reservation]}=await adminPool.query('select * from usage_reservations where id=$1',[f.reservationId]);
 const {rows:[counts]}=await adminPool.query(`select
  (select count(*)::int from extraction_runs where workspace_id=$1) as runs,
  (select count(*)::int from ai_usage_attempts where workspace_id=$1) as ai,
  (select coalesce(sum(pages),0)::int from usage_ledger where workspace_id=$1) as pages`,[f.workspaceId]);
 return {job,reservation,...counts};
}
async function rejectsDispatch(f:Awaited<ReturnType<typeof fixture>>,reservationPresent=true){
 const before=providerCalls;assert.equal(await processOneCoreJob(f.jobId),true);assert.equal(providerCalls,before);
 const actual=await state(f);assert.equal(actual.job.state,'failed');assert.equal(actual.job.attempts,1);assert.match(actual.job.error,/paused.*reserved allowance.*Contact support/);assert.doesNotMatch(actual.job.error,/reprocess/i);
 assert.equal(actual.runs,0);assert.equal(actual.ai,0);assert.equal(actual.pages,0);if(reservationPresent)assert.equal(actual.reservation.state,'released');
 assert.equal(await processOneCoreJob(f.jobId),false);
}
async function completes(f:Awaited<ReturnType<typeof fixture>>){
 const before=providerCalls;assert.equal(await processOneCoreJob(f.jobId),true);assert.equal(providerCalls,before+1);
 const actual=await state(f);assert.equal(actual.job.state,'completed');assert.equal(actual.reservation.state,'committed');assert.equal(actual.runs,1);assert.equal(actual.pages,1);
 assert.equal(await processOneCoreJob(f.jobId),false);return actual;
}
before(async()=>{
 await assertPaperwakeTestDatabase();setStorageForTests(storage);app=await buildApp({signupPolicy:()=>null});await app.ready();
 restoreProvider();
});
afterEach(restoreEnvironment);
after(async()=>{restoreEnvironment();setExtractionProvider(undefined);setStorageForTests(undefined);await app?.close();for(const account of accounts)await adminPool.query('delete from workspaces where id=$1',[account.workspaceId]);for(const account of accounts)await adminPool.query('delete from users where id=$1',[account.userId]);await closeDatabase();});

test('queued test and mock reservations cannot dispatch after live billing is selected',async()=>{
 for(const previous of ['test','mock'] as const){
  const f=await fixture(previous);mode('live');
  // Even an identically named current live subscription cannot relabel an old
  // reservation: its original billing mode is authoritative.
  await adminPool.query("update workspaces set plan=plan||'{\"billingMode\":\"live\"}'::jsonb where id=$1",[f.workspaceId]);
  await rejectsDispatch(f);
 }
});
test('queued live reservations cannot dispatch in a test or invalid billing environment',async()=>{
 const testMode=await fixture('live');mode('test');await rejectsDispatch(testMode);
 const invalid=await fixture('live');process.env.STRIPE_MODE='invalid';await rejectsDispatch(invalid);
});
test('legacy paid reservations with unknown mode fail closed without assuming the current plan mode',async()=>{
 const f=await fixture('test');await adminPool.query('update usage_reservations set billing_mode=null where id=$1',[f.reservationId]);await rejectsDispatch(f);
});
test('accepted paid work survives period rollover and commits to its original reservation',async()=>{
 const f=await fixture('test'),start=new Date(Date.now()-60*86400000),end=new Date(Date.now()-30*86400000),oldKey=`subscription:sub_owned_reservation:${start.toISOString()}`;
 await adminPool.query('update usage_reservations set period_start=$2,period_end=$3,allowance_key=$4 where id=$1',[f.reservationId,start,end,oldKey]);
 const actual=await completes(f);assert.equal(actual.reservation.allowance_key,oldKey);assert.equal(actual.reservation.billing_mode,'test');
});
test('accepted paid work survives cancellation without using the remaining trial allowance',async()=>{
 const f=await fixture('test');await adminPool.query("update workspaces set plan=plan-'subscriptionId'-'periodStart'-'periodEnd'||'{\"id\":\"explore\",\"monthlyPages\":10}'::jsonb where id=$1",[f.workspaceId]);
 const actual=await completes(f);assert.equal(actual.reservation.allowance_kind,'subscription');assert.equal(actual.reservation.allowance_key,f.allowanceKey);
 assert.equal((await adminPool.query("select count(*)::int n from usage_reservations where workspace_id=$1 and allowance_key='trial'",[f.workspaceId])).rows[0].n,0);
});
test('accepted trial work remains usable across a billing mode change',async()=>{
 const f=await fixture();mode('live');const actual=await completes(f);assert.equal(actual.reservation.billing_mode,null);assert.equal(actual.reservation.allowance_kind,'trial');
});
test('missing and page-mismatched reservations cannot authorize provider work',async()=>{
 const missing=await fixture();await adminPool.query('delete from usage_reservations where id=$1',[missing.reservationId]);await rejectsDispatch(missing,false);
 const mismatch=await fixture();await adminPool.query('update usage_reservations set pages=2 where id=$1',[mismatch.reservationId]);await rejectsDispatch(mismatch);
});
test('a reservation pointing at a different owned document cannot authorize the job',async()=>{
 const a=await fixture(),b=await fixture();await adminPool.query('update usage_reservations set document_id=$2 where id=$1',[a.reservationId,b.documentId]);await rejectsDispatch(a);
 const other=await state(b);assert.equal(other.job.state,'queued');assert.equal(other.reservation.state,'reserved');
});
test('an expired or replaced worker lease cannot authorize provider dispatch',async()=>{
 const f=await fixture(),leaseOwner=randomUUID(),identity={workspaceId:f.workspaceId,jobId:f.jobId,documentId:f.documentId,leaseOwner};
 await adminPool.query("update jobs set state='processing',attempts=1,lease_owner=$2,lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.jobId,leaseOwner]);
 await assert.rejects(withWorkspace(f.workspaceId,c=>assertReservedInvoiceDispatch(c,identity)),InvoiceAllowancePaused);
 await adminPool.query("update jobs set lease_until=clock_timestamp()+interval '120 seconds',lease_owner=$2 where id=$1",[f.jobId,randomUUID()]);
 await assert.rejects(withWorkspace(f.workspaceId,c=>assertReservedInvoiceDispatch(c,identity)),InvoiceAllowancePaused);
 await adminPool.query('update jobs set lease_owner=$2 where id=$1',[f.jobId,leaseOwner]);
 await withWorkspace(f.workspaceId,c=>assertReservedInvoiceDispatch(c,identity));
 const actual=await state(f);assert.equal(actual.pages,0);assert.equal(actual.ai,0);assert.equal(actual.runs,0);assert.equal(actual.reservation.state,'reserved');
});
test('the final dispatch check blocks a billing mode change after the initial allowance check',async t=>{
 const f=await fixture('test'),read=storage.read.bind(storage);let httpCalls=0;
 const changed=t.mock.method(storage,'read',async(key:string,maxBytes?:number)=>{const bytes=await read(key,maxBytes);mode('live');return bytes;});
 setExtractionProvider(createOpenAIProvider({apiKey:'owned-synthetic-key',fetch:(async()=>{httpCalls++;throw new Error('A blocked dispatch must not reach provider HTTP.');}) as typeof fetch}));
 try{
  assert.equal(await processOneCoreJob(f.jobId),true);assert.equal(httpCalls,0);
  const actual=await state(f);assert.equal(actual.job.state,'failed');assert.match(actual.job.error,/reserved allowance.*Contact support/);assert.equal(actual.runs,0);assert.equal(actual.pages,0);assert.equal(actual.reservation.state,'released');
  // The already recorded dispatch intent stays conservatively reserved. A
  // failed authority recheck is never grounds to erase cost audit history.
  assert.equal(actual.ai,1);
  const {rows:[intent]}=await adminPool.query('select outcome,cost_usd from ai_usage_attempts where workspace_id=$1',[f.workspaceId]);assert.equal(intent.outcome,'interrupted');assert.equal(intent.cost_usd,null);
 }finally{changed.mock.restore();restoreProvider();}
});
test('the real adapter retains paid cost capacity for accepted canceled work without lending it to a trial job',async()=>{
 const paid=await fixture('test');await adminPool.query("update workspaces set plan=plan-'subscriptionId'-'periodStart'-'periodEnd'||'{\"id\":\"explore\",\"monthlyPages\":10}'::jsonb where id=$1",[paid.workspaceId]);
 const trial=await anotherTrial(paid);await consumedTrialBudget(paid.workspaceId);let httpCalls=0;
 setExtractionProvider(createOpenAIProvider({apiKey:'owned-synthetic-key',fetch:(async()=>{
  httpCalls++;return Response.json({id:'resp_owned_paid_grant',model:openAIExtraction.model,status:'completed',output:[{type:'message',status:'completed',content:[{type:'output_text',text:JSON.stringify({rawValues:{...values,invoice_date:'9 November 2026'},evidence:[],invoiceAssessment:{documentType:'supplier_invoice',sourceLineItemCount:2,allPagesRead:true}})}]}],usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}});
 }) as typeof fetch}));
 try{
  assert.equal(await processOneCoreJob(trial.jobId),true);assert.equal(httpCalls,0,'A trial cannot borrow another queued paid grant in its workspace');
  const blocked=(await adminPool.query('select state,error from jobs where id=$1',[trial.jobId])).rows[0];assert.equal(blocked.state,'failed');assert.match(blocked.error,/processing-cost review/);
  assert.equal((await adminPool.query('select state from usage_reservations where id=$1',[trial.reservationId])).rows[0].state,'released');
  assert.equal(await processOneCoreJob(paid.jobId),true);assert.equal(httpCalls,1);
  const actual=await state(paid);assert.equal(actual.job.state,'completed');assert.equal(actual.reservation.state,'committed');assert.equal(actual.reservation.allowance_kind,'subscription');assert.equal(actual.runs,1);assert.equal(actual.pages,1);assert.equal(actual.ai,4);
  const {rows:[intent]}=await adminPool.query('select outcome,usage_state,cost_usd from ai_usage_attempts where workspace_id=$1 and operation_id=$2',[paid.workspaceId,paid.jobId]);assert.equal(intent.outcome,'response_received');assert.equal(intent.usage_state,'reported_priced');assert.ok(Number(intent.cost_usd)>0);
 }finally{restoreProvider();}
});
test('paid cost grant requires the exact current operation, reservation mode, document pages and live attempt',async()=>{
 const f=await fixture('test');await adminPool.query("update workspaces set plan='{\"id\":\"explore\",\"monthlyPages\":10}'::jsonb where id=$1",[f.workspaceId]);await consumedTrialBudget(f.workspaceId);
 const leaseOwner=randomUUID();await adminPool.query("update jobs set state='processing',attempts=1,lease_owner=$2,lease_until=clock_timestamp()+interval '120 seconds' where id=$1",[f.jobId,leaseOwner]);
 const denied=async(change:Partial<{kind:'extraction'|'schema_suggestion';operationId:string;attempt:number}>={})=>{
  const observer=createAIUsageObserver({workspaceId:f.workspaceId,kind:'extraction',operationId:f.jobId,attempt:1,...change});
  try{await assert.rejects(observer.start(),(error:unknown)=>error instanceof AIProcessingPaused&&error.reason==='workspace_budget');}finally{await observer.finish();}
 };
 await denied({operationId:randomUUID()});await denied({attempt:2});await denied({kind:'schema_suggestion'});
 await adminPool.query("update usage_reservations set billing_mode='live' where id=$1",[f.reservationId]);await denied();
 await adminPool.query('update usage_reservations set billing_mode=null where id=$1',[f.reservationId]);await denied();
 await adminPool.query("update usage_reservations set billing_mode='test',pages=2 where id=$1",[f.reservationId]);await denied();
 await adminPool.query('update usage_reservations set pages=1 where id=$1',[f.reservationId]);
 await adminPool.query("update jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.jobId]);await denied();
 await adminPool.query("update jobs set lease_until=clock_timestamp()+interval '120 seconds' where id=$1",[f.jobId]);
 const accepted=createAIUsageObserver({workspaceId:f.workspaceId,kind:'extraction',operationId:f.jobId,attempt:1});await accepted.start();await accepted.finish();
 assert.equal((await state(f)).ai,4,'Only the matching saved paid dispatch creates an additional cost reservation');
});
