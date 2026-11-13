import {createContext,useContext,useMemo,type ReactNode} from 'react';

export type InvoiceDepartureAction=(allowUnload:()=>void)=>Promise<unknown>;
type DepartureHandler=(action:InvoiceDepartureAction)=>void;
type DraftGuard={register:(handler:DepartureHandler)=>()=>void;requestDeparture:DepartureHandler};
const Context=createContext<DraftGuard|null>(null);

export function createInvoiceDraftGuard():DraftGuard{
  let handler:DepartureHandler|null=null;
  return {
    register(next){handler=next;return()=>{if(handler===next)handler=null;};},
    requestDeparture(action){if(handler)handler(action);else void action(()=>{});},
  };
}

/** One mounted invoice review can protect actions that precede navigation. */
export function InvoiceDraftGuardProvider({children}:{children:ReactNode}){
  const guard=useMemo(createInvoiceDraftGuard,[]);
  return <Context.Provider value={guard}>{children}</Context.Provider>;
}

export function useInvoiceDraftGuard(){
  const guard=useContext(Context);
  if(!guard)throw new Error('Invoice draft protection requires its provider.');
  return guard;
}
