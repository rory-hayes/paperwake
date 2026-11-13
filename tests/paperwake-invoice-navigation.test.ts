import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SchemaField} from '../shared/types';
import {hasUnsavedInvoiceChanges} from '../src/features/documents/value-editing';
import {preventInvoiceDraftUnload,shouldBlockInvoiceNavigation} from '../src/features/documents/UnsavedInvoiceChanges';
import {createInvoiceDraftGuard,type InvoiceDepartureAction} from '../src/features/documents/InvoiceDraftGuard';
import {SessionProvider,useSession} from '../src/lib/session';

const fields:SchemaField[]=[{key:'invoice_number',label:'Invoice number',type:'string'},{key:'total',label:'Total',type:'currency'},{key:'tax',label:'Tax',type:'currency'},{key:'line_items',label:'Lines',type:'array',fields:[{key:'amount',label:'Amount',type:'currency'}]}];
const saved={invoice_number:'000123',total:'10.00',tax:null,line_items:[{amount:'10.00'}]};
const corrected={...saved,total:'12.50',line_items:[{amount:'12.50'}]};

test('navigation protection tracks saved corrections, failed saves, stale revisions and explicit reloads',()=>{
  assert.equal(hasUnsavedInvoiceChanges(saved,saved,saved,fields),false);
  assert.equal(hasUnsavedInvoiceChanges(corrected,saved,saved,fields),true,'edits are protected before saving');
  // A rejected validation/network save supplies no new saved values.
  assert.equal(hasUnsavedInvoiceChanges(corrected,saved,saved,fields),true,'a failed save cannot clear protection');
  assert.equal(hasUnsavedInvoiceChanges(corrected,corrected,saved,fields),false,'successful save response clears protection before the query refresh');
  const newer={...saved,total:'14.00'};
  assert.equal(hasUnsavedInvoiceChanges(corrected,saved,newer,fields),true,'a competing saved revision does not discard this draft');
  assert.equal(hasUnsavedInvoiceChanges(corrected,saved,corrected,fields),false,'the current server values already contain this draft');
  assert.equal(hasUnsavedInvoiceChanges(newer,newer,newer,fields),false,'loading the latest saved revision clears protection');
  assert.equal(hasUnsavedInvoiceChanges(saved,saved,newer,fields),false,'an untouched old revision is not an unsaved edit');
});

test('dirty comparison ignores editor-only normalization but preserves exact monetary scale and identifiers',()=>{
  assert.equal(hasUnsavedInvoiceChanges({...saved,total:' 10.00 ',tax:'',line_items:[{amount:' 10.00 '}]},saved,saved,fields),false);
  assert.equal(hasUnsavedInvoiceChanges({...saved,tax:undefined},saved,saved,fields),false);
  assert.equal(hasUnsavedInvoiceChanges({...saved,total:'10.0'},saved,saved,fields),true,'decimal scale is part of the approved export contract');
  assert.equal(hasUnsavedInvoiceChanges({...saved,invoice_number:'123'},saved,saved,fields),true);
  assert.equal(hasUnsavedInvoiceChanges({...saved,total:'1.2.3'},saved,saved,fields),true,'invalid typed text is still an unsaved draft');
});

function navigationFixture(entries=['/app','/app/documents/invoice-a'],initialIndex=entries.length-1){
  const router=createMemoryRouter([{path:'*',element:null}],{initialEntries:entries,initialIndex});
  let dirty=true;
  router.getBlocker('invoice-draft',({currentLocation,nextLocation})=>shouldBlockInvoiceNavigation(dirty,currentLocation.pathname,nextLocation.pathname));
  return {router,setDirty(value:boolean){dirty=value;},blocker:()=>router.state.blockers.get('invoice-draft')!};
}

test('router blocks internal departures, keeps the current invoice on cancel and leaves on explicit discard',async()=>{
  for(const destination of ['/app','/app/settings','/app/documents/invoice-b']){
    const {router,blocker}=navigationFixture();
    try{
      await router.navigate(destination);
      assert.equal(router.state.location.pathname,'/app/documents/invoice-a');assert.equal(blocker().state,'blocked');
      const first=blocker();if(first.state!=='blocked')assert.fail('Expected blocked navigation');first.reset();
      assert.equal(router.state.location.pathname,'/app/documents/invoice-a');assert.equal(blocker().state,'unblocked');
      await router.navigate(destination);const retry=blocker();if(retry.state!=='blocked')assert.fail('Expected repeated navigation to remain protected');retry.proceed();
      await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(router.state.location.pathname,destination);
    }finally{router.dispose();}
  }
});

test('router protects back and forward history without consuming the destination when the user stays',async()=>{
  for(const delta of [-1,1]){
    const entries=delta<0?['/app','/app/documents/invoice-a']:['/app/documents/invoice-a','/app/settings'];
    const {router,blocker}=navigationFixture(entries,delta<0?1:0);
    try{
      await router.navigate(delta);const blocked=blocker();if(blocked.state!=='blocked')assert.fail('Expected history navigation to be blocked');blocked.reset();
      assert.equal(router.state.location.pathname,'/app/documents/invoice-a');
      await router.navigate(delta);const repeated=blocker();if(repeated.state!=='blocked')assert.fail('Expected history destination to remain available');repeated.proceed();
      await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(router.state.location.pathname,delta<0?'/app':'/app/settings');
    }finally{router.dispose();}
  }
});

test('clean saved values and same-invoice query/hash navigation do not require discarding changes',async()=>{
  const {router,setDirty,blocker}=navigationFixture();
  try{
    await router.navigate('/app/documents/invoice-a?view=fields#main');
    assert.notEqual(blocker()?.state,'blocked');assert.equal(router.state.location.search,'?view=fields');
    setDirty(false);await router.navigate('/app');assert.equal(router.state.location.pathname,'/app');
  }finally{router.dispose();}
});

test('the unload handler requests the native warning without including invoice data',()=>{
  let prevented=0;
  const event={preventDefault(){prevented++;},returnValue:'unchanged'};
  preventInvoiceDraftUnload(event as BeforeUnloadEvent);
  assert.equal(prevented,1);assert.equal(event.returnValue,'');
});

test('a guarded sign-out does not run before confirmation and stale review cleanup cannot remove the current guard',async()=>{
  const guard=createInvoiceDraftGuard();let calls=0,pending:InvoiceDepartureAction|undefined;
  const first=guard.register(action=>{pending=action;});
  const removeCurrent=guard.register(action=>{pending=action;});first();
  guard.requestDeparture(async()=>{calls++;});assert.equal(calls,0);
  pending=undefined;assert.equal(calls,0,'keeping the draft performs no logout action');
  guard.requestDeparture(async()=>{calls++;});assert.equal(calls,0);
  await pending!(()=>{});assert.equal(calls,1);
  removeCurrent();guard.requestDeparture(async()=>{calls++;});assert.equal(calls,2,'a clean or unmounted review no longer intercepts sign-out');
});

test('logout releases the unload warning only after the server accepts logout; failure preserves the active session',async()=>{
  for(const success of [true,false]){
    const storage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),window=Object.getOwnPropertyDescriptor(globalThis,'window'),fetch=globalThis.fetch;
    const events:string[]=[];let logout:ReturnType<typeof useSession>['logout']|undefined;
    const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:Infinity}}});
    client.setQueryData(['session','owned-workspace'],{user:{id:'owned-user'},workspace:{id:'owned-workspace'},workspaces:[]});
    Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'owned-workspace',removeItem:()=>events.push('clear-workspace')}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{assign:(path:string)=>events.push(`navigate:${path}`)}}});
    globalThis.fetch=(async(input)=>{assert.equal(input,'/api/auth/logout');events.push('request');return new Response(success?'{}':'{"message":"Logout unavailable"}',{status:success?200:503,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
    function Capture(){logout=useSession().logout;return null;}
    try{
      renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(SessionProvider,null,createElement(Capture))));
      const departing=logout!(()=>events.push('allow-unload'));
      if(success){await departing;assert.deepEqual(events,['request','allow-unload','clear-workspace','navigate:/sign-in']);assert.equal(client.getQueryCache().getAll().length,0);}
      else {await assert.rejects(departing,/Logout unavailable/);assert.deepEqual(events,['request']);assert.ok(client.getQueryData(['session','owned-workspace']));}
    }finally{client.clear();globalThis.fetch=fetch;for(const [key,descriptor] of [['sessionStorage',storage],['window',window]] as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
  }
});
