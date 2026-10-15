# One wallet record per SIM

SMS imports are stored as one record per SIM (physical slot, labeled with the
carrier's SIM name) instead of one merged SMS record, because a dual-SIM phone
is two M-Pesa wallets and interleaving their transactions silently corrupts
every balance-derived view. The active SIM becomes another way to pick a
record — the header SIM switcher activates a record exactly like History does
— so no analysis code ever learns about SIMs. This refines
[0002-sqlite-transaction-store](0002-sqlite-transaction-store.md), whose
"merge into the latest SMS record" is now scoped to the latest record *per
SIM*.

## Status

accepted.

## Considered options

- **One record, tag each transaction with its SIM, filter in the UI.** Keeps a
  single record, but an "all SIMs" view mixes wallets and every balance
  feature has to remember to filter first; the failure mode is wrong numbers,
  not a visible error.
- **Filter the in-memory message batch at import time.** Simplest, but the
  other wallet can never be revisited without re-importing — and since the
  inbox read returns every SIM anyway, it throws data away for nothing.

## Consequences

- The Android bridge carries each message's `subId`, `slot` (both `-1` when
  unresolved) and the SIM's carrier display name; Go groups by slot and falls
  back to the subscription id. Resolving the slot and name needs
  `READ_PHONE_STATE`, so it joins the READ_SMS permission request — but it is
  optional: a denial, or a pre-API-22 device, still imports as one
  unresolved wallet rather than failing.
- SMS records written before SIM tracking have an empty `SimID` and surface as
  a single untagged wallet. They are not backfilled — the SIM that produced
  them was never recorded and cannot be recovered.
- Each wallet keeps its own receipt-dedup set, and receipt numbers are
  globally unique, so per-SIM merging stays exactly as idempotent as the
  single-record merge it replaces.
