import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {Download} from 'lucide-react';
import {Modal,Button,Notice} from '../../components/ui';
import {api,useData,workspaceId} from '../../lib/api';
import {currentInvoiceMapping,type InvoiceMapping} from '../../lib/invoices';
import {useSession} from '../../lib/session';
import CsvImportGuidance from './CsvImportGuidance';
import './export.css';
export type ApprovalRevision={documentId:string;approvalId:string};
export default function ExportDialog({ids,open,onOpenChange,parserId,revisions,returnFocusRef}:{ids:string[];open:boolean;onOpenChange:(open:boolean)=>void;parserId?:string;revisions?:ApprovalRevision[];returnFocusRef:RefObject<HTMLButtonElement|null>}){
  const [exporting,setExporting]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const client=useQueryClient(),query=useData<{mappings:InvoiceMapping[]}>('/api/export-mappings');
  const generation=useRef(0),controller=useRef<AbortController|null>(null),session=useSession().data,selectedWorkspace=workspaceId();
  const scopeKey=JSON.stringify([session?.user.id,session?.workspace.id,selectedWorkspace,ids,parserId,revisions,open]);
  useLayoutEffect(()=>{generation.current++;setExporting(false);setError('');setMessage('');return()=>{generation.current++;controller.current?.abort();controller.current=null;};},[scopeKey]);
  const mapping=currentInvoiceMapping(query.data?.mappings||[],parserId),pinned=Boolean(revisions?.length);
  async function download(){
    if(!open||controller.current||query.isPending||query.error)return;
    const started=generation.current,request=new AbortController();controller.current=request;
    const current=()=>generation.current===started&&controller.current===request&&!request.signal.aborted;
    setExporting(true);setError('');setMessage('');
    try{
      const result=await api<{id:string;downloadUrl:string}>('/api/exports',{method:'POST',signal:request.signal,body:JSON.stringify({documentIds:ids,format:'csv',revisions,columns:mapping?.columns,lineItems:'line_items'})});
      await client.invalidateQueries({refetchType:'none'});if(!current())return;await client.invalidateQueries();if(!current())return;
      if(result.downloadUrl!==`/api/exports/${result.id}/download`)throw new Error('The CSV download could not be opened. Please try again.');
      const response=await fetch(result.downloadUrl,{signal:request.signal,headers:selectedWorkspace?{'X-Workspace-Id':selectedWorkspace}:undefined,credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('The CSV could not be downloaded.');const blob=await response.blob();if(!current())return;
      const href=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=href;anchor.download='paperwake-invoices.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(href),5000);setMessage('Your approved CSV is ready. The browser download has started.');
    }catch(cause){if(current())setError(cause instanceof Error?cause.message:'The export could not be completed.');}
    finally{if(current()){controller.current=null;setExporting(false);}}
  }
  return <Modal title="Download approved invoices" description={pinned?'This CSV uses the exact revision you approved.':'Each invoice must have an approved revision before export.'} open={open} onOpenChange={onOpenChange} onCloseAutoFocus={event=>{event.preventDefault();const invoker=returnFocusRef.current;if(invoker?.isConnected&&!invoker.disabled)invoker.focus({preventScroll:true});}}>
  <form className="export-form" onSubmit={event=>{event.preventDefault();void download();}}><p>{ids.length} invoice{ids.length===1?'':'s'} selected. One row per line item, with invoice details repeated on every row.</p>
  <p className="small muted">{mapping?'Your saved CSV column labels and order will be used.':'The standard invoice columns will be used.'} <Link className="link" to="/app/settings?tab=csv">CSV settings</Link></p>
  <CsvImportGuidance/>
  <Notice error={error||(query.error instanceof Error?query.error.message:undefined)} message={message}/>
  {query.error&&<Button type="button" variant="secondary" disabled={query.isFetching} onClick={()=>void query.refetch()}>Retry CSV settings</Button>}
  <Button type="submit" disabled={exporting||!ids.length||query.isPending||Boolean(query.error)}><Download/>{exporting?'Preparing CSV…':'Download CSV'}</Button><span className="sr-only" role="status" aria-live="polite">{exporting?'Preparing approved CSV. Your download will start when it is ready.':''}</span></form></Modal>;
}
