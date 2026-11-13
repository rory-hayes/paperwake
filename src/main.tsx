import React from 'react';
import ReactDOM from 'react-dom/client';
import {createBrowserRouter,RouterProvider} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SessionProvider} from './lib/session';
import App from './App';
import {InvoiceDraftGuardProvider} from './features/documents/InvoiceDraftGuard';
import {capturePasswordResetLink} from './features/auth/PasswordRecovery';
import {captureEmailVerificationLink} from './features/auth/EmailVerification';
import './styles/tokens.css';
import './styles/app.css';
import './features/auth/auth.css';
capturePasswordResetLink();
captureEmailVerificationLink();
const captureNewVerificationLink=()=>{if(window.location.pathname==='/verify-email/confirm'&&window.location.hash)captureEmailVerificationLink();};
window.addEventListener('popstate',captureNewVerificationLink);
window.addEventListener('hashchange',captureNewVerificationLink);
const captureNewResetLink=()=>{if(window.location.pathname==='/reset-password'&&window.location.hash)capturePasswordResetLink();};
window.addEventListener('popstate',captureNewResetLink);
window.addEventListener('hashchange',captureNewResetLink);
const client=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:5000,refetchOnWindowFocus:false}}});
// Keep the existing route tree; the data-router context enables supported
// navigation blocking while an invoice has unsaved corrections.
const router=createBrowserRouter([{path:'*',element:<SessionProvider><InvoiceDraftGuardProvider><App/></InvoiceDraftGuardProvider></SessionProvider>}]);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider></React.StrictMode>);
