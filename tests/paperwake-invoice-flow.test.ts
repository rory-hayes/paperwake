import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import type {FastifyInstance} from 'fastify';
import {buildApp} from '../server/app.js';
import {adminPool,closeDatabase,withWorkspace} from '../server/core/db.js';
import {config} from '../server/core/config.js';
import {processOneCoreJob,setExtractionProvider} from '../server/core/worker.js';
import {setStorageForTests,type PrivateStorage} from '../server/core/storage.js';
import {syntheticInvoicePdf} from '../server/core/invoice-sample.js';
import {normalizeValue} from '../server/core/extraction.js';
import {validateValues} from '../server/core/schema.js';
import {readPageUsage} from '../server/core/usage-allowance.js';
import {normalizationPolicy} from '../shared/source-formats.js';

type Account={user:{id:string};workspace:{id:string};cookie:string};
const accounts:Account[]=[],objects=new Map<string,Buffer>();
let app:FastifyInstance,owner:Account,other:Account,viewer:Account,parserId:string,documentId:string,run:any;
let observedError:Error|undefined;
let providerMode:'valid'|'overflow'|'empty'|'transient'='valid',providerCalls=0;
const raw={invoice_number:'0001042',supplier:'North Harbour Supplies Ltd',invoice_date:'9 November 2026',currency:'EUR',subtotal:'40.00',tax:'9.20',total:'49.20',line_items:[{product_code:'0012',description:'Printer paper, A4',quantity:'2',unit_price:'12.50',amount:'25.00'},{product_code:'0019',description:'Archive folders',quantity:'4',unit_price:'3.75',amount:'15.00'}]};
const storage:PrivateStorage={kind:'supabase',async write(key,bytes){objects.set(key,Buffer.from(bytes));},async read(key,maxBytes=config.maxBytes){const bytes=objects.get(key);if(!bytes)throw new Error('Missing owned fixture');if(bytes.length>maxBytes)throw Object.assign(new Error('File exceeds size'),{statusCode:413});return Buffer.from(bytes);},async remove(key){objects.delete(key);},async signUpload(key){return `https://owned-paperwake-fixture.invalid/upload/${key}`;}};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function request(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:unknown,account=owner){return app.inject({method,url,headers:{origin:config.origin,cookie:account.cookie},payload:payload as any});}
async function signup(name:string){const response=await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{name,email:`paperwake-${name}-${randomUUID()}@example.test`,password:'owned paperwake fixture password',workspaceName:`Owned Paperwake ${name}`,inviteCode:process.env.FOLIO_PREVIEW_INVITE_CODE}});assert.equal(response.statusCode,201,response.body);const account={...response.json(),cookie:response.cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')};accounts.push(account);return account as Account;}
async function pdf(label:string,pages=1,blank=false){const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica);for(let i=0;i<pages;i++){const page=document.addPage();if(!blank)page.drawText(`Supplier invoice ${label} - page ${i+1} - synthetic example only`,{x:35,y:750,size:12,font});}return Buffer.from(await document.save());}
async function upload(bytes:Buffer,name='owned-invoice.pdf',account=owner){const boundary=`paperwake-${randomUUID()}`,payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);return app.inject({method:'POST',url:`/api/parsers/${parserId}/documents`,headers:{origin:config.origin,cookie:account.cookie,'content-type':`multipart/form-data; boundary=${boundary}`},payload});}
async function usage(){return withWorkspace(owner.workspace.id,async client=>{const plan=(await client.query('select plan from workspaces where id=$1',[owner.workspace.id])).rows[0].plan;return readPageUsage(client,owner.workspace.id,plan);});}
async function processUpload(uploadResponse:any){assert.equal(uploadResponse.statusCode,202,uploadResponse.body);const intake=uploadResponse.json();assert.ok(intake.jobId);assert.equal(await processOneCoreJob(intake.jobId),true);return intake;}
before(async()=>{
 setStorageForTests(storage);app=await buildApp({signupPolicy:()=>null});app.addHook('onError',async(_request,_reply,error)=>{observedError=error;});await app.ready();owner=await signup('owner');other=await signup('other');viewer=await signup('viewer');
 await adminPool.query("insert into memberships(workspace_id,user_id,role) values($1,$2,'viewer')",[owner.workspace.id,viewer.user.id]);await adminPool.query('update sessions set workspace_id=$2 where user_id=$1',[viewer.user.id,owner.workspace.id]);
 setExtractionProvider({configured:()=>true,async extract(input){providerCalls++;if(providerMode==='transient'){providerMode='valid';throw Object.assign(new Error('Owned temporary provider failure'),{permanent:false});}const rawValues=providerMode==='empty'?{...raw,invoice_number:null,line_items:[]}:providerMode==='overflow'?{...raw,line_items:Array.from({length:101},()=>raw.line_items[0])}:structuredClone(raw);const normalizedValues=Object.fromEntries(input.schema.fields.map(field=>[field.key,normalizeValue((rawValues as any)[field.key],field,input.locale,input.timezone,normalizationPolicy)]));return {engine:'ai',model:'owned-deterministic-invoice-fixture',rawValues,normalizedValues,evidence:{},issues:validateValues(normalizedValues,input.schema),tokenUsage:{},costUsd:0};}});
});
after(async()=>{setExtractionProvider(undefined);setStorageForTests(undefined);await app?.close();for(const account of accounts){await adminPool.query('delete from workspaces where id=$1',[account.workspace.id]);await fs.rm(path.join(config.storageDir,account.workspace.id),{recursive:true,force:true});}for(const account of accounts)await adminPool.query('delete from users where id=$1',[account.user.id]);await closeDatabase();});

test('setup is idempotent under concurrency and generic workflows stay unavailable',async()=>{
 const replies=await Promise.all(Array.from({length:4},()=>request('POST','/api/invoices/setup',{})));for(const response of replies)assert.equal(response.statusCode,200,response.body);parserId=replies[0].json().parser.id;assert.ok(replies.every(response=>response.json().parser.id===parserId));
 assert.equal((await adminPool.query('select count(*)::int count from parsers where workspace_id=$1',[owner.workspace.id])).rows[0].count,1);assert.equal(replies[0].json().schema.invoiceVersion,1);
 for(const [method,url] of [['POST','/api/parsers'],['PATCH',`/api/parsers/${parserId}`],['GET','/api/workspace/api-keys'],['POST','/api/workspaces'],['POST',`/api/parsers/${parserId}/pdf-splits`]] as const)assert.equal((await request(method,url,{})).statusCode,404,url);
 assert.equal((await app.inject({method:'GET',url:'/api/documents',headers:{authorization:'Bearer owned-disabled-key'}})).statusCode,403);
 assert.equal((await request('POST','/api/invoices/setup',{},viewer)).statusCode,403);
});
test('invalid and oversized PDFs create no documents, jobs or page usage',async()=>{
 const before=await usage();
 for(const [bytes,name,status] of [[Buffer.from('plain text'),'fake.pdf',415],[await syntheticInvoicePdf(),'invoice.txt',415],[await pdf('blank',1,true),'blank.pdf',415],[await pdf('six',6),'six.pdf',413],[Buffer.from('%PDF-broken'),'broken.pdf',400]] as const){const response=await upload(bytes,name);assert.equal(response.statusCode,status,response.body);}
 const oversized=await upload(Buffer.alloc(config.maxBytes+1),'too-large.pdf');assert.equal(oversized.statusCode,413,oversized.body);
 const boundary=`paperwake-batch-${randomUUID()}`,sample=await syntheticInvoicePdf(),parts=Array.from({length:11},(_,index)=>Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="invoice-${index}.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),sample,Buffer.from('\r\n')]));
 const batch=await app.inject({method:'POST',url:`/api/parsers/${parserId}/documents`,headers:{origin:config.origin,cookie:owner.cookie,'content-type':`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([...parts,Buffer.from(`--${boundary}--\r\n`)])});assert.equal(batch.statusCode,413,`${batch.body} ${observedError?.message}`);
 assert.equal((await adminPool.query('select count(*)::int count from documents where workspace_id=$1',[owner.workspace.id])).rows[0].count,0);assert.deepEqual(await usage(),before);
 const bytes=await syntheticInvoicePdf(),reserve={filename:'sample.pdf',size:bytes.length,sha256:hash(bytes)};
 assert.equal((await request('POST',`/api/parsers/${parserId}/uploads`,{...reserve,bankLocale:'en-US'})).statusCode,400);
 assert.equal((await request('POST',`/api/parsers/${parserId}/uploads`,{...reserve,pdfSplit:{requestId:randomUUID()}})).statusCode,400);
 assert.equal((await request('POST',`/api/parsers/${parserId}/uploads`,{...reserve,size:config.maxBytes+1})).statusCode,400);
});
test('actual PDF intake, duplicate detection and extraction produce one reserved then committed page',async()=>{
 const accepted=await upload(await syntheticInvoicePdf());assert.equal(accepted.statusCode,202,accepted.body);const intake=accepted.json();documentId=intake.document.id;
 const pending=await usage();assert.equal(pending.pages,0);assert.equal(pending.reservedPages,1);
 const duplicate=await upload(await syntheticInvoicePdf());assert.equal(duplicate.statusCode,202,duplicate.body);assert.equal(duplicate.json().duplicate,true);assert.equal(duplicate.json().document.id,documentId);assert.equal(providerCalls,0);
 assert.equal(await processOneCoreJob(intake.jobId),true);assert.equal(await processOneCoreJob(intake.jobId),false);assert.equal(providerCalls,1);
 const detail=await request('GET',`/api/documents/${documentId}`);assert.equal(detail.statusCode,200,detail.body);run=detail.json().runs[0];assert.equal(run.effectiveValues.invoice_number,'0001042');assert.equal(run.effectiveValues.total,'49.20');assert.equal(run.effectiveValues.line_items[0].product_code,'0012');
 const completed=await usage();assert.equal(completed.pages,1);assert.equal(completed.reservedPages,0);
 const sample=await request('POST',`/api/parsers/${parserId}/sample`,{});assert.equal(sample.statusCode,202,sample.body);assert.equal(sample.json().duplicate,true);
});
test('tenant boundaries and viewer permissions protect originals, corrections and approvals',async()=>{
 for(const suffix of ['', '/original','/original-url'])assert.equal((await request('GET',`/api/documents/${documentId}${suffix}`,undefined,other)).statusCode,404);
 assert.equal((await request('GET',`/api/runs/${run.id}`,undefined,other)).statusCode,404);
 assert.equal((await request('POST',`/api/runs/${run.id}/corrections`,{values:run.effectiveValues,expectedRevision:run.effectiveRevision},viewer)).statusCode,403);
 assert.equal((await request('POST',`/api/runs/${run.id}/approve`,{expectedRevision:run.effectiveRevision},other)).statusCode,404);
 assert.equal((await request('POST','/api/documents/bulk',{ids:[documentId],action:'reprocess'})).statusCode,400);
});
test('mandatory saved revisions fence correction and approval; exact edited values reach CSV snapshots',async()=>{
 assert.equal((await request('POST','/api/exports',{documentIds:[documentId],format:'csv'})).statusCode,400);
 assert.equal((await request('POST',`/api/runs/${run.id}/corrections`,{values:run.effectiveValues})).statusCode,400);
 assert.equal((await request('POST',`/api/runs/${run.id}/approve`,{})).statusCode,400);
 const corrected={...run.effectiveValues,invoice_number:'0009007199254740993',supplier:'=formula supplier',subtotal:'9007199254740993.10',tax:'0.00',total:'9007199254740993.10',line_items:[{product_code:'000023',description:'Large exact decimal fixture',quantity:'1.00',unit_price:'9007199254740993.10',amount:'9007199254740993.10'}]};
 const saved=await request('POST',`/api/runs/${run.id}/corrections`,{values:corrected,expectedRevision:run.effectiveRevision});assert.equal(saved.statusCode,200,saved.body);assert.deepEqual(saved.json().issues,[]);
 assert.equal((await request('POST',`/api/runs/${run.id}/corrections`,{values:corrected,expectedRevision:run.effectiveRevision})).statusCode,409);assert.equal((await request('POST',`/api/runs/${run.id}/approve`,{expectedRevision:run.effectiveRevision})).statusCode,409);
 const approved=await request('POST',`/api/runs/${run.id}/approve`,{expectedRevision:saved.json().run.effectiveRevision});assert.equal(approved.statusCode,200,approved.body);run=approved.json().run;
 for(const format of ['xlsx','json'])assert.equal((await request('POST','/api/exports',{documentIds:[documentId],format})).statusCode,400);
 assert.equal((await request('POST','/api/exports',{documentIds:[documentId],format:'csv',columns:[{source:'private',label:'Private'}]})).statusCode,400);
 const exported=await request('POST','/api/exports',{documentIds:[documentId],format:'csv'});assert.equal(exported.statusCode,200,exported.body);
 const download=await request('GET',exported.json().downloadUrl);assert.equal(download.statusCode,200);assert.ok(download.body.includes('"0009007199254740993"'));assert.ok(download.body.includes('"9007199254740993.10"'));assert.ok(download.body.includes('"000023"'));assert.ok(download.body.includes('"\'=formula supplier"'));
 assert.equal((await request('GET',exported.json().downloadUrl,undefined,other)).statusCode,404);
 const later=await request('POST',`/api/runs/${run.id}/corrections`,{values:{...corrected,invoice_number:'000-next'},expectedRevision:run.effectiveRevision});assert.equal(later.statusCode,200,later.body);assert.equal((await request('POST','/api/exports',{documentIds:[documentId],format:'csv'})).statusCode,400);assert.equal((await request('GET',exported.json().downloadUrl)).body,download.body);
 assert.equal((await usage()).pages,1);
});
test('CSV mapping saves replace one preference rather than create duplicates',async()=>{
 const input={parserId,name:'Paperwake invoice CSV',lineItems:'line_items',columns:[{source:'invoice_number',label:'Reference'},{source:'$item.product_code',label:'SKU'}]};
 const first=await request('POST','/api/export-mappings',input),second=await request('POST','/api/export-mappings',{...input,columns:[{source:'total',label:'Invoice total'}]});assert.equal(first.statusCode,200,first.body);assert.equal(second.statusCode,200,second.body);assert.equal(first.json().id,second.json().id);assert.equal((await request('GET','/api/export-mappings')).json().mappings.length,1);
 assert.equal((await request('POST','/api/export-mappings',{...input,columns:[{source:'outside',label:'Outside'}]})).statusCode,400);
});
test('reconciliation warnings preserve stated values and require a persisted revision-bound acknowledgement',async()=>{
 const initial=(await request('GET',`/api/documents/${documentId}`)).json().runs[0];let revision=initial.effectiveRevision;
 const base={...initial.effectiveValues,currency:'EUR',subtotal:'100.00',tax:'23.00',total:'123.00',line_items:[{product_code:'0001',description:'Declared source item',quantity:'1',unit_price:'100.00',amount:'100.00'}]};
 const cases=[{values:{...base,total:'133.00'},codes:['total']},{values:{...base,subtotal:'90.00',tax:'20.70',total:'110.70'},codes:['line_total']},{values:{...base,subtotal:'50.00',tax:'0.00',total:'50.00',line_items:[{...base.line_items[0],quantity:'2',unit_price:'50.00',amount:'50.00'}]},codes:['line_quantity_total']},{values:{...base,subtotal:null,tax:null,total:'100.00',line_items:[{...base.line_items[0],unit_price:'40.00',amount:'40.00'}]},codes:['reconciliation_incomplete']}];
 for(const fixture of cases){
  const saved=await request('POST',`/api/runs/${initial.id}/corrections`,{values:fixture.values,expectedRevision:revision});assert.equal(saved.statusCode,200,saved.body);revision=saved.json().run.effectiveRevision;assert.deepEqual(saved.json().issues.map((issue:any)=>issue.code).sort(),fixture.codes);assert.ok(saved.json().issues.every((issue:any)=>issue.severity==='warning'));
  assert.equal((await request('POST',`/api/runs/${initial.id}/approve`,{expectedRevision:revision,warningCodes:[]})).statusCode,422);
  const approved=await request('POST',`/api/runs/${initial.id}/approve`,{expectedRevision:revision,acknowledgeInvoiceWarnings:true});assert.equal(approved.statusCode,200,approved.body);assert.deepEqual(approved.json().approval.values,fixture.values);
  const audit=(await adminPool.query("select metadata from audit_events where workspace_id=$1 and action='run.approved' and metadata->>'approvalId'=$2",[owner.workspace.id,approved.json().approval.id])).rows[0].metadata;assert.equal(audit.invoiceReview.revision,revision);assert.deepEqual(audit.invoiceReview.warningCodes,fixture.codes);assert.equal(audit.invoiceReview.acknowledged,true);assert.ok(Number.isFinite(new Date(audit.invoiceReview.acknowledgedAt).getTime()));
 }
 const previous=revision,saved=await request('POST',`/api/runs/${initial.id}/corrections`,{values:{...base,currency:null},expectedRevision:revision});assert.equal(saved.statusCode,200,saved.body);revision=saved.json().run.effectiveRevision;
 assert.equal((await request('POST',`/api/runs/${initial.id}/approve`,{expectedRevision:previous,acknowledgeInvoiceWarnings:true})).statusCode,409);
 assert.equal((await request('POST',`/api/runs/${initial.id}/approve`,{expectedRevision:revision,acknowledgeInvoiceWarnings:true})).statusCode,422);
});
test('signed uploads bind bytes and ownership before immutable invoice intake',async()=>{
 const bytes=await pdf('signed'),reservation=await request('POST',`/api/parsers/${parserId}/uploads`,{filename:'signed.pdf',size:bytes.length,sha256:hash(bytes)});assert.equal(reservation.statusCode,201,reservation.body);const uploadId=reservation.json().uploadId,row=(await adminPool.query('select * from direct_uploads where id=$1',[uploadId])).rows[0];objects.set(row.storage_key,bytes);
 assert.equal((await request('POST',`/api/uploads/${uploadId}/finalize`,{},other)).statusCode,404);assert.equal((await request('POST',`/api/uploads/${uploadId}/finalize`,{},viewer)).statusCode,403);
 const finalized=await request('POST',`/api/uploads/${uploadId}/finalize`,{});assert.equal(finalized.statusCode,202,finalized.body);assert.notEqual(finalized.json().document.storageKey,row.storage_key);const replay=await request('POST',`/api/uploads/${uploadId}/finalize`,{});assert.equal(replay.statusCode,202,replay.body);assert.equal(replay.json().document.id,finalized.json().document.id);assert.equal(replay.json().replayed,true);
 await processOneCoreJob(finalized.json().jobId);assert.equal((await usage()).pages,2);
});
test('overflow and unusable extraction fail without partial result or charge; transient retry commits once',async()=>{
 for(const mode of ['overflow','empty'] as const){providerMode=mode;const intake=await processUpload(await upload(await pdf(mode)));const state=(await adminPool.query('select state from jobs where id=$1',[intake.jobId])).rows[0].state;assert.equal(state,'failed');assert.equal((await adminPool.query('select id from extraction_runs where job_id=$1',[intake.jobId])).rowCount,0);assert.equal((await usage()).pages,2);assert.equal((await usage()).reservedPages,0);}
 providerMode='transient';const intake=await processUpload(await upload(await pdf('retry')));assert.equal((await usage()).pages,2);assert.equal((await usage()).reservedPages,1);await adminPool.query('update jobs set available_at=now() where id=$1',[intake.jobId]);assert.equal(await processOneCoreJob(intake.jobId),true);assert.equal((await usage()).pages,3);assert.equal((await usage()).reservedPages,0);assert.equal((await adminPool.query('select id from usage_ledger where document_id=$1',[intake.document.id])).rowCount,1);
});
