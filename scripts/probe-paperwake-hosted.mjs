/** Operator-invoked probes only. Never reads dotenv, database, or browser state. */
import assert from 'node:assert/strict';

const args=new Set(process.argv.slice(2));
if(args.size===0||args.has('--help')){
 console.log('Usage: node scripts/probe-paperwake-hosted.mjs --probe --expected-revision=<commit> [--wake --ack-global-worker]');
 console.log('Target is fixed to https://paperwake-gamma.vercel.app. Supply PAPERWAKE_PROBE_WORKER_SECRET or read-only PAPERWAKE_PROBE_MONITOR_SECRET through the execution environment; never command arguments.');
 console.log('Without --wake this checks liveness, readiness, authenticated diagnostics and rejected unauthenticated access. --wake sends ONE authenticated global worker request; 202 does not prove completion. Read docs/PAPERWAKE-HOSTED-WORKER-VERIFICATION.md first.');
 process.exit(0);
}
const base='https://paperwake-gamma.vercel.app';
const revisionArg=[...args].find(value=>value.startsWith('--expected-revision='));
assert.ok(args.has('--probe')&&revisionArg,'Explicit --probe and --expected-revision are required.');
for(const value of args)assert.ok(['--probe','--wake','--ack-global-worker'].includes(value)||value===revisionArg,'Unknown probe option.');
const expectedRevision=revisionArg.slice('--expected-revision='.length);
assert.match(expectedRevision,/^[a-f0-9]{7,40}$/,'Expected revision must be a commit hash prefix.');
const workerSecret=process.env.PAPERWAKE_PROBE_WORKER_SECRET;
const diagnosticsSecret=workerSecret||process.env.PAPERWAKE_PROBE_MONITOR_SECRET;
assert.ok(diagnosticsSecret&&diagnosticsSecret.length>=32&&!/\s/.test(diagnosticsSecret),'A valid operator probe secret is required in the execution environment.');
const wake=args.has('--wake');
assert.ok(!wake||args.has('--ack-global-worker')&&workerSecret&&workerSecret.length>=32,'A worker wake needs its worker secret and explicit global-worker acknowledgement.');
const report={target:base,startedAt:new Date().toISOString(),checks:[],workerCompletionVerified:false};
async function request(method,path,secret){
 const response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(10_000),headers:{...(secret?{authorization:`Bearer ${secret}`} :{}),...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
 const reader=response.body?.getReader();let size=0;const chunks=[];
 if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65_536)throw new Error('Unexpected probe response size.');chunks.push(Buffer.from(value));}}finally{try{await reader.cancel();}catch{/* Best effort after the request deadline. */}reader.releaseLock();}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Error('Probe response was not JSON; inspect deployment protection separately.');}
 return {status:response.status,value};
}
try{
 const health=await request('GET','/api/health');assert.equal(health.status,200,'Liveness probe failed.');assert.equal(health.value.name,'Paperwake','Unexpected application.');assert.ok(typeof health.value.revision==='string'&&health.value.revision.startsWith(expectedRevision),'Deployed revision does not match.');
 report.checks.push({check:'liveness',status:health.status,revision:health.value.revision,environment:health.value.environment});
 const ready=await request('GET','/api/ready');assert.equal(ready.status,200,'Dependency readiness failed.');assert.equal(ready.value.status,'ready','Dependency readiness failed.');
 for(const key of ['database','storage','restore'])assert.equal(ready.value.checks?.[key],'ok',`Dependency ${key} is unavailable.`);
 report.checks.push({check:'readiness',status:ready.status,checks:ready.value.checks});
 const deniedDiagnostics=await request('GET','/api/internal/diagnostics');assert.equal(deniedDiagnostics.status,401,'Unauthenticated diagnostics did not reject access.');
 const deniedWorker=await request('POST','/api/internal/worker');assert.equal(deniedWorker.status,401,'Unauthenticated worker probe did not reject access.');
 report.checks.push({check:'unauthenticated_access_rejected',diagnostics:401,worker:401});
 const diagnostics=await request('GET','/api/internal/diagnostics',diagnosticsSecret);assert.equal(diagnostics.status,200,'Authenticated diagnostics failed.');assert.equal(diagnostics.value.status,'available','Authenticated diagnostics failed.');
 assert.ok(Array.isArray(diagnostics.value.worker?.queues),'Diagnostics had no queue observation.');
 report.checks.push({check:'authenticated_diagnostics',status:200,observation:diagnostics.value.worker.observation,queues:diagnostics.value.worker.queues.map(({lane,queued,due,processing,expiredLeases,failed})=>({lane,queued,due,processing,expiredLeases,failed}))});
 if(wake){const accepted=await request('POST','/api/internal/worker',workerSecret);assert.equal(accepted.status,202,'Authenticated worker wake failed.');assert.equal(accepted.value.accepted,true,'Worker wake was not acknowledged.');report.checks.push({check:'authenticated_global_wake_acknowledged',status:202});}
 report.passed=true;
}catch(error){report.passed=false;report.error=error instanceof assert.AssertionError?error.message.split('\n')[0]:error instanceof Error&&error.message.startsWith('Probe response')?error.message:'Probe failed; inspect private operator diagnostics. No automatic retry was sent.';process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));}
