import type {PageText,ValidationIssue} from '../../shared/types.js';

const collapsed=(value:string)=>value.replace(/\s+/g,' ').trim();
export function ambiguousNumericDate(value:unknown){
 if(typeof value!=='string')return false;
 return [...value.matchAll(/\b(\d{1,2})([/.\-])(\d{1,2})\2(\d{4})\b/g)].some(match=>{const first=Number(match[1]),second=Number(match[3]);return first>=1&&first<=12&&second>=1&&second<=12&&first!==second;});
}
/** Locale alone cannot establish the order on an English supplier's invoice. */
export function protectInvoiceDate(raw:unknown,values:Record<string,unknown>,pages:PageText[],evidence:{field:string;text:string}[]):ValidationIssue|undefined{
 if(raw===null||raw===undefined||raw==='')return;
 const quotes=evidence.filter(item=>item.field==='invoice_date').map(item=>item.text);
 if(ambiguousNumericDate(raw)||quotes.some(ambiguousNumericDate)){
  values.invoice_date=null;return {field:'invoice_date',code:'invoice_date_ambiguous',message:'The source date could mean day/month or month/day. Check the original and enter the invoice date explicitly before approving.'};
 }
 // A model-converted ISO date is not the literal source date. Keep the raw
 // evidence, and require a person to establish an unverified interpretation.
 if(typeof raw==='string'&&!pages.some(page=>collapsed(page.text).includes(collapsed(raw)))){
  values.invoice_date=null;return {field:'invoice_date',code:'invoice_date_unverified',message:'The literal invoice date could not be verified in the PDF text. Check the original and enter the date explicitly before approving.'};
 }
}
