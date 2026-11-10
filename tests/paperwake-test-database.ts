import assert from 'node:assert/strict';
import {isIP} from 'node:net';

type DatabaseIdentity={db:string;schema:string;address:string|null};
/** Docker-published CI ports connect locally but PostgreSQL sees its bridge IP. */
export function assertPaperwakeTestDatabaseIdentity(configured:{host:string;database:string},identity:DatabaseIdentity,environment:NodeJS.ProcessEnv=process.env){
 assert.equal(environment.NODE_ENV,'test','Use the Paperwake test runner.');
 assert.ok(configured.host.startsWith('/')||['127.0.0.1','localhost','::1','[::1]'].includes(configured.host),'Fixture database must be local.');
 assert.ok(['paperwake_test','paperwake_ci'].includes(configured.database),'Fixtures require an explicitly named Paperwake test database.');
 assert.equal(identity.db,configured.database);assert.equal(identity.schema,'public');
 if(identity.address===null||['127.0.0.1','::1'].includes(identity.address))return;
 const expected=environment.PAPERWAKE_TEST_DATABASE_SERVER_ADDRESS??'';
 const octets=expected.split('.').map(Number);
 const privateIpv4=isIP(expected)===4&&(octets[0]===10||octets[0]===172&&octets[1]!>=16&&octets[1]!<=31||octets[0]===192&&octets[1]===168);
 assert.ok(environment.GITHUB_ACTIONS==='true'&&configured.database==='paperwake_ci'&&['127.0.0.1','::1','[::1]'].includes(configured.host)&&privateIpv4&&identity.address===expected,'Fixture server must be local or the exact pinned GitHub CI service container.');
}
/** Refuse production, remote or original Folio databases before fixture writes. */
export async function assertPaperwakeTestDatabase(){
 const {adminPool,appPool,databaseSchema}=await import('../server/core/db.js');
 assert.equal(process.env.NODE_ENV,'test','Use the Paperwake test runner.');
 assert.equal(databaseSchema,'public');
 for(const pool of [adminPool,appPool]){
  const url=pool.options.connectionString?new URL(pool.options.connectionString):null;
  const host=url?.hostname??pool.options.host??'';
  const configuredDatabase=url?decodeURIComponent(url.pathname.slice(1)):pool.options.database;
  assert.ok(host.startsWith('/')||['127.0.0.1','localhost','::1','[::1]'].includes(host),'Fixture database must be local.');
  assert.ok(['paperwake_test','paperwake_ci'].includes(String(configuredDatabase)),'Fixtures require an explicitly named Paperwake test database.');
  const {rows:[identity]}=await pool.query('select current_database() db,current_schema() schema,inet_server_addr()::text address,current_user role');
  assertPaperwakeTestDatabaseIdentity({host,database:String(configuredDatabase)},identity);
 }
 const {rows:[role]}=await appPool.query('select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=current_user');
 assert.ok(role);assert.ok(Object.values(role).every(value=>value===false),'Application fixture role must not bypass tenant isolation.');
}
