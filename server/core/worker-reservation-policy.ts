import type {PoolClient} from 'pg';
import {activeBillingMode} from './usage-allowance.js';

export class InvoiceAllowancePaused extends Error {
 readonly permanent=true;
 readonly statusCode=503;
 readonly code='INVOICE_ALLOWANCE_PAUSED';
 constructor(){
  super('Invoice processing is paused because its reserved allowance could not be verified for this billing environment. Contact support. This attempt did not use your page allowance.');
 }
}

/** Admission owns the period/plan decision. Dispatch checks the saved grant,
 * not today's subscription: renewal or cancellation cannot erase accepted work.
 * The workspace lock shares the billing, deletion and intake ordering.
 */
export async function assertReservedInvoiceDispatch(client:PoolClient,identity:{workspaceId:string;jobId:string;documentId:string;leaseOwner:string},environment:NodeJS.ProcessEnv=process.env){
 await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[identity.workspaceId]);
 const {rows:[row]}=await client.query(`select r.id,r.state,r.document_id,r.pages,r.allowance_kind,r.allowance_key,r.billing_mode,
   r.period_start,r.period_end,d.page_count
  from jobs j join documents d on d.id=j.document_id and d.workspace_id=j.workspace_id
  left join usage_reservations r on r.job_id=j.id and r.workspace_id=j.workspace_id
  where j.workspace_id=$1 and j.id=$2 and j.document_id=$3 and j.lease_owner=$4 and j.state='processing'
   and j.lease_until>clock_timestamp()`,[identity.workspaceId,identity.jobId,identity.documentId,identity.leaseOwner]);
 if(!row?.id||row.state!=='reserved'||row.document_id!==identity.documentId||!Number.isSafeInteger(row.pages)||row.pages<1||row.pages!==row.page_count)throw new InvoiceAllowancePaused();
 if(row.allowance_kind==='trial'){
  if(row.allowance_key!=='trial'||row.billing_mode!==null||row.period_start!==null||row.period_end!==null)throw new InvoiceAllowancePaused();
  return;
 }
 // Unknown legacy paid modes fail closed. Never infer them from a current plan
 // or subscription ID, which does not prove the original billing environment.
 const mode=activeBillingMode(environment);
 if(row.allowance_kind!=='subscription'||mode===null||row.billing_mode!==mode)throw new InvoiceAllowancePaused();
}
