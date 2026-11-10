import test,{before,beforeEach,afterEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../server/app.js';
import {configuredSignupPolicy,signupPolicyEnvironmentKeys} from '../server/core/signup-policy-configuration.js';
import {validateSignupPolicy} from '../server/core/signup-terms.js';
import {signupTermsPolicyMaxBytes,type SignupPolicyInput} from '../shared/signup-terms.js';
import {config} from '../server/core/config.js';
import {adminPool,closeDatabase} from '../server/core/db.js';
import {privateIdentifier,decryptSecret} from '../server/integrations/secrets.js';
import {setAccountEmailSenderForTests} from '../server/integrations/account-email.js';
import {assertPaperwakeTestDatabase} from './paperwake-test-database.js';

const policy:SignupPolicyInput={version:'synthetic-config-v1',language:'en-IE',title:'Synthetic signup policy',text:'SYNTHETIC FIXTURE ONLY.\nNot customer terms.',url:'https://example.test/synthetic-signup',agreementText:'I accept the synthetic test policy.'};
const pins=(value=policy)=>({PAPERWAKE_SIGNUP_POLICY_JSON:JSON.stringify(value),PAPERWAKE_SIGNUP_POLICY_VERSION:value.version,PAPERWAKE_SIGNUP_POLICY_SHA256:validateSignupPolicy(value).sha256});
const accept=(value=policy)=>({accepted:true,version:value.version,sha256:validateSignupPolicy(value).sha256});
const keys=[...signupPolicyEnvironmentKeys,'PAPERWAKE_SIGNUP_INVITE_CODE','FOLIO_PREVIEW_MODE','FOLIO_BILLING_MOCK','FOLIO_REQUIRE_EMAIL_VERIFICATION','FOLIO_RATE_LIMIT_NAMESPACE'] as const;
const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]])),emails=new Set<string>();
const originalFetch=globalThis.fetch;
let app:Awaited<ReturnType<typeof buildApp>>,guarded=false,networkCalls=0,emailCalls=0,requestNumber=0;
const addressKey=(email:string)=>privateIdentifier('folio:account-registration:address:v1',email);
const fields=()=>{const email=`owned-config-policy-${randomUUID()}@example.test`;emails.add(email);return {email,name:'Owned policy fixture',workspaceName:'Owned policy fixture',password:'Synthetic config signup password'};};
const post=(body:Record<string,unknown>)=>app.inject({method:'POST',url:'/api/auth/register',remoteAddress:`192.0.2.${++requestNumber}`,headers:{origin:config.origin},payload:body});
const exists=async(email:string)=>(await adminPool.query('SELECT 1 FROM users WHERE email=$1',[email])).rowCount;
function clearPolicy(){for(const key of signupPolicyEnvironmentKeys)delete process.env[key];}
function install(value=policy){Object.assign(process.env,pins(value));}
async function cleanup(){
 const ownedEmails=[...emails],addresses=ownedEmails.map(addressKey);
 await adminPool.query('DELETE FROM account_registration_requests WHERE address_key=ANY($1::text[])',[addresses]);
 await adminPool.query('DELETE FROM account_registration_limits WHERE address_key=ANY($1::text[])',[addresses]);
 await adminPool.query('DELETE FROM workspaces WHERE id IN (SELECT workspace_id FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email=ANY($1::text[])))',[ownedEmails]);
 await adminPool.query('DELETE FROM users WHERE email=ANY($1::text[])',[ownedEmails]);emails.clear();
}
before(async()=>{
 await assertPaperwakeTestDatabase();guarded=true;
 globalThis.fetch=async()=>{networkCalls++;throw new Error('No network in configured-policy fixtures');};
 setAccountEmailSenderForTests({async send(){emailCalls++;throw new Error('No email delivery in configured-policy fixtures');}});
});
beforeEach(async()=>{
 clearPolicy();delete process.env.PAPERWAKE_SIGNUP_INVITE_CODE;
 Object.assign(process.env,{FOLIO_PREVIEW_MODE:'false',FOLIO_BILLING_MOCK:'false',FOLIO_REQUIRE_EMAIL_VERIFICATION:'false',FOLIO_RATE_LIMIT_NAMESPACE:`owned-config-policy-${randomUUID()}`});
 app=await buildApp(); // Exercise the deployed/default provider, never a policy seam.
});
afterEach(async()=>{await app?.close();if(guarded)await cleanup();assert.equal(networkCalls,0);assert.equal(emailCalls,0);});
after(async()=>{
 globalThis.fetch=originalFetch;setAccountEmailSenderForTests(undefined);
 for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 await closeDatabase();
});

test('an entirely absent configuration preserves signup without supplied terms',async()=>{
 assert.equal(configuredSignupPolicy({}),null);
 const status=await app.inject('/api/auth/signup-terms');assert.equal(status.statusCode,200);assert.deepEqual(status.json(),{enabled:false,policy:null});
 const response=await post(fields());assert.equal(response.statusCode,201,response.body);
 assert.equal((await adminPool.query('SELECT 1 FROM signup_terms_acceptances WHERE user_id=$1',[response.json().user.id])).rowCount,0);
});

test('bounded configuration reuses the exact all-field canonical digest and rejects every partial or invalid pin',()=>{
 assert.deepEqual(configuredSignupPolicy(pins()),policy);
 assert.deepEqual(configuredSignupPolicy({...pins(),PAPERWAKE_SIGNUP_POLICY_JSON:JSON.stringify({agreementText:policy.agreementText,url:policy.url,text:policy.text,title:policy.title,language:policy.language,version:policy.version})}),policy);
 const invalid:Record<string,string|undefined>[]=[];
 for(const key of signupPolicyEnvironmentKeys){invalid.push({...pins(),[key]:undefined},{...pins(),[key]:''},{[key]:pins()[key]});}
 for(const json of ['{','null','[]',JSON.stringify({...policy,extra:'unexpected'}),JSON.stringify({...policy,url:'javascript:alert(1)'}),JSON.stringify({...policy,text:'é'.repeat(9000)}),' '.repeat(signupTermsPolicyMaxBytes)+JSON.stringify(policy)])invalid.push({...pins(),PAPERWAKE_SIGNUP_POLICY_JSON:json});
 invalid.push({...pins(),PAPERWAKE_SIGNUP_POLICY_VERSION:'stale-version'},{...pins(),PAPERWAKE_SIGNUP_POLICY_SHA256:'0'.repeat(64)},{...pins(),PAPERWAKE_SIGNUP_POLICY_SHA256:'A'.repeat(64)});
 for(const value of invalid)assert.throws(()=>configuredSignupPolicy(value),(error:any)=>error.statusCode===503&&!error.message.includes(policy.text));
});

test('default app fails closed for malformed, oversized or mismatched policy configuration before account creation',async()=>{
 for(const overrides of [
  {PAPERWAKE_SIGNUP_POLICY_SHA256:undefined},
  {PAPERWAKE_SIGNUP_POLICY_JSON:'{private-invalid-config'},
  {PAPERWAKE_SIGNUP_POLICY_JSON:' '.repeat(signupTermsPolicyMaxBytes)+JSON.stringify(policy)},
  {PAPERWAKE_SIGNUP_POLICY_VERSION:'wrong-version'},
  {PAPERWAKE_SIGNUP_POLICY_SHA256:'0'.repeat(64)},
 ]){
  install();for(const [key,value]of Object.entries(overrides)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  const status=await app.inject('/api/auth/signup-terms');assert.equal(status.statusCode,503,status.body);assert.ok(!status.body.includes('private-invalid-config'));
  const body=fields(),response=await post({...body,termsAcceptance:accept()});assert.equal(response.statusCode,503,response.body);assert.equal(response.headers['set-cookie'],undefined);assert.equal(await exists(body.email),0);
  assert.equal((await adminPool.query('SELECT 1 FROM account_registration_requests WHERE address_key=$1',[addressKey(body.email)])).rowCount,0);
 }
});

test('default app requires current acceptance and retains the exact accepted policy after rotation',async()=>{
 install();const status=await app.inject('/api/auth/signup-terms');assert.equal(status.statusCode,200);assert.deepEqual(status.json().policy,validateSignupPolicy(policy));
 const missing=fields();assert.equal((await post(missing)).statusCode,400);assert.equal(await exists(missing.email),0);
 const changed={...policy,version:'synthetic-config-v2',text:policy.text+'\nSecond synthetic version.'};install(changed);
 const stale=fields();assert.equal((await post({...stale,termsAcceptance:accept()})).statusCode,409);assert.equal(await exists(stale.email),0);
 const correct=fields(),response=await post({...correct,termsAcceptance:accept(changed)});assert.equal(response.statusCode,201,response.body);
 const cookie=response.cookies.map(value=>`${value.name}=${value.value}`).join('; '),userId=response.json().user.id;
 install({...changed,version:'synthetic-config-v3',text:'A different synthetic policy.'});
 const record=await app.inject({url:'/api/auth/signup-terms/record',headers:{cookie}});assert.equal(record.statusCode,200);assert.deepEqual(record.json().record.policy,validateSignupPolicy(changed));
 const persisted=(await adminPool.query('SELECT policy,accepted_at,recorded_at FROM signup_terms_acceptances WHERE user_id=$1',[userId])).rows[0];assert.deepEqual(persisted.policy,validateSignupPolicy(changed));assert.ok(persisted.accepted_at&&persisted.recorded_at);
 const download=await app.inject({url:'/api/auth/signup-terms/record/download',headers:{cookie}});assert.equal(download.statusCode,200);assert.ok(download.body.includes(changed.text));assert.ok(!download.body.includes('A different synthetic policy.'));
});

test('verified-registration queue captures configured acceptance without sending mail or using later policy content',async()=>{
 process.env.FOLIO_REQUIRE_EMAIL_VERIFICATION='true';install();const body=fields();
 const response=await post({...body,termsAcceptance:accept()});assert.equal(response.statusCode,202,response.body);assert.equal(await exists(body.email),0);
 install({...policy,version:'synthetic-config-v2',text:'Later synthetic policy'});
 const {rows:[row]}=await adminPool.query('SELECT payload_ciphertext FROM account_registration_requests WHERE address_key=$1',[addressKey(body.email)]);
 const captured=JSON.parse(decryptSecret(row.payload_ciphertext));assert.deepEqual(captured.signupTerms.policy,validateSignupPolicy(policy));assert.ok(captured.signupTerms.acceptedAt);
});

test('explicit test dependency overrides the default configured provider',async()=>{
 process.env.PAPERWAKE_SIGNUP_POLICY_JSON='invalid';await app.close();app=await buildApp({signupPolicy:()=>null});
 const status=await app.inject('/api/auth/signup-terms');assert.equal(status.statusCode,200);assert.deepEqual(status.json(),{enabled:false,policy:null});
});
