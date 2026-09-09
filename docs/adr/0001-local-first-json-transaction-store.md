# Local-first JSON transaction store

The Insights page and every analysis feature need a persisted, deduplicated history of a user's M-Pesa transactions, fed by repeated statement imports and, on Android, SMS captures. We store transactions in a single JSON file in the app's data directory, deduplicated on M-Pesa's Receipt No., with no cloud backend and no telemetry.

## Status

accepted

## Considered Options

- **SQLite (single native package)**: a `UNIQUE` constraint on Receipt No. gives free deduplication and scales to 100k rows. Rejected: it adds a native dependency to an otherwise pure-Go project for a job a few thousand rows (one multi-month statement) does not strain, and a JSON file keeps the data story inspectable by hand.
- **JSONL append log**: a natural fit for streaming SMS ingestion. Rejected: every startup would have to replay and dedup the whole log into memory, and imports are batch-shaped anyway.
- **Cloud-synced store**: rejected outright. A backend forces accounts and telemetry, and locks the monetization direction (ads vs one-time pay) before it is decided. Local-only is also the privacy pitch — "your money never leaves your phone" — which is the trust story that carries the SMS permission request.

## Consequences

- Each device keeps its own store; moving history between phone and PC uses the Settings "Export history" file, not sync.
- Deduplication runs at import time (a Receipt No. set), not as a database constraint.
- Rows are tagged by source (`statement` | `sms`); balances exist only on statement-sourced rows because SMS carries no balance.
- No feature may force ads, cloud, or telemetry onto the architecture, keeping both monetization doors open.