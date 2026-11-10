import { Link } from 'react-router-dom';
import { FileText, Plus, Table2, CheckCircle2 } from 'lucide-react';
import { MarketingFooter, MarketingHeader } from './MarketingShell';
import ProductDemo from './ProductDemo';
import Pricing from './Pricing';
import { ExtractedFields } from './SampleDocument';
import './marketing.css';

const workflowSteps = [
  {title:'Upload',body:'Drop in a batch of supplier invoice PDFs.'},
  {title:'Extract',body:'Get invoice details and individual line items.'},
  {title:'Review',body:'Check and correct values beside the original.'},
  {title:'Export',body:'Approve your invoices and download a CSV.'},
];
const integrations = [
  {Icon:FileText,title:'Supplier invoice PDFs',body:'English digital PDFs, up to five pages each.',label:'Upload'},
  {Icon:CheckCircle2,title:'Review every detail',body:'Check the original, correct values and approve.',label:'Your control'},
  {Icon:Table2,title:'Spreadsheet-ready CSV',body:'One row per line item, with invoice details repeated.',label:'Download'},
];
const faqs = [
  {question:'Which invoices can I upload?',answer:'Start with English supplier invoices saved as digital PDFs with selectable text. Upload up to ten files at a time, up to 10 MB and five pages each, with one invoice and up to 100 line items per file. Scans, photos, receipts, purchase orders and other document types are not supported in this first version.'},
  {question:'Can I check the results before exporting?',answer:'Yes. Compare the extracted fields and line items with the original PDF, correct anything necessary and explicitly approve the invoice. Your CSV uses that approved revision. AI can misread or omit information, so review remains part of the workflow.'},
  {question:'How does the trial work?',answer:'Your account includes ten one-time evaluation pages with no card required. A PDF page counts as one page; the synthetic sample also uses this allowance. Choose the paid plan when you need recurring invoice processing.'},
  {question:'How are pages counted?',answer:'A PDF uses its page count. Internal processing retries and exact-file duplicates do not add a second page charge. Corrections and downloading an approved CSV again use no additional pages. Paid plans have a fixed allowance and no automatic overage.'},
  {question:'Can I use the CSV in my existing spreadsheet?',answer:'Yes. Download the approved CSV and import it into Excel, Google Sheets or another tool that accepts CSV. Use your spreadsheet’s import tool and import invoice numbers and product codes as Text to keep leading zeroes. You can rename and reorder columns in Settings. Automatic delivery and API connections are not included in this launch.'},
];

function Hero() {
  return (
    <section className="marketing-hero marketing-container" aria-labelledby="hero-title">
      <div className="marketing-hero-copy">
        <h1 id="hero-title"><span>Your invoices.</span><span>Beautifully</span><span className="marketing-underlined">structured.</span></h1>
        <p className="marketing-handwritten">Less copying. More getting things done.</p>
        <p className="marketing-hero-description">Turn supplier invoice PDFs into spreadsheet-ready rows. Check the details and line items, approve, then download your CSV.</p>
        <div className="marketing-hero-actions">
          <Link className="button primary marketing-cta" to="/sign-up">Try ten pages free</Link>
          <Link className="button secondary marketing-cta" to="/sign-up?sample=invoice">Try a sample</Link>
        </div>
      </div>
      <div className="marketing-hero-media">
        <img className="marketing-hero-illustration" src="/assets/hero-document-tray.png" alt="Two documents becoming an organized set of information in a blue paper tray" width={1254} height={1254} fetchPriority="high" />
        <div className="marketing-hero-result">
          <h2>Extracted fields</h2>
          <ExtractedFields minimal />
          <p>Synthetic sample</p>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section className="marketing-section marketing-workflow marketing-container" id="workflow" aria-labelledby="workflow-title">
      <div className="marketing-centered-heading">
        <h2 id="workflow-title">From invoice PDF to your spreadsheet.</h2>
        <p>A simple workflow, with you in control.</p>
      </div>
      <ol className="marketing-workflow-rail">
        {workflowSteps.map((step, index) => <li key={step.title}><span className="marketing-step-number">{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}
      </ol>
      <ProductDemo />
    </section>
  );
}

function IntegrationsSection() {
  return (
    <section className="marketing-section marketing-integrations marketing-container" id="output" aria-labelledby="integrations-title">
      <div className="marketing-integration-layout">
        <div className="marketing-integration-copy">
          <h2 id="integrations-title">Clean data.<br />Ready for what's next.</h2>
          <p>Keep your existing spreadsheet. Paperwake handles the copying, with the original beside your results for review.</p>
          <Link className="button secondary marketing-cta" to="/help">See the invoice workflow</Link>
          <p className="marketing-handwritten">Keep your workflow moving.</p>
        </div>
        <div className="marketing-integration-list">
          {integrations.map(({ Icon, title, body, label }) => (
            <div className="marketing-integration-row" key={title}>
              <span className="marketing-integration-icon"><Icon size={30} strokeWidth={1.7} /></span>
              <div><h3>{title}</h3><p>{body}</p></div><span className="marketing-integration-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="marketing-integration-note"><h3>Your approved values. A consistent spreadsheet.</h3><p>Choose your column labels and order once. Every download uses a saved approval so your corrections carry through.</p></div>
    </section>
  );
}

function FAQSection() {
  return (
    <section className="marketing-section marketing-faq marketing-container" aria-labelledby="faq-title">
      <div className="marketing-faq-intro"><h2 id="faq-title">A few useful answers.</h2><p>Everything you need to process your first invoice.</p></div>
      <div className="marketing-faq-list">
        {faqs.map((faq, index) => <details className="marketing-faq-item" name="paperwake-faq" key={faq.question} open={index === 0}><summary><span>{faq.question}</span><Plus size={23} strokeWidth={1.7} aria-hidden="true" /></summary><p>{faq.answer}</p></details>)}
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="marketing-page">
      <a className="marketing-skip-link" href="#main-content">Skip to content</a>
      <MarketingHeader />
      <main id="main-content">
        <Hero />
        <WorkflowSection />
        <IntegrationsSection />
        <Pricing />
        <FAQSection />
        <section className="marketing-final-cta marketing-container" aria-label="Try Paperwake"><h2>Give your invoice copying a wake-up call.</h2><Link className="button primary marketing-cta" to="/sign-up?sample=invoice">Try a sample</Link></section>
      </main>
      <MarketingFooter />
    </div>
  );
}
