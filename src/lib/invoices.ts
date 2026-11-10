import {useQuery} from '@tanstack/react-query';
import type {SchemaField} from '../../shared/types';
import {api,workspaceId} from './api';
export const invoiceMappingName='Paperwake invoice CSV';
export type InvoiceColumn={source:string;label:string};
export type InvoiceMapping={id:string;parserId:string;name:string;columns:InvoiceColumn[];lineItems:string|null};
export type InvoiceSetup={parser:{id:string;name:string};schema:{fields:SchemaField[]}};
/** Idempotent server setup creates the fixed invoice preset, once per workspace. */
export function useInvoiceSetup(){
  return useQuery<InvoiceSetup>({queryKey:[workspaceId(),'invoice-setup'],queryFn:({signal})=>api('/api/invoices/setup',{method:'POST',body:'{}',signal}),staleTime:Infinity});
}
export function invoiceColumns(fields:SchemaField[]):InvoiceColumn[]{return fields.flatMap(field=>field.type==='array'?(field.fields||[]).map(child=>({source:`$item.${child.key}`,label:child.label})):[{source:field.key,label:field.label}]);}
export function currentInvoiceMapping(mappings:InvoiceMapping[],parserId?:string){return mappings.find(mapping=>mapping.name===invoiceMappingName&&(!parserId||mapping.parserId===parserId));}
