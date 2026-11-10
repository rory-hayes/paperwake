import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {adminPool,closeDatabase,withWorkspace} from '../server/core/db.js';
import {assertPaperwakeTestDatabase} from './paperwake-test-database.js';
import {createAIUsageObserver} from '../server/core/ai-usage.js';
import {AIProcessingPaused,aiCostBudgetPolicy,configuredAICostBudgets} from '../server/core/ai-cost-budget.js';
import {createOpenAIProvider} from '../server/core/openai-provider.js';
import type {AIUsageObservation} from '../shared/ai-usage.js';
import {buildApp} from '../server/app.js';
import {config} from '../server/core/config.js';
import {processOneCoreJob,setExtractionProvider} from '../server/core/worker.js';
import {setStorageForTests,type PrivateStorage} from '../server/core/storage.js';
import {readPageUsage} from '../server/core/usage-allowance.js';

const keys=['PAPERWAKE_AI_TRIAL_MONTHLY_USD','PAPERWAKE_AI_PAID_MONTHLY_USD','PAPERWAKE_AI_GLOBAL_MONTHLY_USD'] as const;
const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
const owned=new Set<string>(),users=new Set<string>();
function budgets(trial='2',paid='25',global='10000'){for(const [index,key] of keys.entries())process.env[key]=[trial,paid,global][index];}
function restore(){for(const key of keys)if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
async function workspace(plan='explore'){const id=randomUUID();owned.add(id);await adminPool.query('insert into workspaces(id,name,slug,plan) values($1,$2,$3,$4)',[id,'Owned Paperwake cost fixture',`cost-${id}`,JSON.stringify({id:plan})]);return id;}
const observer=(workspaceId:string,operationId=randomUUID(),attempt=1)=>createAIUsageObserver({workspaceId,kind:'extraction',operationId,attempt});
const read=async(id:string)=>(await adminPool.query('select * from ai_usage_attempts where id=$1',[id])).rows[0];
function paused(reason:AIProcessingPaused['reason']){return (error:unknown)=>{assert.ok(error instanceof AIProcessingPaused);assert.equal(error.reason,reason);assert.equal(error.permanent,true);assert.match(error.message,/paused.*support/i);return true;};}
const facts:AIUsageObservation={model:aiCostBudgetPolicy.model,requestId:'req_owned_fixture',responseId:'resp_owned_fixture',httpStatus:200,responseStatus:'incomplete',usageState:'reported_priced',inputTokens:100,cachedInputTokens:20,outputTokens:10,reasoningTokens:2,costUsd:0.0001065,pricingBasis:aiCostBudgetPolicy.pricingBasis};
async function providerCall(workspaceId:string,counter:{value:number}){
 const usageObserver=observer(workspaceId);
 const provider=createOpenAIProvider({apiKey:'synthetic-test-only',fetch:(async()=>{counter.value++;throw new Error('Owned transport must not be reached');}) as typeof fetch});
 try{return await provider.extract({bytes:Buffer.from('Identifier: owned'),mimeType:'text/plain',pages:[{page:1,text:'Identifier: owned'}],schema:{fields:[{key:'identifier',label:'Identifier',type:'string'}]},instructions:'',locale:'en-IE',usageObserver});}finally{await usageObserver.finish();}
}
before(assertPaperwakeTestDatabase);
afterEach(async()=>{for(const id of owned)await adminPool.query('delete from workspaces where id=$1',[id]);owned.clear();for(const id of users)await adminPool.query('delete from users where id=$1',[id]);users.clear();restore();});
after(async()=>{restore();await closeDatabase();});

test('cost budgets default conservatively and reject unbounded, fractional-cent or malformed configuration',()=>{
 assert.deepEqual(configuredAICostBudgets({}),{trialUsd:'2',paidUsd:'25',globalUsd:'100'});
 for(const key of keys)for(const value of ['','0','0.99','-1','Infinity','NaN','1e3',' 2','2 ','1.001','10001'])assert.throws(()=>configuredAICostBudgets({[key]:value}),paused('configuration'));
 assert.deepEqual(configuredAICostBudgets({PAPERWAKE_AI_TRIAL_MONTHLY_USD:'1.01',PAPERWAKE_AI_PAID_MONTHLY_USD:'1000',PAPERWAKE_AI_GLOBAL_MONTHLY_USD:'10000'}),{trialUsd:'1.01',paidUsd:'1000',globalUsd:'10000'});
 assert.ok((aiCostBudgetPolicy.maxInputTokens*Number(aiCostBudgetPolicy.inputPerMillion)+aiCostBudgetPolicy.maxOutputTokens*Number(aiCostBudgetPolicy.outputPerMillion))/1e6<Number(aiCostBudgetPolicy.reserveUsd));
});

test('concurrent dispatches reserve atomically and cannot overspend one workspace',async()=>{
 budgets();const id=await workspace(),attempts=Array.from({length:6},()=>observer(id));
 const results=await Promise.allSettled(attempts.map(item=>item.start()));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
 for(const result of results)if(result.status==='rejected')paused('workspace_budget')(result.reason);
 assert.equal((await adminPool.query('select count(*)::int count from ai_usage_attempts where workspace_id=$1',[id])).rows[0].count,2);
 await Promise.all(attempts.map(item=>item.finish()));
 await assert.rejects(observer(id).start(),paused('workspace_budget'));
});

test('the global UTC-month cap spans different workspaces under simultaneous admission',async()=>{
 budgets('25','25');
 // Allow exactly two new dollars above existing fixture costs. Never delete
 // another suite's data; the serial runner prevents concurrent fixture writes.
 const {rows}=await adminPool.query("select * from ai_usage_attempts where created_at>=date_trunc('month',clock_timestamp(),'UTC')");
 const baseline=rows.reduce((sum,row)=>{
  const expected=Number((((Number(row.input_tokens)-Number(row.cached_input_tokens))*0.75+Number(row.cached_input_tokens)*0.075+Number(row.output_tokens)*4.5)/1e6).toFixed(9));
  const verified=row.usage_state==='reported_priced'&&row.model===aiCostBudgetPolicy.model&&row.pricing_basis===aiCostBudgetPolicy.pricingBasis&&Number(row.input_tokens)<=400_000&&Number(row.output_tokens)<=16_000&&Number(row.cost_usd)===expected;
  return sum+(verified?Number(row.cost_usd):Math.max(1,Number(row.cost_usd)));
 },0);
 assert.ok(baseline<9990);process.env.PAPERWAKE_AI_GLOBAL_MONTHLY_USD=(Math.ceil(baseline*100)/100+2).toFixed(2);
 const ids=await Promise.all(Array.from({length:5},()=>workspace()));
 const attempts=ids.map(id=>observer(id)),results=await Promise.allSettled(attempts.map(item=>item.start()));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2,'The installation admits only its remaining two reserved dollars');
 for(const result of results)if(result.status==='rejected')paused('global_budget')(result.reason);
 await Promise.all(attempts.map(item=>item.finish()));
});

test('paid and trial workspaces use their own configured caps',async()=>{
 budgets('1','2');const trial=await workspace(),paid=await workspace('standard');
 for(const id of [trial,paid]){const first=observer(id);await first.start();await first.finish();}
 await assert.rejects(observer(trial).start(),paused('workspace_budget'));
 const second=observer(paid);await second.start();await second.finish();await assert.rejects(observer(paid).start(),paused('workspace_budget'));
});

test('only verified returned prices settle reservations; failed output remains priced and unknown attempts retain a dollar',async()=>{
 budgets('1.01');const id=await workspace(),priced=observer(id);await priced.start();await priced.observe(facts);await priced.finish();
 const second=observer(id),secondId=await second.start();await second.finish();
 assert.equal((await read(secondId)).cost_usd,null);await assert.rejects(observer(id).start(),paused('workspace_budget'));
 // A genuine late priced response can settle interrupted intent once, without
 // repeating HTTP. Output success is irrelevant to provider spend.
 await second.observe({...facts,responseId:'resp_late_fixture'});assert.equal((await read(secondId)).outcome,'response_received');
 const third=observer(id);await third.start();await third.finish();
});

test('unknown prices, mismatched rates and mathematically inconsistent prices never release reserved capacity',async()=>{
 budgets('1');
 for(const change of [{pricingBasis:'Unknown pricing basis'},{costUsd:0},{model:'unpriced-model'},{inputTokens:400_001},{costUsd:2}] as Partial<AIUsageObservation>[]){
  const id=await workspace(),attempt=observer(id);await attempt.start();await attempt.observe({...facts,...change});await attempt.finish();await assert.rejects(observer(id).start(),paused('workspace_budget'));
 }
});

test('previous UTC-month attempts roll off without erasing history; current-month attempts still block',async()=>{
 budgets('1');const id=await workspace();
 const old=randomUUID();await adminPool.query("insert into ai_usage_attempts(id,workspace_id,kind,operation_id,attempt,created_at) values($1,$2,'extraction',$3,1,date_trunc('month',clock_timestamp(),'UTC')-interval '1 second')",[old,id,randomUUID()]);
 const current=observer(id);await current.start();await current.finish();assert.ok(await read(old));await assert.rejects(observer(id).start(),paused('workspace_budget'));
});

test('budget or ledger failure sends no provider HTTP request and creates no successful admission',async t=>{
 budgets('1');const id=await workspace(),first=observer(id);await first.start();await first.finish();const calls={value:0};
 await assert.rejects(providerCall(id,calls),paused('workspace_budget'));assert.equal(calls.value,0);
 process.env.PAPERWAKE_AI_TRIAL_MONTHLY_USD='not-a-budget';await assert.rejects(providerCall(id,calls),paused('configuration'));assert.equal(calls.value,0);
 budgets('2');const connection=t.mock.method(adminPool,'connect',async()=>{throw new Error('Owned unavailable ledger fixture');});
 try{await assert.rejects(providerCall(id,calls),paused('ledger'));assert.equal(calls.value,0);}finally{connection.mock.restore();}
});

test('worker pauses permanently without page charge; deleting its document cannot clear consumed AI reservations',async()=>{
 budgets('1');const objects=new Map<string,Buffer>();
 const storage:PrivateStorage={kind:'filesystem',async write(key,bytes){objects.set(key,Buffer.from(bytes));},async read(key){const bytes=objects.get(key);assert.ok(bytes);return Buffer.from(bytes);},async remove(key){objects.delete(key);}};
 setStorageForTests(storage);const app=await buildApp({signupPolicy:()=>null});let calls=0;
 setExtractionProvider(createOpenAIProvider({apiKey:'owned-test-only',fetch:(async()=>{calls++;throw new Error('Budget-blocked provider must not run');}) as typeof fetch}));
 try{
  await app.ready();const signup=await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{name:'Owned budget fixture',email:`budget-${randomUUID()}@example.test`,password:'owned synthetic budget test password',workspaceName:'Owned budget fixture',inviteCode:process.env.FOLIO_PREVIEW_INVITE_CODE}});assert.equal(signup.statusCode,201,signup.body);
  const account=signup.json();owned.add(account.workspace.id);users.add(account.user.id);const headers={origin:config.origin,cookie:signup.cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')};
  const setup=await app.inject({method:'POST',url:'/api/invoices/setup',headers,payload:{}});assert.equal(setup.statusCode,200,setup.body);
  const intake=await app.inject({method:'POST',url:`/api/parsers/${setup.json().parser.id}/sample`,headers,payload:{}});assert.equal(intake.statusCode,202,intake.body);
  const jobId=intake.json().jobId,documentId=intake.json().document.id,previous=observer(account.workspace.id,jobId,99),previousId=await previous.start();await previous.finish();
  assert.equal(await processOneCoreJob(jobId),true);assert.equal(calls,0);assert.equal(await processOneCoreJob(jobId),false);
  const {rows:[job]}=await adminPool.query('select state,attempts,error from jobs where id=$1',[jobId]);assert.equal(job.state,'failed');assert.equal(job.attempts,1);assert.match(job.error,/paused.*support/i);
  const usage=await withWorkspace(account.workspace.id,c=>readPageUsage(c,account.workspace.id,account.workspace.plan));assert.equal(usage.pages,0);assert.equal(usage.reservedPages,0);
  const removed=await app.inject({method:'DELETE',url:`/api/documents/${documentId}`,headers});assert.equal(removed.statusCode,200,removed.body);assert.ok(await read(previousId));
  await assert.rejects(observer(account.workspace.id).start(),paused('workspace_budget'));assert.equal(calls,0);
 }finally{setExtractionProvider(undefined);setStorageForTests(undefined);await app.close();}
});
