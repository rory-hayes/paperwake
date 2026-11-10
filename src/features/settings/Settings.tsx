import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock3, ShieldCheck } from 'lucide-react';
import { Button, ErrorState, Field, Loading, Notice, PageHeader, Tabs } from '../../components/ui';
import { patch, post, useAction, useData } from '../../lib/api';
import { useSession } from '../../lib/session';
import BillingPanel from './BillingPanel';
import InvoiceCsvSettings from './InvoiceCsvSettings';
import AccountTermsRecord from './AccountTermsRecord';
import {EmailVerificationStatus} from '../auth/EmailVerification';
import './settings.css';

type WorkspaceSettings = {
  workspace: { id: string; name: string; settings: { retentionDays?: number; notifications?: boolean } };
  role: string;
  limits: { maxBytes: number; maxPages: number };
  authentication: { provider: string; emailVerification: boolean; passwordResetEmail: boolean };
};

function GeneralPanel({ data, canManage }: { data: WorkspaceSettings; canManage: boolean }) {
  const action = useAction();
  const [name, setName] = useState(data.workspace.name);
  async function save(event: FormEvent) {
    event.preventDefault();
    await action.run(() => patch('/api/workspace/settings', { name }), 'Workspace settings saved.');
  }
  return (
    <form className="settings-form" onSubmit={(event) => void save(event)}>
      <h2>Account</h2>
      <div className="setting-row"><div><strong>Workspace name</strong><p>Your company name, shown in your invoice workspace.</p></div><input aria-label="Workspace name" required maxLength={100} value={name} disabled={!canManage} onChange={(event) => setName(event.target.value)} /></div>
      <div className="setting-row"><div><strong>Invoice format</strong><p>English supplier invoices with selectable PDF text.</p></div><p>Dates keep their written calendar date. Monetary values and invoice identifiers are preserved for your review. No currency conversion is performed.</p></div>
      <div className="setting-row"><div><strong>Upload limits</strong><p>Validated before a document enters the queue.</p></div><p>{Math.floor(data.limits.maxBytes / 1024 / 1024)} MB per file · {data.limits.maxPages} pages per PDF</p></div>
      <div className="setting-row"><div><strong>Authentication</strong><p>Use your email address and password to sign in.</p></div><div><p>Password sign-in. Verification email is {data.authentication.emailVerification?'available':'currently unavailable'}. Password recovery email is {data.authentication.passwordResetEmail?'available':'currently unavailable'}.</p><Link className="link" to="/app/settings?tab=password">Manage your account email and password</Link></div></div>
      <Notice error={action.error} message={action.message} />
      {canManage ? <div className="actions"><Button type="submit" disabled={action.busy || !name.trim()}>Save changes</Button></div> : <p className="small muted settings-bottom-note">A workspace owner or administrator can change these settings.</p>}
      <div className="settings-callout settings-inline-link"><div><strong>Billing connection</strong><p>View your page allowance, subscription and billing controls.</p></div><Link className="button secondary" to="/app/settings?tab=billing">Usage & billing</Link></div>
    </form>
  );
}

function RetentionPanel({ data, canManage }: { data: WorkspaceSettings; canManage: boolean }) {
  const action = useAction();
  const [days, setDays] = useState(String(data.workspace.settings.retentionDays ?? 30));
  const numericDays = Number(days);
  async function save(event: FormEvent) {
    event.preventDefault();
    await action.run(() => patch('/api/workspace/settings', { retentionDays: numericDays }), 'Retention period saved.');
  }
  return (
    <form className="settings-form" onSubmit={(event) => void save(event)}>
      <div className="settings-section-heading"><div><h2>Document retention</h2><p>Choose how long source documents stay in this workspace.</p></div><Clock3 size={25} strokeWidth={1.6} /></div>
      <div className="setting-row"><div><strong>Retention period</strong><p>Between 1 and 30 days, measured from receipt.</p></div><div className="settings-input-unit"><input aria-label="Retention days" type="number" min={1} max={30} step={1} required disabled={!canManage} value={days} onChange={(event) => setDays(event.target.value)} /><span>days</span></div></div>
      <div className="settings-callout">The worker deletes eligible documents and linked processing records after this period. Lowering it can make older documents eligible at the next sweep. Local export snapshots containing a deleted document are removed too. Copies you have already downloaded remain on your device.</div>
      <Notice error={action.error} message={action.message} />
      {canManage ? <div className="actions"><Button type="submit" disabled={action.busy || !days.trim() || !Number.isInteger(numericDays) || numericDays < 1 || numericDays > 30}>Save retention period</Button></div> : <p className="small muted">A workspace administrator can change retention.</p>}
    </form>
  );
}

function PasswordPanel() {
  const action = useAction();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) { action.setError('The new passwords do not match.'); return; }
    const result = await action.run(() => post('/api/auth/password', { currentPassword, newPassword }), 'Password updated. Other sessions have been signed out.');
    if (result) { setCurrentPassword(''); setNewPassword(''); setConfirmation(''); }
  }
  return (
    <form className="settings-password-form" onSubmit={(event) => void save(event)}>
      <div className="settings-section-heading"><div><h2>Change your password</h2><p>Your current session stays signed in.</p></div><ShieldCheck size={25} strokeWidth={1.6} /></div>
      <Field label="Current password"><input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
      <Field label="New password" hint="Use between 10 and 128 characters."><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field>
      <Field label="Confirm new password"><input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field>
      <Notice error={action.error} message={action.message} /><Button type="submit" disabled={action.busy}>Update password</Button>
    </form>
  );
}

const settingTabs = [
  {id:'general',label:'Account'}, {id:'csv',label:'CSV columns'}, {id:'billing',label:'Billing'}, {id:'retention',label:'Data retention'}, {id:'password',label:'Security'},
];

export default function Settings() {
  const query = useData<WorkspaceSettings>('/api/workspace/settings');
  const { data: session } = useSession();
  const [params, setParams] = useSearchParams();
  const canManage = ['owner', 'admin'].includes(session?.workspace.role || '');
  const tabs = settingTabs;
  const active = tabs.find((tab) => tab.id === params.get('tab')) || tabs[0];
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  return (
    <div className="workspace-settings">
      <PageHeader title="Settings" description="Your account, spreadsheet preferences and subscription." />
      <Tabs items={tabs.map((tab) => tab.label)} value={active.label} onChange={(label) => setParams({ tab: tabs.find((tab) => tab.label === label)!.id })} />
      <div className="settings-tab-content" key={`${query.data.workspace.id}:${active.id}`}>
        {active.id === 'general' ? <><GeneralPanel data={query.data} canManage={canManage} /><AccountTermsRecord /></> : null}
        {active.id === 'csv' ? <InvoiceCsvSettings /> : null}
        {active.id === 'retention' ? <RetentionPanel data={query.data} canManage={canManage} /> : null}
        {active.id === 'billing' ? <BillingPanel /> : null}
        {active.id === 'password' ? <><EmailVerificationStatus /><PasswordPanel /></> : null}
      </div>
    </div>
  );
}
