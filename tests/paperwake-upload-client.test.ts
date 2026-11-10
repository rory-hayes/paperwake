import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {uploadDocuments} from '../src/lib/api';

type Call={url:string;method:string;headers:Headers;body:unknown};
function fixture(t:TestContext,handle:(call:Call)=>Response|Promise<Response>){
 const original=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');let workspace=`owned-${randomUUID()}`;
 const calls:Call[]=[];Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>workspace}});
 t.mock.method(globalThis,'fetch',async(url:string|URL,init:RequestInit={})=>{
  const call={url:String(url),method:init.method||'GET',headers:new Headers(init.headers),body:init.body};calls.push(call);
  if(call.url.startsWith('https:')){assert.match(call.url,/^https:\/\/owned\.supabase\.co\//);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(call.headers.has('X-Workspace-Id'),false);assert.equal(call.headers.get('x-upsert'),'false');}
  else{assert.ok(call.url.startsWith('/api/'));assert.equal(init.credentials,'same-origin');}
  if(call.url==='/api/uploads/config')return Response.json({strategy:'signed',maxBytes:10*1024*1024});
  return handle(call);
 });
 t.after(()=>{if(original)Object.defineProperty(globalThis,'sessionStorage',original);else Reflect.deleteProperty(globalThis,'sessionStorage');});
 return {calls,select:(value:string)=>{workspace=value;}};
}
const reservation=(id:string)=>Response.json({uploadId:id,uploadUrl:`https://owned.supabase.co/${id}`,expiresAt:new Date(Date.now()+10*60_000).toISOString()});
const receipt=(id='invoice')=>Response.json({document:{id},duplicate:false});
const unavailable=()=>Response.json({message:'Temporary verification failure'},{status:503});
const file=()=>new File([`owned file ${randomUUID()}`],'owned.pdf',{type:'application/pdf'});

test('a successful PUT resumes finalization without reserving or uploading the same bytes again',async t=>{
 let reservations=0,puts=0,finalizations=0;
 fixture(t,call=>{if(call.url.endsWith('/uploads')){reservations++;return reservation('first');}if(call.method==='PUT'){puts++;return new Response(null,{status:200});}assert.equal(call.url,'/api/uploads/first/finalize');return ++finalizations===1?unavailable():receipt();});
 const source=file(),first=await uploadDocuments('parser',[source]);assert.match(first.error||'',/Temporary verification failure/);
 const second=await uploadDocuments('parser',[source]);assert.equal(second.document?.id,'invoice');assert.deepEqual({reservations,puts,finalizations},{reservations:1,puts:1,finalizations:2});
});

test('a lost PUT acknowledgement still resolves through server byte verification',async t=>{
 let verifications=0;
 fixture(t,call=>{if(call.url.endsWith('/uploads'))return reservation('lost-ack');if(call.method==='PUT')throw new TypeError('Synthetic lost PUT response');assert.equal(call.url,'/api/uploads/lost-ack/finalize');verifications++;return receipt('verified-original');});
 const result=await uploadDocuments('parser',[file()]);assert.equal(result.document?.id,'verified-original');assert.equal(result.error,undefined);assert.equal(verifications,1);
});

test('an interrupted PUT retries the reused reservation while preserving a clear initial failure',async t=>{
 let reservations=0,puts=0;
 fixture(t,call=>{if(call.url.endsWith('/uploads')){reservations++;return reservation('same-reservation');}if(call.method==='PUT')return new Response(null,{status:++puts===1?503:200});assert.equal(call.url,'/api/uploads/same-reservation/finalize');return puts===1?unavailable():receipt();});
 const source=file();assert.match((await uploadDocuments('parser',[source])).error||'',/could not be uploaded/);assert.equal((await uploadDocuments('parser',[source])).document?.id,'invoice');assert.equal(reservations,2);assert.equal(puts,2);
});

test('an expired finalization receipt is replaced rather than retried forever',async t=>{
 let reservations=0,oldFinalizations=0;
 fixture(t,call=>{if(call.url.endsWith('/uploads'))return reservation(++reservations===1?'expired':'fresh');if(call.method==='PUT')return new Response(null,{status:200});if(call.url==='/api/uploads/expired/finalize')return ++oldFinalizations===1?unavailable():Response.json({message:'Reservation expired'},{status:410});assert.equal(call.url,'/api/uploads/fresh/finalize');return receipt('fresh-invoice');});
 const source=file();await uploadDocuments('parser',[source]);assert.equal((await uploadDocuments('parser',[source])).document?.id,'fresh-invoice');assert.equal(reservations,2);assert.equal(oldFinalizations,2);
});

test('cached finalization IDs cannot cross workspace or byte identity boundaries',async t=>{
 let reservations=0;const ids:string[]=[];
 const env=fixture(t,call=>{if(call.url.endsWith('/uploads'))return reservation(`scoped-${++reservations}`);if(call.method==='PUT')return new Response(null,{status:200});ids.push(call.url);return ids.length===1?unavailable():receipt();});
 const source=file();await uploadDocuments('parser',[source]);env.select('another-owned-workspace');await uploadDocuments('parser',[source]);await uploadDocuments('parser',[file()]);
 assert.equal(reservations,3);assert.deepEqual(ids,['/api/uploads/scoped-1/finalize','/api/uploads/scoped-2/finalize','/api/uploads/scoped-3/finalize']);
 assert.equal(env.calls.filter(call=>call.method==='POST'&&call.url.endsWith('/finalize'))[1].headers.get('X-Workspace-Id'),'another-owned-workspace');
});
