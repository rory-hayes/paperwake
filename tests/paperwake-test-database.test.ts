import assert from 'node:assert/strict';
import test from 'node:test';
import {assertPaperwakeTestDatabase,assertPaperwakeTestDatabaseIdentity as check,paperwakeTestDatabaseIdentityQuery} from './paperwake-test-database.js';

test('fixture identity permits named local test databases over sockets and loopback',()=>{
 for(const database of ['paperwake_test','paperwake_ci'])for(const [host,address] of [['/tmp',null],['127.0.0.1','127.0.0.1'],['::1','::1']] as const){
  assert.doesNotThrow(()=>check({host,database},{db:database,schema:'public',address},{NODE_ENV:'test'}));
 }
});

test('GitHub localhost-published PostgreSQL accepts only its pinned private service address',()=>{
 for(const address of ['172.18.0.2','10.0.0.2','192.168.1.2']){
  assert.doesNotThrow(()=>check({host:'127.0.0.1',database:'paperwake_ci'},{db:'paperwake_ci',schema:'public',address},{NODE_ENV:'test',GITHUB_ACTIONS:'true',PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS:address}));
 }
});

test('CI pinning cannot admit other servers, remote connections, non-test databases or wrong schemas',()=>{
 const configured={host:'127.0.0.1',database:'paperwake_ci'};
 const identity={db:'paperwake_ci',schema:'public',address:'172.18.0.2'};
 const environment={NODE_ENV:'test',GITHUB_ACTIONS:'true',PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS:'172.18.0.2'};
 for(const patch of [
  {environment:{NODE_ENV:'production'}},
  {environment:{GITHUB_ACTIONS:'false'}},
  {environment:{PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS:''}},
  {environment:{PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS:'172.18.0.3'}},
  {configured:{host:'database.example.com'}},
  {configured:{host:'172.18.0.2'}},
  {configured:{host:'localhost'}},
  {configured:{database:'paperwake_local'},identity:{db:'paperwake_local'}},
  {configured:{database:'paperwake_test'},identity:{db:'paperwake_test'}},
  {identity:{db:'folio'}},
  {identity:{schema:'paperwake'}},
 ])assert.throws(()=>check({...configured,...patch.configured},{...identity,...patch.identity},{...environment,...patch.environment}));
 for(const address of ['203.0.113.2','172.15.0.2','172.32.0.2','192.167.1.2','10.1.1.999','not-an-address']){
  assert.throws(()=>check(configured,{...identity,address},{...environment,PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS:address}));
 }
});

test('PostgreSQL identity query normalizes service inet addresses without a CIDR suffix',async()=>{
 const {adminPool,closeDatabase}=await import('../server/core/db.js');
 try{
  await assertPaperwakeTestDatabase();
  // Substitute only the server inet value so a socket-based local run covers
  // the exact SQL expression used for GitHub's TCP/Docker service connection.
  for(const address of ['172.18.0.2','10.0.0.2','192.168.1.2']){
   const {rows:[identity]}=await adminPool.query(paperwakeTestDatabaseIdentityQuery.replace('inet_server_addr()','$1::inet'),[address]);
   assert.equal(identity.address,address);
   check({host:'127.0.0.1',database:'paperwake_ci'},{...identity,db:'paperwake_ci'},{NODE_ENV:'test',GITHUB_ACTIONS:'true',PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS:address});
  }
 }finally{await closeDatabase();}
});
