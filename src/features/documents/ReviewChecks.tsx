import {AlertCircle} from 'lucide-react';
import type {ValidationIssue} from '../../../shared/types';

function fieldLabel(field:string){
  const labels:Record<string,string>={invoice_number:'Invoice number',supplier:'Supplier',invoice_date:'Invoice date',currency:'Currency',subtotal:'Subtotal',tax:'Tax',total:'Total',product_code:'Product code',description:'Description',quantity:'Quantity',unit_price:'Unit price',amount:'Line total'};
  const row=/^line_items\[(\d+)\]\.(.+)$/.exec(field);
  return row?`Line item ${Number(row[1])+1}, ${labels[row[2]]||row[2]}`:labels[field]||field;
}

export default function ReviewChecks({issues}:{issues:ValidationIssue[]}){
  if(!issues.length)return null;
  const missing=issues.filter(issue=>issue.code==='evidence_missing'),other=issues.filter(issue=>issue.code!=='evidence_missing');
  return <div className="validation-summary"><AlertCircle size={21}/><div><strong>{issues.length} check{issues.length===1?'':'s'} to review</strong>
    {other.map((issue,index)=><p key={index}>{issue.message}</p>)}
    {missing.length>0&&<details className="review-missing-evidence"><summary>{missing.length} value{missing.length===1?' has':'s have'} no verified source quote</summary><p>Compare these values and the complete line-item table with the original invoice before approving. A missing quote does not establish whether the value is right or wrong.</p><ul>{missing.map((issue,index)=><li key={index}>{fieldLabel(issue.field)}</li>)}</ul></details>}
    <small>Checks reflect saved values. Save corrections to refresh them; values are checked again when you approve.</small>
  </div></div>;
}
