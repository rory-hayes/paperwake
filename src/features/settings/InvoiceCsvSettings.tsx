import {useState} from 'react';
import {ArrowUp,ArrowDown,Save} from 'lucide-react';
import {Button,ErrorState,Loading,Notice} from '../../components/ui';
import {post,useAction,useData} from '../../lib/api';
import {currentInvoiceMapping,invoiceColumns,invoiceMappingName,useInvoiceSetup,type InvoiceColumn,type InvoiceMapping} from '../../lib/invoices';
import CsvImportGuidance from '../documents/CsvImportGuidance';
export default function InvoiceCsvSettings(){
  const setup=useInvoiceSetup(),mappings=useData<{mappings:InvoiceMapping[]}>('/api/export-mappings');
  if(setup.isPending||mappings.isPending)return <Loading/>;
  if(setup.error||!setup.data)return <ErrorState error={setup.error} retry={()=>void setup.refetch()}/>;
  if(mappings.error)return <ErrorState error={mappings.error} retry={()=>void mappings.refetch()}/>;
  const available=invoiceColumns(setup.data.schema.fields),saved=currentInvoiceMapping(mappings.data?.mappings||[],setup.data.parser.id);
  return <CsvEditor key={setup.data.parser.id} parserId={setup.data.parser.id} available={available} saved={saved}/>;
}
function CsvEditor({parserId,available,saved}:{parserId:string;available:InvoiceColumn[];saved?:InvoiceMapping}){
  const validSaved=saved?.columns.filter(column=>available.some(option=>option.source===column.source));
  const initial=validSaved?.length?[...validSaved,...available.filter(option=>!validSaved.some(column=>column.source===option.source))]:available;
  const [columns,setColumns]=useState(initial),action=useAction();
  function move(index:number,direction:number){setColumns(current=>{const next=[...current];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});}
  return <form className="settings-form" onSubmit={event=>{event.preventDefault();void action.run(()=>post('/api/export-mappings',{parserId,name:invoiceMappingName,columns:columns.map(column=>({...column,label:column.label.trim()})),lineItems:'line_items'}),'CSV preferences saved. New downloads will use these columns.');}}>
  <h2>CSV columns</h2><p>Rename headings and arrange the columns to match your spreadsheet. Every line item gets a row, with its invoice details repeated.</p><CsvImportGuidance/>
  <div className="table-wrap"><table><thead><tr><th>Invoice field</th><th>Spreadsheet heading</th><th>Order</th></tr></thead><tbody>{columns.map((column,index)=><tr key={column.source}><td>{available.find(option=>option.source===column.source)?.label}</td><td><input aria-label={`CSV heading for ${available.find(option=>option.source===column.source)?.label}`} required maxLength={120} disabled={action.busy} value={column.label} onChange={event=>setColumns(current=>current.map(item=>item.source===column.source?{...item,label:event.target.value}:item))}/></td><td><div className="actions"><button className="icon-button" type="button" aria-label={`Move ${column.label||'column'} up`} disabled={action.busy||index===0} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button><button className="icon-button" type="button" aria-label={`Move ${column.label||'column'} down`} disabled={action.busy||index===columns.length-1} onClick={()=>move(index,1)}><ArrowDown size={16}/></button></div></td></tr>)}</tbody></table></div>
  <Notice error={action.error} message={action.message}/><div className="actions"><Button type="submit" disabled={action.busy||columns.some(column=>!column.label.trim())}><Save/>Save CSV preferences</Button><Button type="button" variant="ghost" disabled={action.busy} onClick={()=>{setColumns(available);action.setMessage('Default columns restored in this form. Save to apply them.');}}>Restore defaults</Button></div><p className="small muted">This changes future CSV downloads. It does not change extracted invoice values or earlier saved exports.</p></form>;
}
