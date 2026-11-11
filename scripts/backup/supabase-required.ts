import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {BackupError} from './errors.js';
import {backupLimits,objectKey,sha256,ensurePrivateDirectory} from './files.js';
import type {BackupObjectReference} from './types.js';

const bucket='folio-originals';
class RequiredOriginalsError extends BackupError{}
function check(condition:unknown,code:string,message:string):asserts condition {
 if(!condition)throw new RequiredOriginalsError(code,message);
}
const storageFailure=()=>new RequiredOriginalsError('BACKUP_STORAGE','The required private originals could not be captured.');
type RequiredReference={key:string;required:true;byteSize:number;sha256:string};

/** Explicit single-pass source for database-pinned required originals only.
 * No inventory, optional objects, remote writes, retries or whole-bucket stability
 * claim. The caller still owns the database snapshot and writer fence. */
export function createSupabaseRequiredOriginalsSource(options:{url:string;serviceRoleKey:string;requiredObjects:BackupObjectReference[];fetch?:typeof fetch;timeoutMs?:number}){
 let url:URL;try{url=new URL(options.url);}catch{throw storageFailure();}
 check(url.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)&&!url.username&&!url.password&&!url.port&&url.pathname==='/'&&!url.search&&!url.hash,'BACKUP_STORAGE','Use the exact Supabase project HTTPS origin.');
 const credential=options.serviceRoleKey,transport=options.fetch??fetch,base=url.origin+'/storage/v1',timeout=options.timeoutMs??45_000;
 check(typeof credential==='string'&&credential.length>0&&credential.length<=16_384&&!/\s/.test(credential),'BACKUP_STORAGE','Use a bounded private Supabase service credential file.');
 check(Number.isSafeInteger(timeout)&&timeout>0&&timeout<=45_000,'BACKUP_STORAGE','Invalid storage request deadline.');
 check(Array.isArray(options.requiredObjects)&&options.requiredObjects.length<=backupLimits.files,'BACKUP_LIMIT','The required-original inventory exceeds its file limit.');
 const seen=new Set<string>();let total=0;
 const required:RequiredReference[]=options.requiredObjects.map(value=>{
  check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['key','required','byteSize','sha256'].includes(key))&&value.required===true&&typeof value.key==='string'&&objectKey.test(value.key)&&typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256)&&Number.isSafeInteger(value.byteSize)&&value.byteSize!>=0&&value.byteSize!<=backupLimits.objectBytes,'BACKUP_OBJECT','Required originals must have canonical keys and exact bounded database hashes and sizes.');
  check(!seen.has(value.key),'BACKUP_OBJECT','Required original keys must be unique, without duplicate or conflicting references.');seen.add(value.key);
  total+=value.byteSize!;check(total<=backupLimits.payloadBytes,'BACKUP_LIMIT','The required-original inventory exceeds its payload limit.');
  return Object.freeze({key:value.key,required:true,byteSize:value.byteSize!,sha256:value.sha256});
 }).sort((a,b)=>a.key.localeCompare(b.key));

 async function request(route:string,maxBytes:number):Promise<Buffer>{
  const controller=new AbortController(),deadline=Date.now()+timeout,timer=setTimeout(()=>controller.abort(),timeout);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,body:ReadableStream<Uint8Array>|undefined;
  const expired=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(storageFailure()),{once:true}));void expired.catch(()=>{});
  const guard=()=>{if(Date.now()>=deadline)controller.abort();if(controller.signal.aborted)throw storageFailure();};
  try{
   const response=await Promise.race([Promise.resolve().then(()=>transport(base+route,{method:'GET',headers:{apikey:credential,Authorization:'Bearer '+credential},redirect:'error',signal:controller.signal})),expired]);body=response.body??undefined;guard();
   if(!response.ok||!response.body){void response.body?.cancel().catch(()=>{});throw storageFailure();}
   const declared=response.headers.get('content-length');
   check(declared===null||/^\d+$/.test(declared)&&Number(declared)<=maxBytes,'BACKUP_LIMIT','A required-original response exceeds its supported byte limit.');
   reader=response.body.getReader();const chunks:Buffer[]=[];let size=0,count=0;
   for(;;){guard();const next=await Promise.race([reader.read(),expired]);guard();if(next.done)break;
    check(next.value instanceof Uint8Array&&++count<=65_536,'BACKUP_LIMIT','A required-original response exceeds its supported chunk limit.');
    size+=next.value.byteLength;check(size<=maxBytes,'BACKUP_LIMIT','A required-original response exceeds its supported byte limit.');chunks.push(Buffer.from(next.value));
   }
   return Buffer.concat(chunks,size);
  }catch(error){controller.abort();if(error instanceof RequiredOriginalsError)throw error;throw storageFailure();}
  finally{clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else void body?.cancel().catch(()=>{});}
 }
 async function policy(){
  let value:any;try{value=JSON.parse((await request('/bucket/'+bucket,2*1024*1024)).toString('utf8'));}catch(error){if(error instanceof RequiredOriginalsError)throw error;throw storageFailure();}
  const fileSizeLimit=Number(value?.file_size_limit),allowedMimeTypes=value?.allowed_mime_types??null;
  check(value?.id===bucket&&value.public===false&&Number.isSafeInteger(fileSizeLimit)&&fileSizeLimit>0&&fileSizeLimit<=backupLimits.objectBytes,'BACKUP_STORAGE','The originals bucket must be private with a file limit no greater than 10 MiB.');
  check(allowedMimeTypes===null||Array.isArray(allowedMimeTypes)&&allowedMimeTypes.length<=256&&allowedMimeTypes.every((entry:unknown)=>typeof entry==='string'&&entry.length<=256),'BACKUP_STORAGE','The bucket MIME policy is invalid.');
  return {id:bucket,public:false,fileSizeLimit,allowedMimeTypes};
 }
 async function ownedDirectory(directory:string){
  check(path.isAbsolute(directory),'BACKUP_DIRECTORY','Use an absolute owner-only staging directory.');
  const resolved=await ensurePrivateDirectory(directory),stat=await fs.lstat(resolved);
  check(typeof process.getuid==='function'&&stat.uid===process.getuid(),'BACKUP_DIRECTORY','The staging directory must belong to the current operator.');return resolved;
 }
 return {async capture(directory:string){
  try{
   const root=await ownedDirectory(directory);
   check((await fs.readdir(root)).length===0,'BACKUP_TARGET','The required-original staging directory must be empty.');
   const before=await policy();let sourceBytes=0;
   for(const item of required){
    const bytes=await request('/object/authenticated/'+bucket+'/'+item.key,item.byteSize);
    check(bytes.length===item.byteSize&&sha256(bytes)===item.sha256,'BACKUP_ORIGINAL','A required original is missing or does not match its database hash and size.');
    const workspace=path.join(root,item.key.split('/')[0]!);
    await fs.mkdir(workspace,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});await ownedDirectory(workspace);
    const filename=path.join(root,item.key),file=await fs.open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    sourceBytes+=bytes.length;
   }
   async function verifyPolicy(){check(JSON.stringify(await policy())===JSON.stringify(before),'BACKUP_CHANGED','The private bucket policy changed during capture.');}
   await verifyPolicy();
   return {objects:required.length,sourceBytes,verifyPolicy};
  }catch(error){if(error instanceof BackupError)throw error;throw storageFailure();}
 }};
}
