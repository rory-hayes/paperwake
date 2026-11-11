import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateHybridIdentity, identityToRecipient} from 'age-encryption';
import {openArchive, sealArchive} from '../scripts/backup/archive.js';
import {backupLimits, sha256, validateManifest} from '../scripts/backup/files.js';
import {BackupError} from '../scripts/backup/errors.js';
import type {BackupManifest} from '../scripts/backup/types.js';

const workspace='00000000-0000-4000-8000-000000000001';
const originalKey=workspace+'/00000000-0000-4000-8000-000000000002';
const stagingKey=workspace+'/00000000-0000-4000-8000-000000000003';
const deletionKey=workspace+'/00000000-0000-4000-8000-000000000004';
const extraKey=workspace+'/00000000-0000-4000-8000-000000000005';
const content=new Map<string,Buffer>([
 ['integration-key.bin',Buffer.alloc(32,0x35)],
 // The archive treats COPY bytes as opaque; database recovery has separate acceptance.
 ['tables/documents.bin',Buffer.from('owned synthetic table COPY bytes')],
 ['objects/'+originalKey,Buffer.from('owned invoice PDF bytes, reference 00042, €49.00')],
]);
type RequiredManifest=Extract<BackupManifest,{version:3}>;
function manifest():RequiredManifest{
 const original=content.get('objects/'+originalKey)!;
 return {
  format:'folio-backup',version:3,id:'00000000-0000-4000-8000-000000000010',createdAt:'2026-11-11T12:00:00.000Z',
  capture:'quiesced-supabase-required-originals',sourceInventory:'database-references-only',
  database:{schema:'paperwake',postgresMajor:17,encoding:'UTF8',sourceIdentity:sha256('owned source'),securitySha256:sha256('owned security'),
   tables:[{name:'documents',columns:[{name:'id',type:'uuid',generated:'',identity:''}],primaryKey:['id'],rows:1}],
   sequences:[],migrations:[{name:'001_core.sql',sha256:sha256('owned migration')}]},
  files:[...content].map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha256(bytes)})),
  objects:[{key:originalKey,required:true,present:true,byteSize:original.length,bytes:original.length,sha256:sha256(original)},
   {key:stagingKey,required:false,present:false},{key:deletionKey,required:false,present:false}],
  integrationKeySha256:sha256(content.get('integration-key.bin')!),omittedObjects:[],
  excludedUploadStaging:[{key:stagingKey,recordType:'direct_upload',recordId:stagingKey.split('/')[1]}],
 };
}
function rejects(mutate:(m:any)=>void,label:string){
 const value=manifest();mutate(value);
 assert.throws(()=>validateManifest(value),error=>error instanceof BackupError,label);
}
async function directory(t:TestContext){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'paperwake-required-manifest-'));await fs.chmod(root,0o700);
 t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}

test('v3 declares only database-referenced originals and retains absent optional references',()=>{
 const value=manifest();assert.deepEqual(validateManifest(value),value);
 const empty=manifest();empty.objects=empty.objects.filter(object=>!object.required);
 empty.files=empty.files.filter(file=>!file.name.startsWith('objects/'));empty.database.tables[0].rows=0;
 assert.deepEqual(validateManifest(empty),empty,'An empty accepted-original set is a valid recovery snapshot.');
});

test('v3 authenticates an encrypted round trip without creating optional or staging payloads',async t=>{
 const root=await directory(t),source=path.join(root,'source'),target=path.join(root,'target'),archive=path.join(root,'backup.age');
 await fs.mkdir(source,{mode:0o700});await fs.mkdir(target,{mode:0o700});
 for(const [name,bytes]of content){await fs.mkdir(path.dirname(path.join(source,name)),{recursive:true,mode:0o700});await fs.writeFile(path.join(source,name),bytes,{mode:0o600});}
 const identity=await generateHybridIdentity(),recipient=await identityToRecipient(identity),value=manifest();
 await sealArchive(source,value,recipient,archive);
 const restored=await openArchive(archive,identity,target);assert.deepEqual(restored.manifest,value);
 for(const [name,bytes]of content)assert.deepEqual(await fs.readFile(path.join(target,name)),bytes);
 for(const key of [stagingKey,deletionKey,extraKey])await assert.rejects(fs.stat(path.join(target,'objects',key)),{code:'ENOENT'});
});

test('v3 rejects absent, mixed or unsupported capture declarations instead of claiming a full bucket inventory',()=>{
 const cases:Array<[string,(m:any)=>void]>=[
  ['missing source inventory',m=>{delete m.sourceInventory;}],
  ['full-bucket inventory claim',m=>{m.sourceInventory='full-bucket';}],
  ['legacy capture claim',m=>{m.capture='quiesced-supabase';}],
  ['v2 capture claim',m=>{m.capture='quiesced-supabase-excluding-staging';}],
  ['missing capture',m=>{delete m.capture;}],
  ['wrong version',m=>{m.version=2;}],
  ['extra unrecognized claim',m=>{m.bucketInventoryVerified=true;}],
  ['missing exclusions',m=>{delete m.excludedUploadStaging;}],
  ['missing omitted inventory',m=>{delete m.omittedObjects;}],
  ['invented omitted object',m=>{m.omittedObjects.push({key:extraKey,bytes:7,sha256:sha256('unknown')});}],
 ];for(const [label,mutate]of cases)rejects(mutate,label);
});

test('v3 rejects missing originals, mismatched hashes or sizes, and extra payloads',()=>{
 const cases:Array<[string,(m:any)=>void]>=[
  ['missing required payload',m=>{m.files=m.files.filter((file:any)=>file.name!=='objects/'+originalKey);}],
  ['missing required reference',m=>{m.objects.shift();}],
  ['required marked absent',m=>{m.objects[0].present=false;delete m.objects[0].bytes;delete m.objects[0].sha256;}],
  ['missing expected bytes',m=>{delete m.objects[0].byteSize;}],
  ['expected bytes mismatch',m=>{m.objects[0].byteSize++;}],
  ['captured bytes mismatch',m=>{m.objects[0].bytes++;}],
  ['captured hash missing',m=>{delete m.objects[0].sha256;}],
  ['captured hash mismatch',m=>{m.objects[0].sha256=sha256('other bytes');}],
  ['file hash mismatch',m=>{m.files.find((file:any)=>file.name==='objects/'+originalKey).sha256=sha256('other bytes');}],
  ['unexpected object payload',m=>{m.files.push({name:'objects/'+extraKey,bytes:0,sha256:sha256('')});}],
  ['duplicate reference',m=>{m.objects.push({...m.objects[0]});}],
  ['duplicate payload',m=>{m.files.push({...m.files[0]});}],
  ['oversized original',m=>{m.objects[0].byteSize=backupLimits.objectBytes+1;}],
  ['invalid original hash',m=>{m.objects[0].sha256='not-a-sha256';}],
 ];for(const [label,mutate]of cases)rejects(mutate,label);
});

test('v3 never carries optional content even when its payload would be internally consistent',()=>{
 for(const index of [1,2]){
  rejects(m=>{const object=m.objects[index];object.present=true;object.bytes=3;object.sha256=sha256('abc');m.files.push({name:'objects/'+object.key,bytes:3,sha256:object.sha256});},'Present optional reference '+index);
  for(const property of ['bytes','byteSize','sha256'])rejects(m=>{m.objects[index][property]=property==='sha256'?sha256(''):0;},'Absent optional metadata '+property);
 }
 rejects(m=>{m.objects[0].required=false;},'A present original cannot be relabelled optional.');
});

test('v3 preserves exact canonical staging identities and rejects aliases or undeclared references',()=>{
 const cases:Array<[string,(m:any)=>void]>=[
  ['protected original exclusion',m=>{m.excludedUploadStaging=[{key:originalKey,recordType:'direct_upload',recordId:originalKey.split('/')[1]}];}],
  ['absent reference missing',m=>{m.objects=m.objects.filter((object:any)=>object.key!==stagingKey);}],
  ['exclusion not in reference inventory',m=>{m.excludedUploadStaging=[{key:extraKey,recordType:'direct_upload',recordId:extraKey.split('/')[1]}];}],
  ['reservation identity mismatch',m=>{m.excludedUploadStaging[0].recordId=extraKey.split('/')[1];}],
  ['duplicate exclusion',m=>{m.excludedUploadStaging.push({...m.excludedUploadStaging[0]});}],
  ['extra exclusion data',m=>{m.excludedUploadStaging[0].unverified=true;}],
  ['noncanonical order',m=>{m.excludedUploadStaging.unshift({key:deletionKey,recordType:'direct_upload',recordId:deletionKey.split('/')[1]});}],
 ];for(const [label,mutate]of cases)rejects(mutate,label);
});

test('v1 and v2 continue accepting their existing optional captures and explicit omitted inventory',()=>{
 for(const version of [1,2]as const){
  const value:any=manifest();value.version=version;delete value.sourceInventory;
  value.capture=version===1?'quiesced-supabase':'quiesced-supabase-excluding-staging';
  if(version===1)delete value.excludedUploadStaging;
  const optional=value.objects[2];optional.present=true;optional.bytes=3;optional.sha256=sha256('abc');
  value.files.push({name:'objects/'+deletionKey,bytes:3,sha256:optional.sha256});
  value.omittedObjects=[{key:extraKey,bytes:6,sha256:sha256('orphan')}];
  assert.deepEqual(validateManifest(value),value);
  assert.throws(()=>validateManifest({...value,sourceInventory:'database-references-only'}),BackupError);
  assert.throws(()=>validateManifest({...value,capture:'quiesced-supabase-required-originals'}),BackupError);
 }
});

test('v3 keeps the aggregate payload bound instead of silently truncating large snapshots',()=>{
 rejects(m=>{m.files.find((file:any)=>file.name==='tables/documents.bin').bytes=backupLimits.payloadBytes;},'Table plus key and originals exceed the unchanged total bound.');
});
