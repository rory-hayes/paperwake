# MaintainFlow invoice language assessment

Observed 13 November 2026. This follow-up adds an explicit provider-reported language check to the English-only invoice MVP. It is a model assessment with server-enforced rejection, **not deterministic language identification or a guarantee that every unsupported language will be detected**.

## Production change

Invoice provider response `invoiceAssessment` now requires `sourceLanguage`, restricted to `english`, `unsupported` or `uncertain`. The server rejects unsupported and uncertain assessments with a clear permanent error before accepting extracted data. Missing, malformed or extra assessment fields also fail closed. The invoice prompt version is `paperwake-invoice-v3`.

Fixed provider instructions apply to existing saved parsers and queued jobs. They require assessing every page from the printed source, not the filename, country, currency or parser locale. An invoice with complete English wording, including a parallel English version, is supported. Foreign proper names, addresses, brands and product codes alone are not grounds for rejection, and source values must not be translated.

This changes only the provider response contract and fixed instructions. The saved invoice schema, parser instructions, raw invoice field structure, database schema, existing extraction runs and CSV contract are unchanged. Existing saved runs are not retrospectively reassessed. Generic/non-invoice provider requests are unchanged.

## Controlled verification

Forty-five focused tests passed across the invoice-policy, OpenAI provider and worker-allowance suites. New checks cover the bounded enum, missing/invalid assessments, unsupported/uncertain rejection despite otherwise valid data, permanent errors, unchanged English source values with foreign names/codes, fixed guidance for existing parser instructions, and absence of invoice-only assessment fields from generic requests. Typecheck and scoped diff checks passed.

The tests use controlled provider responses to verify the contract. They do not measure language-identification accuracy.

## Separate real-provider check

Four existing public publisher samples were attempted once with v3. Each request used the current production PDF guards, decoder, invoice schema, instructions and pinned provider. No hosted accounts, uploads, database writes, approvals, CSVs, email or deployment were changed.

| Sample | Provider language assessment | Result |
| --- | --- | --- |
| Salzburg German annotated sample invoice | unsupported | Rejected explicitly for English-only support |
| FileDone English invoice | english | Six rows retained; printed GST amount omitted as null |
| Zoho Standard Japanese template (printed in English) | english | Three rows retained |
| Ynteractive Paperclip Office English invoice | english | Four rows retained |

All three English invoices produced the expected row counts: 13 rows. **85 of 86** labelled normalized fields matched the existing manifest. The remaining mismatch was FileDone tax: its explicitly printed GST of `2646.36` was returned as null. The app retained a reconciliation warning rather than inventing a different amount. Currency still required review for these symbol-only examples, and the ambiguous Ynteractive date remained unresolved. This run does not establish regression-free general extraction or remove the need for source review.

There were four generation requests and four input-token-count preflights. The preflights used the documented [Responses input token count endpoint](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count). Counted input tokens matched reported generation input tokens for all four requests. The runner reserved USD 0.10 per generation after checking the count plus an 8,192-token margin and the unchanged 16,000-token output ceiling, enforced an additional USD 0.20 ceiling and the existing USD 1 overall cap, journalled dispatch before sending, and stopped on any unknown generation cost. No ambiguous attempt was retried.

Additional estimated model cost was **USD 0.02621025**, bringing the previous corpus benchmark plus this follow-up to **USD 0.15889875**, excluding taxes/provider-level adjustments. All four generation usages were reported and priced. The original baseline and both v2 result files remain separate and unchanged.

## Limits and evidence

The German document is one annotated teaching sample, not a broad multilingual holdout. The check does not cover every language, mixed-language layout or sparse invoice. English false rejection and non-English false acceptance remain possible because the server depends on the model's assessment. The boundary is explicit and fail-closed for unsupported/uncertain/missing assessments; it is not an independent language detector.

Local evidence is under `.local/public-invoice-corpus/`: `benchmark-language-v3.mjs`, `benchmark-language-v3-results.json`, `benchmark-language-v3-score.mjs` and `benchmark-language-v3-score.json`. The source manifest and earlier evidence are described in [the original sample benchmark](MAINTAINFLOW-SAMPLE-BENCHMARK-2026-11-13.md). Its finding that no language assessment existed describes v1/v2; v3 supersedes that implementation limitation without establishing perfect detection.
