import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSupabaseRequiredOriginalsSource} from '../scripts/backup/supabase-required.js';
import {backupLimits,sha256} from '../scripts/backup/files.js';
import {BackupError} from '../scripts/backup/errors.js';
import type {BackupObjectReference} from '../scripts/backup/types.js';

const url='https://required-original-fixture.supabase.co',serviceRoleKey='controlled-private-fixture-key';
const workspace='00000000-0000-4000-8000-000000000001';
const key=(n:number)=>workspace+'/00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const reference=(key:string,bytes:Buffer):BackupObjectReference=>({key,required:true,byteSize:bytes.length,sha256:sha256(bytes)});
async function temp(fn:(directory:string)=>Promise<void>){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paperwake-required-originals-'));try{await fs.chmod(dir,0o700);await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
function transport(objects:Map<string,Buffer>,options:{response?:(route:string,call:number)=>Response|undefined}={}){
 const calls:Array<{route:string;method:string}>=[];let policies=0;
 const fetch=(async(input,init={})=>{
  const parsed=new URL(String(input));assert.equal(parsed.origin,url);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.body,undefined);
  assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+serviceRoleKey);assert.equal(new Headers(init.headers).get('apikey'),serviceRoleKey);
  assert.equal(init.signal?.aborted,false);const route=parsed.pathname;calls.push({route,method:init.method!});
  if(route==='/storage/v1/bucket/folio-originals'){policies++;const replacement=options.response?.(route,policies);return replacement??Response.json({id:'folio-originals',public:false,file_size_limit:backupLimits.objectBytes,allowed_mime_types:['application/pdf']});}
  assert.ok(route.startsWith('/storage/v1/object/authenticated/folio-originals/'),'No listing, signing, optional or write endpoint is allowed');
  const replacement=options.response?.(route,calls.length);if(replacement)return replacement;
  const value=objects.get(route.split('/folio-originals/')[1]!);return value?new Response(new Uint8Array(value)):new Response('PRIVATE absent object detail',{status:404});
 }) as typeof globalThis.fetch;
 return {fetch,calls,get policies(){return policies;},get downloads(){return calls.filter(call=>call.route.includes('/object/authenticated/'));}};
}
const rejects=(promise:Promise<unknown>,code?:string)=>assert.rejects(promise,error=>{assert.ok(error instanceof BackupError);if(code)assert.equal(error.code,code);assert.doesNotMatch(error.message,/PRIVATE|controlled-private-fixture-key|Bearer/);assert.equal(error.cause,undefined);return true;});

test('required originals are downloaded once, privately fsynced and verified against the database; optional objects are never requested',async()=>temp(async directory=>{
 const one=Buffer.from('Synthetic required one'),two=Buffer.from('Synthetic required two'),optional=Buffer.from('Do not read optional object');
 const refs=[reference(key(2),two),reference(key(1),one)],mock=transport(new Map([[key(1),one],[key(2),two],[key(3),optional]]));
 const captured=await createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:refs,fetch:mock.fetch}).capture(directory);
 assert.equal(captured.objects,2);assert.equal(captured.sourceBytes,one.length+two.length);assert.equal(mock.policies,2);assert.equal(mock.downloads.length,2);
 assert.deepEqual(mock.downloads.map(call=>call.route.split('/folio-originals/')[1]),[key(1),key(2)]);
 for(const [name,expected]of [[key(1),one],[key(2),two]] as const){assert.deepEqual(await fs.readFile(path.join(directory,name)),expected);const stat=await fs.stat(path.join(directory,name));assert.equal(stat.mode&0o077,0);assert.equal(stat.uid,process.getuid!());}
 assert.deepEqual(await fs.readdir(path.join(directory,workspace)),[key(1).split('/')[1],key(2).split('/')[1]]);
 await captured.verifyPolicy();assert.equal(mock.policies,3);assert.equal(mock.downloads.length,2,'Later policy verification never redownloads captured content');
}));

test('all reference shape, optionality, duplicate and conflicting identity failures occur before requests',()=>{
 const ref=reference(key(1),Buffer.from('one')),variants:unknown[]=[null,{},[{...ref,required:false}],[{...ref,key:'../outside'}],[{...ref,key:workspace+'/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}],[{...ref,sha256:'A'.repeat(64)}],[{...ref,byteSize:-1}],[{...ref,byteSize:1.5}],[{...ref,byteSize:backupLimits.objectBytes+1}],[{...ref,unexpected:true}],[ref,ref],[ref,{...ref,sha256:'a'.repeat(64)}]];
 let calls=0;const fetch=(async()=>{calls++;throw new Error('Must not reach transport');}) as typeof globalThis.fetch;
 for(const requiredObjects of variants)assert.throws(()=>createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:requiredObjects as BackupObjectReference[],fetch}),BackupError);
 assert.equal(calls,0);
});

test('aggregate byte and file limits reject before download without allocating large payloads',()=>{
 const large={required:true,byteSize:backupLimits.objectBytes,sha256:'0'.repeat(64)},refs=Array.from({length:Math.floor(backupLimits.payloadBytes/backupLimits.objectBytes)+1},(_,n)=>({...large,key:key(n+1)}));
 let calls=0;const fetch=(async()=>{calls++;throw new Error('Must not download over-limit inventory');}) as typeof globalThis.fetch;
 for(const requiredObjects of [refs,Array(backupLimits.files+1).fill(reference(key(1),Buffer.from('a')))])assert.throws(()=>createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects,fetch}),error=>error instanceof BackupError&&error.code==='BACKUP_LIMIT');
 assert.equal(calls,0);
});

test('options and required references are pinned before any asynchronous capture',async()=>temp(async directory=>{
 const value=Buffer.from('Pinned original'),ref=reference(key(1),value),mock=transport(new Map([[key(1),value]]));
 const options={url,serviceRoleKey,requiredObjects:[ref],fetch:mock.fetch};const source=createSupabaseRequiredOriginalsSource(options);
 options.url='https://unrelated.invalid';options.serviceRoleKey='PRIVATE changed key';options.fetch=async()=>{throw new Error('Changed transport must not run');};ref.key=key(2);ref.sha256='0'.repeat(64);options.requiredObjects.length=0;
 const captured=await source.capture(directory);assert.equal(captured.objects,1);assert.deepEqual(await fs.readFile(path.join(directory,key(1))),value);assert.equal(mock.downloads.length,1);
}));

test('missing, same-size corrupt and truncated source bytes are rejected before retaining that original',async()=>{
 const expected=Buffer.from('Expected exact source');
 for(const value of [undefined,Buffer.alloc(expected.length,4),expected.subarray(1)])await temp(async directory=>{
  const mock=transport(new Map(value?[[key(1),value]]:[]));await rejects(createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[reference(key(1),expected)],fetch:mock.fetch}).capture(directory),value?'BACKUP_ORIGINAL':'BACKUP_STORAGE');
  assert.deepEqual(await fs.readdir(directory),[]);assert.equal(mock.downloads.length,1);
 });
});

test('declared and actual response size limits are checked against the exact database byte size',async()=>{
 const value=Buffer.from('tiny');
 for(const declared of [true,false])await temp(async directory=>{
  const mock=transport(new Map([[key(1),value]]),{response:route=>route.includes('/object/authenticated/')?new Response(declared?'tiny':'too many bytes',declared?{headers:{'content-length':String(value.length+1)}}:{}):undefined});
  await rejects(createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[reference(key(1),value)],fetch:mock.fetch}).capture(directory),'BACKUP_LIMIT');assert.deepEqual(await fs.readdir(directory),[]);
 });
});

test('zero required originals still check private bucket policy before and after without listing or content reads',async()=>temp(async directory=>{
 const mock=transport(new Map());const result=await createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[],fetch:mock.fetch}).capture(directory);
 assert.deepEqual({objects:result.objects,sourceBytes:result.sourceBytes},{objects:0,sourceBytes:0});assert.equal(mock.policies,2);assert.equal(mock.downloads.length,0);assert.deepEqual(await fs.readdir(directory),[]);
}));

test('later source changes cannot alter an already captured hash-matching original and do not trigger content rereads',async()=>temp(async directory=>{
 const value=Buffer.from('Exact database snapshot content'),objects=new Map([[key(1),value]]),mock=transport(objects);
 const result=await createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[reference(key(1),value)],fetch:mock.fetch}).capture(directory);
 objects.set(key(1),Buffer.alloc(value.length,8));await result.verifyPolicy();objects.delete(key(1));await result.verifyPolicy();
 assert.deepEqual(await fs.readFile(path.join(directory,key(1))),value);assert.equal(mock.downloads.length,1);
}));

test('the exact 10 MiB original boundary is retained with one bounded content GET',async()=>temp(async directory=>{
 const value=Buffer.alloc(backupLimits.objectBytes,3),mock=transport(new Map([[key(1),value]]));
 const result=await createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[reference(key(1),value)],fetch:mock.fetch}).capture(directory);
 assert.equal(result.sourceBytes,backupLimits.objectBytes);assert.equal(mock.downloads.length,1);assert.equal(sha256(await fs.readFile(path.join(directory,key(1)))),sha256(value));
}));

test('public, missing, malformed and oversized bucket policies reject before content requests',async()=>{
 for(const policy of [{id:'folio-originals',public:true,file_size_limit:10},{id:'other',public:false,file_size_limit:10},{id:'folio-originals',public:false,file_size_limit:backupLimits.objectBytes+1},{id:'folio-originals',public:false,file_size_limit:0},{id:'folio-originals',public:false,file_size_limit:10,allowed_mime_types:[17]}])await temp(async directory=>{
  const mock=transport(new Map([[key(1),Buffer.from('a')]]),{response:route=>route.includes('/bucket/')?Response.json(policy):undefined});await rejects(createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[reference(key(1),Buffer.from('a'))],fetch:mock.fetch}).capture(directory),'BACKUP_STORAGE');assert.equal(mock.downloads.length,0);
 });
});

test('policy changes during and after capture fail without redownloading content',async()=>{
 for(const changeOn of [2,3])await temp(async directory=>{
  const value=Buffer.from('Stable source'),mock=transport(new Map([[key(1),value]]),{response:(route,call)=>route.includes('/bucket/')&&call===changeOn?Response.json({id:'folio-originals',public:false,file_size_limit:backupLimits.objectBytes,allowed_mime_types:['application/pdf','text/plain']}):undefined});
  const capturing=createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[reference(key(1),value)],fetch:mock.fetch}).capture(directory);
  if(changeOn===2)await rejects(capturing,'BACKUP_CHANGED');else await rejects((await capturing).verifyPolicy(),'BACKUP_CHANGED');
  assert.equal(mock.downloads.length,1);assert.deepEqual(await fs.readFile(path.join(directory,key(1))),value);
 });
});

test('origin, credential and timeout guards reject before transport calls',()=>{
 const base={url,serviceRoleKey,requiredObjects:[] as BackupObjectReference[]};
 for(const value of ['http://a.supabase.co','https://a.supabase.co@other.invalid','https://a.supabase.co/path','https://a.supabase.co?x=1','https://a.supabase.co:444','https://a.supabase.co#fragment'])assert.throws(()=>createSupabaseRequiredOriginalsSource({...base,url:value}),BackupError);
 for(const value of ['', 'private key', 'x'.repeat(16_385)])assert.throws(()=>createSupabaseRequiredOriginalsSource({...base,serviceRoleKey:value}),BackupError);
 for(const timeoutMs of [0,-1,1.5,45_001])assert.throws(()=>createSupabaseRequiredOriginalsSource({...base,timeoutMs}),BackupError);
});

test('stalled transport and body remain bounded, including uncooperative body cancellation',async()=>{
 for(const body of [false,true])await temp(async directory=>{
  const fetch=(async()=>body?new Response(new ReadableStream({start(){},cancel(){return new Promise(()=>{});}})):new Promise(()=>{})) as typeof globalThis.fetch;
  const start=performance.now();await rejects(createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[],fetch,timeoutMs:20}).capture(directory),'BACKUP_STORAGE');assert.ok(performance.now()-start<1000);
 });
});

test('provider responses and thrown errors cannot leak credentials or arbitrary error messages',async()=>{
 for(const thrown of [false,true])await temp(async directory=>{
  const fetch=(async()=>{if(thrown)throw new BackupError('EXTERNAL','PRIVATE '+serviceRoleKey);return new Response('PRIVATE '+serviceRoleKey,{status:403});}) as typeof globalThis.fetch;
  await rejects(createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[],fetch}).capture(directory),'BACKUP_STORAGE');
 });
});

test('staging must be private, empty and nonsymlinked; pre-existing files are never replaced',async()=>temp(async directory=>{
 const mock=transport(new Map()),source=createSupabaseRequiredOriginalsSource({url,serviceRoleKey,requiredObjects:[],fetch:mock.fetch});
 await fs.chmod(directory,0o755);await rejects(source.capture(directory),'BACKUP_DIRECTORY');await fs.chmod(directory,0o700);
 await fs.writeFile(path.join(directory,'existing'),'preserve',{mode:0o600});await rejects(source.capture(directory),'BACKUP_TARGET');assert.equal(await fs.readFile(path.join(directory,'existing'),'utf8'),'preserve');
 const link=path.join(os.tmpdir(),'paperwake-required-link-'+randomUUID());try{await fs.symlink(directory,link);await rejects(source.capture(link),'BACKUP_DIRECTORY');}finally{await fs.unlink(link);}
 assert.equal(mock.calls.length,0);
}));
