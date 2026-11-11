import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,BookOpen} from 'lucide-react';
import {MarketingFooter,MarketingHeader} from './MarketingShell';
import {useData} from '../../lib/api';
import type {PublicInstallation} from '../../../shared/installation';
import {commercialTerms} from '../../../shared/commercial';
import {PLANS} from '../../../shared/plans';
import {Button} from '../../components/ui';
import CsvImportGuidance from '../documents/CsvImportGuidance';
import './marketing.css';
function GuideLayout({title,introduction,children}:{title:string;introduction:string;children:ReactNode}){
  return <div className="marketing-page"><a className="marketing-skip-link" href="#guide-content">Skip to content</a><MarketingHeader/><main className="marketing-guide marketing-container" id="guide-content"><Link to="/help" className="marketing-guide-back"><BookOpen size={17}/>Help & documentation</Link><h1>{title}</h1><p className="marketing-guide-introduction">{introduction}</p><div className="marketing-guide-body">{children}</div></main><MarketingFooter/></div>;
}
export default function Help(){
  const installation=useData<{publicService:PublicInstallation}>('/api/config');
  const supportEmail=installation.isSuccess?installation.data?.publicService?.supportEmail:null;
  const trial=PLANS.find(plan=>plan.id==='explore')!,paid=PLANS.find(plan=>plan.id==='standard')!;
  return <GuideLayout title="Your first invoice, step by step." introduction="Upload a supplier invoice, check the extracted rows and download a CSV for your spreadsheet.">
    <section><h2>1. Upload an invoice PDF</h2><p>Open Invoices and choose Upload invoices, or drag your files into the upload area. Paperwake supports English supplier invoices saved as digital PDFs with selectable text. Choose up to ten files at once, up to 10 MB and five pages per file. Each PDF must contain one invoice with a single line-item table of up to 100 rows.</p><p>Try a synthetic sample if you want to explore the workflow first. It is clearly labelled and uses your page allowance. Scans, photos, encrypted files, purchase orders and receipts are outside this first release.</p></section>
    <section><h2>2. Review the details and line items</h2><p>Processing continues in the background if you leave the page. Open the invoice when it needs review. The original PDF appears beside the extracted fields; use the Line items tab to check the table. Compare the complete row count, amounts, currency and invoice number with the source.</p><p>Correct any mistakes and choose Save correction before approving. If a numeric date is ambiguous, enter the date shown on your original. Missing or invalid required values must be fixed. Totals warnings can reflect discounts or shipping; check the original and confirm the saved values instead of changing a correct invoice to make its totals fit. AI can misread or omit information; passing a field check does not guarantee the invoice is correct.</p></section>
    <section><h2>3. Approve and download</h2><p>Choose Approve & export after reviewing the invoice, then Download CSV. Paperwake saves the approved revision and uses it for your CSV. You can also select approved invoices in the list to download a combined CSV.</p><p>Each line item gets a row, with its invoice details repeated. Import the file into Excel, Google Sheets or another CSV-compatible tool. Settings → CSV columns lets you rename headings and change their order for future downloads.</p><CsvImportGuidance/><p>Text that could be read as a spreadsheet formula is prefixed with an apostrophe for safer import. Decimal fields retain their decimal text in the CSV. Check your imported spreadsheet before using it elsewhere.</p></section>
    <section><h2>Page allowance and billing</h2><p>Your trial includes {trial.monthlyPages} one-time evaluation pages with no card required. The paid plan is €{paid.monthlyPrice}/month excluding applicable VAT, with {paid.monthlyPages} invoice pages per billing period. One PDF page counts as one page. Internal retries use no extra pages. Re-uploading an identical file uses no extra pages while its invoice remains in your workspace. After deletion or expiry, uploading it again starts new processing and uses your allowance if extraction succeeds. Corrections and repeat downloads use no additional pages.</p><p>See your usage and subscription in Settings → Billing. There is no automatic trial charge or automatic overage. Use the billing portal to manage cancellation.</p></section>
    <section id="processing-help"><h2>If something needs attention</h2><dl><div><dt>File not supported</dt><dd>Check that the file is a readable digital supplier invoice PDF within the size and page limits. Do not rename another file type to PDF.</dd></div><div><dt>Processing failed</dt><dd>Open the invoice to read the error. The invoice detail shows the error and provides access to the uploaded original while it is retained. For a supported file that failed, contact support with its name and the displayed message. While that invoice remains in your workspace, uploading the same file again returns it and does not restart processing. Do not send passwords or API keys.</dd></div><div><dt>A newer correction was saved</dt><dd>Another tab changed this invoice. Load the latest values before saving or approving again. Your current draft remains visible until you choose to replace it.</dd></div><div><dt>Download unavailable</dt><dd>Approve every selected invoice first. If downloading fails, retry; downloading an approved revision again does not use more pages.</dd></div></dl></section>
    <section><h2>Contact support</h2>{installation.isPending?<p role="status">Loading the support contact…</p>:supportEmail?<p>Email <a href={`mailto:${encodeURIComponent(supportEmail)}`}>{supportEmail}</a> with the invoice name and displayed error.</p>:<p>The support contact is currently unavailable.</p>}{installation.isError&&<Button type="button" variant="secondary" disabled={installation.isFetching} onClick={()=>void installation.refetch()}>Retry support contact</Button>}</section>
    <section><h2>Your documents</h2><p>Use Data retention in Settings to view or shorten how long documents are kept. Delete an invoice from the Invoices list when you no longer need it. Downloaded copies remain on your device.</p><p>API access, automatic delivery and additional document types are not included in this launch.</p></section>
    <Link className="button primary" to="/app">Open your invoices<ArrowRight size={17}/></Link>
  </GuideLayout>;
}

export function OperatorDetails({details,pending=false,unavailable=false}:{details?:PublicInstallation;pending?:boolean;unavailable?:boolean}) {
  return <section aria-label="Service operator and policies">
    <h2>Service operator and policies</h2>
    {pending ? <p>Checking this installation’s operator details…</p> : unavailable ? <p>Operator details could not be loaded. Try again before submitting sensitive documents.</p> : <>
      {details?.operatorName ? <p><strong>Operator:</strong> {details.operatorName}</p> : <p>The operator’s identity has not been configured for this installation.</p>}
      {details?.supportEmail ? <p><strong>Support:</strong> <a href={`mailto:${encodeURIComponent(details.supportEmail)}`}>{details.supportEmail}</a></p> : <p>A support contact has not been provided.</p>}
      {details?.privacyEmail ? <p><strong>Privacy requests:</strong> <a href={`mailto:${encodeURIComponent(details.privacyEmail)}`}>{details.privacyEmail}</a></p> : <p>A privacy-request contact has not been provided.</p>}
      {details?.privacyUrl ? <p><a href={details.privacyUrl} rel="noopener noreferrer">Read the operator’s privacy notice</a></p> : <p>The operator’s full privacy notice has not been provided.</p>}
      {details?.termsUrl ? <p><a href={details.termsUrl} rel="noopener noreferrer">Read the operator’s service terms</a></p> : <p>The operator’s service terms have not been provided.</p>}
      {details?.subprocessorsUrl ? <p><a href={details.subprocessorsUrl} rel="noopener noreferrer">Review the operator’s subprocessors</a></p> : null}
    </>}
  </section>;
}

export function Privacy() {
  const installation=useData<{publicService:PublicInstallation}>('/api/config');
  const details=installation.data?.publicService;
  return (
    <GuideLayout title="Privacy & data handling." introduction="How the application handles documents, with contacts and policies supplied by this installation’s operator.">
      <OperatorDetails details={details} pending={installation.isPending} unavailable={!!installation.error}/>
      <section>
        <h2>About this page</h2>
        <p>These notes describe application behavior. The operator’s privacy notice explains the legal basis for processing, who receives data and how to exercise your rights. Configured contacts and links do not by themselves verify those arrangements.</p>
      </section>
      <section>
        <h2>Data in your workspace</h2>
        <p>The application stores account information, private workspace information, uploaded invoices, processing results, corrections, approvals, exports, CSV preferences, usage and audit events. Records use PostgreSQL; original files use the installation’s configured private storage. The operator’s notice identifies the actual hosting arrangements.</p>
        <p>Passwords are stored as password hashes. Session tokens are stored as token hashes. Account boundaries control access to invoices and settings.</p>
      </section>
      <section>
        <h2>Provider processing</h2>
        <p>Invoice extraction sends the document content and invoice field definitions to the configured AI provider. Hosting and storage providers process the records and originals needed to run Paperwake. Account-email and billing providers receive the information needed for those actions. The operator’s privacy notice identifies these providers and their applicable arrangements.</p>
        <p>The application does not add a separate cross-workspace training process using customer corrections. This does not make a claim about a third-party provider's data retention or training policy.</p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>Workspace administrators can choose a document-retention period in Settings. Active processing can defer expiry. Deletion removes document records and queues removal of private files. Failed file removals have bounded retries and remain tracked for administrator follow-up. A removed document record does not by itself confirm physical file removal. Minimal usage, audit and replay-protection records can remain. Downloaded exports, backups and copies already delivered to another service have separate retention arrangements.</p>

        <p>{details?.retentionNotice||'The operator has not yet published a retention notice covering backups, audit records and provider copies. Confirm those periods before submitting sensitive production data.'}</p>
      </section>
      <section>
        <h2>Data location</h2>
        <p>{details?.dataLocationNotice||'The operator has not yet published the data locations and transfer arrangements for this installation. A storage provider’s name alone does not establish where every copy is processed or retained.'}</p>
      </section>
    </GuideLayout>
  );
}

export function Terms() {
  const installation=useData<{publicService:PublicInstallation}>('/api/config');
  const details=installation.data?.publicService;
  return (
    <GuideLayout title="Service terms & usage." introduction="Review the operator’s service terms and the workflow limits before using this installation.">
      <OperatorDetails details={details} pending={installation.isPending} unavailable={!!installation.error}/>
      <section>
        <h2>Use suitable documents</h2>
        <p>The synthetic samples are provided to explore the workflow. Only upload documents you are entitled to process, and review the result before relying on it or sending it to another system.</p>
      </section>
      <section>
        <h2>Extraction and review</h2>
        <p>Document extraction can omit or misread information. The workflow includes source review, corrections and approval so you can check values. These application notes make no numerical accuracy guarantee or assurance of suitability for a regulated decision.</p>
      </section>
      <section>
        <h2>Pricing and providers</h2>
        <p>No subscription is activated by viewing a plan. Demo and test billing are labelled in Billing before you open Checkout. Review the displayed price and the operator’s payment and cancellation terms before confirming a live subscription. External services require their own configuration and account permissions.</p>
        <p>{commercialTerms.allowance}</p>
        <p>{commercialTerms.tax}</p>
      </section>
      <section>
        <h2>Cancellation and refunds</h2>
        <p>{commercialTerms.refunds}</p>
        <p>When paid subscriptions are available, use the billing portal to manage cancellation and check its effective date. Paid access continues while a subscription is active; after it ends, new processing depends on any unused one-time evaluation allowance. Cancellation does not delete existing documents or erase usage. Contact the support address above about a billing error, an unavailable cancellation control or a refund required by law.</p>
      </section>
      <section>
        <h2>Operator terms apply separately</h2>
        <p>{details?.termsUrl?'Use the linked operator terms for the applicable service, payment, cancellation and legal arrangements. These workflow notes do not replace that document.':'Service, payment, cancellation and legal arrangements have not been supplied for this installation. These workflow notes are not a substitute for completed operator terms.'}</p>
      </section>
      <Link className="marketing-text-link" to="/privacy">Read the current data-handling notes <ArrowRight size={17} /></Link>
    </GuideLayout>
  );
}
