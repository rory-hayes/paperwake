import type {ValidationIssue} from '../../../shared/types';

const valueValidationCodes=new Set(['unknown_field','required','number','currency','allowed_choice','boolean','text','date','array','object','table_limit','line_total','total','line_quantity_total','reconciliation_incomplete']);

/** Saved-value checks replace earlier validation; source/extraction warnings remain. */
export function currentReviewIssues(original:ValidationIssue[],current?:ValidationIssue[],savedValues?:Record<string,unknown>):ValidationIssue[]{
  if(!current)return original;
  const correctedDate=typeof savedValues?.invoice_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(savedValues.invoice_date)&&!current.some(issue=>issue.field==='invoice_date');
  return [...original.filter(issue=>!valueValidationCodes.has(issue.code)&&!issue.code.startsWith('timestamp_')&&!(correctedDate&&['invoice_date_ambiguous','invoice_date_unverified'].includes(issue.code))),...current];
}

export function invoiceApprovalState(issues:Array<ValidationIssue&{severity?:'warning'|'error'}>,state:{revision:string;acknowledgedRevision:string|null;dirty:boolean;stale:boolean}){
  const warnings=issues.filter(issue=>issue.severity==='warning'),blocking=issues.filter(issue=>issue.severity!=='warning');
  const acknowledged=!state.dirty&&!state.stale&&state.acknowledgedRevision===state.revision;
  return {warnings,blocking,acknowledged,canApprove:!state.dirty&&!state.stale&&!blocking.length&&(!warnings.length||acknowledged)};
}
