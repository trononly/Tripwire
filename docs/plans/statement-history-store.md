# Plan: Statement History Store

Source: grilling session with the owner (all decisions below are confirmed, not proposals).
Goal: persist imported statements so the app restores data across launches, plus a
history switcher in the UI. Replaces the round-4 CLI-args idea (dropped entirely).

## Decisions (settled)

1. **Store parsed transactions, not PDFs or paths.** Transactions are the source of
   truth. No re-parse, ever — the password is needed once, in the import dialog, and is
   never persisted. No PDF copies in appdata. (This also kills the Android
   content-URI/repermissioning problem: no paths anywhere.)
2. **One active statement at a time. No merging.** Cross-statement dedup on Receipt No.
   is deferred to v2. Current replace-on-import semantics stay.
3. **Re-imports may create duplicates.** No matching/upsert by name+date-range — the
   user can trash unwanted entries. (Owner: "we can't baby them on everything.")
4. **Never auto-load on launch.** Every session starts with nothing active; the user
   picks a statement by clicking (history or a fresh import). Persisting an
   "active" pointer across sessions was explicitly rejected as a "big assumption".
5. **Naming:** the import dialog gets a pre-filled, **editable** name field, auto-derived
   from the statement's first/last transaction dates (e.g. `Jan 2025 – Sep 2025`).
6. **Deleting a history entry deletes that record's stored transactions.** If the
   deleted record was active, drop to the empty state — **no auto-promotion** of another
   statement.
7. **UX = status chip + Sheet/Drawer** (shadcn Sheet), not a dedicated page, not a
   dropdown on the Import button, not a Dashboard section. Details below.

## Store

- One JSON file in `application.Path(application.PathDataHome)/mpesa-analyzer/`
  (Wails v3 beta.17, adrg/xdg → `%LocalAppData%` on Windows). Same code path on
  Android — no platform fork.
- Schema:

  ```json
  {
    "statements": [
      {
        "id": "...",
        "name": "Jan 2025 – Sep 2025",
        "dateRange": { "start": "2025-01-03", "end": "2025-09-28" },
        "txCount": 143,
        "importedAt": "2026-01-01T12:00:00Z",
        "txs": [ /* parser.Transaction[] */ ]
      }
    ]
  }
  ```

- `dateRange` comes from the parsed transactions' min/max dates (statement header dates
  are unreliable); `txCount = len(txs)`.
- New package `internal/store` (JSON read/write, atomic write via temp+rename).
- Imports and deletes write the file immediately; no in-memory-only mode.

## Import flow (extends the existing dialog)

File picker → dialog gains one field: **Statement name** (pre-filled from date range,
editable) + existing **PIN** field → `ParsePDF` → on success persist the record and
**activate it immediately** (assumption confirmed by owner).

## Header & history UX

- **Status chip** next to Import Statement: shows active statement
  (`Mar 2024 · 143 txns ▾`). Chip tap → Sheet (right side on desktop, bottom on mobile).
  On narrow viewports the chip truncates (date range or icon+count); Import button goes
  icon-only. Two compact header elements total.
- **Sheet rows**: name, date range, txn count, trash icon. Active row gets a checkmark +
  accent background. Row tap = activate + close sheet + re-render Dashboard/Transactions.
  Trash = confirm dialog (destructive: deletes stored txs, irreversible) → row removed.
- **Import affordance at the top of the sheet** so browsing history can jump to import.
- **Empty states** (Dashboard):
  - Never imported anything → centered empty state, single large Import CTA (same
    handler as header button); chip hidden or disabled "No statements yet".
  - History exists, nothing active (this is the state on **every** launch, per no-auto-load)
    → two CTAs: "Choose from history" (opens the sheet) + "Import new statement".

## Explicitly out of scope (do not build)

- CLI args / auto-import at launch (dropped)
- "PDF has been moved → locate elsewhere" modal (nothing is re-parsed)
- Cross-statement Receipt No. dedup / merged store (v2)
- SMS feed integration, Insights tiles, paid tier (separate work)
- Statement rename or re-upload actions on rows (add back only if the drawer stops fitting)

## Docs follow-up (after implementation)

- **ADR-0001 revision note**: supersede dedup-merge + single flat store with
  per-statement records, no cross-statement dedup in v1, password never persisted.
- **CONTEXT.md** vocabulary: **Active statement** (the one being analyzed; session-only),
  **History** (the statement list + sheet), keep "Statement store" wording aligned with
  the new schema (it no longer dedups on Receipt No. in v1).

## Implementation pointers

- Backend: `internal/store` (load/save, StatementRecord type), extend `ParseService`
  with bindings like `ImportStatement(filePath, pin, name)`, `ListStatements()`,
  `ActivateStatement(id)` (returns txs for the active id), `DeleteStatement(id)`,
  `RenameStatement(id, name)` (cheap; optional). Regenerate Wails bindings after.
- Frontend: active statement id lives in `App.tsx` state (session-only, resets on
  reload); Dashboard/Transactions consume it; new chip + Sheet component on the header;
  empty-state variants on Dashboard.
- Existing ParsePDF flow stays as the parse engine; the dialog in
  `frontend/src/components/import-statement-dialog.tsx` gains the name field and
  switches to the new import binding.
