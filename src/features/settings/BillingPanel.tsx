import { useSearchParams } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { PLANS } from '../../../shared/plans';
import { commercialTerms } from '../../../shared/commercial';
import { Button, ErrorState, Loading, Notice } from '../../components/ui';
import { post, useAction, useData } from '../../lib/api';
import { useSession } from '../../lib/session';
import type { ProviderStatus } from '../integrations/types';
import CheckoutTermsRecords from './CheckoutTermsRecords';

type UsageData={plan:{id:string;name:string;monthlyPages:number};usage:{pages:number;reservedPages:number;remainingPages:number;kind:'trial'|'subscription';endsAt:string|null;available:boolean};billingRule:string};
export default function BillingPanel() {
  const providers=useData<ProviderStatus>('/api/providers/status');
  const usageQuery=useData<UsageData>('/api/workspace/usage',true);
  const {data:session}=useSession();
  const action=useAction(),[params]=useSearchParams();
  const canManage=['owner','admin'].includes(session?.workspace.role||'');
  const generation=useRef(0);
  useLayoutEffect(()=>{generation.current++;return()=>{generation.current++;};},[session?.user.id,session?.workspace.id,session?.workspace.role,providers.data?.stripe.mode]);
  async function openBilling(path:string,body?:unknown){
    const started=generation.current,expectedMode=providers.data?.stripe.mode;
    const result=await action.run(async()=>{
      const response=await post<{url:string;mode:'test'|'live'}>(path,body);
      if(response.mode!==expectedMode)throw new Error('Billing changed. Refresh this page before continuing.');
      return response;
    },expectedMode==='live'?'Opening secure billing…':'Opening Stripe test mode…');
    if(result?.url&&generation.current===started)window.location.assign(result.url);
  }
  async function changeMockPlan(subscribe:boolean){
    await action.run(()=>post(subscribe?'/api/billing/mock/plan':'/api/billing/mock/cancel',subscribe?{planId:'standard'}:{}),'Test allowance updated. No payment was made.');
  }
  if(providers.isPending||usageQuery.isPending)return <Loading/>;
  if(providers.error||!providers.data)return <ErrorState error={providers.error} retry={()=>void providers.refetch()}/>;
  if(usageQuery.error||!usageQuery.data)return <ErrorState error={usageQuery.error} retry={()=>void usageQuery.refetch()}/>;
  const stripe=providers.data.stripe,{plan,usage,billingRule}=usageQuery.data,paid=PLANS.find(p=>p.id==='standard')!;
  const isMock=stripe.mode==='mock',isLive=stripe.mode==='live',subscribed=plan.id==='standard';
  const percent=plan.monthlyPages>0?Math.min(100,(usage.pages+usage.reservedPages)/plan.monthlyPages*100):0;
  return <section className="billing-panel">
    <div className="settings-section-heading"><div><h2>Plan & billing</h2><p>Simple page allowances, with no automatic overage charges.</p></div><CreditCard size={26} strokeWidth={1.5}/></div>
    {!isLive?<div className="settings-information"><strong>{isMock?'Demo billing · no payments':'Test billing · no real payments'}</strong><p>{isMock?'Plan changes simulate a subscription in this test account.':stripe.configured?'Checkout uses Stripe test mode. No real subscription payment is taken.':'Paid checkout is not available yet. You can use your evaluation pages.'}</p></div>:!stripe.configured?<div className="settings-information"><strong>Paid checkout is temporarily unavailable</strong><p>Your existing invoices and current page allowance remain available.</p></div>:null}
    <section className="usage-summary" aria-labelledby="usage-allowance-title"><p className="small">{subscribed?'Paperwake':'Free evaluation'}</p><h2 id="usage-allowance-title">{usage.pages} <small>/ {plan.monthlyPages} pages {usage.kind==='trial'?'once':'this billing period'}</small></h2><div className="usage-meter" role="meter" aria-label="Page allowance used or processing" aria-valuemin={0} aria-valuemax={plan.monthlyPages} aria-valuenow={Math.min(plan.monthlyPages,usage.pages+usage.reservedPages)}><span style={{width:`${percent}%`}}/></div><p className="small muted">{usage.remainingPages} pages available{usage.reservedPages?` · ${usage.reservedPages} processing`:''}{usage.endsAt?` · Period ends ${new Date(usage.endsAt).toLocaleDateString('en-IE')}`:' · No monthly reset'}</p>{!usage.available?<p className="small">Your subscription allowance is awaiting a billing update. Please retry shortly.</p>:null}</section>
    {params.get('checkout')==='returned'?<div className="settings-callout">Your subscription appears after Stripe confirms payment. Returning from Checkout alone does not confirm payment.</div>:params.get('checkout')==='canceled'?<div className="settings-callout">Checkout was canceled. Your current allowance is unchanged.</div>:null}
    <Notice error={action.error} message={action.message}/>
    <div className="plan-columns"><div><h3>{paid.name}</h3><h2>€{paid.monthlyPrice} <small>/ month</small></h2><p>{paid.monthlyPages} processed pages per billing period</p><ul>{paid.features.map(feature=><li key={feature}>{feature}</li>)}</ul>{!subscribed?<Button disabled={!canManage||action.busy||(!isMock&&!stripe.configured)} onClick={()=>void (isMock?changeMockPlan(true):openBilling('/api/billing/checkout',{planId:'standard'}))}>{isMock?'Try demo plan':isLive?'Subscribe to Paperwake':'Test checkout'}</Button>:<p className="small">Your current plan</p>}</div></div>
    <div className="settings-callout"><strong>How pages are counted</strong><p>{billingRule}</p></div>
    <p className="small muted">{commercialTerms.allowance}</p><p className="small muted">{commercialTerms.tax} {commercialTerms.refunds}</p>
    <div className="actions">{isMock?<Button variant="secondary" disabled={!canManage||action.busy||!subscribed} onClick={()=>void changeMockPlan(false)}>Cancel demo subscription</Button>:<Button variant="secondary" disabled={!canManage||!stripe.configured||action.busy} onClick={()=>void openBilling('/api/billing/portal')}><ExternalLink size={16}/>{isLive?'Manage billing & cancellation':'Open test billing portal'}</Button>}</div>
    {canManage&&session?<CheckoutTermsRecords key={`${session.user.id}:${session.workspace.id}:${session.workspace.role}`} workspace={session.workspace.id}/>:null}
  </section>;
}
