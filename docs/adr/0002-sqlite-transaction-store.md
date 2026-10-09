# SQLite transaction store

Statements and SMS imports share one local SQLite database in the app's data
directory (`statements.db`): one `statements` table for record metadata, one
`transactions` table for the rows, linked by record id. Both import sources
feed the same normalized `Transaction` model and the same analysis pipeline;
a record's `Source` ("statement" vs "sms") is the only thing that remembers
where a row came from. The privacy rules from 0001 carry over unchanged: no
backend, no telemetry, the PDF password is used once at import and never
written to disk, and the database holds parsed transactions only — never
PDFs or file paths.

## Status

accepted. Supersedes
[0001-local-first-json-transaction-store](0001-local-first-json-transaction-store.md),
whose JSON premises no longer hold.

## Why SQLite replaced the JSON file

- **Whole-file rewrite per merge.** The JSON store rewrote every transaction
  on every save. The SMS feed grows by appending messages, so each silent
  refresh re-wrote its entire history — slower without bound as the feed
  grows. SQLite appends only the fresh rows (`AppendFresh`) and leaves stored
  rows untouched.
- **Unbounded memory growth.** The JSON store loaded everything to do
  anything. Metadata listing, name/rename/delete, and dedup now run against
  indexed tables without touching the transaction rows.
- **Fragile persistence.** A failed read poisoned the in-memory store as
  empty, and the next save overwrote the file with that emptiness. SQLite
  transactions are atomic; a failed write leaves the previous state intact.
- **Dedup at import, enforced by query.** Receipt-number dedup still runs at
  import time over an indexed id lookup, not as a schema constraint (repeat
  imports of one statement legitimately create separate records).

## Design points

- **Pure Go (`modernc.org/sqlite`).** No CGO, so the same code compiles for
  desktop and Android with `CGO_ENABLED=0`. One pooled connection serializes
  writers (`PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout`).
- **One-time migration.** If a legacy `statements.json` sits next to the
  database and the database is empty, it is imported once and archived to
  `statements.json.migrated` — never deleted, never re-imported.
- **SMS and statements share the store but not records.** The refresh path
  merges into the latest SMS record in place; older SMS records stay as
  snapshots. The service no longer tracks an "active" record; activation is
  a load, not a state.

## Consequences

- SMS history survives restarts exactly like statement history; the "SMS
  feed is session-only app state" premise of 0001 is gone.
- Raw transactions still never leave the device except inside an explicitly
  exported report. Moving to SQLite changes nothing about the privacy pitch.
- The database file is binary, so history is no longer hand-inspectable the
  way the JSON file was; `sqlite3` (or any SQLite browser) replaces a text
  editor for debugging.
