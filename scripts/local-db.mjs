import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:['.env.local','.env'],quiet:true});
const root=process.cwd(),dir=path.join(root,'.local/pg'),sock=path.join(root,'.local/socket');
const action=process.argv[2]||'start';
if(!['start','stop'].includes(action))throw new Error('Use start or stop.');
// An explicitly configured database belongs to its operator, not this helper.
// Verify it for setup, but never start, stop, create or rename external databases.
if(process.env.DATABASE_URL||process.env.DATABASE_ADMIN_URL||process.env.PGHOST){
 if(action==='stop'){console.log('Configured PostgreSQL left running; Paperwake does not manage its lifecycle.');process.exit(0);}
 if(process.env.DATABASE_ADMIN_URL||process.env.DATABASE_URL){console.log('Managed database configured. Apply migrations with the separate migration identity.');process.exit(0);}
 const pool=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE||'paperwake_local',user:process.env.PGADMINUSER||'paperwake_admin',connectionTimeoutMillis:5000,max:1});
 try{await pool.query('select 1');console.log('Configured Paperwake PostgreSQL is reachable.');}finally{await pool.end();}
 process.exit(0);
}
fs.mkdirSync(sock,{recursive:true,mode:0o700});fs.chmodSync(sock,0o700);
const binary=name=>fs.existsSync(`/opt/homebrew/bin/${name}`)?`/opt/homebrew/bin/${name}`:name;
const run=(bin,args,allowFail=false)=>{const result=spawnSync(binary(bin),args,{stdio:'inherit'});if(result.error)throw new Error(`Cannot run ${bin}. Install PostgreSQL or configure a dedicated local database.`);if(result.status&&!allowFail)process.exit(result.status);return result.status;};
if(action==='stop'){run('pg_ctl',['-D',dir,'-m','fast','stop'],true);process.exit(0);}
if(!fs.existsSync(path.join(dir,'PG_VERSION'))){
 run('initdb',['-D',dir,'-U','paperwake_admin','--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C']);
 fs.appendFileSync(path.join(dir,'postgresql.conf'),`\nlisten_addresses = ''\nport = 55432\nunix_socket_directories = '${sock.replaceAll("'","''")}'\nunix_socket_permissions = 0700\nmax_connections = 20\n`);
}
const state=spawnSync(binary('pg_ctl'),['-D',dir,'status'],{stdio:'ignore'});if(state.status)run('pg_ctl',['-D',dir,'-l',path.join(root,'.local/postgres.log'),'start','-w']);
run('psql',['-h',sock,'-p','55432','-U','paperwake_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c',"DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='paperwake_app') THEN CREATE ROLE paperwake_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$;"]);
const exists=spawnSync(binary('psql'),['-h',sock,'-p','55432','-U','paperwake_admin','-d','postgres','-Atc',"SELECT 1 FROM pg_database WHERE datname='paperwake_local'"],{encoding:'utf8'});if(exists.status!==0)process.exit(exists.status||1);if(exists.stdout.trim()!=='1')run('createdb',['-h',sock,'-p','55432','-U','paperwake_admin','paperwake_local']);
console.log('Private Paperwake PostgreSQL is ready on .local/socket:55432 (TCP disabled).');
