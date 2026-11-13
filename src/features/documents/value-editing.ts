import type {SchemaField} from '../../../shared/types';

export function emptyFieldValue(field:SchemaField):unknown {
  if(field.default!==undefined)return structuredClone(field.default);
  if(field.type==='array')return [];
  if(field.type==='object')return Object.fromEntries((field.fields||[]).map(child=>[child.key,emptyFieldValue(child)]));
  return null;
}

// Keep input drafts as text while typing, then normalize once at the save boundary.
export function normalizeEditorValues(values:Record<string,unknown>,fields:SchemaField[],options:{decimalStrings?:boolean}={}):Record<string,unknown> {
  return Object.fromEntries(fields.map(field=>[field.key,normalizeValue(values[field.key],field,options)]));
}

/** Compare what would be saved, without losing exact decimal scale or identifiers. */
export function hasUnsavedInvoiceChanges(values:Record<string,unknown>,baseline:Record<string,unknown>,currentSaved:Record<string,unknown>,fields:SchemaField[]):boolean {
  const comparable=(value:Record<string,unknown>)=>JSON.stringify(normalizeEditorValues(value,fields,{decimalStrings:true}));
  const draft=comparable(values);
  // A newer server revision may already contain this draft. Loading that
  // revision is still required for approval, but leaving will not lose edits.
  return draft!==comparable(baseline)&&draft!==comparable(currentSaved);
}
function normalizeValue(value:unknown,field:SchemaField,options:{decimalStrings?:boolean}):unknown {
  if(value===null||value===undefined||value==='')return null;
  if(field.type==='number'||field.type==='currency'){
    if(options.decimalStrings)return typeof value==='string'?(value.trim()||null):String(value);
    if(typeof value!=='string')return value;
    const trimmed=value.trim();
    if(!trimmed)return null;
    const numeric=Number(trimmed);
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(trimmed)&&Number.isFinite(numeric)?numeric:value;
  }
  if(field.type==='array'&&Array.isArray(value))return value.map(row=>row&&typeof row==='object'&&!Array.isArray(row)?normalizeEditorValues(row as Record<string,unknown>,field.fields||[],options):row);
  if(field.type==='object'&&typeof value==='object'&&!Array.isArray(value))return normalizeEditorValues(value as Record<string,unknown>,field.fields||[],options);
  return value;
}
