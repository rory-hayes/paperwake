import {useEffect,useRef,useState} from 'react';
import {NavLink,Outlet,Link,Navigate,useLocation} from 'react-router-dom';
import {FileText,Settings,HelpCircle,LogOut,Menu,X} from 'lucide-react';
import {useSession} from '../lib/session';
import {Loading,Notice,ErrorState,Button} from './ui';
import {useAction} from '../lib/api';
import ProcessingNotifications from './ProcessingNotifications';
import {EmailVerificationPrompt} from '../features/auth/EmailVerification';
import {PLANS} from '../../shared/plans';
const links=[['/app','Invoices',FileText],['/app/settings','Settings',Settings]] as const;
export default function AppShell(){
  const session=useSession(),location=useLocation();
  const [menu,setMenu]=useState(false),[mobile,setMobile]=useState(()=>window.matchMedia('(max-width:1000px)').matches);
  const menuTrigger=useRef<HTMLButtonElement>(null),menuClose=useRef<HTMLButtonElement>(null),sidebar=useRef<HTMLElement>(null);const action=useAction();
  useEffect(()=>{const query=window.matchMedia('(max-width:1000px)');const change=()=>{setMobile(query.matches);if(!query.matches)setMenu(false);};const resize=()=>{change();setMenu(false);};query.addEventListener('change',change);window.addEventListener('resize',resize);return()=>{query.removeEventListener('change',change);window.removeEventListener('resize',resize);};},[]);
  useEffect(()=>{if(!menu||!mobile)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';menuClose.current?.focus();return()=>{document.body.style.overflow=previous;menuTrigger.current?.focus();};},[menu,mobile]);
  if(session.loading)return <Loading/>;if(session.error&&!session.data)return <ErrorState error={new Error('MaintainFlow is temporarily unavailable. Your sign-in has not been changed. Please try again.')} retry={()=>void session.refresh()}/>;if(!session.data)return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname+location.search)}`} replace/>;
  const {user,workspace}=session.data;const current=location.pathname.startsWith('/app/settings')?'Settings':'Invoices';
  const planName=PLANS.find(plan=>plan.id===workspace.plan.id)?.name??workspace.plan.name;
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a><aside id="workspace-navigation" ref={sidebar} className={`sidebar ${menu?'open':''}`} role={mobile&&menu?'dialog':undefined} aria-modal={mobile&&menu?true:undefined} aria-label="Workspace navigation" onKeyDown={event=>{
    if(!menu||!mobile)return;if(event.key==='Escape'){event.preventDefault();setMenu(false);return;}if(event.key!=='Tab')return;
    const focusable=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')||[]).filter(element=>element.offsetParent!==null);
    const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }}><div className="sidebar-brand"><Link to="/" className="wordmark" onClick={()=>setMenu(false)}>MaintainFlow</Link><button type="button" ref={menuClose} className="icon-button mobile-only" aria-label="Close navigation" onClick={()=>setMenu(false)}><X size={20}/></button></div>
  <div className="workspace-switch" aria-label="Current workspace">{workspace.name}</div><Notice error={action.error}/>
  <nav aria-label="Workspace pages">{links.map(([path,label,Icon])=><NavLink to={path} end={path==='/app'} className={current===label?'active':undefined} aria-current={current===label?'page':undefined} onClick={()=>setMenu(false)} key={path}><Icon size={21} strokeWidth={1.6}/>{label}</NavLink>)}</nav>
  <div className="sidebar-bottom"><Link to="/help" onClick={()=>setMenu(false)}><HelpCircle size={21} strokeWidth={1.6}/>Help & documentation</Link><div className="profile"><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><span>{planName}</span></div><button type="button" className="icon-button" aria-label="Sign out" disabled={action.busy} onClick={()=>void action.run(()=>session.logout(),'')}><LogOut size={17}/></button></div></div></aside>
  {menu&&mobile&&<button type="button" tabIndex={-1} className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
  <div className="app-body" inert={mobile&&menu}><header className="app-topbar"><div><button type="button" ref={menuTrigger} className="icon-button mobile-only" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={menu} onClick={()=>setMenu(true)}><Menu size={21}/></button><span className="muted">{workspace.name}</span><span className="muted">/</span><span>{current}</span></div><div><ProcessingNotifications key={`${workspace.id}:${user.id}`} workspaceId={workspace.id} userId={user.id}/><span className="avatar small-avatar">{user.name.slice(0,1).toUpperCase()}</span></div></header><main className="app-main" id="main" key={workspace.id}>{session.error&&<div><Notice error="MaintainFlow is temporarily unavailable. Your sign-in and current screen are unchanged."/><Button variant="secondary" onClick={()=>void session.refresh()}>Retry connection</Button></div>}<EmailVerificationPrompt/><Outlet/></main></div></div>;
}
