import {useLayoutEffect,useRef,useState} from 'react';
import {Upload as UploadIcon} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {Button,Notice} from '../../components/ui';
import {post,uploadDocuments,useAction} from '../../lib/api';
import {useSession} from '../../lib/session';
type UploadResult={document?:{id:string};duplicate?:boolean;name?:string;error?:string};
export default function Upload({parserId,onComplete,compact=false}:{parserId?:string;onComplete?:()=>void;compact?:boolean}){
  const input=useRef<HTMLInputElement>(null),generation=useRef(0),[dragging,setDragging]=useState(false),action=useAction(),navigate=useNavigate();
  const session=useSession().data,canEdit=session?.workspace.role!=='viewer';
  useLayoutEffect(()=>{generation.current++;return()=>{generation.current++;};},[session?.user.id,session?.workspace.id,session?.workspace.role,parserId]);
  async function upload(files:FileList|File[]|null){
    if(!files?.length||action.busy||!canEdit)return;
    if(!parserId){action.setError('Your invoice workspace is not ready. Refresh the page and try again.');return;}
    if(files.length>10){action.setError('Choose up to 10 invoice PDFs in one upload.');return;}
    const invalid=Array.from(files).filter(file=>!file.name.toLowerCase().endsWith('.pdf')||file.type&&file.type!=='application/pdf');
    if(invalid.length){action.setError(`Upload digital invoice PDFs only: ${invalid.map(file=>file.name).join(', ')}. Scans, images and other file formats are not supported yet.`);return;}
    const oversized=Array.from(files).filter(file=>file.size<1||file.size>10*1024*1024);
    if(oversized.length){action.setError(`Each file must contain data and be 10 MB or smaller: ${oversized.map(file=>file.name).join(', ')}`);return;}
    const started=generation.current;
    const response=await action.run(async()=>{try{return await uploadDocuments(parserId,Array.from(files));}catch(error){if(generation.current===started)throw error;}},'');
    if(generation.current!==started)return;if(input.current)input.current.value='';if(!response)return;
    const results=response.results||[response],accepted=results.filter(result=>result.document),failures=results.filter(result=>result.error),duplicates=accepted.filter(result=>result.duplicate).length;
    const newDocuments=accepted.length-duplicates,duplicateSummary=duplicates?`${duplicates} file${duplicates===1?' is':'s are'} already present.`:'';
    const summary=`${newDocuments} new invoice${newDocuments===1?'':'s'} received.${duplicateSummary?` ${duplicateSummary}`:''}`;
    if(failures.length)action.setError(`${summary} ${failures.map(result=>`${result.name||'File'}: ${result.error}`).join(' ')}`);
    else action.setMessage(newDocuments?`${summary} Processing continues in the background.`:duplicates?`${duplicateSummary} No new processing was started.`:'No new invoices were received.');
    if(accepted.length)onComplete?.();if((compact||accepted.length===1)&&accepted.length===1&&!failures.length)navigate(`/app/documents/${accepted[0].document!.id}`);
  }
  async function sample(){
    if(action.busy||!canEdit||!parserId)return;const started=generation.current;
    const result=await action.run(async()=>{try{const response=await post<UploadResult>(`/api/parsers/${parserId}/sample`);if(generation.current!==started)return;if(!response.document?.id)throw new Error('The sample was not received. Please try again.');return response;}catch(error){if(generation.current===started)throw error;}},'');
    if(generation.current!==started||!result?.document?.id)return;onComplete?.();navigate(`/app/documents/${result.document.id}`);
  }
  return <div><div className={`dropzone ${dragging?'dragging':''}`} aria-busy={action.busy} onDragOver={event=>{event.preventDefault();if(!action.busy&&canEdit)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);void upload(event.dataTransfer.files);}}>
  <UploadIcon size={30} strokeWidth={1.6}/><strong>{action.busy?'Uploading invoices…':'Drop invoice PDFs here'}</strong><p>Up to 10 digital PDFs · 10 MB and 5 pages per file</p>
  <div className="actions"><Button type="button" variant="secondary" disabled={action.busy||!parserId||!canEdit} onClick={()=>input.current?.click()}>Upload invoices</Button><Button type="button" variant="ghost" disabled={action.busy||!parserId||!canEdit} onClick={()=>void sample()}>Try a synthetic sample</Button></div>
  <input className="sr-only" ref={input} tabIndex={-1} disabled={action.busy||!canEdit} type="file" multiple accept=".pdf,application/pdf" onChange={event=>void upload(event.target.files)} aria-label="Upload invoice PDFs"/></div>
  <p className="small muted">One English supplier invoice per PDF, with selectable text and up to 100 line items. You’ll review and approve the extracted values before export. The synthetic sample uses your page allowance.</p><Notice error={action.error} message={action.message}/></div>;
}
