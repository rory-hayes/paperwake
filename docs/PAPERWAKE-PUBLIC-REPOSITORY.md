# Public repository scope

This repository publishes Paperwake's application source, tests, migrations, synthetic fixtures, build/deployment templates and current product/setup notes. It preserves inherited implementation helpers for later work without enabling their deferred product features.

Historical Folio screenshots, account/deployment reports, design exports, monitoring evidence and the earlier README are retained on the original workstation but excluded by the explicit documentation allowlist in `.gitignore`. They are not needed to build or test this release and are not Paperwake acceptance evidence. Local raw Paperwake acceptance artifacts also remain under ignored `.local/` or `docs/evidence/`; only explicitly allowlisted, sanitized release receipts are published. Current verification summaries distinguish measured results from outstanding work.

The preserved local copies include the original `BACKUP-RESTORE.md` and `UNIT-ECONOMICS.md` under `docs/history/`. Their public replacements describe current tools without publishing old account records or obsolete pricing claims. Do not force-add that history or generated evidence when publishing updates.

## Documentation dependencies

- `tests/unit-economics.test.ts` reads `docs/unit-economics.example.json`. This synthetic assumption file is included; its financial inputs are examples, not invoices, current provider quotes or measured business economics.
- `scripts/backup.ts` and `scripts/unit-economics.ts` refer operators to the included [backup guide](BACKUP-RESTORE.md) and [calculator guide](UNIT-ECONOMICS.md).
- The managed backup drill and backup tests construct their own controlled fixtures. They do not read historical documentation/evidence. The backup watchdog uses `deploy/supabase-worker.sql`, which remains included.
- Historical evaluation scripts can write new reports into `docs/evidence/`. Those generated reports remain ignored and are not input dependencies of current CI.

The release manifest is [scripts/test-paperwake.mjs](../scripts/test-paperwake.mjs); [test scope](PAPERWAKE-TEST-SCOPE.md) explains retained and deferred coverage. No public repository claim substitutes for deployed-provider acceptance or a production recovery drill.
