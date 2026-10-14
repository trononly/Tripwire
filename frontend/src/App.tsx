import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { TransactionReceiptDialog } from "@/components/transaction-receipt-dialog";
import { HistorySheet } from "@/components/history-sheet";
import { ScrollToTop } from "@/components/scroll-to-top";
import {
  Banknote,
  FileUp,
  MessageSquareText,
  Phone,
  Send as SendIcon,
  Settings as SettingsIcon,
  ShoppingCart,
  X,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

import type * as parser from "../bindings/mpesa-analyzer/internal/parser/models";
import type * as analysis from "../bindings/mpesa-analyzer/internal/analysis/models";
import type * as store from "../bindings/mpesa-analyzer/internal/store/models";
import {
  ActivateStatement,
  AnalyzeTransactions,
  DeleteStatement,
  ListStatements,
  RefreshSmsImport,
  RefreshSimLabels,
} from "../bindings/mpesa-analyzer/parseservice";
import {
  drainPendingSms,
  hasPhoneStatePermission,
  isAndroidBridge,
  requestPhoneStatePermission,
  requestSimCards,
  requestSmsImport,
  smsPermissions,
  type SmsBridgeMessage,
  type SmsBridgeResult,
} from "@/lib/sms-bridge";
import { useSmsPermissions } from "@/hooks/use-sms-permissions";
import { usePaymentsEnabled } from "@/lib/payments-mode";
import { MobileNav } from "@/components/mobile-nav";
import { SimSwitcher } from "@/components/sim-switcher";
import type {
  SmsImportResult,
  SmsRefreshResult,
} from "../bindings/mpesa-analyzer/models";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import Sms from "@/pages/Sms";
import Dashboard from "@/pages/Dashboard";
import Insights from "@/pages/Insights";
import Send from "@/pages/Send";
import Lipa from "@/pages/Lipa";
import Withdraw from "@/pages/Withdraw";

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
      Loading dashboard…
    </div>
  );
}

// Primary bottom-tab destinations vs. secondary pages. There is no native
// back-press hook in this app (main.go is the desktop Wails entry,
// build/android/main_android.go only registers it — no onBackPressed /
// goBack handling anywhere), so the Android system back button arrives as
// a plain WebView history back, i.e. a router POP navigation. This
// component reroutes exactly that: a POP landing on a secondary route is
// replaced with the last-visited primary tab, instead of stepping back
// through history. POP on a primary tab is untouched,
// so it keeps the default behavior (exit the app when history is empty).
// In-app PUSH/REPLACE navigations (tab taps, links, FAB) are unaffected.
const PRIMARY_TABS: readonly string[] = ["/", "/transactions", "/insights"];

function BackToPrimaryTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const lastPrimary = useRef<string>("/");
  useEffect(() => {
    if (PRIMARY_TABS.includes(location.pathname)) {
      lastPrimary.current = location.pathname;
      return;
    }
    // A system-back POP landing on a secondary route is rerouted to the
    // last-visited primary tab (replace, so history doesn't grow).
    // In-app PUSH/REPLACE navigations never trigger this.
    if (navigationType === "POP" && location.pathname !== lastPrimary.current) {
      navigate(lastPrimary.current, { replace: true });
    }
  }, [location.pathname, navigationType, navigate]);
  return null;
}

/**
 * M-Pesa speed-dial (Android only): the FAB opens 3 actions — Send
 * (Send Money / Pochi), Lipa (Paybill / Buy Goods), Withdraw (todo).
 * Each page collects number/amount and dials a prefilled stacked USSD code;
 * the PIN is always entered in the system phone dialog.
 */
function MpesaFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The speed-dial is redundant on its own destinations and noise on
  // Settings — hide it there so it never covers form actions.
  if (
    pathname === "/settings" ||
    pathname === "/send" ||
    pathname === "/lipa" ||
    pathname === "/withdraw"
  ) {
    return null;
  }
  const actions = [
    { to: "/send", label: "Send Money", icon: SendIcon },
    { to: "/lipa", label: "Lipa na M-PESA", icon: ShoppingCart },
    { to: "/withdraw", label: "Withdraw", icon: Banknote },
  ];
  return (
    <>
      <style>
        {`@keyframes fab-pop {
          from { opacity: 0; transform: translateY(14px) scale(0.5); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fab-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }`}
      </style>
      {open && (
        <button
          aria-label="Close M-Pesa menu"
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
          style={{ animation: "fab-fade 0.2s ease-out both" }}
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className="fixed right-4 z-30 flex flex-col items-end gap-2"
        style={{ bottom: "calc(8rem + env(safe-area-inset-bottom))" }}
      >
        {open &&
          actions.map(({ to, label, icon: Icon }, i) => (
            <div
              key={to}
              className="flex items-center gap-2"
              style={{
                animation: "fab-pop 0.25s ease-out both",
                animationDelay: `${(actions.length - 1 - i) * 60}ms`,
              }}
            >
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground shadow">
                {label}
              </span>
              <Button
                size="icon"
                aria-label={label}
                className="size-11 rounded-full shadow-lg"
                onClick={() => {
                  setOpen(false);
                  navigate(to);
                }}
              >
                <Icon className="size-5" />
              </Button>
            </div>
          ))}
        <Button
          size="icon"
          aria-label={open ? "Close M-Pesa" : "Transact with M-Pesa"}
          title="M-Pesa (*334#)"
          onClick={() => {
            // Read-only grant check (hasCallPermission never prompts):
            // opening the menu must not request CALL_PHONE, the same way
            // SMS import never asks for it. That prompt happens only at
            // dial time (WailsBridge.startUssdQuickEntry); SIM names have
            // their own tap-only opt-in in Settings.
            smsPermissions();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className="size-12 rounded-full shadow-lg"
        >
          {open ? <X className="size-5" /> : <Phone className="size-5" />}
        </Button>
      </div>
    </>
  );
}

/**
 * Data mode, meaningful on Android only: the analysis runs over either the
 * statement history or the SMS imports. Chosen in Settings; SMS imports
 * switch it automatically.
 */
type DataMode = "statements" | "sms";
const MODE_KEY = "mpesa-analyzer.mode";

function App() {
  // Android defaults to SMS mode — that is the source a phone actually
  // has — unless the user last picked Statements. Desktop is always
  // statements.
  const [mode, setModeState] = useState<DataMode>(() => {
    try {
      if (!isAndroidBridge()) return "statements";
      return localStorage.getItem(MODE_KEY) === "statements"
        ? "statements"
        : "sms";
    } catch {
      return "sms";
    }
  });
  const [statementTxs, setStatementTxs] = useState<parser.Transaction[]>([]);
  const [smsTxs, setSmsTxs] = useState<parser.Transaction[]>([]);
  const txs = mode === "sms" ? smsTxs : statementTxs;
  const [analysisResult, setAnalysisResult] =
    useState<analysis.AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Statement history. The active id is session-only: nothing auto-loads
  // on launch, the user picks a statement (or imports one) every session.
  const [statements, setStatements] = useState<store.StatementMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeStatement = statements.find((s) => s.id === activeId) ?? null;
  // SMS records are one-per-SIM: the switcher lists them and the active one
  // feeds SMS mode. Newest import first, same order as History.
  const smsMetas = statements.filter((s) => s.source === "sms");
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // SMS import is Android-only; the injected bridge is checked once after
  // mount so desktop rendering never touches window.wails.
  // Direct import, no modal: the header/SMS/Dashboard buttons call
  // startSmsImport, the bridge asks for SMS access itself when missing, and
  // the pages show skeletons until the merged dataset lands. Denials
  // surface as toasts — there is no dialog left to host them.
  const [smsImporting, setSmsImporting] = useState(false);
  const smsImportingRef = useRef(false);
  const [isAndroid, setIsAndroid] = useState(false);
  // M-Pesa speed-dial visibility. ON by default; Settings flips it off.
  const paymentsEnabled = usePaymentsEnabled();
  // Live grant state for READ_SMS / RECEIVE_SMS / CALL_PHONE. Refreshes on
  // foreground; every SMS path consults it before doing work.
  const { permissions: smsPerms, refresh: refreshSmsPerms } = useSmsPermissions();
  // Last SMS audit of this session, kept here so the SMS page survives
  // closing the import dialog and navigating around. Not persisted.
  const [smsResult, setSmsResult] = useState<SmsImportResult | null>(null);
  const [smsBridgeCount, setSmsBridgeCount] = useState<number | null>(null);
  // The SMS record currently feeding SMS mode. The ref mirrors it for the
  // long-lived interval/silent-refresh closures, which capture the initial
  // render and would otherwise always see a null active record.
  const [smsRecordId, setSmsRecordId] = useState<string | null>(null);
  const smsRecordIdRef = useRef<string | null>(null);
  smsRecordIdRef.current = smsRecordId;
  // Arrival receipt: the current fresh transaction, shown as a slip until
  // dismissed. Null means closed.
  const [receiptTx, setReceiptTx] = useState<parser.Transaction | null>(null);

  useEffect(() => {
    setIsAndroid(isAndroidBridge());
  }, []);

  useEffect(() => {
    ListStatements()
      .then((list) => {
        const metas = list ?? [];
        setStatements(metas);
        // Launching into SMS mode needs its dataset: the newest SMS import.
        const latestSms = metas.find((s) => s.source === "sms");
        if (
          latestSms &&
          isAndroidBridge() &&
          localStorage.getItem(MODE_KEY) !== "statements"
        ) {
          setSmsRecordId(latestSms.id);
          ActivateStatement(latestSms.id)
            .then((loaded) => setSmsTxs(loaded ?? []))
            .catch((e) => console.error("Loading SMS dataset failed:", e));
        }
      })
      .catch((e) => console.error("Loading statement history failed:", e));
  }, []);

  // Silent SMS refresh shared by launch, resume and the foreground
  // interval below. Queue-first: messages the catcher queued since the
  // last drain merge append-only (no inbox re-read). Only when the queue
  // is empty AND this install could have missed broadcasts (no seeded SMS
  // record yet, RECEIVE_SMS missing, or no full read in the last day) does
  // it fall back to a full inbox read. The receipt pops solely for
  // user-initiated spends.
  const SMS_SEEDED_KEY = "mpesa-analyzer.sms-seeded";
  const SMS_FULL_READ_KEY = "mpesa-analyzer.sms-full-read";
  const lastSilentRefresh = useRef(0);
  // Merge one batch of messages; resolves true when anything new landed.
  // Shared by the silent paths and the pull-to-refresh gesture.
  function mergeSmsBatch(
    messages: SmsBridgeMessage[],
    bridgeCount: number,
    announce: boolean,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      RefreshSmsImport(stampSmsMessages(messages))
        .then((refresh) => {
          const sims = refresh?.sims ?? [];
          const hasNew = sims.some((s) => s.newCount > 0);
          if (!refresh || !hasNew) {
            resolve(false);
            return;
          }
          applySmsRefresh(refresh, bridgeCount, announce);
          resolve(true);
        })
        .catch((e) => {
          console.error("Auto SMS import failed:", e);
          resolve(false);
        });
    });
  }
  // Explicit refresh (pull-to-refresh): merge whatever the catcher has
  // queued, bypassing the silent throttle. Draining the queue needs no
  // permission, so RECEIVE_SMS alone is enough. Resolves when settled.
  function refreshSmsNow(): Promise<boolean> {
    if (!isAndroidBridge()) return Promise.resolve(false);
    const perms = smsPermissions();
    if (!perms.read && !perms.receive) return Promise.resolve(false);
    return mergeSmsBatch(drainPendingSms(), 0, true);
  }

  // Foreground entry for the native side (see WailsBridge.onResume): the
  // one path that does not depend on DOM visibility signals. The ref
  // indirection keeps the global stable while always calling fresh code.
  const foregroundHandler = useRef(() => {});
  foregroundHandler.current = () => {
    refreshSmsPerms();
    void refreshSmsNow();
  };
  useEffect(() => {
    window.__mpesaOnForeground = () => foregroundHandler.current();
    return () => {
      delete window.__mpesaOnForeground;
    };
  }, []);
  function refreshSmsSilently(announce: boolean) {
    if (!isAndroidBridge()) return;
    // Either permission can yield data: RECEIVE_SMS feeds the catcher queue,
    // READ_SMS covers the full-inbox fallback below.
    const perms = smsPermissions();
    if (!perms.read && !perms.receive) return;
    const now = Date.now();
    // Mount and an immediate resume event would otherwise double-fire.
    if (now - lastSilentRefresh.current < 15000) return;
    lastSilentRefresh.current = now;
    const queued = drainPendingSms();
    if (queued.length > 0) {
      void mergeSmsBatch(queued, queued.length, announce);
      return;
    }
    // Everything below re-reads the whole inbox, which needs READ_SMS.
    if (!perms.read) return;
    let seeded = false;
    let lastFullRead = 0;
    try {
      seeded = localStorage.getItem(SMS_SEEDED_KEY) === "1";
      lastFullRead = Number(localStorage.getItem(SMS_FULL_READ_KEY) ?? 0);
    } catch {
      /* ignore */
    }
    // Self-heal: broadcasts missed while the catcher was off (stale
    // install, revoked permission) surface on the next full read, at most
    // once a day.
    if (seeded && perms.receive && now - lastFullRead < 86400000) {
      return;
    }
    try {
      localStorage.setItem(SMS_FULL_READ_KEY, String(now));
    } catch {
      /* ignore */
    }
    Events.Once("common:sms", (ev) => {
      const data = ev.data as SmsBridgeResult;
      if (!data?.ok) return;
      void mergeSmsBatch(stampSmsMessages(data.messages ?? []), data.count ?? 0, announce);
    });
    requestSmsImport();
  }

  // Launch-time refresh. Without permission the app stays put; the manual
  // import buttons remain the only entry.
  useEffect(() => {
    refreshSmsSilently(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foreground-resume refresh: coming back from a USSD session (or
  // anything else) drains the catcher queue so fresh confirmations merge
  // and receipt-worthy spends pop their slip.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshSmsSilently(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () =>
      document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime engine: drain the catcher queue every few seconds whether
  // or not the page considers itself visible — visibility signals are
  // unreliable in this WebView, and the drain is a local prefs read that
  // merges only when something actually queued.
  useEffect(() => {
    const tick = () => {
      if (!isAndroidBridge()) return;
      const perms = smsPermissions();
      if (!perms.read && !perms.receive) return;
      const queued = drainPendingSms();
      if (queued.length === 0) return;
      void mergeSmsBatch(queued, queued.length, true);
    };
    tick();
    const timer = window.setInterval(tick, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run analysis once per statement and keep the result in App state so
  // navigating away and back does not remount/remount the Dashboard.
  useEffect(() => {
    if (txs.length === 0) {
      setAnalysisResult(null);
      return;
    }
    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    AnalyzeTransactions(txs)
      .then((r) => {
        if (!cancelled) setAnalysisResult(r);
      })
      .catch((e) => {
        if (!cancelled) setAnalysisError(String(e));
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [txs]);

  function metaOf(record: store.StatementRecord): store.StatementMeta {
    return {
      id: record.id,
      name: record.name,
      source: record.source,
      simId: record.simId,
      simLabel: record.simLabel,
      dateRange: record.dateRange,
      txCount: record.txCount,
      importedAt: record.importedAt,
    };
  }

  function addMeta(record: store.StatementRecord) {
    setStatements((prev) => [metaOf(record), ...prev]);
  }

  // The refresh merges into the latest SMS record in place, so unlike a
  // statement import this upserts: no duplicate History rows, no jumping.
  function upsertMeta(record: store.StatementRecord) {
    const meta = metaOf(record);
    setStatements((prev) => {
      const i = prev.findIndex((s) => s.id === record.id);
      if (i === -1) return [meta, ...prev];
      const next = prev.slice();
      next[i] = meta;
      return next;
    });
  }

  // The current device offset renders received times in the phone's own
  // timezone (JS Date.getTimezoneOffset convention: Nairobi is -180). SIM
  // metadata rides along so Go can keep one record per wallet.
  function stampSmsMessages(messages: SmsBridgeMessage[]) {
    return messages.map((m) => ({
      id: m.id,
      address: m.address,
      dateMs: m.dateMs,
      body: m.body,
      subId: m.subId,
      slot: m.slot,
      simLabel: m.simLabel,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    }));
  }

  // Apply a refresh across every SIM it touched: upsert each SIM's record
  // meta, then focus a wallet. A receipt-worthy spend wins focus (and pops
  // its slip when announce is set); otherwise stay on the wallet the user is
  // viewing, falling back to whichever SIM gained data.
  function applySmsRefresh(
    refresh: SmsRefreshResult,
    count: number,
    announce: boolean,
  ) {
    setSmsResult(refresh.result);
    setSmsBridgeCount(count);
    const sims = refresh.sims ?? [];
    for (const sim of sims) {
      if (sim.record) upsertMeta(sim.record);
    }
    if (sims.length === 0) return;

    const currentId = smsRecordIdRef.current;
    const receiptSim = announce
      ? sims.find((s) => s.receipt && (s.newTxns?.length ?? 0) > 0)
      : undefined;
    const focus =
      receiptSim ??
      sims.find((s) => s.record?.id === currentId) ??
      sims.find((s) => s.newCount > 0) ??
      sims[0];
    if (focus?.record) {
      setSmsRecordId(focus.record.id);
      setSmsTxs(focus.record.txs ?? []);
    }
    if (receiptSim) {
      const fresh = receiptSim.newTxns ?? [];
      const newest = fresh[fresh.length - 1];
      if (newest) setReceiptTx(newest);
    }
    // An SMS record exists on this install: future refreshes can trust the
    // catcher queue instead of re-reading the whole inbox.
    try {
      localStorage.setItem(SMS_SEEDED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // Debug-only: pop the receipt for the newest loaded SMS transaction,
  // so the arrival UX is testable without moving real money.
  function testArrivalAnnouncement() {
    const newest = smsTxs[smsTxs.length - 1];
    if (!newest) {
      toast.info("No SMS transactions loaded to preview.");
      return;
    }
    setReceiptTx(newest);
  }

  // Manual import from a button: the bridge reads the inbox (asking for
  // SMS access itself when missing), Go merges it into each SIM's record,
  // and this applies it and moves into SMS mode. No modal: pages render
  // skeletons while smsImporting is set.
  function startSmsImport() {
    if (!isAndroidBridge() || smsImportingRef.current) return;
    smsImportingRef.current = true;
    setSmsImporting(true);
    Events.Once("common:sms", (ev) => {
      handleBridgeSms(ev.data as SmsBridgeResult);
    });
    requestSmsImport();
  }

  function handleBridgeSms(data: SmsBridgeResult) {
    if (!data?.ok) {
      smsImportingRef.current = false;
      setSmsImporting(false);
      const err = data?.error ?? "Unknown error";
      if (err.includes("permanently denied")) {
        toast.error(
          "SMS access is permanently denied. Re-enable it in Android Settings → Apps → Tripwire → Permissions → SMS, then import again.",
        );
      } else if (err.includes("permission denied")) {
        toast.error("SMS access was denied. Allow it and import again.");
      } else {
        toast.error(`Import failed: ${err}`);
      }
      return;
    }
    RefreshSmsImport(stampSmsMessages(data.messages ?? []))
      .then((res) => {
        smsImportingRef.current = false;
        setSmsImporting(false);
        if (!res) {
          toast.error("Import failed: empty response from the importer.");
          return;
        }
        handleSmsRefresh(res, data.count ?? 0);
      })
      .catch((e) => {
        smsImportingRef.current = false;
        setSmsImporting(false);
        toast.error(`Import failed: ${String(e)}`);
      });
  }

  // Manual import from the dialog: the refresh already merged the inbox
  // into each SIM's record, so this applies it and moves into SMS mode.
  function handleSmsRefresh(
    refresh: SmsRefreshResult,
    count: number,
  ) {
    // Grant state may have just changed behind the permission dialog.
    refreshSmsPerms();
    const sims = refresh.sims ?? [];
    if (sims.length === 0) {
      setSmsResult(refresh.result);
      setSmsBridgeCount(count);
      toast.info(
        count > 0
          ? "No M-Pesa transactions were recognized in the inbox."
          : "No M-Pesa messages found in the inbox.",
      );
      return;
    }
    applySmsRefresh(refresh, count, false);
    setModeState("sms");
    try {
      localStorage.setItem(MODE_KEY, "sms");
    } catch {
      /* private mode: mode stays session-only */
    }
    const totalNew = sims.reduce((n, s) => n + (s.newCount ?? 0), 0);
    if (totalNew > 0) {
      toast.success(
        `Imported ${totalNew.toLocaleString()} new SMS transaction${totalNew === 1 ? "" : "s"}`,
      );
    } else {
      toast.info("SMS already up to date.");
    }
  }

  // Switch SMS mode to another SIM's wallet.
  function handleSwitchSim(meta: store.StatementMeta) {
    if (meta.id === smsRecordId) return;
    setSmsRecordId(meta.id);
    ActivateStatement(meta.id)
      .then((loaded) => setSmsTxs(loaded ?? []))
      .catch((e) => console.error("Loading SMS dataset failed:", e));
  }

  // Carrier-name upgrade, run when Settings opens: resolve the phone's
  // current SIM list and heal wallets imported without phone-state
  // access — renaming fallbacks and moving subscription-keyed records
  // onto their slot key. Read-only unless access is already granted:
  // the only prompts are the import-time batch and the Settings opt-in.
  const SIM_NUMBERS_KEY = "mpesa-analyzer.sim-numbers";
  const [simNumbers, setSimNumbers] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(SIM_NUMBERS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(
          parsed as Record<string, unknown>,
        )) {
          if (typeof v === "string" && v) out[k] = v;
        }
        return out;
      }
    } catch {
      /* private mode: numbers stay session-only */
    }
    return {};
  });

  // Numbers ride under both keys (slot and subscription id) so a wallet
  // shows its number however it was keyed when imported.
  function rememberSimNumbers(
    cards: { subId: number; slot: number; number: string }[],
  ) {
    const next: Record<string, string> = {};
    for (const c of cards) {
      const num = c.number.trim();
      if (!num) continue;
      if (c.slot >= 0) next[`sim-${c.slot}`] = num;
      if (c.subId >= 0) next[`sub-${c.subId}`] = num;
    }
    if (Object.keys(next).length === 0) return;
    setSimNumbers((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(SIM_NUMBERS_KEY, JSON.stringify(merged));
      } catch {
        /* private mode: numbers stay session-only */
      }
      return merged;
    });
  }

  function refreshSimNames() {
    if (!isAndroidBridge() || !hasPhoneStatePermission()) return;
    const cards = requestSimCards();
    rememberSimNumbers(cards);
    const named = cards.filter((c) => c.simLabel.trim() !== "");
    if (named.length === 0) return;
    RefreshSimLabels(named)
      .then((n) => {
        if (n > 0) {
          ListStatements()
            .then((list) => setStatements(list ?? []))
            .catch((e) => console.error("Reloading statements failed:", e));
        }
      })
      .catch((e) => console.error("Refreshing SIM names failed:", e));
  }

  // Settings opt-in for installs that denied the phone-state half of the
  // import prompt: ask once on tap, then resolve names when granted.
  function requestSimNamesGrant() {
    if (!isAndroidBridge()) return;
    Events.Once("common:simstate", (ev) => {
      const data = ev.data as { granted?: boolean };
      if (data?.granted) {
        refreshSmsPerms();
        refreshSimNames();
      }
    });
    requestPhoneStatePermission();
  }

  // Mode switch from Settings. Each mode lazily loads its own dataset so
  // switching is instant and works after a restart.
  function setMode(next: DataMode) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode: mode stays session-only */
    }
    if (next === "sms" && smsTxs.length === 0 && smsRecordId === null) {
      const latestSms = statements.find((s) => s.source === "sms");
      if (latestSms) {
        setSmsRecordId(latestSms.id);
        ActivateStatement(latestSms.id)
          .then((loaded) => setSmsTxs(loaded ?? []))
          .catch((e) => console.error("Loading SMS dataset failed:", e));
      }
    }
    if (next === "statements" && statementTxs.length === 0 && activeId) {
      ActivateStatement(activeId)
        .then((loaded) => setStatementTxs(loaded ?? []))
        .catch((e) => console.error("Loading statement failed:", e));
    }
  }

  function handleImported(record: store.StatementRecord) {
    addMeta(record);
    setActiveId(record.id);
    setStatementTxs(record.txs ?? []);
    // Importing a statement is an explicit move back to statements mode.
    if (mode !== "statements") setMode("statements");
  }

  function handleActivate(id: string) {
    ActivateStatement(id)
      .then((loaded) => {
        setActiveId(id);
        setStatementTxs(loaded ?? []);
      })
      .catch((e) => console.error("Activating statement failed:", e));
  }

  function handleDelete(id: string) {
    DeleteStatement(id)
      .then(() => {
        setStatements((prev) => prev.filter((s) => s.id !== id));
        if (id === activeId) {
          // Deleting the active statement drops to the empty state; no
          // auto-promotion of another statement.
          setActiveId(null);
          setStatementTxs([]);
        }
        if (id === smsRecordId) {
          setSmsRecordId(null);
          setSmsTxs([]);
        }
      })
      .catch((e) => console.error("Deleting statement failed:", e));
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <HashRouter>
        <ScrollToTop />
        <BackToPrimaryTabs />
        <SidebarProvider>
          {/* Phones navigate from the bottom bar; the sidebar is desktop-only. */}
          <div className="hidden md:contents">
            <AppSidebar />
          </div>
          <Toaster position="bottom-right" richColors />
          {/* overflow-x-clip (not hidden): hidden would make this a
              scroll container and silently disable the sticky header. */}
          <SidebarInset className="min-w-0 overflow-x-clip">
            <header className="sticky top-0 z-40 border-b bg-background">
              {/* Notch/status-bar spacer, part of the sticky header so the
                  header's total height is exactly
                  calc(3.5rem + env(safe-area-inset-top)) — the dashboard
                  filter bar pins to that same offset with no gap. */}
              <div style={{ height: "env(safe-area-inset-top)" }} />
              <div className="flex min-h-14 items-center justify-between gap-2 px-4 py-2">
              {/* The sidebar trigger is meaningless on phones — the sidebar
                 does not render there; the app name takes its place. */}
              <SidebarTrigger className="hidden md:inline-flex" />
              <span className="text-base font-bold tracking-tight md:hidden">
                Tripwire
              </span>

              <div className="flex items-center gap-2">
                {statements.length > 0 && mode === "statements" && (
                  <HistorySheet
                    statements={statements}
                    activeId={activeId}
                    open={historyOpen}
                    onOpenChange={setHistoryOpen}
                    onActivate={handleActivate}
                    onDelete={handleDelete}
                    onImport={() => setImportOpen(true)}
                  />
                )}
                {/* The header import matches the data mode: statements on
                   desktop and in statements mode, M-Pesa SMS in SMS mode.
                   A second SIM adds a wallet switcher beside it. */}
                {isAndroid && mode === "sms" && (
                  <SimSwitcher
                    sims={smsMetas}
                    activeId={smsRecordId}
                    numbers={simNumbers}
                    onSwitch={handleSwitchSim}
                  />
                )}
                {isAndroid && mode === "sms" ? (
                  <Button
                    size="sm"
                    onClick={startSmsImport}
                    disabled={smsImporting}
                  >
                    <MessageSquareText />
                    <span className="hidden sm:inline">
                      {smsImporting ? "Reading…" : "Import SMS"}
                    </span>
                    <span className="sm:hidden">SMS</span>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setImportOpen(true)}>
                    <FileUp />
                    <span className="hidden sm:inline">Import Statement</span>
                    <span className="sm:hidden">Import</span>
                  </Button>
                )}
                {/* Desktop gets Settings from the sidebar; phones get it
                   here since the bottom bar holds the primary destinations. */}
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Settings"
                >
                  <Link to="/settings">
                    <SettingsIcon className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
            </header>
            <main className="min-w-0 flex-1 space-y-4 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
              <Routes>
                <Route
                  path="/"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Dashboard
                        transactions={txs}
                        result={analysisResult}
                        loading={analysisLoading}
                        error={analysisError}
                        activeStatement={
                          mode === "statements" ? activeStatement : null
                        }
                        historyCount={statements.length}
                        smsMode={mode === "sms"}
                        onImport={() => setImportOpen(true)}
                        onImportSms={startSmsImport}
                        importing={smsImporting}
                        onBrowseHistory={() => setHistoryOpen(true)}
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/transactions"
                  element={
                    <Transactions
                      transactions={txs}
                      onRefresh={() => refreshSmsNow()}
                    />
                  }
                />
                <Route
                  path="/sms"
                  element={
                    <Sms
                      result={smsResult}
                      bridgeCount={smsBridgeCount}
                      isAndroid={isAndroid}
                      importing={smsImporting}
                      onImport={startSmsImport}
                    />
                  }
                />
                <Route
                  path="/insights"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Insights
                        transactions={txs}
                        result={analysisResult}
                        loading={analysisLoading}
                        error={analysisError}
                        activeStatement={
                          mode === "statements" ? activeStatement : null
                        }
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/send"
                  element={<Send />}
                />
                <Route
                  path="/lipa"
                  element={<Lipa />}
                />
                <Route
                  path="/withdraw"
                  element={<Withdraw />}
                />
                <Route
                  path="/settings"
                  element={
                    <Settings
                      mode={mode}
                      onModeChange={setMode}
                      isAndroid={isAndroid}
                      smsPermissions={smsPerms}
                      statements={statements}
                      statementTxCount={statementTxs.length}
                      smsTxCount={smsTxs.length}
                      activeSmsId={smsRecordId}
                      onSwitchSim={handleSwitchSim}
                      numbers={simNumbers}
                      onRefreshSimNames={refreshSimNames}
                      onRequestSimNames={requestSimNamesGrant}
                      onTestArrival={testArrivalAnnouncement}
                    />
                  }
                />
              </Routes>
            </main>
            <MobileNav />
            {/* M-Pesa speed-dial (Android only): opens Send / Lipa / Withdraw
                pages. Each page dials a prefilled stacked USSD code while the
                always-on catcher queues the confirmation in real time. The
                user pays in the system phone UI; spends pop their receipt on
                merge. */}
            {isAndroid && paymentsEnabled && <MpesaFab />}
          </SidebarInset>
        </SidebarProvider>

        <ImportStatementDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={handleImported}
        />
        <TransactionReceiptDialog
          tx={receiptTx}
          onClose={() => setReceiptTx(null)}
          onViewAll={() => {
            window.location.hash = "#/transactions";
          }}
        />
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
