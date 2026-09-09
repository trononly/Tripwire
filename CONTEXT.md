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

**SMS transaction**:
A transaction parsed from an Android M-Pesa notification SMS. The live layer: knows only what it has seen since onboarding, plus whatever statements supplied. Android-exclusive; permission grade varies by build.
_Avoid_: notification, alert

**Receipt No.**:
The unique transaction ID M-Pesa prints on every transaction and includes in every SMS. The identity key that merges SMS rows and statement rows without double counting.
_Avoid_: receipt number, transaction ID

**Source**:
Whether a transaction row came from a Statement or an SMS transaction. Balances only exist on statement-sourced rows; the export and the balance-chain logic branch on it.
_Avoid_: origin, feed

**Transaction store**:
The persisted JSON file holding one row per transaction, written by imports and read by every page. Imports are idempotent: a duplicate Receipt No. is refused, never re-added. Statements and SMS feed the same store.
_Avoid_: database, cache

**Bills & subscriptions**:
The tile listing recurring outflows grouped by bill counterpart: amount (single value when stable, range when variable), cadence, next-due estimate, and the monthly-obligations total. Alerts when a bill is missing this month, powered by the live SMS feed.
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