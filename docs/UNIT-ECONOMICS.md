# Paperwake economics calculator

The offline model in [scripts/unit-economics.ts](../scripts/unit-economics.ts) reads the current plan catalogue: ten one-time evaluation pages and EUR 49/month for 500 processed pages. It does not access credentials, a database or providers, change prices, or authorize spending. Suggestion allowances are zero in the invoice-only launch.

```sh
node --import tsx scripts/unit-economics.ts docs/unit-economics.example.json
node --import tsx --test tests/unit-economics.test.ts
```

[The example](unit-economics.example.json) is a synthetic planning input, not measured customer economics. It retains inherited scenario fields for compatibility, including unused suggestion assumptions. Its retention, provider rates, fees, exchange rate, workload, support time and target contribution are scenario assumptions; they are not current product settings, provider quotes or an approved operating budget. Review them before making a decision. The calculator always returns `planning_model_requires_operator_review`, even when operator-supplied evidence references are filled.

## Input and interpretation

The authoritative strict input schema is `economicsInputSchema` in the script. Version 1 requires:

- `rates`: model, source/date and per-million input, cached-input and output USD prices.
- `financial`: explicit FX, payment/Billing fees, reserve/tax, storage/egress/email rates and support value.
- `portfolio`: paying-account count, active free-account acquisition ratio and fixed monthly costs.
- `decision`: proposed contribution target.
- `scenarios`: paid/free usage, pages/job, attempts, token assumptions, new-original ratios, storage/read/retention assumptions, support/operations and project-wide peak demand.
- `capacity`: null or attributed owner-verified project limits.
- `evidence`: operator references for project/billing window, all-attempt reconciliation, receipts/FX, workload, operating costs, adopted offer/budget and hosted capacity; unknowns remain null.

Each assumption group carries a `basis` and `source`. Cached input is a subset of input; output tokens already include reasoning. Count retries through attempts. Use `uncreditedAiJobsPerCreditedAiJob` only for extra failed or rejected work absent from processed-page charges, without counting an attempt twice.

The free cohort represents active one-time evaluations acquired during the modeled period; it does not grant recurring monthly trial pages. Include support, failed attempts, storage/egress and free acquisition when assessing paid contribution. Fixed-cost allocation and fee/card mix need actual operating evidence. Positive contribution does not include every possible business expense or establish profitability.

[Initial live synthetic cost evidence](PAPERWAKE-ECONOMICS.md) is recorded separately. The application cost guard is an independent operational safeguard, not this calculator and not a guarantee of full-allowance margin. Historical Folio economics notes remain local and unpublished.
