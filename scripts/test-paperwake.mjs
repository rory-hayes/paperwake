import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
/** Release contract; dormant Folio features remain available via test:historical. */
export const suites={
 launch:['paperwake-invoice-policy','paperwake-invoice-editor','paperwake-review-issues','paperwake-upload-recovery','paperwake-upload-client','paperwake-session-availability','paperwake-signup-invite','paperwake-invoice-flow','paperwake-usage'],
 accounts:['paperwake-signup-policy-configuration','account-email-template','account-email','account-email-worker','account-email-dispatch','account-cleanup-bounds','account-registration','account-recovery','account-recovery-ui','email-verification','email-verification-ui','auth-login','hosted-auth','signup-terms-policy','signup-terms-workflow','signup-terms-ui'],
 boundaries:['paperwake-test-database','request-rate-limit','database-schema','private-storage','storage-error-response','file-deletion-claim','static-serving','dependency-availability','provider-errors'],
 processing:['paperwake-worker-allowance','paperwake-ai-budget','upload-workspace-continuity','hosted-worker','ai-usage-attempts','ai-usage-deadline','openai-provider','openai-usage','source-validation','pdf-degenerate-text','pdfjs-render-errors','regional-normalization','schema-empty-array-validation','nested-values','csv-values','frontend-values','timestamps','written-date'],
 billing:['mock-billing-ui','checkout-contract-evidence','checkout-policy-configuration','stripe-test-clock-policy','stripe-workspace-uuid','preview','preview-runtime','unit-economics'],
 recovery:['backup-archive','backup-cli','backup-runtime','backup-staging','backup-supabase'],
};
const allFiles=new Set(Object.values(suites).flat().map(name=>`${name}.test.ts`));
for(const file of readdirSync('tests'))if(file.startsWith('paperwake-')&&file.endsWith('.test.ts')&&!allFiles.has(file))throw new Error(`New Paperwake coverage must be listed in the release manifest: ${file}`);
const selected=process.argv.find(arg=>arg.startsWith('--group='))?.slice(8);
if(selected&&!Object.hasOwn(suites,selected))throw new Error('Unknown test group');
const files=(selected?suites[selected]:Object.values(suites).flat()).map(name=>`tests/${name}.test.ts`);
for(const file of files)if(!existsSync(file))throw new Error(`Missing release coverage: ${file}`);
if(process.argv.includes('--list')){console.log(files.join('\n'));process.exit(0);}
const environment={...process.env,NODE_ENV:'test',PGDATABASE:process.env.PGDATABASE||'paperwake_test',FOLIO_PREVIEW_MODE:'false',FOLIO_BILLING_MOCK:'false',RESEND_INBOUND_ENABLED:'false',OPENAI_API_KEY:'',PAPERWAKE_AI_TRIAL_MONTHLY_USD:'1000',PAPERWAKE_AI_PAID_MONTHLY_USD:'1000',PAPERWAKE_AI_GLOBAL_MONTHLY_USD:'10000',RESEND_API_KEY:'',FOLIO_AUTH_EMAIL_ENABLED:'false',FOLIO_AUTH_EMAIL_API_KEY:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''};
// Empty shadow values prevent dotenv importing actual operator text. The test
// preload removes them after configuration loads, before fixture apps start.
for(const key of ['PAPERWAKE_SIGNUP_POLICY_JSON','PAPERWAKE_SIGNUP_POLICY_VERSION','PAPERWAKE_SIGNUP_POLICY_SHA256'])environment[key]='';
const guard=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {assertPaperwakeTestDatabase} from './tests/paperwake-test-database.ts'; import {closeDatabase} from './server/core/db.ts'; try {await assertPaperwakeTestDatabase();} finally {await closeDatabase();}"],{stdio:'inherit',env:environment});
if(guard.status!==0)process.exit(guard.status??1);
const result=spawnSync(process.execPath,['--import','tsx','--import','./tests/test-environment.ts','--test','--test-concurrency=1',...files],{stdio:'inherit',env:environment});
if(result.error)throw result.error;process.exit(result.status??1);
