# Local-first JSON transaction store

The Insights page and every analysis feature need a persisted, deduplicated history of a user's M-Pesa transactions, fed by repeated statement imports. We store those statement transactions in a single JSON file in the app's data directory, deduplicated on M-Pesa's Receipt No., with no cloud backend and no telemetry. The Android SMS feed stays separate — app state, not a store — and never merges with statements.

## Status

superseded by [0002-sqlite-transaction-store](0002-sqlite-transaction-store.md):
the JSON store became SQLite, and the SMS feed merged into the same store.
Originally accepted; revised when statement history landed: the flat dedup
store described below became per-statement records.

## Revision — per-statement records

The original design was one flat transaction list, deduplicated on Receipt No. at import time. That is deferred to v2. The store now holds one record per imported statement, each with its own transactions, and importing replaces the active statement instead of merging into it. A re-import of the same PDF creates a second record; the user deletes unwanted ones. Two rules carried over unchanged: the parser's password is used once in the import dialog and never persisted, and the store file never contains PDFs or file paths, only parsed transactions. Deleting a history record deletes its transactions; if it was the active statement, nothing is active afterwards.

## Considered Options

- **SQLite (single native package)**: a `UNIQUE` constraint on Receipt No. gives free deduplication and scales to 100k rows. Rejected: it adds a native dependency to an otherwise pure-Go project for a job that a few thousand rows (one multi-month statement) does not strain, and a JSON file keeps the data inspectable by hand.
- **JSONL append log**: a natural fit for streaming SMS ingestion. Rejected: every startup would have to replay and dedup the whole log into memory, and imports are batch-shaped anyway.
- **Cloud-synced store**: rejected outright. A backend forces accounts and telemetry, and locks the monetization direction (ads vs one-time pay) before it is decided. Local-only is also the privacy pitch — "your money never leaves your phone" — which justifies the SMS permission request.

## Consequences

- The store holds statements only. The SMS feed is Android-only app state, kept apart; the two never merge into one history.
- The Dashboard has an analysis-mode toggle next to Import Statement that switches between the Statement feed and the SMS feed. Desktop has no SMS, so the toggle is hidden there; desktop and mobile dashboards differ by design.
- Nothing except a rendered report leaves the device. Cross-device "transfer" means exporting an image, PDF, or HTML report; raw transactions and SMS state are never moved or removed.
- Deduplication runs at import time (a Receipt No. set), not as a database constraint.
- No feature may force ads, cloud, or telemetry onto the architecture, keeping both monetization doors open.