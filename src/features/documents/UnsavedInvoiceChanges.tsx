import {useCallback,useEffect,useRef,useState} from 'react';
import {useBlocker,type BlockerFunction} from 'react-router-dom';
import {Button,Modal} from '../../components/ui';
import {useInvoiceDraftGuard,type InvoiceDepartureAction} from './InvoiceDraftGuard';

export function shouldBlockInvoiceNavigation(dirty:boolean,currentPath:string,nextPath:string){
  return dirty&&currentPath!==nextPath;
}

export function preventInvoiceDraftUnload(event:BeforeUnloadEvent){
  event.preventDefault();
  // Browsers choose their own warning text; this also supports older clients.
  event.returnValue='';
}

export default function UnsavedInvoiceChanges({dirty}:{dirty:boolean}){
  const invoker=useRef<HTMLElement|null>(null),allowUnload=useRef(false),guard=useInvoiceDraftGuard();
  const [departure,setDeparture]=useState<InvoiceDepartureAction|null>(null);
  const shouldBlock=useCallback<BlockerFunction>(({currentLocation,nextLocation})=>{
    const block=shouldBlockInvoiceNavigation(dirty,currentLocation.pathname,nextLocation.pathname);
    if(block)invoker.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    return block;
  },[dirty]);
  const blocker=useBlocker(shouldBlock);
  useEffect(()=>{
    if(!dirty)return;
    const protect=(event:BeforeUnloadEvent)=>{if(!allowUnload.current)preventInvoiceDraftUnload(event);};
    window.addEventListener('beforeunload',protect);
    return()=>window.removeEventListener('beforeunload',protect);
  },[dirty]);
  useEffect(()=>{
    if(!dirty)return;
    return guard.register(action=>{invoker.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDeparture(()=>action);});
  },[dirty,guard]);
  useEffect(()=>{if(!dirty){setDeparture(null);if(blocker.state==='blocked')blocker.reset();}},[dirty,blocker]);
  function stay(){setDeparture(null);if(blocker.state==='blocked')blocker.reset();}
  function leave(){
    if(departure){
      setDeparture(null);
      // The action releases the unload warning only after its server mutation
      // succeeds, immediately before its intended hard navigation.
      void departure(()=>{allowUnload.current=true;});
    }else if(blocker.state==='blocked')blocker.proceed();
  }
  return <Modal title="Leave without saving?" description="Your invoice corrections have not been saved. Stay to save them, or discard these changes and leave." open={dirty&&(blocker.state==='blocked'||Boolean(departure))} onOpenChange={open=>{if(!open)stay();}} onCloseAutoFocus={event=>{event.preventDefault();if(invoker.current?.isConnected)invoker.current.focus({preventScroll:true});}}>
    <div className="actions"><Button type="button" variant="secondary" onClick={stay}>Keep editing</Button><Button type="button" variant="danger" onClick={leave}>Discard changes &amp; leave</Button></div>
  </Modal>;
}
