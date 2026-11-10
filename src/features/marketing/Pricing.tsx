import {Link} from 'react-router-dom';
import {CircleCheck} from 'lucide-react';
import {PLANS} from '../../../shared/plans';
import {commercialTerms} from '../../../shared/commercial';
export default function Pricing(){
  const trial=PLANS.find(plan=>plan.id==='explore'),paid=PLANS.find(plan=>plan.id==='standard');
  return <section className="marketing-section marketing-pricing marketing-container" id="pricing" aria-labelledby="pricing-title"><div className="marketing-centered-heading"><h2 id="pricing-title">Try your invoices. Keep your time.</h2><p>One simple plan for recurring supplier invoices.</p></div>
  <div className="marketing-pricing-columns paperwake-pricing-columns"><article className="marketing-price-column" aria-labelledby="plan-trial"><h3 id="plan-trial">Try Paperwake</h3><p className="marketing-price"><strong>€0</strong><span>to try</span></p><p className="marketing-plan-pages">{trial?.monthlyPages??10} one-time evaluation pages</p><ul>{['No card required','Try the complete invoice workflow','Review, approve and download CSV'].map(feature=><li key={feature}><CircleCheck size={21} strokeWidth={1.7}/><span>{feature}</span></li>)}</ul><Link className="button secondary marketing-cta" to="/sign-up">Start with ten pages</Link></article>
  {paid&&<article className="marketing-price-column" aria-labelledby="plan-paperwake"><h3 id="plan-paperwake">Paperwake</h3><p className="marketing-price"><strong>€{paid.monthlyPrice}</strong><span>/ month</span></p><p className="marketing-plan-pages">{paid.monthlyPages.toLocaleString('en-IE')} invoice pages / month</p><ul>{paid.features.map(feature=><li key={feature}><CircleCheck size={21} strokeWidth={1.7}/><span>{feature}</span></li>)}</ul><Link className="button primary marketing-cta" to="/sign-up">Try before subscribing</Link></article>}</div>
  <p className="marketing-pricing-note">No automatic trial charges. No automatic overage. Cancel your subscription through Billing.</p><p className="marketing-pricing-note">{commercialTerms.tax} <Link to="/terms">Payment and cancellation terms</Link>.</p></section>;
}
