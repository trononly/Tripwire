# TODO — Mpesa Analyzer UI/bug fixes (from agy e2e + vision audit, 2026-09-22)

Source evidence: agy headless runs vs `com.wails.app` on device A015 (Android 16,
1080x2400); captures in `C:\Users\trono\mcp\adb-ui-mcp\screenshots\`.

## P0 — layout shell (do first)

- [ ] **1. Sticky header + status-bar overlap** — `frontend/src/App.tsx:272`
  - Header is in-flow (`flex h-14 ... border-b px-4`): scrolls away, and with
    `viewport-fit=cover` the page starts under the Android status bar.
  - Fix: `sticky top-0 z-40 ... bg-background/95 backdrop-blur
    supports-[backdrop-filter]:bg-background/80 md:static` +
    `style={{ paddingTop: "env(safe-area-inset-top)" }}` on the header.
  - Verify on-device: header pinned while Dashboard scrolls; nothing under clock/icons.

- [ ] **2. Dashboard KPI stacking** — `frontend/src/components/totals-cards.tsx:53,68`
  - `grid gap-4 sm:grid-cols-2` = one giant vertical stack on phones.
  - Fix: `grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6`, tighter mobile padding.
  - Optional: Net as full-width hero card on top.

- [ ] **3. Bottom nav ergonomics** — `frontend/src/components/mobile-nav.tsx:31-48`
  - Add active pill/indicator, icons `size-5` → `size-[22px]`, rows `min-h-14` → `min-h-16`.

## P1 — e2e bugs

- [ ] **4. Fee Radar "Share of money out" shows `—`** —
  `frontend/src/pages/Insights.tsx:56-61` + `parseservice.go`
  - `totalOut` arrives 0/undefined for SMS-mode data (expected ~0.5% on current data).

- [ ] **5. Header action mismatch** — `frontend/src/App.tsx:294-319`
  - `SMS` solid button vs Settings icon button differ in height/weight.
  - Normalize to 40px targets, same radius; add dataset badge (SMS vs Statement).

- [ ] **6. KPI cards have no icons** — `frontend/src/components/totals-cards.tsx:11-48`
  - Add Lucide icons (`ArrowDownLeft`, `ArrowUpRight`, `Receipt`, `Wallet`).

## P2 — polish

- [ ] **7. SMS-mode copy says "statement"** — `frontend/src/pages/Transactions.tsx`,
  `frontend/src/pages/Insights.tsx`
  - Branch on the existing `smsMode` prop ("from imported SMS" vs "from the active statement").

- [ ] **8. Redundant "Open Dashboard →" on mobile Insights** — `frontend/src/pages/Insights.tsx`
  - `hidden md:inline-flex` (bottom nav already covers it).

- [ ] **9. Currency typography** — `frontend/src/lib/format.ts` + `totals-cards.tsx`
  - Small muted `KES` prefix, `tabular-nums tracking-tight` digits, clarify
    `-KES 38.87` sign; rename "Opening → Closing" → "Current Balance".

- [ ] **10. App title still `wails-base-fresh`** — `frontend/index.html:9`
  - Set real title + `<meta name="theme-color">` matching dark bg.

## Verify on device (after build)

- [ ] Reinstall APK → Dashboard scroll (header pinned, nothing under status bar) →
  Transactions → Insights (Fee Radar % renders) → Settings → SMS-mode copy →
  screenshot each, compare with `mcp/adb-ui-mcp/screenshots/`.
