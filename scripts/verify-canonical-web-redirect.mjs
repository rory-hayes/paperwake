import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Controlled packaging proof. The deployed edge still needs an HTTP check. */
export async function verifyCanonicalWebRedirect(output='.vercel/output'){
  const routing=JSON.parse(await fs.readFile(path.join(output,'config.json'),'utf8'));
  const redirects=routing.routes.filter(route=>route.dest==='/canonical-web');
  assert.equal(redirects.length,1,'Exactly one legacy browser redirect is packaged.');
  const route=redirects[0];
  assert.deepEqual(route.methods,['GET','HEAD']);
  assert.deepEqual(route.has,[{type:'host',value:{eq:'paperwake-gamma.vercel.app'}}]);
  assert.equal(routing.routes[0].dest,'/api','API delivery must precede the browser redirect.');
  assert.ok(routing.routes.indexOf(route)<routing.routes.findIndex(candidate=>candidate.handle==='filesystem'));
  const matches=(host,method,pathname)=>route.has[0].value.eq===host&&route.methods.includes(method)&&new RegExp(route.src,'i').test(pathname);
  for(const pathname of ['/','/app','/app/settings','/reset-password','/verify-email/confirm']){
    assert.equal(matches('paperwake-gamma.vercel.app','GET',pathname),true);
    assert.equal(matches('paperwake-gamma.vercel.app','HEAD',pathname),true);
    assert.equal(matches('paperwake-gamma.vercel.app','POST',pathname),false);
    for(const host of ['maintainflow.io','127.0.0.1:5189','localhost','paperwake-branch-rory.vercel.app','paperwake-gamma.vercel.app.example.test'])assert.equal(matches(host,'GET',pathname),false);
  }
  for(const pathname of ['/api','/api/health','/api/billing/webhook','/api/internal/worker','/API/billing/webhook']){
    assert.equal(matches('paperwake-gamma.vercel.app','GET',pathname),false);
    assert.ok(new RegExp('^'+routing.routes[0].src+'$','i').test(pathname),'API requests retain their function route.');
  }
  const root=path.resolve(output,'functions/canonical-web.func');
  const configuration=JSON.parse(await fs.readFile(path.join(root,'.vc-config.json'),'utf8'));
  assert.equal(configuration.handler,'index.mjs');
  const {default:handler}=await import(pathToFileURL(path.join(root,'index.mjs')).href);
  function request(url,method='GET',host='paperwake-gamma.vercel.app'){
    const headers={};let ended=false,body;
    const response={statusCode:200,setHeader(key,value){headers[key.toLowerCase()]=value;},end(value){ended=true;body=value;}};
    handler({url,method,headers:{host}},response);
    assert.equal(ended,true);assert.equal(body,undefined,'No request data is reflected in a response body.');
    assert.equal(headers['cache-control'],'private, no-store');assert.equal(headers['referrer-policy'],'no-referrer');
    return {status:response.statusCode,headers};
  }
  for(const url of ['/','/app/documents/owned-invoice','/app/settings?tab=billing&checkout=returned','/sign-in?next=%2Fapp%3Ffilter%3Da%2520b','/verify-email/confirm?preview=1&preview=2']){
    for(const method of ['GET','HEAD']){
      const result=request(url,method);assert.equal(result.status,307);assert.equal(result.headers.location,'https://maintainflow.io'+url);
    }
  }
  for(const url of ['/api','/api/billing/webhook?event=fixture','/API/health','/a/../api/health','//example.test/','https://example.test/','/\\example.test/','/bad\r\nLocation: https://example.test/','/reset-password#not-transmitted']){
    const result=request(url);assert.equal(result.status,404);assert.equal(result.headers.location,undefined);
  }
  for(const host of ['maintainflow.io','paperwake-branch-rory.vercel.app','localhost','paperwake-gamma.vercel.app.example.test']){
    const result=request('/app','GET',host);assert.equal(result.status,404);assert.equal(result.headers.location,undefined);
  }
  for(const method of ['POST','PUT','DELETE','OPTIONS']){
    const result=request('/app',method);assert.equal(result.status,404);assert.equal(result.headers.location,undefined);
  }
  const injection=request('/sign-in?next=https%3A%2F%2Fexample.test');
  assert.equal(new URL(injection.headers.location).origin,'https://maintainflow.io');
  console.log('PASS generated canonical web redirect: exact host, GET/HEAD, path/query, API exclusion and fixed destination.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)await verifyCanonicalWebRedirect();
