# Hesabu

Hesabu is a local-first personal M-Pesa money analyzer for desktop and Android.
It imports your M-Pesa history — PDF statements on both platforms, and the
M-Pesa SMS in your Android phone's inbox — parses it all into one normalized
transaction model, and helps you understand where your money goes: cashflow,
categories, counterparties, the fees Safaricom took, and recurring bills and
subscriptions.

## Privacy: everything stays on device

There is no backend, no account, and no telemetry. Statements and SMS are
parsed locally and persisted in a local database in the app's data directory;
the parser password is used once, in the import dialog, and is never written to
disk. The only thing that ever leaves the device is a report you explicitly
export (image, PDF, or HTML). The reasoning is recorded in
`docs/adr/0002-sqlite-transaction-store.md` (which supersedes
`docs/adr/0001-local-first-json-transaction-store.md`).

## Architecture

A [Wails v3](https://v3.wails.io/) app: a Go backend with an embedded
React/TypeScript frontend.

- `main.go` — entry point. Creates the Wails app, embeds `frontend/dist`, opens
  the window.
- `parseservice.go` — the Go service the frontend binds to: statement and SMS
  imports, the active dataset, history, and the analysis calls.
- `internal/parser` — the normalized `Transaction` model shared by every import
  source, plus the money parser.
- `internal/pdf` — extracts the M-Pesa "DETAILED STATEMENT" table from PDF
  statements.
- `internal/sms` — parses Android M-Pesa confirmation SMS into the same
  `Transaction` shape as statements.
- `internal/analysis` — totals, categorization, time windows, and insights.
- `internal/recurring` — the deterministic recurring-bills detector (median-gap
  cadence, MAD regularity).
- `internal/store` — local persistence for imported datasets (pure-Go SQLite,
  CGO disabled).
- `internal/counterparty`, `internal/txtype` — shared helpers that extract the
  counterparty and classify a transaction description, used by both analysis
  and the recurring detector.
- `frontend/src` — the UI: `App.tsx` shell, `pages/`, `components/`, `lib/`.
- `frontend/bindings` — generated Wails bindings; do not edit by hand.

Both import sources feed one analysis pipeline; the `Source` field on a stored
record is the only thing that remembers where a row came from. The SMS parser
is deliberately strict — only message shapes backed by real samples are
accepted, and anything else is reported rather than guessed at. `CONTEXT.md` is
the source of truth for the domain vocabulary.

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

## Where to go next

- `CONTEXT.md` — the domain model and vocabulary; read this first.
- `FEATURES.md` — the demo/showcase script: what's built and how to exercise it.
- `TODO.md` — the current UI and bug backlog.
- `docs/` — ADRs and design plans.

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
  root `Taskfile.yml` already defaults `PACKAGE_MANAGER` to pnpm — always
  build via the root task (`android:package`), not the inner Taskfile.

## Install on a device

Enable Developer options + USB debugging, then either:

    adb install -r build/android/app/build/outputs/apk/release/app-release-signed.apk

or copy the APK onto the phone and open it.

## Using the SMS audit

1. Open the app → in **SMS mode** the header shows **Import SMS**, or go
   to **Settings → SMS import details** (only visible on Android, where
   the bridge is present).
2. Grant READ_SMS when prompted ("Allow SMS access and import").
3. The dialog parses every M-Pesa message in the inbox and shows the audit:
   parsed/skipped counts, per-kind filters (unsupported / malformed /
   invalid / non-transactional), free-text filter, and a detail view per
   message (raw SMS next to everything the parser produced).
4. **Copy audit report** puts a plain-text report of all skipped messages
   (with raw bodies and reasons) plus capped parsed messages on the
   clipboard — paste it back to the agent to extend parser coverage.
5. After closing the dialog, the last audit stays available on the **SMS**
   page (session-only). Importing saves automatically: the batch is
   written into the same store as PDF statements and the app switches
   into SMS mode, so the Dashboard shows the SMS dataset right away.
   Switch between Statements and SMS mode in Settings.

## Useful commands

    go test ./internal/sms/          # parser fixtures + classification tests
    wails3 task android:package      # rebuild after any Go or frontend change
    adb logcat --pid=$(adb shell pidof com.wails.app)   # runtime logs

# Notes from creator

- Onboarding should have the user setup their own icons for categories. For every section have an icon showing how we categorize them
- TODO: Streamline customization, inspiration: https://www.youtube.com/watch?v=MccJdr61xnc - Geoffrey Litt
- The app should have a "what's new" modal on first launch after an update. Can be disabled in the settings
- Make animations disable them in the settings with a "reduce motion" option
