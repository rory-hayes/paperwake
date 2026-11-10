import type {PoolClient} from 'pg';
import {badRequest} from './db.js';
import {mockBillingEnabled} from '../integrations/mock-billing.js';
import {stripeMode} from '../integrations/provider-policy.js';

export type PageAllowance={kind:'trial'|'subscription';key:string;limit:number;startsAt:string|null;endsAt:string|null;available:boolean};
export type PageUsage=PageAllowance&{pages:number;reservedPages:number;remainingPages:number};

/** Resolve the running mode without treating malformed mock settings as Stripe. */
export function activeBillingMode(environment:NodeJS.ProcessEnv=process.env):'mock'|'test'|'live'|null{
 if(environment.FOLIO_BILLING_MOCK==='true')return mockBillingEnabled(environment)?'mock':null;
 try{
  const mode=stripeMode(environment);
  return mode==='live'&&environment.FOLIO_PREVIEW_MODE==='true'?null:mode;
 }catch{return null;}
}

/** Paid test/mock state never grants production capacity after a mode change. */
export function planBillingModeAllowed(plan:Record<string,unknown>,environment:NodeJS.ProcessEnv=process.env):boolean{
 if(plan.id==='explore')return true;
 if(plan.id!=='standard')return false;
 const mode=activeBillingMode(environment);
 return mode!==null&&plan.billingMode===mode;
}

/** The server's persisted plan, never upload input, defines the allowance. */
export function pageAllowance(plan:Record<string,unknown>,now=new Date(),environment:NodeJS.ProcessEnv=process.env):PageAllowance{
 const limit=Number(plan.monthlyPages);
 if(!Number.isSafeInteger(limit)||limit<0)throw new Error('Invalid page allowance configuration.');
 if(plan.id==='explore')return {kind:'trial',key:'trial',limit,startsAt:null,endsAt:null,available:true};
 if(plan.id!=='standard')return {kind:'subscription',key:'unavailable',limit:0,startsAt:null,endsAt:null,available:false};
 const start=typeof plan.periodStart==='string'?new Date(plan.periodStart):new Date(NaN);
 const end=typeof plan.periodEnd==='string'?new Date(plan.periodEnd):new Date(NaN);
 const valid=Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>start&&typeof plan.subscriptionId==='string';
 return {kind:'subscription',key:valid?`subscription:${plan.subscriptionId}:${start.toISOString()}`:'unavailable',limit,
  startsAt:valid?start.toISOString():null,endsAt:valid?end.toISOString():null,available:valid&&planBillingModeAllowed(plan,environment)&&now>=start&&now<end};
}

export async function readPageUsage(c:PoolClient,workspaceId:string,plan:Record<string,unknown>):Promise<PageUsage>{
 const {rows:[clock]}=await c.query('select clock_timestamp() as at');
 const allowance=pageAllowance(plan,clock.at);
 const {rows:[totals]}=await c.query(`select
  coalesce(sum(pages) filter(where state='committed'),0)::int pages,
  coalesce(sum(pages) filter(where state='reserved'),0)::int reserved_pages
  from usage_reservations where workspace_id=$1 and allowance_key=$2`,[workspaceId,allowance.key]);
 const pages=totals.pages,reservedPages=totals.reserved_pages;
 return {...allowance,pages,reservedPages,remainingPages:allowance.available?Math.max(0,allowance.limit-pages-reservedPages):0};
}

/** Caller holds the workspace advisory lock, shared with billing/deletion. */
export async function reservePageUsage(c:PoolClient,input:{workspaceId:string;documentId:string;jobId:string;pages:number;plan:Record<string,unknown>}){
 const {workspaceId,documentId,jobId,pages,plan}=input;
 if(!Number.isSafeInteger(pages)||pages<1)throw new Error('Invalid document page count.');
 const existing=(await c.query('select id,pages,document_id,state,allowance_kind,billing_mode from usage_reservations where workspace_id=$1 and job_id=$2',[workspaceId,jobId])).rows[0];
 if(existing){
  if(existing.state==='released')throw new Error('Processing page reservation was released.');
  if(existing.pages!==pages||existing.document_id!==documentId)throw new Error('Usage reservation does not match the processing job.');
  if(existing.allowance_kind==='subscription'&&(!existing.billing_mode||existing.billing_mode!==activeBillingMode()))badRequest('The billing mode for this processing reservation has changed. Please contact support.',503);
  return;
 }
 const usage=await readPageUsage(c,workspaceId,plan);
 if(!usage.available)badRequest('Your subscription allowance is awaiting a billing update. Please retry shortly or contact support.',503);
 if(pages>usage.remainingPages)badRequest(usage.kind==='trial'?'Your ten evaluation pages are used or reserved. Subscribe to process more invoices.':'Your page allowance is used or reserved for this billing period. No extra charge will be made.',429);
 await c.query(`insert into usage_reservations(workspace_id,document_id,job_id,pages,allowance_key,allowance_kind,period_start,period_end,billing_mode)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[workspaceId,documentId,jobId,pages,usage.key,usage.kind,usage.startsAt,usage.endsAt,usage.kind==='subscription'?plan.billingMode:null]);
}

/** Same transaction as the saved extraction candidate; fenced worker owns the job. */
export async function commitPageUsage(c:PoolClient,workspaceId:string,jobId:string){
 const {rows:[reservation]}=await c.query('select * from usage_reservations where workspace_id=$1 and job_id=$2 for update',[workspaceId,jobId]);
 if(!reservation)throw new Error('Processing has no page reservation.');
 if(reservation.state==='released')throw new Error('Processing page reservation was released.');
 if(reservation.state==='committed')return;
 await c.query(`insert into usage_ledger(workspace_id,document_id,event,pages,idempotency_key) values($1,$2,'processed',$3,$4)
  on conflict(idempotency_key) do nothing`,[workspaceId,reservation.document_id,reservation.pages,`processed:${reservation.id}`]);
 await c.query("update usage_reservations set state='committed',updated_at=clock_timestamp() where id=$1",[reservation.id]);
}

/** Release only unresolved work; deleting a completed invoice never refunds its usage. */
export async function releasePageUsage(c:PoolClient,workspaceId:string,selector:{jobId:string}|{documentId:string}){
 const byJob='jobId' in selector;
 await c.query(`update usage_reservations set state='released',updated_at=clock_timestamp()
  where workspace_id=$1 and ${byJob?'job_id':'document_id'}=$2 and state='reserved'`,[workspaceId,byJob?selector.jobId:selector.documentId]);
}
