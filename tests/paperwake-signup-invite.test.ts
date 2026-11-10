import test,{after} from 'node:test';
import type {FastifyInstance,LightMyRequestResponse} from 'fastify';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {acceptsSignupInvite,signupInviteRequired,validateSignupInviteConfiguration} from '../server/core/signup-invite.js';
import {stripeConfiguration} from '../server/integrations/provider-policy.js';
import {previewEnabled,validatePreviewConfiguration} from '../server/core/preview.js';
import {buildApp} from '../server/app.js';
import {config} from '../server/core/config.js';
import {adminPool,closeDatabase} from '../server/core/db.js';
import {assertPaperwakeTestDatabase} from './paperwake-test-database.js';

const code='owned-pilot-fixture-0123456789abcdef';
after(()=>closeDatabase());

test('a closed paid pilot accepts live billing configuration without preview or mock billing',()=>{
 const environment={NODE_ENV:'production',APP_ORIGIN:'https://owned-paperwake.example.test',PAPERWAKE_SIGNUP_INVITE_CODE:code,FOLIO_PREVIEW_MODE:'false',FOLIO_BILLING_MOCK:'false',STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_owned_fixture',STRIPE_WEBHOOK_SECRET:'whsec_owned_fixture',STRIPE_PRICE_STANDARD:'price_owned',STRIPE_ACCOUNT_ID:'acct_owned',STRIPE_PORTAL_CONFIGURATION_ID:'bpc_owned'};
 assert.doesNotThrow(()=>validatePreviewConfiguration(environment));assert.doesNotThrow(()=>validateSignupInviteConfiguration(environment));
 assert.equal(stripeConfiguration(environment).mode,'live');assert.equal(previewEnabled(environment),false);assert.equal(signupInviteRequired(environment),true);
 for(const value of [undefined,'',code+'x','a'.repeat(257),true])assert.equal(acceptsSignupInvite(value,environment),false);
 assert.equal(acceptsSignupInvite(code,environment),true);
});

test('invalid configured pilot codes fail closed, while an unset gate preserves intentional public signup',()=>{
 for(const value of ['', 'short','x'.repeat(257),' '+code,code+'\n']){
  const environment={PAPERWAKE_SIGNUP_INVITE_CODE:value};
  assert.throws(()=>validateSignupInviteConfiguration(environment),/32–256/);
  assert.equal(signupInviteRequired(environment),true);assert.equal(acceptsSignupInvite(value,environment),false);
 }
 assert.equal(signupInviteRequired({}),false);assert.equal(acceptsSignupInvite(undefined,{}),true);
});

test('pilot codes cannot bypass the existing preview invitation',()=>{
 const previewCode='owned-preview-fixture-0123456789abcdef';
 const environment={PAPERWAKE_SIGNUP_INVITE_CODE:code,FOLIO_PREVIEW_MODE:'true',FOLIO_BILLING_MOCK:'true',FOLIO_PREVIEW_INVITE_CODE:previewCode};
 assert.equal(acceptsSignupInvite(code,environment),false);assert.equal(acceptsSignupInvite(previewCode,environment),true);
});

test('HTTP registration requires the pilot code but existing users can sign in after code rotation',async()=>{
 await assertPaperwakeTestDatabase();
 const keys=['PAPERWAKE_SIGNUP_INVITE_CODE','FOLIO_PREVIEW_MODE','FOLIO_BILLING_MOCK','FOLIO_REQUIRE_EMAIL_VERIFICATION'] as const;
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{PAPERWAKE_SIGNUP_INVITE_CODE:code,FOLIO_PREVIEW_MODE:'false',FOLIO_BILLING_MOCK:'false',FOLIO_REQUIRE_EMAIL_VERIFICATION:'false'});
 let app:FastifyInstance|undefined,userId:string|undefined,workspaceId:string|undefined;
 const email=`owned-pilot-${randomUUID()}@example.test`,body={name:'Owned pilot fixture',workspaceName:'Owned pilot',email,password:'Owned pilot fixture password'};
 try{
  app=await buildApp();
  const runtime=await app.inject({url:'/api/config'});assert.equal(runtime.statusCode,200);assert.equal(runtime.json().preview,false);assert.equal(runtime.json().inviteRequired,true);assert.ok(!runtime.body.includes(code));
  for(const inviteCode of [undefined,'wrong-code']){
   const rejected:LightMyRequestResponse=await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{...body,...(inviteCode?{inviteCode}:{})}});
   assert.equal(rejected.statusCode,403,rejected.body);assert.equal(rejected.headers['set-cookie'],undefined);
  }
  assert.equal((await adminPool.query('select id from users where email=$1',[email])).rowCount,0);
  const registered=await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{...body,inviteCode:code}});
  assert.equal(registered.statusCode,201,registered.body);userId=registered.json().user.id;workspaceId=registered.json().workspace.id;
  process.env.PAPERWAKE_SIGNUP_INVITE_CODE='rotated-owned-pilot-0123456789abcdef';
  const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{email,password:body.password}});
  assert.equal(login.statusCode,200,login.body);assert.equal(login.json().user.id,userId);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{...body,email:`new-${email}`,inviteCode:code}})).statusCode,403);
  process.env.PAPERWAKE_SIGNUP_INVITE_CODE='short';
  assert.equal((await app.inject({method:'POST',url:'/api/auth/register',headers:{origin:config.origin},payload:{...body,email:`new-${email}`,inviteCode:'short'}})).statusCode,403);
  await assert.rejects(buildApp(),/32–256/);
 }finally{
  await app?.close();if(workspaceId)await adminPool.query('delete from workspaces where id=$1',[workspaceId]);if(userId)await adminPool.query('delete from users where id=$1',[userId]);
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});
