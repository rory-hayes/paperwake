import {lazy,Suspense} from 'react';
import {Routes,Route,Link,Navigate} from 'react-router-dom';
import {Loading} from './components/ui';
import AppShell from './components/AppShell';
import Landing from './features/marketing/Landing';
import Auth from './features/auth/Auth';
import PasswordRecovery from './features/auth/PasswordRecovery';
import EmailVerification from './features/auth/EmailVerification';
import PreviewNotice from './components/PreviewNotice';
import PageErrorBoundary from './components/PageErrorBoundary';
const Documents=lazy(()=>import('./features/documents/Documents'));
const Review=lazy(()=>import('./features/documents/Review'));
const Settings=lazy(()=>import('./features/settings/Settings'));
const Help=lazy(()=>import('./features/marketing/Help'));
const Privacy=lazy(()=>import('./features/marketing/Help').then(m=>({default:m.Privacy})));
const Terms=lazy(()=>import('./features/marketing/Help').then(m=>({default:m.Terms})));
export default function App(){return <><PreviewNotice/><PageErrorBoundary><Suspense fallback={<Loading/>}><Routes>
  <Route path="/" element={<Landing/>}/><Route path="/sign-in" element={<Auth/>}/><Route path="/sign-up" element={<Auth signUp/>}/>
  <Route path="/forgot-password" element={<PasswordRecovery/>}/><Route path="/reset-password" element={<PasswordRecovery reset/>}/>
  <Route path="/verify-email" element={<EmailVerification/>}/><Route path="/verify-email/confirm" element={<EmailVerification confirm/>}/>
  <Route path="/help" element={<Help/>}/><Route path="/privacy" element={<Privacy/>}/><Route path="/terms" element={<Terms/>}/>
  <Route path="/app" element={<AppShell/>}><Route index element={<Documents/>}/><Route path="documents/:id" element={<Review/>}/><Route path="settings" element={<Settings/>}/><Route path="usage" element={<Navigate to="/app/settings?tab=billing" replace/>}/></Route>
  <Route path="*" element={<div className="empty"><h1>This page isn’t here.</h1><p>Return to your invoices or the home page.</p><Link className="button primary" to="/app">Go to invoices</Link></div>}/>
</Routes></Suspense></PageErrorBoundary></>;}
