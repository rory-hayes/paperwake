import type {QueryResult} from 'pg';
import {openAIExtraction} from './openai-provider.js';
import {activeBillingMode} from './usage-allowance.js';
import type {AIUsageKind} from '../../shared/ai-usage.js';

/** Current pinned model: 400k context, at most 16k output, no tools. At the
 * checked-in $0.75/$4.50 rates, even 400k input + 16k output costs <$0.40.
 * $1 remains reserved until a matching, arithmetically verified price settles.
 * Model, endpoint, output limit or price changes require reviewing this bound. */
export const aiCostBudgetPolicy=Object.freeze({model:'gpt-5.4-mini-2026-03-17',pricingBasis:'OpenAI standard USD token rates, 2026-09-07',reserveUsd:'1',maxInputTokens:400_000,maxOutputTokens:16_000,inputPerMillion:'0.75',cachedInputPerMillion:'0.075',outputPerMillion:'4.5'});
export class AIProcessingPaused extends Error{
 readonly permanent=true;readonly statusCode=503;readonly code='AI_PROCESSING_PAUSED';
 constructor(readonly reason:'workspace_budget'|'global_budget'|'configuration'|'ledger'){
  super(reason==='ledger'?'AI usage could not be reserved. Invoice processing is paused; contact support. This attempt did not use your page allowance.':'Invoice processing is temporarily paused for a processing-cost review. Contact support. This attempt did not use your page allowance.');
 }
}
function boundedUsd(value:string|undefined,fallback:string,maximum:number){
 const selected=value===undefined?fallback:value;
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(selected)||Number(selected)<1||Number(selected)>maximum)throw new AIProcessingPaused('configuration');
 return selected;
}
export function configuredAICostBudgets(environment:NodeJS.ProcessEnv=process.env){
 return {trialUsd:boundedUsd(environment.PAPERWAKE_AI_TRIAL_MONTHLY_USD,'2',1000),paidUsd:boundedUsd(environment.PAPERWAKE_AI_PAID_MONTHLY_USD,'25',1000),globalUsd:boundedUsd(environment.PAPERWAKE_AI_GLOBAL_MONTHLY_USD,'100',10000)};
}
type Client={query:(sql:string,values?:unknown[])=>Promise<QueryResult>};
/** Runs in the SAME transaction as dispatch intent insertion. There is no
 * customer-controlled reset: jobs/documents may disappear; these rows remain.
 * Backend policies are required to see the installation-wide ledger. */
export async function assertAIDispatchBudget(client:Client,workspaceId:string,operation:{kind:AIUsageKind;operationId:string;attempt:number}){
 const limits=configuredAICostBudgets(),policy=aiCostBudgetPolicy;
 // Refuse a future provider/configuration change until its reservation bound is
 // reviewed explicitly. There are no configurable models, tools or endpoints.
 if(openAIExtraction.model!==policy.model||openAIExtraction.endpoint!=='https://api.openai.com/v1/responses'||openAIExtraction.maxOutputTokens>policy.maxOutputTokens||openAIExtraction.inputPerMillion!==Number(policy.inputPerMillion)||openAIExtraction.cachedInputPerMillion!==Number(policy.cachedInputPerMillion)||openAIExtraction.outputPerMillion!==Number(policy.outputPerMillion))throw new AIProcessingPaused('configuration');
 await client.query("select pg_advisory_xact_lock(hashtextextended(current_schema()||':paperwake:ai-cost-budget:v1',0))");
 const {rows:[decision]}=await client.query(`with budget_window as materialized (
   select date_trunc('month',clock_timestamp(),'UTC') as month_start
  ), charges as (
   select workspace_id,case when usage_state='reported_priced' and model=$5 and pricing_basis=$6
    and input_tokens<=$7 and output_tokens<=$8
    and cost_usd=round(((input_tokens-cached_input_tokens)*$9::numeric+cached_input_tokens*$10::numeric+output_tokens*$11::numeric)/1000000,9)
    then cost_usd else greatest($12::numeric,coalesce(cost_usd,0)) end as reserved_cost
   from ai_usage_attempts,budget_window where created_at>=month_start
  ), totals as (
   select coalesce(sum(reserved_cost),0) as global_cost,
    coalesce(sum(reserved_cost) filter(where workspace_id=$1),0) as workspace_cost from charges
  ), dispatch_grant as (
   -- An accepted paid operation retains its original cost cap after downgrade.
   -- Bind every fact to this exact dispatch; a workspace-level reservation is
   -- not authority for another job, a trial, a stale attempt or another mode.
   select exists(select 1 from usage_reservations r
    join jobs j on j.id=r.job_id and j.workspace_id=r.workspace_id
    join documents d on d.id=j.document_id and d.workspace_id=j.workspace_id
    where $14::text='extraction' and j.id=$15::uuid and j.attempts=$16::integer and j.workspace_id=$1
     and j.state='processing' and j.lease_owner is not null and j.lease_until>clock_timestamp()
     and r.state='reserved' and r.allowance_kind='subscription' and r.billing_mode=$13::text
     and r.document_id=j.document_id and r.pages=d.page_count and r.pages>0) as paid
  ) select w.id as workspace_id,
   totals.global_cost+$12::numeric<=$4::numeric as global_allowed,
   totals.workspace_cost+$12::numeric<=case when (w.plan->>'id'='standard' and w.plan->>'billingMode'=$13::text) or dispatch_grant.paid then $3::numeric else $2::numeric end as workspace_allowed
  from workspaces w cross join totals cross join dispatch_grant where w.id=$1`,[workspaceId,limits.trialUsd,limits.paidUsd,limits.globalUsd,policy.model,policy.pricingBasis,policy.maxInputTokens,policy.maxOutputTokens,policy.inputPerMillion,policy.cachedInputPerMillion,policy.outputPerMillion,policy.reserveUsd,activeBillingMode(),operation.kind,operation.operationId,operation.attempt]);
 if(!decision||typeof decision.global_allowed!=='boolean'||typeof decision.workspace_allowed!=='boolean')throw new AIProcessingPaused('ledger');
 if(!decision.global_allowed)throw new AIProcessingPaused('global_budget');
 if(!decision.workspace_allowed)throw new AIProcessingPaused('workspace_budget');
}
