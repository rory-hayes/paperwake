import type {FastifyInstance} from 'fastify';
import type {PageText} from '../../shared/types.js';
import {SourceValidationError} from './source-validation.js';
import {isDeepStrictEqual} from 'node:util';
import {invoiceSchema} from '../../shared/invoice.js';
import {badRequest} from './db.js';

export function assertFixedInvoiceSchema(schema:unknown){
 if(!isDeepStrictEqual(schema,invoiceSchema))badRequest('Only the current supplier-invoice workflow is available in MaintainFlow.',409);
}

/** Product boundary, not a hidden feature flag. Future workflows require an explicit release. */
export function invoiceRouteAllowed(method:string,pathname:string){
 const read=method==='GET'||method==='HEAD';
 if(!pathname.startsWith('/api/'))return true;
 if(/^\/api\/auth\//.test(pathname))return true;
 if(['/api/health','/api/ready','/api/config','/api/plans'].includes(pathname))return read;
 if(pathname==='/api/internal/worker')return method==='POST';
 if(pathname==='/api/internal/diagnostics')return read;
 if(/^\/api\/billing\//.test(pathname))return true;
 if(pathname==='/api/providers/status')return read;
 if(pathname==='/api/invoices/setup')return method==='POST';
 if(pathname==='/api/workspaces')return read;
 if(/^\/api\/workspace\/(usage|audit|storage-deletions|notifications)$/.test(pathname))return read;
 if(pathname==='/api/workspace/settings')return read||method==='PATCH';
 if(pathname==='/api/workspace/notifications/read'||/^\/api\/workspace\/storage-deletions\/[^/]+\/retry$/.test(pathname))return method==='POST';
 if(pathname==='/api/parsers'||/^\/api\/parsers\/[^/]+$/.test(pathname))return read;
 if(/^\/api\/parsers\/[^/]+\/documents$/.test(pathname))return read||method==='POST';
 if(/^\/api\/parsers\/[^/]+\/uploads$/.test(pathname))return method==='POST';
 if(/^\/api\/parsers\/[^/]+\/sample$/.test(pathname))return method==='POST';
 if(pathname==='/api/uploads/config')return read;
 if(/^\/api\/uploads\/[^/]+\/finalize$/.test(pathname))return method==='POST';
 if(pathname==='/api/documents')return read;
 if(pathname==='/api/documents/bulk')return method==='POST';
 if(/^\/api\/documents\/[^/]+$/.test(pathname))return read||method==='DELETE';
 if(/^\/api\/documents\/[^/]+\/(original|original-url|preview)$/.test(pathname))return read;
 if(/^\/api\/(jobs|runs)\/[^/]+$/.test(pathname))return read;
 if(/^\/api\/runs\/[^/]+\/(corrections|approve)$/.test(pathname))return method==='POST';
 if(pathname==='/api/exports'||pathname==='/api/export-mappings')return read||method==='POST';
 if(/^\/api\/exports\/[^/]+\/download$/.test(pathname))return read;
 if(/^\/api\/export-mappings\/[^/]+$/.test(pathname))return method==='DELETE';
 return false;
}

export function registerInvoiceLaunchPolicy(app:FastifyInstance){
 app.addHook('onRequest',async(request,reply)=>{
  const pathname=request.url.split('?')[0];
  if(!invoiceRouteAllowed(request.method,pathname))return reply.code(404).send({error:'not_available',message:'This workflow is not available in MaintainFlow. Upload a supplier invoice PDF from Invoices.'});
  if(pathname.startsWith('/api/')&&!pathname.startsWith('/api/internal/')&&request.headers.authorization?.startsWith('Bearer '))return reply.code(403).send({error:'api_unavailable',message:'Public API access is not available in this release. Sign in to MaintainFlow to manage invoices.'});
 });
}

export function assertInvoicePdfBytes(bytes:Buffer,filename:string){
 if(bytes.length>10*1024*1024)throw new SourceValidationError('file_too_large');
 if(!bytes.length)throw new SourceValidationError('empty');
 if(!/\.pdf$/i.test(filename)||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new SourceValidationError('invoice_pdf_only');
}

export function assertInvoiceSource(source:{mimeType:string;pageCount:number;pages:PageText[]}){
 if(source.mimeType!=='application/pdf')throw new SourceValidationError('invoice_pdf_only');
 if(source.pageCount>5)throw new SourceValidationError('invoice_page_limit');
 if(source.pageCount<1||source.pages.length!==source.pageCount||source.pages.some((page,index)=>page.page!==index+1||page.text.replace(/\s/g,'').length<20))throw new SourceValidationError('invoice_native_text');
}
