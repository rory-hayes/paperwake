# Paperwake initial cost evidence

The proposed €49/month, 500-page allowance is plausible to test. The available evidence does **not** establish full-allowance profitability or total operating cost per account. A separate estimated AI-budget safeguard is described below.

On 9 November 2026, a real-provider synthetic run processed five fixtures: a two-page invoice, a four-page/100-line invoice, a rejected purchase order, a rejected credit note, and a one-page invoice with missing currency. Its local receipt is `.local/live-invoice-acceptance/39bde973-0b74-4481-aff3-d4a5e0de983f/report.json`. No real customer corpus was used.

The run recorded five provider attempts, nine input pages, seven committed pages, and **$0.0375855** of model cost. All five attempts had reported, priced usage; there were no unknown-cost attempts in this run. Costs use provider-reported token usage and the configured model rates, rather than a settled provider invoice.

| Extrapolation | AI-only cost |
| --- | ---: |
| 500 input pages at this small corpus's observed mix | $2.09 |
| 500 committed pages, retaining this run's failed/rejected workload per committed page | $2.68 |
| 500 pages like the four-page, 100-line fixture | $2.52 |

The dense fixture itself cost $0.02016375. These projections assume the observed mix repeats linearly. They are neither forecasts nor worst-case bounds. All five requests completed in one attempt; the corpus does not estimate production retry frequency, customer input variety, long descriptions, heavily populated pages or abuse. Human correction/support time is not measured. EUR revenue and USD costs are not directly interchangeable without an explicit FX assumption.

Hosting, database, private storage and egress, backups, email, payment processing, Stripe Billing/Tax where enabled, monitoring and founder support remain additional costs. Fixed costs should be divided by actual paying accounts, and free-evaluation acquisition cost should be accounted for separately. A claimed gross margin must name those assumptions and distinguish contribution before support from profit.

## Processing limits and the separate cost safeguard

The inherited provider permits 512 KiB of input text and 16,000 output tokens. Jobs default to **three total attempts**: an initial attempt plus at most two automatic retries for retryable failures. Output-limit failures are permanent, so they must not be described as always receiving three attempts.

At the configured output price, 16,000 output tokens alone cost $0.072 per request. Across 500 one-page requests that is $36 before input tokens; this is an illustrative output-cap scenario, not the expected workload or a complete upper bound. A retry after a timeout can incur another request even when the first request's final cost was not observed locally.

Failed processing releases page reservations while the provider can still charge for the attempted work. Repeated rejected uploads or manual retries can therefore consume model budget without reducing the remaining processed-page allowance. Page, concurrency, upload-size and HTTP rate limits alone do not establish a monthly account spend ceiling.

The source now adds a separate pre-dispatch safeguard in [ai-cost-budget.ts](../server/core/ai-cost-budget.ts): defaults of $2 per evaluation account, $25 per paid account and $100 across the installation per UTC calendar month. It reserves $1 before an attempted request, serializes global admission, and only replaces that reservation with arithmetically verified usage for the pinned model/rates. Unknown or unmatched observations retain the reservation. Model, output-limit or pricing changes require reviewing these assumptions. The release evidence must cover its concurrency and before-request behavior.

This safety budget can pause an account before all 500 page credits have been used, particularly for unusually expensive or uncertain work. Operator review may be necessary during the pilot. It is separate from subscription billing periods and is not a settled-provider-invoice guarantee or evidence of a profitable full allowance.

Before opening paid pilots, measure a consenting real invoice corpus and calibrate invoice-specific input/output limits against the supported 100-line case. The new safety budget contains exposure; it does not replace those measurements. The existing [economics calculator](../scripts/unit-economics.ts) is a planning model whose assumptions must be reviewed against those measurements.
