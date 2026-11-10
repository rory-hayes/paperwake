import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {invoiceSchema,invoiceInstructions} from '../../shared/invoice.js';
import {requireActor,editors,requireSession} from './auth.js';
import {withWorkspace,camel,audit,badRequest} from './db.js';

export async function registerInvoiceRoutes(app:FastifyInstance){
 app.post('/api/invoices/setup',async request=>{
  const actor=await requireActor(request,{roles:editors});requireSession(actor);
  z.object({}).strict().parse(request.body??{});
  return withWorkspace(actor.workspaceId,async client=>{
   await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[actor.workspaceId]);
   const existing=(await client.query("select p.*,s.schema from parsers p join schema_versions s on s.id=p.active_schema_id where p.workspace_id=$1 and p.use_case='invoice' and not p.archived order by p.created_at,p.id limit 1 for update of p",[actor.workspaceId])).rows[0];
   if(existing){
    if(existing.mode!=='ai'||!isDeepStrictEqual(existing.schema,invoiceSchema)||existing.allowed_formats?.length!==1||existing.allowed_formats[0]!=='pdf')badRequest('The saved invoice configuration is incompatible. Contact support before uploading more invoices.',409);
    const {schema,...parser}=existing;return {parser:camel(parser),schema:{...schema,id:existing.active_schema_id,version:1}};
   }
   const parser=(await client.query("insert into parsers(workspace_id,name,use_case,mode,instructions,locale,timezone,allowed_formats,field_setup_state) values($1,'Supplier invoices','invoice','ai',$2,'en-IE','Europe/Dublin',ARRAY['pdf']::text[],'ready') returning *",[actor.workspaceId,invoiceInstructions])).rows[0];
   const schema=(await client.query('insert into schema_versions(workspace_id,parser_id,version,schema,created_by) values($1,$2,1,$3,$4) returning *',[actor.workspaceId,parser.id,JSON.stringify(invoiceSchema),actor.userId])).rows[0];
   await client.query('update parsers set active_schema_id=$2 where id=$1',[parser.id,schema.id]);
   await audit(client,actor.workspaceId,actor.userId,'invoice.setup',parser.id,{invoiceVersion:1});
   return {parser:camel({...parser,active_schema_id:schema.id}),schema:{...schema.schema,id:schema.id,version:1}};
  });
 });
}
