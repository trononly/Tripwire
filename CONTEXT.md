# Mpesa Analyzer

Desktop + Android app that imports a user's M-Pesa transactions and helps them understand their money. The free pages (Dashboard, Transactions, Settings) show what happened; the Insights page is where paying depth lives.

## Language

**Insights**:
The fourth page — a tile canvas, and the home of the paid tier. Promise: "understand your money" — know what leaves every month, what Safaricom takes, and how your money is changing.
_Avoid_: analytics, statistics, premium page

**Insight tile**:
A self-contained card on the Insights page; the page is a canvas of tiles the user adds, removes, and reorders. The v1 MVP ships four: Bills & subscriptions, Fee radar, "vs last month", Reports & sharing. Future features are new tiles, never new architecture.
_Avoid_: widget, insight card

**Statement**:
A PDF statement exported by M-Pesa and parsed into transactions. A single statement can span months. On both platforms statements are the history layer — the only way to see the past.
_Avoid_: export, bank statement

**SMS feed**:
The live transactions parsed from Android M-Pesa notification SMS, held in app state for the running app. Android-exclusive; permission grade varies by build. Kept apart from the Statement store — the two never merge.
_Avoid_: notification, alert, SMS transaction

**Receipt No.**:
The unique transaction ID M-Pesa prints on every transaction and includes in every SMS. The dedup key for cross-statement dedup, deferred to v2 — in v1 a re-imported statement is stored as its own record.
_Avoid_: receipt number, transaction ID

**Analysis mode**:
The Dashboard control, next to Import Statement, that switches analysis between the Statement feed and the SMS feed. Android-only — on desktop there is no SMS, so the button is hidden. Desktop and mobile dashboards legitimately differ because of it.
_Avoid_: view, tab, switcher

**Active statement**:
The statement being analyzed right now. Session-only: nothing auto-loads on launch, so every session starts with nothing active until the user picks from History or imports. Importing activates the new statement immediately; deleting the active one leaves nothing active.
_Avoid_: current statement, selected statement, last opened

**History**:
The list of stored statements plus the sheet that shows it, opened from the header status chip. A row tap activates; the trash icon deletes the record and its transactions. Renames and re-uploads on rows are deliberately absent until the sheet stops fitting.
_Avoid_: statement list, drawer, dropdown

**Statement store**:
The persisted JSON file in the app's data directory, holding one record per imported statement: name, date range, transaction count, import time, and the parsed transactions. No PDFs, no file paths, no passwords. Imports and deletes write the file immediately; v1 does not dedup across statements.
_Avoid_: database, transaction store, cache

**Export**:
The only thing that leaves the device: a report rendered as an image, PDF, or HTML. No raw transactions, no store file, no SMS state are moved or removed — artifacts only.
_Avoid_: transfer, sync, backup

**Bills & subscriptions**:
The tile listing recurring outflows grouped by bill counterpart: amount (single value when stable, range when variable), cadence, next-due estimate, and the monthly-obligations total. On the Statement analysis it is a history report; on the SMS analysis it adds the live "this bill is usually paid by now" alert.
_Avoid_: recurring payments (the deleted dashboard widget)

**Fee radar**:
The tile showing "what Safaricom took" — charges by type (ATM, Pay Bill Charge, Fuliza interest, transfer fees) with totals over time. The v1 spending-depth tile.
_Avoid_: charges, fees breakdown

**Recurring bills detector**:
The engine powering Bills & subscriptions. Groups by bill counterpart plus timing cadence, measured in median gaps (never averages — outliers lie). Recurring person-to-person sends reuse the same engine later.
_Avoid_: recurring payments detector

**Onboarding**:
The first-run guided import that walks the user through connecting their data (statements and/or SMS access) while touring each section of the app.
_Avoid_: tour, setup wizard