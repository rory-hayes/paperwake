# MaintainFlow public invoice sample benchmark

Observed 13 November 2026. **The public corpus exercises useful invoice cases, but this is not an all-pass extraction benchmark or proof of customer accuracy.** The baseline processed 15 publisher sample PDFs through the local production PDF guards, decoder and extraction provider. It did not create accounts, upload to the hosted application, write application database rows, approve invoices or export CSVs.

## Corpus and method

The corpus contains 11 English digital invoice PDFs, two scanned PDFs, one bank statement and one German annotated invoice example. All are fictional or publisher-provided sample documents. Six English files are variants of the same Zoho invoice: they add layout coverage, not six independent supplier populations. Sources and labels are recorded separately in the [sample corpus report](MAINTAINFLOW-PUBLIC-INVOICE-CORPUS-2026-11-13.md); the authoritative private local manifest is `.local/public-invoice-corpus/manifest.json`.

The runner uses the application's `assertInvoicePdfBytes`, `runDecoder`, `assertInvoiceSource`, fixed `invoiceSchema`, `invoiceInstructions` and `createOpenAIProvider`, with the production invoice locale `en-IE` and timezone `Europe/Dublin`. It supplies the original PDF and decoded page text to the existing pinned model `gpt-5.4-mini-2026-03-17`. No custom schema, per-sample prompt or manual extraction correction was used.

Each document received at most one request per explicitly recorded prompt variant. Dispatch was journalled before the request; no ambiguous response was retried. The baseline and two focused follow-ups shared a USD 1 ceiling, reserving USD 0.45 before each request and stopping on unknown cost. The [current model pricing and context limit](https://developers.openai.com/api/docs/models/gpt-5.4-mini) were checked before execution. All 22 requests returned priced usage; the combined estimated model cost was **USD 0.1326885**, excluding taxes or any provider-level adjustments. No new credential was created; only the existing authorized extraction key was loaded, without printing or copying it.

Ground truth checks exact invoice identifiers, whitespace-normalized supplier/description strings and decimal values without binary floating-point conversion. Decimal scale differences such as `1` and `1.00` are equal for scoring. Null currency and ambiguous-date expectations follow the current extraction contract. Initial label assumptions about INR and calculated combined tax were explicitly revised against the schema/instructions, with the former interpretations retained as derived reference values. The source's printed invoice total remains authoritative even when the sample's arithmetic is inconsistent.

## Baseline: prompt `paperwake-invoice-v1`

| Observation | Result |
| --- | --- |
| English invoice PDFs producing a structured result | 11 of 11 |
| Line-item row counts matching the source | 11 of 11 documents; 33 rows total |
| Normalized field comparisons matching labels | 224 of 242 |
| Scanned PDFs rejected before any AI request | 2 of 2 |
| Bank statement rejected as not a supplier invoice | 1 of 1, after AI assessment |
| German annotated invoice rejected | No: it produced a result with blocking date/number validation issues |
| AI requests and estimated cost | 13 requests; USD 0.0746505 |

The 18 field mismatches were:

- Three Zoho layouts selected the first of two tax components for the single tax field. There was no printed combined tax amount. Reconciliation warnings appeared, but the tax field was still partial.
- Fourteen line-item descriptions across five Zoho layouts retained item titles but omitted printed descriptive subtitles. Correct row counts and numeric amounts do not establish complete row descriptions; the short matching source quote did not independently detect these omissions.
- The Zoho Simple total remained `Rs.662.75` instead of a valid decimal. The application raised a numeric validation error. It did not silently normalize to a different monetary value.

All 11 invoices lacked an explicit three-letter currency code, so the extractor left currency null and required review. The three Ynteractive numeric dates were correctly treated as ambiguous and required manual confirmation. These are expected conservative behaviors under the current contract, but they also reveal real onboarding/correction work; the documents were not ready for approval without review.

The Zoho Minimalist sample is internally inconsistent: its stated subtotal and tax components do not equal its printed total. The printed invoice total was retained, and reconciliation remained unresolved. Invoice total was distinguished from the lower balance due after payment.

## Focused tax correction and retest

The fixed invoice provider instruction now says to copy only a printed aggregate tax amount; a single tax charge is its own printed total. Multiple components without a printed combined amount must produce null rather than selecting one or calculating a sum. The runtime invoice prompt version is **`paperwake-invoice-v2`**.

The clarification sits in the fixed provider instruction, so it also covers existing saved parsers and queued jobs whose stored instructions predate the change. No persisted parser schema, identifier, invoice data or migration changed. Existing reconciliation warnings remain in place.

Only the six affected Zoho multi-tax samples were rerun:

| Observation | Result |
| --- | --- |
| Tax values left null when no combined amount is printed | 6 of 6 |
| Line-item row counts matching labels | 6 of 6 documents; 17 rows |
| Normalized field comparisons matching labels | 114 of 127 |
| Remaining differences | 12 omitted description subtitles and the one `Rs.` numeric total |
| Additional AI requests and estimated cost | 6 requests; USD 0.0379935 |

This fixes the observed tax selection in this bounded retest; it does not prove perfect future behavior. Description outputs varied between the two single-attempt runs, so the two sets must not be combined into a claimed whole-corpus post-fix accuracy score.

### Final targeted description and monetary-selection check

Before releasing v2, the fixed invoice guidance was also clarified to copy every printed subtitle/wrapped detail line in each line-item description, without summarizing it. Monetary extraction now selects the literal numeric span without surrounding currency markers such as `Rs.`, while preserving number punctuation, decimal scale, trailing zeroes and signs. The separate ISO currency field stays null unless an explicit three-letter code is printed. These are selection instructions; no schema, deterministic decimal normalizer or language gate changed.

One final attempt was made on **Zoho Minimalist, Zoho Simple and Zoho Standard Japanese** (the last document is English despite its filename). All **61 of 61** labelled fields matched, across eight rows. The complete descriptions were present, all three unprinted aggregate tax values stayed null, and the Simple total normalized to `662.75` while currency remained null. Expected currency-required and reconciliation-review issues remained. The additional three requests cost an estimated **USD 0.0200445**.

The final run stopped there as scoped. It covers the three diagnosed examples; it is not a rerun of the entire corpus, an unseen holdout or a guarantee of repeated model behavior. Baseline, tax-only v2 and final v2 results remain separate, with per-request hashes distinguishing the two pre-release v2 prompt variants.

Thirty-one controlled provider and invoice-policy tests passed, including checks that fixed guidance applies with old stored parser wording, retains null tax/reconciliation, preserves full descriptions and decimal scale, and does not infer a currency code. Typecheck and scoped whitespace checks passed. Account/email tests are separate evidence for the brand change.

## Remaining findings and scope limits

1. **Description completeness needs broader evidence.** The final focused prompt pass corrected the observed omissions on its three samples. Titles alone can still satisfy a short matching quote; there is no independent completeness guarantee. Verify against source on unseen layouts before claiming complete line-item transcription.
2. **English-only scope is not an enforced language gate.** The local PDF guards check format, page count and native text. The German annotated sample passed those checks and AI classification. Its number/date problems blocked approval, but an incidental validation failure is not language enforcement. This annotated example is not a pure language-isolation test.
3. **Currency-prefix handling has bounded evidence.** The final numeric-span guidance corrected the demonstrated `Rs.` case without guessing ISO currency. Unseen prefixes or punctuation may still require correction; the deterministic normalizer and supported-locale scope are unchanged.
4. **The corpus is small and repetitive.** It lacks a supported native-text multipage invoice, long tables near the 100-row limit, broad supplier diversity and customers' actual spreadsheet requirements. Existing synthetic tests cover some limits separately; this run does not refresh that evidence.
5. **No hosted lifecycle or customer value test occurred.** Authentication, persistence, worker scheduling, corrections, immutable approval, CSV download, billing and repeat customer time savings remain separate acceptance evidence. Public sample success cannot substitute for permissioned customer invoices.

Local owner-only evidence is under `.local/public-invoice-corpus/`: `benchmark-results.json`, `benchmark-tax-v2-results.json`, `benchmark-refined-v2-results.json`, `benchmark-score.json`, `benchmark.mjs` and `benchmark-score.mjs`. These contain public sample data and usage metadata, not credentials. Original baselines are retained.
