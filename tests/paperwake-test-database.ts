import assert from 'node:assert/strict';
/** Refuse production, remote or original Folio databases before fixture writes. */
export async function assertPaperwakeTestDatabase(){
 const {adminPool,appPool,databaseSchema}=await import('../server/core/db.js');
 assert.equal(process.env.NODE_ENV,'test','Use the Paperwake test runner.');
 assert.equal(databaseSchema,'public');
 for(const pool of [adminPool,appPool]){
  const url=pool.options.connectionString?new URL(pool.options.connectionString):null;
  const host=url?.hostname??pool.options.host??'';
  assert.ok(host.startsWith('/')||['127.0.0.1','localhost','::1','[::1]'].includes(host),'Fixture database must be local.');
  const configuredDatabase=url?decodeURIComponent(url.pathname.slice(1)):pool.options.database;
  assert.ok(['paperwake_test','paperwake_ci'].includes(String(configuredDatabase)),'Fixtures require an explicitly named Paperwake test database.');
  const {rows:[identity]}=await pool.query('select current_database() db,current_schema() schema,inet_server_addr()::text address,current_user role');
  assert.equal(identity.db,configuredDatabase);assert.equal(identity.schema,'public');
  assert.ok(identity.address===null||['127.0.0.1','::1'].includes(identity.address));
 }
 const {rows:[role]}=await appPool.query('select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=current_user');
 assert.ok(role);assert.ok(Object.values(role).every(value=>value===false),'Application fixture role must not bypass tenant isolation.');
}
