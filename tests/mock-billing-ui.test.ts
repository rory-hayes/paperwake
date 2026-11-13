import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {SessionProvider} from '../src/lib/session';
import BillingPanel from '../src/features/settings/BillingPanel';
import {PLANS} from '../shared/plans';

type Options={mode?:'mock'|'test'|'live';role?:'owner'|'viewer';configured?:boolean;subscribed?:boolean;failure?:'providers'|'usage';usagePending?:boolean;usageAvailable?:boolean;checkout?:'returned'|'canceled'};
function renderBilling({mode='live',role='owner',configured=true,subscribed=false,failure,usagePending=false,usageAvailable=true,checkout}:Options={}){
  const storage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),fetch=globalThis.fetch;let calls=0;
  globalThis.fetch=(async()=>{calls++;throw new Error('Network is forbidden in this component fixture');}) as typeof fetch;
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'billing-ui-fixture'}});
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:Infinity}}});
  const workspace='billing-ui-fixture',plan=PLANS.find(item=>item.id===(subscribed?'standard':'explore'))!;
  client.setQueryData(['session',workspace],{user:{id:'owned-user'},workspace:{id:workspace,role,plan}});
  const providerKey=[workspace,'/api/providers/status'],usageKey=[workspace,'/api/workspace/usage'];
  client.setQueryData(providerKey,{stripe:{mode,configured}});
  if(!usagePending)client.setQueryData(usageKey,{plan,usage:{pages:subscribed?124:1,reservedPages:subscribed?5:1,remainingPages:usageAvailable?(subscribed?371:8):0,kind:subscribed?'subscription':'trial',endsAt:subscribed?'2026-11-20T00:00:00.000Z':null,available:usageAvailable},billingRule:'Successful processing uses pages. Internal retries do not add a second charge.'});
  if(failure)client.getQueryCache().find({queryKey:failure==='providers'?providerKey:usageKey,exact:true})!.setState({status:'error',error:new Error('Billing status unavailable'),fetchStatus:'idle'});
  try{
    const query=checkout?`&checkout=${checkout}`:'';
    const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(MemoryRouter,{initialEntries:[`/app/settings?tab=billing${query}`]},createElement(SessionProvider,null,createElement(BillingPanel)))));
    assert.equal(calls,0);return html;
  }finally{client.clear();globalThis.fetch=fetch;if(storage)Object.defineProperty(globalThis,'sessionStorage',storage);else Reflect.deleteProperty(globalThis,'sessionStorage');}
}
function button(html:string,label:string){
  const found=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match=>match[2].replace(/<[^>]+>/g,'').replaceAll('&amp;','&')===label);
  assert.ok(found,`Missing button: ${label}`);return found[1];
}

test('the free evaluation is one-time and shows reserved pages with one shared-price paid offer',()=>{
  const html=renderBilling();
  assert.match(html,/Free evaluation/);assert.match(html,/\/ 10 pages once/);assert.match(html,/8 pages available · 1 processing · No monthly reset/);
  assert.match(html,/aria-valuemax="10" aria-valuenow="2"/);
  const paid=PLANS.find(plan=>plan.id==='standard')!;
  assert.match(html,new RegExp(`€${paid.monthlyPrice}`));assert.match(html,new RegExp(`${paid.monthlyPages} processed pages per billing period`));
  assert.doesNotMatch(html,/Team|Standard plan|Parsers|suggestion/);
  assert.doesNotMatch(button(html,'Subscribe to MaintainFlow'),/disabled/);
});

test('subscribed usage uses the billing period, preserves reservations and exposes cancellation',()=>{
  const html=renderBilling({subscribed:true});
  assert.match(html,/124 <small>\/ 500 pages this billing period/);assert.match(html,/371 pages available · 5 processing · Period ends/);
  assert.match(html,/aria-valuemax="500" aria-valuenow="129"/);assert.match(html,/Your current plan/);
  assert.doesNotMatch(html,/No monthly reset|Subscribe to MaintainFlow/);assert.doesNotMatch(button(html,'Manage billing & cancellation'),/disabled/);
  const awaiting=renderBilling({subscribed:true,usageAvailable:false});assert.match(awaiting,/allowance is awaiting a billing update/);assert.match(awaiting,/0 pages available/);
});

test('demo controls are labelled simulated while test Checkout never claims a real payment',()=>{
  const demo=renderBilling({mode:'mock',configured:false});
  assert.match(demo,/Demo billing · no payments/);assert.match(demo,/simulate a subscription/);assert.doesNotMatch(button(demo,'Try demo plan'),/disabled/);
  assert.match(button(demo,'Cancel demo subscription'),/disabled/);assert.doesNotMatch(demo,/Test checkout|Subscribe to MaintainFlow/);
  const subscribed=renderBilling({mode:'mock',subscribed:true});assert.doesNotMatch(button(subscribed,'Cancel demo subscription'),/disabled/);
  const testMode=renderBilling({mode:'test',checkout:'returned'});assert.match(testMode,/Test billing · no real payments/);assert.match(testMode,/No real subscription payment is taken/);
  assert.doesNotMatch(button(testMode,'Test checkout'),/disabled/);assert.doesNotMatch(button(testMode,'Open test billing portal'),/disabled/);
  assert.match(testMode,/Returning from Checkout alone does not confirm payment/);
});

test('unconfigured checkout and viewers cannot start billing mutations; cancellation return preserves allowance',()=>{
  for(const mode of ['test','live'] as const){
    const html=renderBilling({mode,configured:false});assert.match(button(html,mode==='live'?'Subscribe to MaintainFlow':'Test checkout'),/disabled/);
    assert.match(button(html,mode==='live'?'Manage billing & cancellation':'Open test billing portal'),/disabled/);assert.match(html,/not available yet|temporarily unavailable/);
  }
  for(const mode of ['mock','test','live'] as const){
    const html=renderBilling({mode,role:'viewer'});assert.match(button(html,mode==='mock'?'Try demo plan':mode==='test'?'Test checkout':'Subscribe to MaintainFlow'),/disabled/);
    assert.match(button(html,mode==='mock'?'Cancel demo subscription':mode==='test'?'Open test billing portal':'Manage billing & cancellation'),/disabled/);
  }
  assert.match(renderBilling({checkout:'canceled'}),/Checkout was canceled. Your current allowance is unchanged/);
});

test('missing or stale billing facts never expose an actionable subscription form',()=>{
  assert.match(renderBilling({usagePending:true}),/Loading your workspace/);
  for(const failure of ['providers','usage'] as const){const html=renderBilling({failure});assert.match(html,/Billing status unavailable/);assert.doesNotMatch(html,/Subscribe to MaintainFlow|Try demo plan|Manage billing/);}
});
