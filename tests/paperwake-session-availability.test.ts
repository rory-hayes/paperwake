import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {invoiceSchema} from '../shared/invoice';
import {registerHooks} from 'node:module';
import {ApiError} from '../src/lib/api';
import {SessionProvider,useSession} from '../src/lib/session';
const hooks=registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
const AppShell=await import('../src/components/AppShell').then(module=>module.default);
const Review=await import('../src/features/documents/Review').then(module=>module.default).finally(()=>hooks.deregister());
function Probe(){const session=useSession();return createElement('output',null,JSON.stringify({user:session.data?.user.id??null,unavailable:Boolean(session.error),loading:session.loading}));}
function render(error:Error,{cached=false,shell=false,review=false}:{cached?:boolean;shell?:boolean;review?:boolean}={}){
 const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),fetch=globalThis.fetch;let calls=0;
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=> 'session-fixture'}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({matches:false})}});
 globalThis.fetch=(async()=>{calls++;throw new Error('Unexpected session mutation');}) as typeof fetch;
 const client=new QueryClient({defaultOptions:{queries:{retry:false,retryOnMount:false,staleTime:Infinity,gcTime:Infinity}}}),key=['session','session-fixture'];
 if(cached)client.setQueryData(key,{user:{id:'owned-user',name:'Owned user',email:'owned@example.test',emailVerifiedAt:'2026-11-01T00:00:00Z',emailVerificationRequired:false},workspace:{id:'session-fixture',name:'Owned workspace',role:'owner',plan:{id:'standard',name:'Paperwake'}},workspaces:[]});
 else client.getQueryCache().build(client,{queryKey:key});
 if(review){
  const values={invoice_number:'SYN-00001',supplier:'Owned supplier',invoice_date:'2026-11-09',currency:'EUR',subtotal:'10.00',tax:'0.00',total:'10.00',line_items:[{description:'Owned line',amount:'10.00'}]};
  const documentKey=['session-fixture','/api/documents/owned-invoice'];
  client.setQueryData(documentKey,{document:{id:'owned-invoice',name:'owned.pdf',mimeType:'application/pdf',pageCount:1,status:'needs_review'},parser:{id:'owned-parser'},runs:[{id:'owned-run',schema:invoiceSchema,effectiveValues:values,effectiveRevision:'run:owned-run',rawValues:values,evidence:{},issues:[],validationIssues:[],corrections:[],approvals:[],createdAt:'2026-11-09T12:00:00Z'}]});
  client.getQueryCache().find({queryKey:documentKey,exact:true})!.setState({status:'error',error,fetchStatus:'idle'});
  client.setQueryData(['session-fixture','/api/export-mappings'],{mappings:[]});
 }
 client.getQueryCache().find({queryKey:key,exact:true})!.setState({status:'error',error,fetchStatus:'idle'});
 try{
  const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(MemoryRouter,{initialEntries:['/app/documents/owned-invoice']},createElement(SessionProvider,null,review?createElement(Routes,null,createElement(Route,{path:'/app/documents/:id',element:createElement(Review)})):createElement(shell?AppShell:Probe)))));
  assert.equal(calls,0);return html;
 }finally{client.clear();globalThis.fetch=fetch;for(const [key,descriptor] of [['sessionStorage',oldStorage],['window',oldWindow]] as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}

test('network and server failures remain unavailable instead of becoming a signed-out session',()=>{
 for(const error of [new TypeError('Failed to fetch'),new ApiError('Private upstream failure',503)]){
  assert.match(render(error),/&quot;unavailable&quot;:true/);
  const cached=render(error,{cached:true});assert.match(cached,/owned-user/);assert.match(cached,/&quot;unavailable&quot;:true/);
  const cachedPage=render(error,{shell:true,cached:true});assert.match(cachedPage,/Retry connection/);assert.match(cachedPage,/Owned workspace/);assert.match(cachedPage,/<span>MaintainFlow<\/span>/);assert.doesNotMatch(cachedPage,/Paperwake/);
  const page=render(error,{shell:true});assert.match(page,/temporarily unavailable/);assert.match(page,/Your sign-in has not been changed/);assert.match(page,/Try again/);assert.doesNotMatch(page,/Private upstream|href="\/sign-in|Create account/);
 }
});

test('an explicit401 removes stale authenticated state and remains a real signed-out response',()=>{
 const html=render(new ApiError('Session expired',401),{cached:true});assert.match(html,/&quot;user&quot;:null/);assert.match(html,/&quot;unavailable&quot;:false/);assert.doesNotMatch(html,/owned-user/);
});


test('an invoice refetch outage retains the rendered saved values and disables mutations until recovery',()=>{
 const html=render(new ApiError('Temporary interruption',503),{cached:true,review:true});
 assert.match(html,/Your invoice draft is still here/);assert.match(html,/value="SYN-00001"/);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Approve &amp; export<\/button>/);
 const deleted=render(new ApiError('Removed',404),{cached:true,review:true});assert.match(deleted,/Invoice unavailable/);assert.doesNotMatch(deleted,/value="SYN-00001"/);
});
