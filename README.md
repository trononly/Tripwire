# Tripwire

Tripwire is a local-first personal M-Pesa money analyzer for Android(Windows & Linux soon).
It imports your M-Pesa history - PDF statements, and the M-Pesa SMS in
your phone's inbox - parses it all into one normalized transaction model,
and helps you understand where your money goes: cashflow, categories,
counterparties, the fees Safaricom took, and recurring bills and
subscriptions.

## Installation

[releases page](https://github.com/trononly/Tripwire/releases) as
`Tripwire-1.2.3.apk` (plus a `Tripwire-1.2.3.aab` Play Store bundle).

The app checks that releases page for updates: on launch (at most once a
day) and on demand from **Settings → App updates**. When a newer build
exists, a dialog shows the version, the release notes as the Changelog,
and an Update button that downloads the APK and hands it to the Android
installer. The same **Changelog** button in Settings shows the notes for the
build you have installed; they are fetched at launch and cached, so the
dialog opens instantly and works offline. The first install of a new version asks you to allow
"Install unknown apps" for Tripwire once - Android's rule for updates
outside the Play Store, not something the app can skip.

**IMPORTANT**

The application asks for the following permissions:

- Manage Calls - To support automated payments by calling `*334#` and getting the Sim Carrier names for users who have two sims
- Read SMS - To get the transactions from MPESA
- Read Notifications - To get receipt notifications from MPESA to show masked messages without having to read the entire SMS inbox
- Accessibility Permissions - To automate `*334#` payments for offline payments

Therefore, the app may be blocked because of security purposes, and thats a good thing. Dont install dumb apps that ask for all these features. The good thing is that this is OSS you can view everything or even ask your agent about this application.

The way to rectify the blocking is by going to Play Store -> Settings > Play Protect > Turn off "Scan apps with Play Protect" and "Improve harmful app detection"

Furthermore Android itself will also block permissions but there are instructions in app on how to fix it. If you struggle with the instructions, I recommend you either, try again and read slowly, or open an issue on the repo and I will help you out.

I'll try to get the app on Play Store but I don't have a developer account, you can sponsor the project so I can get one. Also this app may not be green lit for the playstore but when that does happen I'll update the repository but for now, you can download the APK from the releases page and install it manually. The app is open source and you can verify the code yourself.

## Limitations

- Dual-SIM: SMS import reads the whole M-Pesa inbox and stores one wallet per
  SIM (physical slot + carrier name, falling back to the subscription id when
  `READ_PHONE_STATE` is unavailable). A SIM switcher in the SMS-mode header
  picks which wallet the analysis uses. Records imported before SIM tracking
  appear as a single untagged wallet. Guided payments dial `*334#` on the
  active wallet's SIM, whatever its carrier label, so the phone never falls
  back to its default call line or a "Call with" chooser; if that SIM cannot
  be resolved the call prefers the phone's Safaricom line, then the only SIM.
- No fee radar by-type breakdown in v1: no Fuliza sample so no Fuliza breakdown.

## Architecture

A [Wails v3](https://v3.wails.io/) app: a Go backend with an embedded
React/TypeScript frontend.

- `main.go` - entry point. Creates the Wails app, embeds `frontend/dist`, opens
  the window.
- `parseservice.go` - the Go service the frontend binds to: statement and SMS
  imports, the active dataset, history, and the analysis calls.
- `internal/parser` - the normalized `Transaction` model shared by every import
  source, plus the money parser.
- `internal/pdf` - extracts the M-Pesa "DETAILED STATEMENT" table from PDF
  statements.
- `internal/sms` - parses Android M-Pesa confirmation SMS into the same
  `Transaction` shape as statements.
- `internal/analysis` - totals, categorization, time windows, and insights.
- `internal/recurring` - the deterministic recurring-bills detector (median-gap
  cadence, MAD regularity).
- `internal/favourites`, `internal/phone` - saved Send and Lipa na M-Pesa
  destinations plus the Kenyan-mobile normalizer they share with the USSD
  scripts.
- `internal/store` - local persistence for imported datasets (pure-Go SQLite,
  CGO disabled).
- `internal/counterparty`, `internal/txtype` - shared helpers that extract the
  counterparty and classify a transaction description, used by both analysis
  and the recurring detector.
- `internal/categories` - the user's own icon categories plus the rule layer
  that maps a receipt, counterparty or transaction type to one.
- `frontend/src` - the UI: `App.tsx` shell, `pages/`, `components/`, `lib/`.
- `frontend/bindings` - generated Wails bindings; do not edit by hand.

Both import sources feed one analysis pipeline; the `Source` field on a stored
record remembers where a row came from (`statement` or `sms`), and an SMS
record's `SimID`/`SimLabel` remember which SIM's wallet it is. The SMS parser
is deliberately strict - only message shapes backed by real samples are
accepted, and anything else is reported rather than guessed at.

Send favourites are a local snapshot of a name and canonical phone number.
On Android they can be added through the system contact picker
(`ACTION_PICK`), which hands the app a one-off row and needs no contacts
permission; on desktop the same list is managed by typing a number. Send
Money and Pochi La Biashara keep separate lists, and Lipa favourites are
saved per flow too (paybills on the Paybill tab, tills on Buy Goods). All of
them can be renamed, removed and reordered from their manage sheets; Lipa
favourites (paybill or till, plus the paybill account) are always typed by
hand because a business number is not a contact.

User categories overlay the built-in M-Pesa ones rather than replacing them.
An assignment is a rule keyed on the M-Pesa receipt, the normalized
counterparty, or the transaction type - never on a statement row - so
re-importing a statement or refreshing the SMS feed keeps every label.
Resolution is transaction override, then counterparty, then type, then the
built-in category, and a paired Fuliza fee inherits its parent purchase's
label.

The dashboard's spending breakdown switches between the built-in M-Pesa
categories and **My categories**: unlabelled transactions stay visible as one
gray Uncategorized slice, and tapping any slice opens the matching rows in
Transactions. Categories themselves are renamed, reordered and deleted on the
**Categories** page, reachable from Settings, the desktop sidebar and the
donut's Manage link.

Each user category can also carry a monthly spending cap. The **Categories**
page compares the month in the active dataset with that cap, shows how much is
left, and turns the row amber at 80% and red once spending passes it. When the
dataset's newest month is the current month, the dashboard repeats the warning
as a notice and a once-per-session toast, with a link straight back to the
categories. The report is resolved through the same category rules as the
donut, so the budget and the chart can never disagree about which transaction
belongs where.

## Running it

Development, with hot-reload for both frontend and backend changes:

    wails3 dev

Production build:

    wails3 build

The Android SMS path only exists on a device, so its build/install loop lives
in the **Android debug workflow (SMS import)** section below.

## Tests

    go test ./...                          # Go: parser, analysis, recurring, store, ...
    cd frontend && pnpm exec vitest run    # Frontend: component tests

To run one Go package, e.g. the SMS parser fixtures:
`go test ./internal/sms/`.

# Android debug workflow (SMS import)

The SMS import feature only exists on Android (it reads the phone's M-Pesa
inbox through an injected bridge), so its whole dev loop lives on a device.

## Build the debug APK

Requires the Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT) and a connected
or downloadable platform + build-tools; the first run can take a while.

    wails3 task android:package

- Production (signed release, arm64) APK is the default target.
- For a faster debug build: `wails3 task android:build` (no APK assembly).
- Fat APK for emulator + device: `wails3 task android:package:fat`.
- Output lands under `build/android/app/build/outputs/apk/…` (signed release
  APK in ...`release`, e.g. `app-release-signed.apk`).
- If only `pnpm` exists but the task wants another package manager, the
  root `Taskfile.yml` already defaults `PACKAGE_MANAGER` to pnpm - always
  build via the root task (`android:package`), not the inner Taskfile.

## Debug builds (coexists with the release app)

The debug build has its own application id (`com.tripwire.app.debug`), a
blue launcher icon and the label **Tripwire Debug**, so it installs beside
the Tripwire you actually use; uninstalling one never removes the other.

    wails3 task android:package:debug   # -> bin/tripwire-debug.apk
    wails3 task android:run:device      # build, install and launch on adb

The same APK is built by the **Android debug APK** workflow
(`.github/workflows/android-debug.yml`) on `workflow_dispatch` and on pushes
to an optional `nightly` branch. Download the `tripwire-debug-apk` artifact
from the run summary.

## Guided payments

Tripwire stops at the PIN screen and, by default, also stops at the final
"Safaricom: 1 = Yes" confirmation. Enter the PIN and tap the confirmation
yourself. If you prefer the old behaviour, turn on **Settings → Preferences →
Auto-confirm after PIN**; Tripwire will then answer that final prompt for you.

On a dual-SIM phone, grant phone-state access when asked. The payment is
placed on the SIM that owns the active wallet; without that access the phone
may show its "Call with SIM 1 / SIM 2" chooser, which the menu automation
cannot drive.

The service drives the phone app's USSD window only, never Tripwire's own
window: the USSD dialog is an overlay that is often not the focused window, so
reading only the active window would leave the menu untouched.

If Android ever reports the service as enabled but no longer runs it, Send
says "automation is not running" instead of dialling into a menu nothing will
drive. Toggling the service off and on in system accessibility settings
rebinds it; restart the phone only if that does not.

## Install on a device

Enable Developer options + USB debugging, then either:

    adb install -r build/android/app/build/outputs/apk/release/app-release-signed.apk

or copy the APK onto the phone and open it.

## Using the SMS audit

1. Open the app → in **SMS mode** the header shows **Import SMS**, or go
   to **Settings → SMS import details** (only visible on Android, where
   the bridge is present).
2. Grant READ_SMS when prompted ("Allow SMS access and import"). On a
   dual-SIM phone Android also asks for READ_PHONE_STATE, which is what
   identifies the SIM each message arrived on; decline it and the import
   still works, just as one undifferentiated wallet.
3. The dialog parses every M-Pesa message in the inbox and shows the audit:
   parsed/skipped counts, per-kind filters (unsupported / malformed /
   invalid / non-transactional), free-text filter (sender, SIM, receipt ID,
   body), and a detail view per message (raw SMS plus its source SIM next to
   everything the parser produced).
4. **Copy audit report** puts a plain-text report of all skipped messages
   (with raw bodies and reasons) plus capped parsed messages on the
   clipboard - paste it back to the agent to extend parser coverage.
5. After closing the dialog, the last audit stays available on the **SMS**
   page (session-only). Importing saves automatically: the batch is
   written into the same store as PDF statements and the app switches
   into SMS mode, so the Dashboard shows the SMS dataset right away.
   Switch between Statements and SMS mode in Settings.
6. On a dual-SIM phone a **SIM switcher** appears in the SMS-mode header.
   Each SIM is its own wallet record, so switching re-runs the Dashboard,
   Transactions and Insights over that SIM's transactions alone - balances
   and cashflow are never mixed across wallets.

## Useful commands

    go test ./internal/sms/          # parser fixtures + classification tests
    wails3 task android:package      # rebuild after any Go or frontend change
    adb logcat --pid=$(adb shell pidof com.tripwire.app)   # runtime logs

# Contributing

`main` is protected: push a branch and open a PR. Every user-facing PR needs
a plain-language **title** and a `## What's new` section in the description
(see `.github/PULL_REQUEST_TEMPLATE.md` and `AGENTS.md`). CI rejects a PR with
no bullets in that section; use the `skip-release-notes` label for
maintenance PRs that have no user-facing change.

The `## What's new` bullets are raw material, not the published copy. Before
tagging a release, draft the notes:

    node scripts/draft-release-notes.mjs tripwire-0.9.7

Edit `release-notes/0.9.7.md` (group, dedupe, order by user impact), commit
it through a PR, then tag the merge commit. The release workflow publishes
the file verbatim as the GitHub Release body, which is what the in-app
**What's new** and Changelog dialogs show. It fails if the file is missing,
empty, or has no `## What's new` section. Do not publish from the GitHub UI
and do not use `generate_release_notes`; both bypass the committed notes.

See `RELEASING.md` for the full checklist, versionCode rules, annotated tags
and the hotfix path.

Before opening a PR:

    go test ./...
    cd frontend && pnpm exec tsc --noEmit && pnpm test
    node --test scripts/draft-release-notes.test.mjs

# Notes from creator

- Onboarding should have the user setup their own icons for categories. For every section have an icon showing how we categorize them
- TODO: Streamline customization, inspiration: https://www.youtube.com/watch?v=MccJdr61xnc - Geoffrey Litt
- DONE: Changelog button in Settings → App updates, cached for the installed release
- DONE: Reduce motion option in Settings (stops the Pay icons pulsing)
