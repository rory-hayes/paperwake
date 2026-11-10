import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {buildApp} from '../server/app.js';
import {adminPool,closeDatabase,withWorkspace} from '../server/core/db.js';
import {config} from '../server/core/config.js';
import {setStorageForTests,type PrivateStorage} from '../server/core/storage.js';
import {syntheticInvoicePdf} from '../server/core/invoice-sample.js';
import {assertPaperwakeTestDatabase} from './paperwake-test-database.js';

type Account={user:{id:string};workspace:{id:string};cookie:string;parserId:string};
const accounts:Account[]=[],objects=new Map<string,Buffer>();
let app:FastifyInstance,bytes:Buffer,failSign=false;
const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const storage:PrivateStorage={kind:'supabase',async write(key,value){objects.set(key,Buffer.from(value));},async read(key,maxBytes=config.maxBytes){const value=objects.get(key);if(!value)throw Object.assign(new Error('Owned object not received yet'),{statusCode:503});if(value.length>maxBytes)throw Object.assign(new Error('Owned object exceeds size'),{statusCode:413});return Buffer.from(value);},async remove(key){objects.delete(key);},async signUpload(key){if(failSign){failSign=false;throw Object.assign(new Error('Owned signature temporarily unavailable'),{statusCode:503});}return `https://owned-upload.supabase.co/staging/${key}`;}};
async function request(account:Account,url:string,payload:unknown={}){return app.inject({method:'POST',url,headers:{origin:config.origin,cookie:account.cookie},payload:payload as any});}
async function account(limit=1){
 const response=await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{name:'Owned upload recovery',email:`upload-${randomUUID()}@example.test`,password:'owned upload recovery fixture password',workspaceName:'Owned upload recovery'}});
 assert.equal(response.statusCode,201,response.body);
 const result:Account={...response.json(),cookie:response.cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; '),parserId:''};accounts.push(result);
 await adminPool.query("update workspaces set plan=jsonb_set(plan,'{monthlyPages}',$2::jsonb) where id=$1",[result.workspace.id,JSON.stringify(limit)]);
 const setup=await request(result,'/api/invoices/setup');assert.equal(setup.statusCode,200,setup.body);result.parserId=setup.json().parser.id;return result;
}
async function reserve(owner:Account,value=bytes){return request(owner,`/api/parsers/${owner.parserId}/uploads`,{filename:'owned-invoice.pdf',size:value.length,sha256:sha(value)});}
async function reservation(owner:Account,id:string){return withWorkspace(owner.workspace.id,async c=>(await c.query('select * from direct_uploads where id=$1',[id])).rows[0]);}
async function stage(owner:Account,id:string,value=bytes){objects.set((await reservation(owner,id)).storage_key,Buffer.from(value));}
async function finalize(owner:Account,id:string){return request(owner,`/api/uploads/${id}/finalize`);}
async function counts(owner:Account){return withWorkspace(owner.workspace.id,async c=>(await c.query(`select (select count(*)::int from documents where workspace_id=$1) documents,(select count(*)::int from jobs where workspace_id=$1) jobs,(select count(*)::int from direct_uploads where workspace_id=$1) uploads,(select coalesce(sum(pages),0)::int from usage_reservations where workspace_id=$1 and state<>'released') pages`,[owner.workspace.id])).rows[0]);}

before(async()=>{await assertPaperwakeTestDatabase();setStorageForTests(storage);app=await buildApp({signupPolicy:()=>null});await app.ready();bytes=await syntheticInvoicePdf();});
after(async()=>{setStorageForTests(undefined);await app?.close();for(const owned of accounts)await adminPool.query('delete from workspaces where id=$1',[owned.workspace.id]);for(const owned of accounts)await adminPool.query('delete from users where id=$1',[owned.user.id]);await closeDatabase();});

test('interrupted PUT reuses the same final-page reservation and extends capability cleanup safely',async()=>{
 const owner=await account(),first=await reserve(owner);assert.equal(first.statusCode,201,first.body);const id=first.json().uploadId;
 assert.equal((await finalize(owner,id)).statusCode,503);
 await adminPool.query("update direct_uploads set cleanup_after=now()+interval '1 hour' where id=$1",[id]);
 const retry=await reserve(owner);assert.equal(retry.statusCode,201,retry.body);assert.equal(retry.json().uploadId,id);assert.equal(retry.json().reused,true);
 assert.ok(new Date((await reservation(owner,id)).cleanup_after).getTime()>Date.now()+2*60*60_000);
 await stage(owner,id);const received=await finalize(owner,id);assert.equal(received.statusCode,202,received.body);
 assert.deepEqual(await counts(owner),{documents:1,jobs:1,uploads:1,pages:1});
 const replay=await finalize(owner,id);assert.equal(replay.statusCode,202,replay.body);assert.equal(replay.json().replayed,true);assert.equal(replay.json().document.id,received.json().document.id);
});

test('expired pending reservations do not block a new same-file upload or revive their receipt',async()=>{
 const owner=await account(),first=await reserve(owner),oldId=first.json().uploadId;
 await adminPool.query("update direct_uploads set expires_at=now()-interval '1 second' where id=$1",[oldId]);
 const next=await reserve(owner);assert.equal(next.statusCode,201,next.body);assert.notEqual(next.json().uploadId,oldId);assert.equal(next.json().reused,false);
 assert.equal((await finalize(owner,oldId)).statusCode,410);await stage(owner,next.json().uploadId);assert.equal((await finalize(owner,next.json().uploadId)).statusCode,202);
});

test('duplicates at exhausted quota require actual matching bytes before the existing receipt is returned',async()=>{
 const owner=await account(),initial=await reserve(owner),id=initial.json().uploadId;await stage(owner,id);const first=await finalize(owner,id);assert.equal(first.statusCode,202,first.body);
 const duplicate=await reserve(owner);assert.equal(duplicate.statusCode,201,duplicate.body);const duplicateId=duplicate.json().uploadId;assert.notEqual(duplicateId,id);
 assert.equal((await finalize(owner,duplicateId)).statusCode,503,'A claimed hash alone cannot return the prior document');
 const wrong=Buffer.from(bytes);wrong[wrong.length-1]^=1;await stage(owner,duplicateId,wrong);assert.equal((await finalize(owner,duplicateId)).statusCode,400);
 const valid=await reserve(owner);assert.equal(valid.statusCode,201,valid.body);await stage(owner,valid.json().uploadId);const receipt=await finalize(owner,valid.json().uploadId);
 assert.equal(receipt.statusCode,202,receipt.body);assert.equal(receipt.json().duplicate,true);assert.equal(receipt.json().document.id,first.json().document.id);
 const totals=await counts(owner);assert.equal(totals.documents,1);assert.equal(totals.jobs,1);assert.equal(totals.pages,1);
 const another=Buffer.concat([bytes,Buffer.from('\n% different invoice bytes')]);assert.equal((await reserve(owner,another)).statusCode,429);
 const foreign=await account();assert.equal((await request(foreign,`/api/parsers/${owner.parserId}/uploads`,{filename:'owned-invoice.pdf',size:bytes.length,sha256:sha(bytes)})).statusCode,404);
});

test('concurrent same-file reservations coalesce while different files cannot oversubscribe the last slot',async()=>{
 const owner=await account();const same=await Promise.all(Array.from({length:4},()=>reserve(owner)));assert.ok(same.every(response=>response.statusCode===201));assert.equal(new Set(same.map(response=>response.json().uploadId)).size,1);assert.equal((await counts(owner)).uploads,1);
 const separate=await account(),changed=Buffer.concat([bytes,Buffer.from('\n% distinct file')]);const responses=await Promise.all([reserve(separate),reserve(separate,changed)]);
 assert.deepEqual(responses.map(response=>response.statusCode).sort(),[201,429]);assert.equal((await counts(separate)).uploads,1);
});

test('pending reservations remain owner-bound and a signing failure is recoverable',async()=>{
 const owner=await account(2),other=await account();const first=await reserve(owner),firstId=first.json().uploadId;
 await adminPool.query("insert into memberships(workspace_id,user_id,role) values($1,$2,'editor')",[owner.workspace.id,other.user.id]);await adminPool.query('update sessions set workspace_id=$2 where user_id=$1',[other.user.id,owner.workspace.id]);
 const second=await request(other,`/api/parsers/${owner.parserId}/uploads`,{filename:'owned-invoice.pdf',size:bytes.length,sha256:sha(bytes)});assert.equal(second.statusCode,201,second.body);assert.notEqual(second.json().uploadId,firstId);
 assert.equal((await finalize(other,firstId)).statusCode,404);
 const recovery=await account();failSign=true;assert.equal((await reserve(recovery)).statusCode,503);const retried=await reserve(recovery);assert.equal(retried.statusCode,201,retried.body);assert.equal(retried.json().reused,true);assert.equal((await counts(recovery)).uploads,1);
});
