# Plan: USSD Accessibility Automation (quick entries)

Source: owner direction 2026-10-12 — plan only, no wiring yet. Method: Android
AccessibilityService. UPDATE 2026-10-13: stacked direct codes
(`*334*1*1*…#`) were tried as an MVP and REJECTED on-device — Safaricom
drops everything after `*334` and shows the main menu, so prefilled dialing
cannot work. The service below walks the live menus instead. Wiring status:
service + bridge + scripts + pages + Settings disclosure all implemented;
on-device stepping run is the remaining verification.

## Current state (verified)

- One generic transact FAB: `frontend/src/App.tsx:634-667` calls
  `startUssdSession("*334#")` (`frontend/src/lib/sms-bridge.ts:89-91`).
- Native: `WailsBridge.java:991-1044` places `ACTION_CALL tel:*334#` (asks
  `CALL_PHONE + RECEIVE_SMS` together), emits `common:ussd {ok, listening}`.
  `WailsJSBridge.java:146-150,178-181` exposes it. Manifest holds
  `CALL_PHONE / RECEIVE_SMS / READ_SMS` (`AndroidManifest.xml:12-19`).
- The payment UI is always the system phone app — this app never sees
  keypresses or the PIN. Confirmations merge via the always-on `SmsReceiver`
  catcher queue (`drainPendingSms`, 5s tick + resume drain in `App.tsx`).
  Only till/paybill/send-money arrivals pop the receipt.
- Quick-entry data already exists: Bills & subscriptions tile
  (`recurring-payments.tsx`, engine in `internal/recurring/`) + top
  counterparties from `internal/analysis/categorization.go`. No payee store yet.

## Goal

User taps a quick entry in-app (e.g. "Send 500 to Achieng", "Pay KPLC bill
12345") → app dials `*334#` → an AccessibilityService steps through the
system USSD menus (select option, fill phone / business no / account / amount,
confirm) → **stops at the PIN screen, user enters PIN manually** → existing
catcher + receipt flow completes the loop.

## Hard constraints (non-negotiable)

1. **PIN never enters this app.** Service must detect the PIN/secret prompt
   and stop (no `setText`, no scraping the PIN field). Abort + toast instead.
2. **User-initiated only.** Service acts solely while a session is "armed" by
   an in-app tap, with a timeout (~90s). Never reacts to USSD dialogs otherwise.
3. **Least privilege.** Only touches USSD dialog windows
   (`com.android.phone`, `com.google.android.dialer`, OEM variants); ignores
   everything else. No notification scraping, no web content.
4. **Menu text drifts.** Safaricom renumbers/rewords menus; OEM dialog layouts
   differ. All step-matching must be fuzzy (contains/regex, Kiswahili+English)
   with abort-on-unknown-prompt, never blind index-tapping.
5. **Play policy.** AccessibilityService is a sensitive permission: needs
   in-app disclosure + Settings opt-in + privacy-policy note. Plan for review
   friction; keep the service disabled by default.

## Architecture

### 1. Native service (new files)

- `build/android/app/src/main/java/com/wails/app/MpesaUssdService.java`
  extends `AccessibilityService`:
  - `onServiceConnected`: subscribe to `TYPE_WINDOW_STATE_CHANGED |
    TYPE_WINDOW_CONTENT_CHANGED`.
  - Gate: only when `SessionArmed` (static holder set by `WailsBridge`, holds
    `script: List<Step>`, `expiresAt`, `stepIndex`; cleared on timeout/finish).
  - On event: if top window package is a known phone/dialer package and node
    tree contains USSD keywords (`M-PESA`, `Enter phone`, `Enter amount`,
    `PIN`), match current prompt against expected step (fuzzy), then
    `performAction(ACTION_SET_TEXT / ACTION_CLICK)` on the input + Send/OK node.
  - PIN detection (`"pin"`, `"secret"`, `"password"` in prompt or password
    input type) → disarm, emit `common:ussd-auto {state:"awaiting-pin"}`.
  - Unexpected prompt / timeout / session cancelled → disarm, emit
    `{state:"aborted", reason}`.
- `build/android/app/src/main/res/xml/ussd_service_config.xml`:
  `accessibilityEventTypes`, `packageNames` (phone/dialer), `canRetrieveWindowContent=true`,
  `description=@string/ussd_service_desc`.
- Manifest: `BIND_ACCESSIBILITY_SERVICE` permission + `<service>` with
  `action.BIND_ACCESSIBILITY_SERVICE` intent-filter + `meta-data
  ACCESSIBILITY_SERVICE` → config. New strings for description/disclosure.
- `build.gradle`: no new deps (framework only). `minSdk 21` is fine.

### 2. Bridge (extend, don't fork)

- `WailsBridge.java`: `isUssdAutomationEnabled()` (check
  `Settings.Secure ENABLED_ACCESSIBILITY_SERVICES` for our service id),
  `openUssdAutomationSettings()` (fire `ACTION_ACCESSIBILITY_SETTINGS`),
  `startUssdQuickEntry(scriptJson)` (validate → arm session → `placeUssdCall("*334#")`).
- `WailsJSBridge.java`: `@JavascriptInterface` for the three above.
- `sms-bridge.ts`: `ussdAutomationStatus()`, `openUssdAutomationSettings()`,
  `startUssdQuickEntry(script)` + `UssdAutoEvent` type for
  `common:ussd-auto {state: "step"|"awaiting-pin"|"done"|"aborted", step?, prompt?}`.
- Reuse existing post-payment path untouched: catcher → `mergeSmsBatch` →
  receipt pop. `done` is only inferred from the SMS confirmation, never from
  the USSD dialog closing.

### 3. Menu map + execution model (frontend-owned, versioned)

- Menu map lives in one TS file (`frontend/src/lib/ussd-menus.ts`) so
  Safaricom renumbers mean editing data, not service code. Confirmed by owner
  2026-10-13 (English handset):
  - `*334#` → `1` Send money → `1` Send to any network / `3` Pochi La Biashara.
    Flow: phone → amount → PIN → `1` (Yes) to confirm. Pochi is identical.
  - `*334#` → `6` Lipa na M-PESA → `1` Pay Bill / `2` Buy Goods and Services.
    Paybill flow: business no → account → amount → PIN → `1` (Yes).
    Till flow: till no → amount → PIN → `1` (Yes).
  - Withdraw (agent / ATM / bank to M-PESA) is a TODO placeholder page —
    flows differ per channel, implemented later.
- MVP execution is **guided stepping, not stacked codes**: the pages build a
  `QuickEntryScript` (`ussd-menus.ts`: ordered `{match, input}` steps), the
  bridge arms `MpesaUssdService` and dials plain `*334#`, and the service
  types each value + taps Send per prompt, in order. The session lands on
  the PIN/confirm screen; the PIN is always entered manually in the system
  dialog, then confirmed with 1 (the script's final step, entered only after
  the user finishes the PIN screen).
- Future-proofing: steps match fuzzily (prompt contains ANY keyword), and
  `parseMenuOption()` documents the rule for resolving the number before a
  matched label if Safaricom renumbers. On no match the service aborts after
  4 distinct unknown prompts, never guesses. Hardcoded numbers are the MVP only.
- Slow networks: the service skips dialogs that are still loading (spinner /
  "please wait" words) instead of typing into them. While armed it re-checks
  the live screen every 400ms rather than waiting for OS events, so a ready
  menu is acted on immediately; a step whose prompt persists 4s after acting
  gets exactly one retry (input possibly wiped by a refresh), then waits out
  the session instead of spamming Send.
- Automation-off UX: Send/Lipa show an amber warning panel (enable / dial
  manually / check-again) instead of the guided button; availability
  rechecks on focus return. Manual `*334#` dial remains as fallback.

### 4. Frontend UX (new, Android-only)

- The single FAB is replaced by a **speed-dial FAB** (`MpesaFab` in
  `frontend/src/App.tsx`): tap opens 3 actions — **Send** (`/send`), **Lipa**
  (`/lipa`), **Withdraw** (`/withdraw`, TODO placeholder).
- `/send` (Send Money & Pochi La Biashara): top toggle switches the two
  options; inputs are phone number + amount, one Send button.
- `/lipa` (Lipa na M-PESA): top toggle switches Paybill (paybill + account +
  amount) and Buy Goods (till + amount).
- `/withdraw`: static placeholder (Agent / ATM / Bank to M-PESA), disabled
  button, implemented later.
- All pages are English, validate locally (KE numbers, 1–500,000 KSh, no
  `*`/`#` in tokens), then dial the stacked code via `startUssdSession`.
  On `common:ussd ok` show "Enter your M-Pesa PIN in the phone dialog".
- Settings gains an **M-Pesa automation** card: status (on/off), "Enable in
  system settings" button, plain-language disclosure (what it automates, that
  the PIN stays manual, how to switch off). Gated to `isAndroidBridge()`.
- Progress UX: toast/step indicator driven by `common:ussd-auto`; on
  `awaiting-pin` show "Enter your M-Pesa PIN in the phone dialog to finish".
- Debug: extend hidden diagnostics with automation status + a prompt simulator
  (replay canned USSD prompts through the matcher with no call placed).

## Phases (in order when wiring starts)

0. **Menu mapping** (done 2026-10-13): owner supplied `*334#` numbering and
   prompt wording (EN). Output = `ussd-menus.ts` data + step-script builders.
1. **Service skeleton + status bridge**: service + config + manifest,
   `isEnabled/openSettings` bridge, Settings card. Verify enable/disable round-trip.
2. **Script runner**: armed-session holder, fuzzy matcher, PIN-stop, abort paths,
   `startUssdQuickEntry` + `common:ussd-auto` events. Test with one script (Send Money).
3. **Quick Pay sheet**: 4 actions + suggestions from recurring/counterparties;
   wire remaining scripts; keep generic `*334#` FAB as fallback.
4. **Hardening**: 90s timeout, unexpected-prompt abort, timeout/abort toasts,
   e2e on-device (agy), Play disclosure text + privacy-policy note.

## Explicitly out of scope

- Auto-entering or storing the PIN ("insecure mode" with a saved PIN was
  proposed and rejected 2026-10-13: a stored 4-digit money PIN endangers the
  whole wallet to anyone holding the unlocked phone or its backups, voids
  the accessibility disclosure, and risks a Play policy ban);
  sending USSD via `TelephonyManager`
  (bypasses the user-visible PIN UI — rejected).
- Background/auto-pay without a tap; iOS/desktop (no USSD surface).
- A payee/account store (retype each time in MVP; add only if sheet outgrows it).
- Dead-code removal (table/breadcrumb/dropdown-menu UI, `insights.go` stub,
  `TransactionCategories`/`SaveSmsImport`/`RenameStatement`) — deferred per owner.
