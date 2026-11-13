import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

/** Stable synthetic bytes make repeated onboarding samples ordinary duplicate uploads. */
let sample:Promise<Buffer>|undefined;
export function syntheticInvoicePdf(){
 return sample??=(async()=>{
  const pdf=await PDFDocument.create();pdf.setCreationDate(new Date('2026-01-01T00:00:00Z'));pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  pdf.setTitle('MaintainFlow synthetic supplier invoice');pdf.setAuthor('MaintainFlow');
  const page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica);
  const lines=[
   'SYNTHETIC EXAMPLE - NOT A REAL INVOICE',
   'Supplier: North Harbour Supplies Ltd',
   'Invoice number: 0001042',
   'Invoice date: 9 November 2026',
   'Currency: EUR',
   '',
   'Product code | Description | Quantity | Unit price | Amount',
   '0012 | Printer paper, A4 | 2 | 12.50 | 25.00',
   '0019 | Archive folders | 4 | 3.75 | 15.00',
   '',
   'Subtotal: 40.00',
   'Tax: 9.20',
   'Total: 49.20',
   '',
   'This document contains fictional supplier and invoice details.',
  ];
  lines.forEach((text,index)=>page.drawText(text,{x:45,y:790-index*28,size:index===0?14:11,font,color:rgb(0.12,0.16,0.22)}));
  return Buffer.from(await pdf.save({useObjectStreams:false}));
 })();
}
