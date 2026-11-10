# Paperwake backup and restore tools

The inherited encrypted backup CLI is [scripts/backup.ts](../scripts/backup.ts). The current release checks its archive, storage and restore boundaries with controlled fixtures. On 10 November 2026, an owner-approved encrypted capture of the actual hosted Paperwake database/originals also passed restore and inactive byte verification: 64 tables, 99 rows, 40 migrations and one PDF. See the [hosted recovery receipt](evidence/paperwake-hosted-restore-2026-11-10.json). The target was a fresh database on the existing local PostgreSQL 17 test server, reached through a Unix socket; no restored application or worker was activated.

Recurring backup scheduling, independent offsite storage/key custody, retention and failure notifications remain separate acceptance requirements. The one-off encrypted archive and recovery identity are currently on the same Mac. [Deployment status](PAPERWAKE-DEPLOYMENT.md) and [verification](PAPERWAKE-WEEK-ONE-EVIDENCE.md) record those limits.

## Verification commands

```sh
node scripts/test-paperwake.mjs --group=recovery
npm run verify:backup:managed
```

The managed drill creates its own temporary PostgreSQL cluster and controlled private storage. It does not contact production providers. The older `verify:backup` scenario assumes deferred Folio workflows and is not the Paperwake release gate.

## Operator interface

The CLI supports these commands with explicit absolute paths to private files:

| Command | Required options |
| --- | --- |
| `keygen` | `--identity-file`, `--recipient-file` |
| `create` | `--config`, `--recipient-file`, `--output`, `--quiesced` |
| `inspect` | `--input`, `--identity-file` |
| `restore` | `--config`, `--input`, `--identity-file` |
| `verify` | `--config`, `--input`, `--identity-file` |
| `activate` | `--config`, `--input`, `--identity-file`, `--allow-outbound` |

Invoke with `node --import tsx scripts/backup.ts <command> ...`. Selected output files must be new. `create --quiesced` asserts that all API, worker, deletion/maintenance and storage writers have stopped; it is not a command that stops them. Coordinate a real maintenance window before capture.

The explicit JSON configuration has version `1`, `database` connection fields (`host`, `port`, `database`, `user`, optional private `passwordFile`/`sslCaFile`), `schema`, two restricted runtime roles (`adminRole`, `appRole`), `storageDir`, and `integrationKeyFile`. The canonical shape is [BackupConfig](../scripts/backup/types.ts), with validation in [backup/files.ts](../scripts/backup/files.ts). The CLI does not load application environment files. Keep configuration, passwords, integration keys, recovery identity and backup artifacts outside originals and public Git, using owner-only files/directories. Remote database connections require trusted CA verification.

`databaseProfile: "managed-source"` and `sourceStorage` describe capture from private Supabase storage using a separately selected service-role key file. This mode is capture-only. Optional `--exclude-upload-staging` is valid only for an explicit managed Supabase capture and records omitted unfinished uploads in the archive. Do not infer production compatibility from the controlled test alone.

Restore requires a fresh, different, dedicated database and empty destination storage, matching PostgreSQL/migration/schema requirements, and provisioned restricted runtime roles. It refuses an existing populated target. A restore remains inactive behind a pending marker. `verify` checks the restored data without activating it. `activate --allow-outbound` is a separate operator decision: restored queues and credentials may perform external work when services are later started. The tool does not start application services.

Review the exact source/destination, config schema, preflight checks, supported size limits, archive migration hashes and private-key custody before a real operation. Preserve the integration-encryption key along with the database and originals; a database-only backup is insufficient. Historical Folio operational evidence is retained locally, not published as Paperwake recovery proof.
