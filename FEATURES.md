# Features

Showcase script for onboarding: what the app does, where to find it, and
what "working" looks like. Follow top to bottom on a phone with SMS
permission granted.

## 1. Automatic SMS import (Android)

- Open the app. With SMS access already granted, the inbox is read and
  merged silently — new M-Pesa transactions appear, no taps needed.
- A toast confirms only when something is new
  ("Imported N new SMS transactions"); an unchanged inbox stays silent.
- Without permission nothing pops up; the app stays where it is.

## 2. Manual import

- Header button (SMS in SMS mode, Import otherwise) opens a compact
  dialog. Permission already granted means it refetches immediately;
  otherwise one explainer button triggers the system prompt.
- Statements import from PDF on both platforms via the same button.

## 3. Dashboard time filter

- Floating glass pill above the bottom bar: 30D / 90D / All, anchored to
  the newest transaction.
- Totals and every chart re-analyze the selected window. Daily/Weekly/
  Monthly cadence on the cashflow card composes with it.

## 4. Drill-down charts

- Donut segments and counterparty bars navigate to Transactions
  pre-filtered (category / text search). Copy says "Tap" on phones.

## 5. Insights month filter

- Month chips (All + each month in the dataset, newest first) scope every
  tile: Bills & subscriptions, Fee radar, vs last month, Reports.

## 6. Statement history

- Header status chip opens History: tap a row to activate, trash to
  delete. Deleting the active statement returns to the empty state.

## 7. Data modes (Android, in Settings)

- Statements vs SMS datasets. Importing either switches automatically.

## 8. Debug mode (hidden)

- Not part of the showcase. Konami code on keyboard, or seven taps on the
  Settings title, unlocks a diagnostics card (platform, SMS permission,
  record and transaction counts).
- The card's test button replays the arrival announcement (toast +
  notification + receipt) from the newest loaded transaction — the full
  post-payment path with no money moved.

## 9. Paying from the app (Android)

- The green call button starts a payment session: it places the `*334#`
  USSD call directly (calling + SMS-receive asked together up front). The
  session UI itself is always the system phone app — Android exposes no
  in-app surface for USSD, and the PIN never enters this app.
- An always-on catcher queues incoming M-Pesa SMS in real time (sender
  checked, bodies carried but never read outside the merge). The app drains
  the queue on launch, on resume, and every 15 seconds in the foreground,
  merging append-only — the inbox is never re-read wholesale once an SMS
  record exists. First run (or missing receive permission) still does one
  full inbox import.
- Only till/buy-goods, paybill and send-money arrivals pop the receipt;
  inbound money and everything else merges silently.
