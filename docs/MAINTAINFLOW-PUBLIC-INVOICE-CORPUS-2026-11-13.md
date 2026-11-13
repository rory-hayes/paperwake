# MaintainFlow public invoice sample corpus

Prepared and inspected on **13 November 2026**. This is a private regression corpus of intentionally published sample documents, not exposed customer bills. It supplies varied layouts and failure cases; it does not prove performance on customers' invoices or willingness to pay.

## Corpus and provenance

Fifteen original PDFs were downloaded into the ignored `.local/public-invoice-corpus/pdfs/` directory. The local `manifest.json` records each source URL, publisher, sample/reuse evidence, exact SHA-256, byte size, page count, native-text observation, expected header values and line items, and review caveats. Third-party PDFs are not committed or redistributed.

| Publisher / samples | PDFs | Purpose and reuse evidence |
| --- | ---: | --- |
| [filedone](https://filedone.ai/sample-files/sample-invoice-pdf) | 3 | Native stationery invoice, scanned version, and fictional bank statement. Publisher explicitly dedicates the fictional examples to CC0. |
| [Sliced Invoices](https://slicedinvoices.com/extensions/pdf-email/) | 1 | Publisher-provided DEMO invoice with placeholder business/bank details and a Paid watermark. No separate redistribution licence observed; private evaluation only. |
| [Zoho Invoice](https://www.zoho.com/invoice/invoice-templates/sample/zoho-invoice-standard-template.pdf) | 6 | Standard, lite, grand, minimalist, simple and Japanese-named layout samples. Each is labelled as a sample template. No separate redistribution licence observed; private evaluation only. |
| [Ynteractive / Stepthrough](https://learn.ynteractive.com/courses/ai-document-processing/8) | 3 | Made-up print-shop, office-supply and cleaning invoices explicitly offered for extraction practice. Each PDF states fictional sample/do not pay. No broad redistribution licence claimed. |
| [Parseur](https://parseur.com/blog/sample-pdf-invoice) | 1 | Two-page scanned packaging invoice with 18 rows, repeated headers/carry-forward and stamps. Publisher states the data are fictional and the sample may be shared/uploaded. |
| [Bildungsdirektion Salzburg](https://www.bildung-sbg.gv.at/images/com_edocman/Musterrechnung.pdf) | 1 | German annotated teaching invoice with Musterfirma/Max Mustermann and placeholder details. Outside English-only scope; not an actual customer's invoice. No broad redistribution licence claimed. |

## Coverage and deliberate limits

- **11 English digital invoice PDFs**, representing **six fictional suppliers across four publishers**. Six Zoho PDFs are related layout variants and the three Stepthrough files share a visual family. Do not describe these as 11 independent real-world suppliers.
- **Four negative cases:** two image-only invoices (one with two pages), one native-text bank statement and one German annotated invoice. The bank statement and German example are valid PDFs with native text, so passing intake text checks must not be confused with being in product scope.
- Line items range from one to six in the supported set. Coverage includes wrapped descriptions, zero tax, multiple tax lines, partial payment versus invoice total, a Paid watermark, symbol-only currency, ambiguous numerical dates, missing quantity/unit-price columns, and inconsistent source totals.
- The PDF named `zoho-invoice-standard-japanese-template.pdf` is **English in its actual contents**. It is layout coverage, not a language-rejection test.
- The Zoho minimalist source prints subtotal 550.000 and separate taxes 25.850 and 38.500, but total 662.750. Preserve the printed total and surface a discrepancy; do not silently replace it with a calculated total.
- This public set does **not** contain a native multipage supplier invoice, product-code-heavy invoice, 100-row invoice or broad EUR/GBP invoice coverage. Existing owned synthetic multipage/boundary fixtures remain necessary. Permissioned pilot samples are still needed for customer-specific accuracy and time-saving claims.

## Ground truth and conservative review

All 17 pages were rendered with Poppler and visually inspected. Header and line-item labels were manually transcribed, then checked against the application's decoded text. Wrapped descriptions are whitespace-normalized. Monetary labels remain decimal strings; compare numeric equivalence without introducing rounding or truncation.

Manifest version 2 separates printed facts from interpretation. The FileDone invoice prints a rupee symbol but no three-letter currency code; its currency interpretation is recorded separately, while the current explicit-code extraction contract expects a null/review result. Zoho prints two tax rows but no combined-tax scalar: the arithmetic sum is recorded separately for human review, and the no-calculation extraction contract expects null for the single tax field. This label revision is recorded explicitly in the manifest. Dollar-only currencies and ambiguous numerical dates similarly remain review cases rather than invented facts.

## Checks performed here

The application's actual isolated `runDecoder` read all 15 PDFs successfully. Thirteen PDFs passed its native-text threshold; both scanned invoices had zero native text and correctly fail the threshold required by invoice intake. All files are below 10 MiB and five pages. These observations are **offline decoding/preflight**, not hosted upload, AI classification, extraction accuracy, approval or CSV acceptance.

Reproduce the offline decoding from the project root:

```sh
node --import tsx .local/public-invoice-corpus/inspect.mjs
```

Evidence lives in `.local/public-invoice-corpus/manifest.json`, `offline-decoder-results.json`, `text/` and `renders/`. Download metadata are in `downloads.json`. Source pages were retained where available. No authentication credentials, customer data, emails, hosted uploads or AI calls were used to assemble and inspect the corpus.

The separately owned `benchmark*` files, if present, record any subsequent extraction run. Do not imply that the offline checks above establish those results.

## Existing workflow harness boundary

`scripts/verify-paperwake-live.ts` is a separate, explicit **local-only** harness. It generates its own synthetic fixtures, creates disposable local accounts, uses the configured database/app/worker, and can spend up to its configured AI cap. It does not accept this public corpus and must not be presented as having tested it unchanged. Retain its previous multipage, 100-row, correction/approval and CSV evidence at its original revision; use a bounded corpus-aware harness for these new PDFs.
