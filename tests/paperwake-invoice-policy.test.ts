import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceRouteAllowed,assertInvoicePdfBytes,assertInvoiceSource,assertFixedInvoiceSchema} from '../server/core/invoice-policy.js';
import {invoiceSchema} from '../shared/invoice.js';
import {normalizeValue} from '../server/core/extraction.js';
import {validateValues} from '../server/core/schema.js';
import {decimalSumMatches,decimalProductMatches,currencyTolerance} from '../server/core/decimal.js';
import {protectInvoiceDate} from '../server/core/invoice-result.js';
import {renderExport} from '../server/integrations/export-format.js';
import {normalizationPolicy} from '../shared/source-formats.js';
import {createOpenAIProvider,openAIExtraction,extractionResponseSchema} from '../server/core/openai-provider.js';

const values={invoice_number:'0000009007199254740993',supplier:'=HYPERLINK("bad")',invoice_date:'2026-11-09',currency:'EUR',subtotal:'9007199254740993.10',tax:'0.00',total:'9007199254740993.10',line_items:[{product_code:'000123',description:'-not a formula',quantity:'1.00',unit_price:'9007199254740993.10',amount:'9007199254740993.10'}]};
test('invoice route boundary has no feature-flag bypass for generic or API workflows',()=>{
 assert.doesNotThrow(()=>assertFixedInvoiceSchema(structuredClone(invoiceSchema)));
 assert.throws(()=>assertFixedInvoiceSchema({fields:invoiceSchema.fields}),/Only the current supplier-invoice/);
 assert.throws(()=>assertFixedInvoiceSchema({...invoiceSchema,fields:invoiceSchema.fields.slice(0,2)}),/Only the current supplier-invoice/);
 for(const [method,path] of [['POST','/api/parsers'],['PATCH','/api/parsers/owned'],['POST','/api/documents/owned/reprocess'],['GET','/api/workspace/api-keys'],['POST','/api/parsers/owned/pdf-splits'],['POST','/api/uploads/owned/split-confirm'],['GET','/api/integrations'],['POST','/api/workspaces']])assert.equal(invoiceRouteAllowed(method,path),false,path);
 for(const [method,path] of [['POST','/api/invoices/setup'],['POST','/api/parsers/owned/documents'],['POST','/api/parsers/owned/sample'],['POST','/api/runs/owned/corrections'],['POST','/api/runs/owned/approve'],['POST','/api/exports'],['POST','/api/billing/webhook'],['POST','/api/internal/worker'],['GET','/api/health'],['GET','/api/auth/me']])assert.equal(invoiceRouteAllowed(method,path),true,path);
});
test('invoice intake rejects unsupported sources and never accepts a partially inspected document',()=>{
 assert.throws(()=>assertInvoicePdfBytes(Buffer.from('plain text'),'invoice.pdf'),/PDF/);
 assert.throws(()=>assertInvoicePdfBytes(Buffer.from('%PDF-1.7'),'invoice.png'),/PDF/);
 assert.throws(()=>assertInvoicePdfBytes(Buffer.alloc(10*1024*1024+1),'invoice.pdf'),/10 MB/);
 assert.throws(()=>assertInvoiceSource({mimeType:'application/pdf',pageCount:6,pages:[]}),/five pages/);
 assert.throws(()=>assertInvoiceSource({mimeType:'application/pdf',pageCount:2,pages:[{page:1,text:'Supplier invoice with plenty of digital text'}]}),/Every invoice page/);
 assert.throws(()=>assertInvoiceSource({mimeType:'application/pdf',pageCount:1,pages:[{page:1,text:''}]}),/Every invoice page/);
 assert.doesNotThrow(()=>assertInvoiceSource({mimeType:'application/pdf',pageCount:1,pages:[{page:1,text:'Supplier invoice with plenty of digital text'}]}));
});
test('normalization keeps decimal scale and values beyond binary floating-point precision',()=>{
 const field=invoiceSchema.fields.find(field=>field.key==='total')!;
 assert.equal(normalizeValue('9,007,199,254,740,993.10',field,'en-IE',undefined,normalizationPolicy),'9007199254740993.10');
 assert.equal(normalizeValue('(EUR 1,234.5000)',field,'en-IE',undefined,normalizationPolicy),'-1234.5000');
 assert.equal(decimalSumMatches(['9007199254740993.10','0.20'],'9007199254740993.30'),true);
 assert.equal(decimalSumMatches(['9007199254740993.10','0.20'],'9007199254740993.32'),false);
 assert.equal(decimalSumMatches(['-0.10','0.20'],'0.10'),true);
 assert.deepEqual(validateValues(values,invoiceSchema),[]);
 assert.ok(validateValues({...values,total:9007199254740993.10},invoiceSchema).some(issue=>issue.code==='number'));
 assert.ok(validateValues({...values,currency:'EURO'},invoiceSchema).some(issue=>issue.code==='currency'));
 assert.ok(validateValues({...values,line_items:Array.from({length:101},()=>values.line_items[0])},invoiceSchema).some(issue=>issue.code==='table_limit'));
 assert.deepEqual(validateValues({...values,subtotal:'100.00',total:'100.00',tax:'0.00',line_items:Array.from({length:100},()=>({...values.line_items[0],quantity:'1',unit_price:'1.00',amount:'1.00'}))},invoiceSchema),[]);
 assert.equal(decimalProductMatches('2','9007199254740993.10','18014398509481986.20'),true);
 assert.equal(decimalProductMatches('2','50.00','50.00'),false);
 assert.equal(currencyTolerance('EUR'),'0.01');assert.equal(currencyTolerance('JPY'),'1');assert.equal(currencyTolerance('KWD'),'0.001');
});
test('ambiguous and model-converted invoice dates require an explicit manual date',()=>{
 for(const raw of ['03/04/2026','03-04-2026','03.04.2026']){const current={invoice_date:'2026-04-03'},issue=protectInvoiceDate(raw,current,[{page:1,text:`Invoice date: ${raw}`}],[]);assert.equal(current.invoice_date,null);assert.equal(issue?.code,'invoice_date_ambiguous');}
 const current={invoice_date:'2026-04-03'};assert.equal(protectInvoiceDate('2026-04-03',current,[{page:1,text:'Invoice date: 03/04/2026'}],[{field:'invoice_date',text:'Invoice date: 03/04/2026'}])?.code,'invoice_date_ambiguous');assert.equal(current.invoice_date,null);
 const invented={invoice_date:'2026-04-03'};assert.equal(protectInvoiceDate('2026-04-03',invented,[{page:1,text:'Invoice date: 9 November 2026'}],[])?.code,'invoice_date_unverified');
 for(const raw of ['2026-11-09','9 November 2026','03/03/2026']){const valid={invoice_date:'2026-11-09'};assert.equal(protectInvoiceDate(raw,valid,[{page:1,text:`Invoice date: ${raw}`}],[]),undefined);}
});
test('invoice CSV preserves exact identifiers and signed decimals while escaping arbitrary formula text',async()=>{
 const record={documentId:'doc',filename:'invoice.pdf',runId:'run',revision:1,values:{...values,total:'-0.10'}};
 const rendered=await renderExport([record],{format:'csv',workflow:'invoice'}),csv=rendered.bytes.toString('utf8');
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('"0000009007199254740993"'));
 assert.ok(csv.includes('"000123"'));
 assert.ok(csv.includes('"9007199254740993.10"'));
 assert.ok(csv.includes('"-0.10"'));
 assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
 assert.ok(csv.includes('"\'-not a formula"'));
 await assert.rejects(renderExport([record],{format:'xlsx',workflow:'invoice'}),/CSV/);
 await assert.rejects(renderExport([record],{format:'csv',workflow:'invoice',columns:[{source:'private',label:'Private'}]}),/fixed source/);
});
test('invoice provider rejects reported omissions, multi-invoice sources and inconsistent row counts',async()=>{
 const assessment={documentType:'supplier_invoice',sourceLanguage:'english',sourceLineItemCount:1,allPagesRead:true};
 const extract=async(invoiceAssessment:unknown)=>createOpenAIProvider({apiKey:'owned-fixture',fetch:(async()=>Response.json({id:'owned-response',status:'completed',model:openAIExtraction.model,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',status:'completed',content:[{type:'output_text',text:JSON.stringify({rawValues:values,evidence:[],invoiceAssessment})}]}]})) as typeof fetch}).extract({bytes:Buffer.from('%PDF-owned-controlled-input'),mimeType:'application/pdf',pages:[{page:1,text:'Owned synthetic supplier invoice'}],schema:invoiceSchema,instructions:'Extract invoice',locale:'en-IE'});
 const result=await extract(assessment);assert.equal(result.promptVersion,'paperwake-invoice-v3');assert.equal(result.normalizedValues.total,'9007199254740993.10');
 assert.ok((extractionResponseSchema(invoiceSchema).required as string[]).includes('invoiceAssessment'));
 await assert.rejects(extract({...assessment,documentType:'multiple_invoices'}),/each invoice separately/);
 await assert.rejects(extract({...assessment,documentType:'other'}),/not supported/);
 await assert.rejects(extract({...assessment,allPagesRead:false}),/No partial extraction/);
 await assert.rejects(extract({...assessment,sourceLineItemCount:2}),/count does not match/);
 await assert.rejects(extract({...assessment,sourceLineItemCount:101}),/more than 100/);
});

test('fixed invoice guidance keeps unprinted combined tax absent for existing parser instructions and preserves review warnings',async()=>{
 let request:any;
 const rawValues={...values,subtotal:'630.000',tax:null,total:'662.750',line_items:[{...values.line_items[0],quantity:'1',unit_price:'630.000',amount:'630.000'}]};
 const result=await createOpenAIProvider({apiKey:'owned-fixture',fetch:(async(_url,options)=>{
  request=JSON.parse(String(options?.body));
  return Response.json({id:'owned-response',status:'completed',model:openAIExtraction.model,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',status:'completed',content:[{type:'output_text',text:JSON.stringify({rawValues,evidence:[],invoiceAssessment:{documentType:'supplier_invoice',sourceLanguage:'english',sourceLineItemCount:1,allPagesRead:true}})}]}]});
 }) as typeof fetch}).extract({bytes:Buffer.from('%PDF-owned-controlled-input'),mimeType:'application/pdf',pages:[{page:1,text:'Subtotal 630.000\nSample Tax1 11.750\nSample Tax2 21.000\nTotal 662.750'}],schema:invoiceSchema,instructions:'Extract one supplier invoice only.',locale:'en-IE'});
 assert.match(request.instructions,/copy only an explicitly printed aggregate tax total/);
 assert.match(request.instructions,/single tax charge is its own printed total/);
 assert.match(request.instructions,/multiple tax components.*return null for tax; never select just one component or calculate their sum/);
 assert.equal(result.rawValues.tax,null);assert.equal(result.normalizedValues.tax,null);
 assert.equal(result.normalizedValues.total,'662.750');
 assert.ok(result.issues.some(issue=>issue.field==='total'&&issue.code==='reconciliation_incomplete'));
});

test('invoice selection retains full row descriptions and numeric spans without inferring a currency code',async()=>{
 let request:any;
 const description='Brochure Design\nBrochure Design Single Sided Color';
 const rawValues={...values,currency:null,subtotal:'630.00',tax:null,total:'662.750',line_items:[{...values.line_items[0],description,quantity:'1',unit_price:'630.00',amount:'630.00'}]};
 const result=await createOpenAIProvider({apiKey:'owned-fixture',fetch:(async(_url,options)=>{
  request=JSON.parse(String(options?.body));
  return Response.json({id:'owned-response',status:'completed',model:openAIExtraction.model,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',status:'completed',content:[{type:'output_text',text:JSON.stringify({rawValues,evidence:[{field:'line_items[0].description',page:1,text:description},{field:'total',page:1,text:'Total Rs.662.750'}],invoiceAssessment:{documentType:'supplier_invoice',sourceLanguage:'english',sourceLineItemCount:1,allPagesRead:true}})}]}]});
 }) as typeof fetch}).extract({bytes:Buffer.from('%PDF-owned-controlled-input'),mimeType:'application/pdf',pages:[{page:1,text:`${description}\nSubtotal630.00\nTax111.75\nTax221.00\nTotal Rs.662.750`}],schema:invoiceSchema,instructions:'Extract one supplier invoice only.',locale:'en-IE'});
 assert.match(request.instructions,/complete printed description, including every wrapped subtitle or detail line/);
 assert.match(request.instructions,/Never shorten it to the item title or summarize it/);
 assert.match(request.instructions,/literal numeric span without surrounding currency symbols or prefixes such as Rs\./);
 assert.match(request.instructions,/Preserve the number punctuation, decimal places, trailing zeroes, minus signs and accounting parentheses exactly/);
 assert.match(request.instructions,/keep it null unless an explicit three-letter currency code is printed/);
 assert.equal(result.normalizedValues.currency,null);assert.equal(result.normalizedValues.total,'662.750');
 assert.equal((result.normalizedValues.line_items as any[])[0].description,description);
 assert.equal(result.evidence.total[0].source,'matched-text');
 assert.equal(result.evidence['line_items[0].description'][0].source,'matched-text');
});

test('invoice language assessment is required, bounded and rejects unsupported or uncertain sources before accepting data',async()=>{
 const assessment={documentType:'supplier_invoice',sourceLanguage:'english',sourceLineItemCount:1,allPagesRead:true};
 const extract=(invoiceAssessment:unknown)=>createOpenAIProvider({apiKey:'owned-fixture',fetch:(async()=>Response.json({id:'owned-language-response',status:'completed',model:openAIExtraction.model,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',status:'completed',content:[{type:'output_text',text:JSON.stringify({rawValues:values,evidence:[],invoiceAssessment})}]}]})) as typeof fetch}).extract({bytes:Buffer.from('%PDF-owned-controlled-input'),mimeType:'application/pdf',pages:[{page:1,text:'Invoice 00042. Supplier. Quantity. Total EUR 10.00.'}],schema:invoiceSchema,instructions:'Extract one supplier invoice only.',locale:'en-IE'});
 const response=extractionResponseSchema(invoiceSchema) as any;
 assert.deepEqual(response.properties.invoiceAssessment.properties.sourceLanguage.enum,['english','unsupported','uncertain']);
 assert.ok(response.properties.invoiceAssessment.required.includes('sourceLanguage'));
 for(const [sourceLanguage,message] of [['unsupported',/supports English supplier invoices only/],['uncertain',/could not confirm.*supported in English/]] as const){
  await assert.rejects(extract({...assessment,sourceLanguage}),error=>error instanceof Error&&message.test(error.message)&&/No extraction was saved/.test(error.message)&&(error as any).permanent===true);
 }
 for(const sourceLanguage of [undefined,null,'de','English',1,['english'],{language:'english'}])await assert.rejects(extract({...assessment,sourceLanguage}),/invalid structured extraction/);
 await assert.rejects(extract({...assessment,languageOverride:'english'}),/invalid structured extraction/);
});

test('English invoice assessment preserves foreign proper names and product codes without translating existing parser data',async()=>{
 let request:any;
 const rawValues={...values,supplier:'Müller & Söhne GmbH',line_items:[{...values.line_items[0],product_code:'東京-000123',description:'Café Étoile replacement filter\nSize 10 mm'}]};
 const result=await createOpenAIProvider({apiKey:'owned-fixture',fetch:(async(_url,options)=>{
  request=JSON.parse(String(options?.body));
  return Response.json({id:'owned-language-response',status:'completed',model:openAIExtraction.model,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',status:'completed',content:[{type:'output_text',text:JSON.stringify({rawValues,evidence:[],invoiceAssessment:{documentType:'supplier_invoice',sourceLanguage:'english',sourceLineItemCount:1,allPagesRead:true}})}]}]});
 }) as typeof fetch}).extract({bytes:Buffer.from('%PDF-owned-controlled-input'),mimeType:'application/pdf',pages:[{page:1,text:'Invoice. Supplier: Müller & Söhne GmbH. Product code: 東京-000123. Description: Café Étoile replacement filter\nSize 10 mm. Total EUR 10.00.'}],schema:invoiceSchema,instructions:'Extract one supplier invoice only.',locale:'en-IE'});
 assert.deepEqual(result.rawValues,rawValues);
 assert.equal(result.normalizedValues.supplier,rawValues.supplier);
 assert.equal((result.normalizedValues.line_items as any[])[0].product_code,'東京-000123');
 assert.equal((result.normalizedValues.line_items as any[])[0].description,rawValues.line_items[0].description);
 assert.equal(result.promptVersion,'paperwake-invoice-v3');
 assert.match(request.instructions,/complete parallel English wording is acceptable/);
 assert.match(request.instructions,/Foreign proper names, addresses, brands and product codes alone are not grounds for rejection/);
 assert.match(request.instructions,/never translate source values or proper names/);
 assert.match(request.instructions,/Do not infer language from the filename, country, currency or parser locale/);
 assert.ok(request.instructions.indexOf('invoiceAssessment.sourceLanguage')<request.instructions.indexOf('workspace-controlled'));
 const generic=extractionResponseSchema({fields:[{key:'supplier',label:'Supplier',type:'string'}]}) as any;
 assert.equal(generic.properties.invoiceAssessment,undefined);
 assert.deepEqual(generic.required,['rawValues','evidence']);
});
