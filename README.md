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
exists, a dialog shows the version, the release notes as "What's new",
and an Update button that downloads the APK and hands it to the Android
installer. The first install of a new version asks you to allow
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
  appear as a single untagged wallet.
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
- `internal/store` - local persistence for imported datasets (pure-Go SQLite,
  CGO disabled).
- `internal/counterparty`, `internal/txtype` - shared helpers that extract the
  counterparty and classify a transaction description, used by both analysis
  and the recurring detector.
- `frontend/src` - the UI: `App.tsx` shell, `pages/`, `components/`, `lib/`.
- `frontend/bindings` - generated Wails bindings; do not edit by hand.

Both import sources feed one analysis pipeline; the `Source` field on a stored
record remembers where a row came from (`statement` or `sms`), and an SMS
record's `SimID`/`SimLabel` remember which SIM's wallet it is. The SMS parser
is deliberately strict - only message shapes backed by real samples are
accepted, and anything else is reported rather than guessed at.

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

# Notes from creator

- Onboarding should have the user setup their own icons for categories. For every section have an icon showing how we categorize them
- TODO: Streamline customization, inspiration: https://www.youtube.com/watch?v=MccJdr61xnc - Geoffrey Litt
- The app should have a "what's new" modal on first launch after an update. Can be disabled in the settings
- Make animations disable them in the settings with a "reduce motion" option
