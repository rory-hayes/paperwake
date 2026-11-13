/** Explicit, local-only live acceptance. Calls the running app/worker; never installs a provider double. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {config} from '../server/core/config.js';
import {adminPool,closeDatabase} from '../server/core/db.js';
import {invoiceSchema,invoiceDefaultColumns} from '../shared/invoice.js';

const args=process.argv.slice(2);
assert.ok(args.includes('--execute'),'Pass --execute to spend a small amount on real OpenAI extraction of owned synthetic PDFs.');
const base=new URL(args.find(arg=>arg.startsWith('--base-url='))?.slice(11)??'http://127.0.0.1:4328');
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&!base.username&&!base.password,'This harness only targets a local Paperwake app.');
const id=randomUUID(),directory=path.resolve('.local/live-invoice-acceptance',id),deadline=Date.now()+15*60_000;
let workspaceId:string|undefined,userId:string|undefined,cookie='';
type Values={invoice_number:string;supplier:string;invoice_date:string|null;currency:string|null;subtotal:string;tax:string;total:string;line_items:{product_code:string;description:string;quantity:string;unit_price:string;amount:string}[]};
type Fixture={name:string;type:'supported'|'rejected'|'missing_currency'|'ambiguous_date'|'adjustment';pages:number;bytes:Buffer;expected:Values};
const report:any={version:1,id,startedAt:new Date().toISOString(),baseUrl:base.origin,syntheticOnly:true,providerDoubles:false,maximumBudgetUsd:3,checks:[],fixtures:[],failures:[],costBasis:'Persisted provider-reported token usage priced at the configured model rates; not a settled provider invoice.'};
const writeReport=()=>fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function api(method:string,url:string,body?:unknown,timeoutMs=60_000){
 const headers:Record<string,string>={origin:config.origin,...(cookie?{cookie}:{})};
 if(body!==undefined&&!(body instanceof FormData))headers['content-type']='application/json';
 const response=await fetch(new URL(url,base),{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
 const bytes=Buffer.from(await response.arrayBuffer());let value:any;try{value=JSON.parse(bytes.toString());}catch{value=undefined;}
 return {status:response.status,value,bytes,cookies:response.headers.getSetCookie().map(value=>value.split(';')[0])};
}
async function costs(){
 if(!workspaceId)return {usd:0,unknown:0,attempts:[]};
 const attempts=(await adminPool.query('select kind,operation_id,attempt,outcome,model,http_status,response_status,usage_state,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,cost_usd,pricing_basis from ai_usage_attempts where workspace_id=$1 order by created_at,id',[workspaceId])).rows;
 return {usd:attempts.reduce((sum,row)=>sum+Number(row.cost_usd??0),0),unknown:attempts.filter(row=>row.usage_state!=='reported_priced').length,attempts};
}
async function makeFixture(name:string,rowCount:number,perPage:number,type:Fixture['type']='supported',heading='SUPPLIER INVOICE'):Promise<Fixture>{
 const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica),bold=await document.embedFont(StandardFonts.HelveticaBold),pages=Math.ceil(rowCount/perPage);
 document.setTitle(`Paperwake synthetic acceptance ${name}`);document.setAuthor('Paperwake synthetic acceptance');
 const amount=(rowCount===100?'1.10':'10.00'),subtotal=(rowCount===100?'110.00':`${rowCount*10}.00`),tax=(rowCount===100?'25.30':(rowCount*2.3).toFixed(2)),total=(rowCount===100?'135.30':(rowCount*12.3).toFixed(2));
 const expected:Values={invoice_number:`000042-${name.toUpperCase()}`,supplier:'North Harbour Supplies Ltd',invoice_date:type==='ambiguous_date'?null:'2026-11-09',currency:type==='missing_currency'?null:'EUR',subtotal,tax,total:type==='adjustment'?(Number(total)+10).toFixed(2):total,line_items:Array.from({length:rowCount},(_,index)=>({product_code:String(index+1).padStart(6,'0'),description:`Stock item ${String(index+1).padStart(3,'0')}`,quantity:'1',unit_price:amount,amount}))};
 for(let index=0;index<pages;index++){
  const page=document.addPage([595,842]);const text=(value:string,x:number,y:number,size=11,strong=false)=>page.drawText(value,{x,y,size,font:strong?bold:font,color:rgb(.1,.15,.2)});
  text('SYNTHETIC TEST DOCUMENT - fictional data only',35,810,9);text(heading,35,780,17,true);
  text(`Supplier: ${expected.supplier}`,35,750);text(`${heading==='CREDIT NOTE'?'Credit note number':heading==='PURCHASE ORDER'?'Purchase order number':'Invoice number'}: ${expected.invoice_number}`,35,730);
  text(type==='ambiguous_date'?'Invoice date: 03/04/2026':'Document date: 9 November 2026',35,710);if(expected.currency)text(`Currency: ${expected.currency}`,350,710);
  text(`Page ${index+1} of ${pages}`,450,780,10);text('Product code',35,680,10,true);text('Description',120,680,10,true);text('Qty',350,680,10,true);text('Unit price',405,680,10,true);text('Amount',500,680,10,true);
  const rows=expected.line_items.slice(index*perPage,(index+1)*perPage);
  rows.forEach((row,offset)=>{const y=656-offset*19;for(const [value,x] of [[row.product_code,35],[row.description,120],[row.quantity,350],[row.unit_price,405],[row.amount,500]] as const)text(value,x,y,10);});
  if(index===pages-1){const y=656-rows.length*19-20;text(`Subtotal: ${subtotal}`,390,y);text(`Tax: ${tax}`,390,y-20);if(type==='adjustment')text('Shipping: 10.00',390,y-40);text(`Total: ${expected.total}`,390,y-(type==='adjustment'?60:40),12,true);}
  else text('Continued on the next page. Repeated headings are not line items.',35,90,9);
  if(heading==='PURCHASE ORDER')text('Purchase order only. This is not an invoice or a request for payment.',35,48,9);
  if(heading==='CREDIT NOTE')text('Credit note: refund for returned goods. This reduces an earlier invoice.',35,48,9);
 }
 return {name,type,pages,expected,bytes:Buffer.from(await document.save({useObjectStreams:false}))};
}
function differences(actual:any,expected:Values){
 const differences:string[]=[];
 for(const field of invoiceSchema.fields.filter(field=>field.key!=='line_items'))if(actual?.[field.key]!==expected[field.key as keyof Values])differences.push(`${field.key}: expected ${JSON.stringify(expected[field.key as keyof Values])}, got ${JSON.stringify(actual?.[field.key])}`);
 if(!Array.isArray(actual?.line_items)){differences.push('line_items is not an array');return differences;}
 if(actual.line_items.length!==expected.line_items.length)differences.push(`line_items count: expected ${expected.line_items.length}, got ${actual.line_items.length}`);
 expected.line_items.forEach((row,index)=>{for(const field of Object.keys(row) as (keyof typeof row)[])if(actual.line_items[index]?.[field]!==row[field])differences.push(`line_items[${index}].${field}: expected ${JSON.stringify(row[field])}, got ${JSON.stringify(actual.line_items[index]?.[field])}`);});
 return differences;
}
function expectedCsv(values:Values){
 const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
 return '\uFEFF'+[invoiceDefaultColumns.map(column=>column.label),...values.line_items.map(row=>invoiceDefaultColumns.map(column=>column.source.startsWith('$item.')?row[column.source.slice(6) as keyof typeof row]:values[column.source as keyof Values]))].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
async function waitForDocument(documentId:string){
 while(Date.now()<deadline){
  const response=await api('GET',`/api/documents/${documentId}`);assert.equal(response.status,200,'Owned document should remain readable');
  const job=response.value.jobs[0];if(job&&['completed','failed'].includes(job.state))return response.value;
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw new Error('Live acceptance exceeded its bounded deadline. Owned jobs are retained for inspection.');
}
try{
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const identity=(await adminPool.query('select current_database() as database')).rows[0];assert.equal(identity.database,'paperwake_local','Refuse to read any unrelated or hosted database');
 let health:Awaited<ReturnType<typeof api>>|undefined;
 for(let attempt=0;attempt<20;attempt++){try{health=await api('GET','/api/health',undefined,1000);if(health.status===200)break;}catch{/* Local dev reloads may briefly close the listener before startup. */}await new Promise(resolve=>setTimeout(resolve,1000));}
 assert.equal(health?.status,200,'The local Paperwake API did not become ready within the bounded startup window');assert.equal(health.value.name,'MaintainFlow');
 const password=randomBytes(24).toString('base64url'),email=`paperwake-live-${id}@example.test`;
 const signup=await api('POST','/api/auth/register',{name:'Owned live invoice acceptance',email,password,workspaceName:`Synthetic invoice acceptance ${id.slice(0,8)}`,inviteCode:process.env.FOLIO_PREVIEW_INVITE_CODE});assert.equal(signup.status,201,'Live fixture signup must succeed without changing server auth settings');
 cookie=signup.cookies.join('; ');workspaceId=signup.value.workspace.id;userId=signup.value.user.id;report.workspaceId=workspaceId;report.userId=userId;
 const setup=await api('POST','/api/invoices/setup',{});assert.equal(setup.status,200);const parserId=setup.value.parser.id;
 const baselineFixtures=[await makeFixture('multipage',6,3),await makeFixture('boundary100',100,25),await makeFixture('purchaseorder',2,2,'rejected','PURCHASE ORDER'),await makeFixture('creditnote',2,2,'rejected','CREDIT NOTE'),await makeFixture('currencyabsent',2,2,'missing_currency')];
 const guardFixtures=[await makeFixture('ambiguousdate',2,2,'ambiguous_date'),await makeFixture('shipping',2,2,'adjustment')];
 const fixtures=args.includes('--guards-only')?guardFixtures:[...baselineFixtures,...guardFixtures];
 for(const fixture of fixtures){
  const before=await costs();assert.equal(before.unknown,0,'Stop additional model spending when an earlier attempt has unknown usage');assert.ok(before.usd+1.25<3,'Keep headroom below the authorized $3 maximum');
  await fs.writeFile(path.join(directory,fixture.name+'.pdf'),fixture.bytes,{mode:0o600});
  const form=new FormData();form.append('files',new Blob([new Uint8Array(fixture.bytes)],{type:'application/pdf'}),fixture.name+'.pdf');
  const upload=await api('POST',`/api/parsers/${parserId}/documents`,form);assert.equal(upload.status,202,`Upload failed for synthetic fixture ${fixture.name}`);assert.ok(upload.value.jobId);assert.equal(upload.value.duplicate,false);
  const record:any={name:fixture.name,expectedOutcome:fixture.type,pages:fixture.pages,sourceSha256:sha(fixture.bytes),documentId:upload.value.document.id,jobId:upload.value.jobId,expectedRows:fixture.expected.line_items.length};report.fixtures.push(record);await writeReport();
  const detail=await waitForDocument(record.documentId),job=detail.jobs[0],run=detail.runs[0];record.jobState=job.state;record.attempts=job.attempts;record.error=job.error;record.model=run?.model;record.promptVersion=run?.promptVersion;record.runId=run?.id;
  if(fixture.type==='rejected'){
   record.passed=job.state==='failed'&&!run&&/not one supported supplier invoice|not supported yet/i.test(job.error??'');
  }else if(job.state==='completed'&&run){
   record.differences=differences(run.effectiveValues,fixture.expected);record.actualRows=run.effectiveValues.line_items?.length;record.validationIssues=run.validationIssues;record.providerIssues=run.issues;
   await fs.writeFile(path.join(directory,fixture.name+'-result.json'),JSON.stringify({raw:run.rawValues,normalized:run.effectiveValues,evidence:run.evidence,validationIssues:run.validationIssues,providerIssues:run.issues},null,2)+'\n',{mode:0o600});
   let approval=await api('POST',`/api/runs/${run.id}/approve`,{expectedRevision:run.effectiveRevision});record.approvalStatus=approval.status;
   if(fixture.type==='ambiguous_date'){record.passed=record.differences.length===0&&run.effectiveValues.invoice_date===null&&approval.status===422&&run.issues.some((issue:any)=>['invoice_date_ambiguous','invoice_date_unverified'].includes(issue.code));}
   else if(fixture.type==='missing_currency')record.passed=record.differences.length===0&&run.effectiveValues.currency===null&&approval.status===422&&run.validationIssues.some((issue:any)=>issue.field==='currency'&&issue.code==='required');
   else{
    if(fixture.type==='adjustment'){record.unacknowledgedBlocked=approval.status===422;approval=await api('POST',`/api/runs/${run.id}/approve`,{expectedRevision:run.effectiveRevision,acknowledgeInvoiceWarnings:true});record.acknowledgedStatus=approval.status;record.audit=(await adminPool.query("select metadata from audit_events where workspace_id=$1 and action='run.approved' and metadata->>'approvalId'=$2",[workspaceId,approval.value?.approval?.id??''])).rows[0]?.metadata?.invoiceReview;}
    record.passed=record.differences.length===0&&approval.status===200&&(fixture.type!=='adjustment'||record.unacknowledgedBlocked&&record.audit?.revision===run.effectiveRevision&&record.audit?.warningCodes?.includes('total'));
    if(approval.status===200){const exported=await api('POST','/api/exports',{format:'csv',documentIds:[record.documentId],revisions:[{documentId:record.documentId,approvalId:approval.value.approval.id}]});assert.equal(exported.status,200);const downloaded=await api('GET',exported.value.downloadUrl);assert.equal(downloaded.status,200);await fs.writeFile(path.join(directory,fixture.name+'.csv'),downloaded.bytes,{mode:0o600});record.csvMatchesExpected=downloaded.bytes.toString()===expectedCsv(fixture.expected);record.passed&&=record.csvMatchesExpected;record.exportId=exported.value.id;}
   }
  }else record.passed=false;
  const after=await costs();record.providerCostUsd=Number((after.usd-before.usd).toFixed(9));record.pricedProviderAttempts=after.attempts.filter(row=>row.operation_id===record.jobId);record.reservations=(await adminPool.query('select pages,state from usage_reservations where workspace_id=$1 and job_id=$2',[workspaceId,record.jobId])).rows;
  if(fixture.type==='rejected')record.passed&&=record.reservations.length===1&&record.reservations[0].state==='released';
  if(!record.passed)report.failures.push(fixture.name);report.totalCostUsd=after.usd;await writeReport();
  console.log(JSON.stringify({fixture:record.name,passed:record.passed,state:record.jobState,rows:record.actualRows??null,costUsd:record.providerCostUsd,reason:record.error??null,differences:record.differences??[]}));
 }
 report.costs=await costs();report.allowance=(await api('GET','/api/workspace/usage')).value.usage;report.passed=report.failures.length===0;report.completedAt=new Date().toISOString();assert.ok(report.costs.usd<3,'Live fixture spending exceeded the explicit cap');
}catch(error){report.passed=false;report.failures.push(error instanceof Error?error.message:'Unknown acceptance error');process.exitCode=1;}
finally{
 report.completedAt??=new Date().toISOString();report.totalCostUsd=(await costs().catch(()=>({usd:report.totalCostUsd??null}))).usd;await writeReport();await closeDatabase();
 console.log(JSON.stringify({passed:report.passed,report:path.join(directory,'report.json'),workspaceId,totalCostUsd:report.totalCostUsd,failures:report.failures}));if(!report.passed)process.exitCode=1;
}
