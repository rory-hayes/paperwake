import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {adminPool,closeDatabase,withWorkspace} from '../server/core/db.js';
import {pageAllowance,readPageUsage,reservePageUsage,commitPageUsage,releasePageUsage} from '../server/core/usage-allowance.js';
import {PLANS} from '../shared/plans.js';
import {stripeConfiguration,stripePriceMatches,stripeTaxParameters} from '../server/integrations/provider-policy.js';
import type Stripe from 'stripe';
import {reconcileStripeCustomer} from '../server/integrations/providers.js';

const trial={id:'explore',monthlyPages:10};
const paid=(start='2026-11-01T00:00:00.000Z',end='2026-12-01T00:00:00.000Z')=>({id:'standard',monthlyPages:500,subscriptionId:'sub_owned',periodStart:start,periodEnd:end});
const workspaces:string[]=[];
after(async()=>{if(workspaces.length)await adminPool.query('delete from workspaces where id=any($1::uuid[])',[workspaces]);await closeDatabase();});
async function fixture(){
 const id=randomUUID(),parser=randomUUID(),schema=randomUUID();workspaces.push(id);
 await adminPool.query('insert into workspaces(id,name,slug,plan) values($1,$2,$3,$4)',[id,'Owned Paperwake usage fixture',id,JSON.stringify(trial)]);
 await adminPool.query('insert into parsers(id,workspace_id,name) values($1,$2,$3)',[parser,id,'Invoice fixture']);
 await adminPool.query('insert into schema_versions(id,workspace_id,parser_id,version,schema) values($1,$2,$3,1,$4)',[schema,id,parser,JSON.stringify({fields:[]})]);
 return {id,parser,schema};
}
async function job(f:Awaited<ReturnType<typeof fixture>>){
 const documentId=randomUUID(),jobId=randomUUID();
 await adminPool.query("insert into documents(id,workspace_id,parser_id,name,mime_type,byte_size,sha256,storage_key,page_count) values($1,$2,$3,'owned.pdf','application/pdf',5,$4,$4,1)",[documentId,f.id,f.parser,documentId]);
 await adminPool.query("insert into jobs(id,workspace_id,document_id,schema_version_id,config) values($1,$2,$3,$4,'{}')",[jobId,f.id,documentId,f.schema]);
 return {documentId,jobId};
}
async function reserve(f:Awaited<ReturnType<typeof fixture>>,j:Awaited<ReturnType<typeof job>>,pages:number,plan:Record<string,unknown>=trial){
 return withWorkspace(f.id,async c=>{await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[f.id]);await reservePageUsage(c,{workspaceId:f.id,...j,pages,plan});});
}

test('trial is lifetime and paid allowance is bound to a verified subscription period',()=>{
 assert.equal(pageAllowance(trial,new Date('2026-01-01')).key,pageAllowance(trial,new Date('2030-12-01')).key);
 assert.equal(pageAllowance(paid(),new Date('2026-11-15')).available,true);
 assert.equal(pageAllowance(paid(),new Date('2026-12-01')).available,false);
 assert.equal(pageAllowance({id:'standard',monthlyPages:500},new Date()).available,false);
 assert.notEqual(pageAllowance(paid(),new Date('2026-11-15')).key,pageAllowance(paid('2026-12-01','2027-01-01'),new Date('2026-12-15')).key);
});

test('automatic tax is explicit and malformed configuration fails closed',()=>{
 assert.deepEqual(stripeTaxParameters({}),{});
 assert.deepEqual(stripeTaxParameters({STRIPE_AUTOMATIC_TAX_ENABLED:'false'}),{});
 assert.deepEqual(stripeTaxParameters({STRIPE_AUTOMATIC_TAX_ENABLED:'true'}),{automatic_tax:{enabled:true},customer_update:{address:'auto'}});
 assert.throws(()=>stripeTaxParameters({STRIPE_AUTOMATIC_TAX_ENABLED:'yes'}));
});

test('only the EUR49 monthly Paperwake price enables checkout; legacy Team cannot',()=>{
 assert.deepEqual(PLANS.map(p=>[p.id,p.monthlyPrice,p.monthlyPages]),[['explore',0,10],['standard',49,500]]);
 const settings=stripeConfiguration({STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_STANDARD:'price_owned'});
 const price={id:'price_owned',livemode:false,active:true,currency:'eur',unit_amount:4900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}} as Stripe.Price;
 assert.equal(stripePriceMatches(price,'standard',settings.prices,'test',true),true);
 assert.equal(stripePriceMatches({...price,unit_amount:1900},'standard',settings.prices,'test',true),false);
 assert.equal(stripePriceMatches(price,'team',settings.prices,'test',true),false);
});

test('reservation, retry and commit are atomic and debit only one usable extraction',async()=>{
 const f=await fixture(),j=await job(f);
 await reserve(f,j,3);await reserve(f,j,3);
 let usage=await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial));
 assert.equal(usage.pages,0);assert.equal(usage.reservedPages,3);assert.equal(usage.remainingPages,7);
 assert.equal((await adminPool.query('select count(*)::int total from usage_ledger where workspace_id=$1',[f.id])).rows[0].total,0);
 await assert.rejects(withWorkspace(f.id,async c=>{await commitPageUsage(c,f.id,j.jobId);throw new Error('simulated candidate save rollback');}));
 usage=await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial));assert.equal(usage.pages,0);assert.equal(usage.reservedPages,3);
 await withWorkspace(f.id,async c=>{await commitPageUsage(c,f.id,j.jobId);await commitPageUsage(c,f.id,j.jobId);});
 usage=await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial));assert.equal(usage.pages,3);assert.equal(usage.reservedPages,0);
 assert.equal((await adminPool.query('select count(*)::int total from usage_ledger where workspace_id=$1',[f.id])).rows[0].total,1);
 await withWorkspace(f.id,c=>releasePageUsage(c,f.id,{jobId:j.jobId}));
 await adminPool.query('delete from documents where id=$1',[j.documentId]);
 assert.equal((await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial))).pages,3,'deletion must not restore processed allowance');
});

test('concurrent jobs cannot overbook trial and failed work releases capacity',async()=>{
 const f=await fixture(),a=await job(f),b=await job(f);
 const results=await Promise.allSettled([reserve(f,a,6),reserve(f,b,6)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 const accepted=results[0].status==='fulfilled'?a:b,other=accepted===a?b:a;
 await withWorkspace(f.id,c=>releasePageUsage(c,f.id,{jobId:accepted.jobId}));
 await assert.rejects(withWorkspace(f.id,c=>commitPageUsage(c,f.id,accepted.jobId)),/released/);
 await assert.rejects(reserve(f,accepted,6),/released/);
 await reserve(f,other,6);
 assert.equal((await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial))).remainingPages,4);
});

test('another workspace cannot read, release or commit a reservation',async()=>{
 const f=await fixture(),outside=await fixture(),j=await job(f);await reserve(f,j,4);
 await withWorkspace(outside.id,async c=>{
  assert.equal((await c.query('select id from usage_reservations where job_id=$1',[j.jobId])).rowCount,0);
  await releasePageUsage(c,outside.id,{jobId:j.jobId});
  await assert.rejects(commitPageUsage(c,outside.id,j.jobId),/no page reservation/);
 });
 assert.equal((await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial))).reservedPages,4);
});


test('paid renewal changes the allowance window without restoring already used evaluation pages',async()=>{
 const f=await fixture(),a=await job(f),b=await job(f),now=Date.now();
 await reserve(f,a,3);await withWorkspace(f.id,c=>commitPageUsage(c,f.id,a.jobId));
 const current=paid(new Date(now-86400000).toISOString(),new Date(now+86400000).toISOString());
 await reserve(f,b,5,current);await withWorkspace(f.id,c=>commitPageUsage(c,f.id,b.jobId));
 assert.equal((await withWorkspace(f.id,c=>readPageUsage(c,f.id,current))).pages,5);
 const renewed=paid(new Date(now-1000).toISOString(),new Date(now+30*86400000).toISOString());
 assert.equal((await withWorkspace(f.id,c=>readPageUsage(c,f.id,renewed))).remainingPages,500);
 assert.equal((await withWorkspace(f.id,c=>readPageUsage(c,f.id,trial))).remainingPages,7);
 const expired=paid(new Date(now-2*86400000).toISOString(),new Date(now-86400000).toISOString()),c=await job(f);
 await assert.rejects(reserve(f,c,1,expired),/awaiting a billing update/);
});


test('controlled Stripe reconciliation persists item periods and revokes past-due allowance',async()=>{
 const keys=['STRIPE_MODE','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_STANDARD','STRIPE_ACCOUNT_ID','STRIPE_TEST_CLOCK_ID','STRIPE_AUTOMATIC_TAX_ENABLED','FOLIO_BILLING_MOCK'] as const;
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const f=await fixture(),customerId=`cus_${f.id.replaceAll('-','')}`,eventId=`evt_${randomUUID().replaceAll('-','')}`;
 const now=Math.floor(Date.now()/1000),item={quantity:1,current_period_start:now-3600,current_period_end:now+86400,price:{id:'price_owned',livemode:false,active:true,currency:'eur',unit_amount:4900,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}};
 let subscription={id:'sub_owned',customer:customerId,livemode:false,created:now,status:'active',items:{data:[item]}};
 const client={subscriptions:{list:async(input:{customer:string})=>{assert.equal(input.customer,customerId);return {data:[subscription],has_more:false};}}} as unknown as Stripe;
 try{
  Object.assign(process.env,{STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_owned_fixture',STRIPE_WEBHOOK_SECRET:'whsec_owned_fixture',STRIPE_PRICE_STANDARD:'price_owned',STRIPE_AUTOMATIC_TAX_ENABLED:'false',FOLIO_BILLING_MOCK:'false'});
  delete process.env.STRIPE_ACCOUNT_ID;delete process.env.STRIPE_TEST_CLOCK_ID;
  await adminPool.query("insert into subscriptions(workspace_id,billing_mode,customer_id) values($1,'test',$2)",[f.id,customerId]);
  await adminPool.query("insert into provider_events(id,provider,payload) values($1,'stripe','{}')",[`stripe:${eventId}`]);
  const pointer={id:eventId,type:'customer.subscription.updated',created:now,customerId,mode:'test' as const};
  await reconcileStripeCustomer(pointer,client);
  const stored=async()=>(await adminPool.query('select plan from workspaces where id=$1',[f.id])).rows[0].plan;
  let plan=await stored();assert.equal(plan.id,'standard');assert.equal(plan.monthlyPages,500);assert.equal(plan.periodStart,new Date(item.current_period_start*1000).toISOString());assert.equal(plan.periodEnd,new Date(item.current_period_end*1000).toISOString());
  subscription={...subscription,items:{data:[{...item,current_period_end:0}]}};
  await assert.rejects(reconcileStripeCustomer(pointer,client),/valid allowance period/);assert.deepEqual(await stored(),plan);
  subscription={...subscription,status:'past_due',items:{data:[item]}};
  await reconcileStripeCustomer(pointer,client);plan=await stored();assert.equal(plan.id,'explore');assert.equal(plan.monthlyPages,10);assert.equal(plan.periodStart,undefined);
 }finally{
  await adminPool.query('delete from provider_events where id=$1',[`stripe:${eventId}`]);
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});
