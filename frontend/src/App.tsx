import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { ImportSmsDialog } from "@/components/import-sms-dialog";
import { TransactionReceiptDialog } from "@/components/transaction-receipt-dialog";
import { HistorySheet } from "@/components/history-sheet";
import { ScrollToTop } from "@/components/scroll-to-top";
import {
  FileUp,
  MessageSquareText,
  Phone,
  Settings as SettingsIcon,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
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
} from "../bindings/mpesa-analyzer/parseservice";
import {
  hasSmsPermission,
  hasSmsReceivePermission,
  drainPendingSms,
  isAndroidBridge,
  requestSmsImport,
  startUssdSession,
  type SmsBridgeMessage,
  type SmsBridgeResult,
} from "@/lib/sms-bridge";
import { MobileNav } from "@/components/mobile-nav";
import type {
  SmsImportResult,
  SmsRefreshResult,
} from "../bindings/mpesa-analyzer/models";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import Sms from "@/pages/Sms";
import Dashboard from "@/pages/Dashboard";
import Insights from "@/pages/Insights";

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
      Loading dashboard…
    </div>
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
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // SMS import is Android-only; the injected bridge is checked once after
  // mount so desktop rendering never touches window.wails.
  const [smsOpen, setSmsOpen] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  // Last SMS audit of this session, kept here so the SMS page survives
  // closing the import dialog and navigating around. Not persisted.
  const [smsResult, setSmsResult] = useState<SmsImportResult | null>(null);
  const [smsBridgeCount, setSmsBridgeCount] = useState<number | null>(null);
  // The SMS record currently feeding SMS mode.
  const [smsRecordId, setSmsRecordId] = useState<string | null>(null);
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
          if (!refresh?.record || refresh.newCount <= 0) {
            resolve(false);
            return;
          }
          applySmsRecord(refresh.record, refresh.result, bridgeCount);
          if (announce && refresh.receipt) {
            const fresh = refresh.newTxns ?? [];
            const newest = fresh[fresh.length - 1];
            if (newest) setReceiptTx(newest);
          }
          resolve(true);
        })
        .catch((e) => {
          console.error("Auto SMS import failed:", e);
          resolve(false);
        });
    });
  }
  // Explicit refresh (pull-to-refresh): merge whatever the catcher has
  // queued, bypassing the silent throttle. Resolves when settled.
  function refreshSmsNow(): Promise<boolean> {
    if (!isAndroidBridge() || !hasSmsPermission()) return Promise.resolve(false);
    return mergeSmsBatch(drainPendingSms(), 0, true);
  }

  // Foreground entry for the native side (see WailsBridge.onResume): the
  // one path that does not depend on DOM visibility signals. The ref
  // indirection keeps the global stable while always calling fresh code.
  const foregroundHandler = useRef(() => {});
  foregroundHandler.current = () => {
    void refreshSmsNow();
  };
  useEffect(() => {
    window.__mpesaOnForeground = () => foregroundHandler.current();
    return () => {
      delete window.__mpesaOnForeground;
    };
  }, []);
  function refreshSmsSilently(announce: boolean) {
    if (!isAndroidBridge() || !hasSmsPermission()) return;
    const now = Date.now();
    // Mount and an immediate resume event would otherwise double-fire.
    if (now - lastSilentRefresh.current < 15000) return;
    lastSilentRefresh.current = now;
    const queued = drainPendingSms();
    if (queued.length > 0) {
      void mergeSmsBatch(queued, queued.length, announce);
      return;
    }
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
    if (seeded && hasSmsReceivePermission() && now - lastFullRead < 86400000) {
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
      if (!isAndroidBridge() || !hasSmsPermission()) return;
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
  // timezone (JS Date.getTimezoneOffset convention: Nairobi is -180).
  function stampSmsMessages(messages: SmsBridgeMessage[]) {
    return messages.map((m) => ({
      id: m.id,
      address: m.address,
      dateMs: m.dateMs,
      body: m.body,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    }));
  }

  function applySmsRecord(
    record: store.StatementRecord,
    result: SmsImportResult,
    count: number,
  ) {
    setSmsResult(result);
    setSmsBridgeCount(count);
    upsertMeta(record);
    setSmsRecordId(record.id);
    setSmsTxs(record.txs ?? []);
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

  // Manual import from the dialog: the refresh already merged the inbox
  // into the SMS record, so this applies it and moves into SMS mode.
  function handleSmsRefresh(
    refresh: SmsRefreshResult,
    count: number,
  ) {
    if (!refresh.record) {
      setSmsResult(refresh.result);
      setSmsBridgeCount(count);
      toast.info(
        count > 0
          ? "No M-Pesa transactions were recognized in the inbox."
          : "No M-Pesa messages found in the inbox.",
      );
      return;
    }
    applySmsRecord(refresh.record, refresh.result, count);
    setModeState("sms");
    try {
      localStorage.setItem(MODE_KEY, "sms");
    } catch {
      /* private mode: mode stays session-only */
    }
    if (refresh.newCount > 0) {
      toast.success(
        `Imported ${refresh.newCount.toLocaleString()} new SMS transaction${refresh.newCount === 1 ? "" : "s"}`,
      );
    } else {
      toast.info("SMS already up to date.");
    }
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
                Mpesa Analyzer
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
                   desktop and in statements mode, M-Pesa SMS in SMS mode. */}
                {isAndroid && mode === "sms" ? (
                  <Button size="sm" onClick={() => setSmsOpen(true)}>
                    <MessageSquareText />
                    <span className="hidden sm:inline">Import SMS</span>
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
                      onImport={() => setSmsOpen(true)}
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
                  path="/settings"
                  element={
                    <Settings
                      mode={mode}
                      onModeChange={setMode}
                      isAndroid={isAndroid}
                      statements={statements}
                      statementTxCount={statementTxs.length}
                      smsTxCount={smsTxs.length}
                      onTestArrival={testArrivalAnnouncement}
                    />
                  }
                />
              </Routes>
            </main>
            <MobileNav />
            {/* M-Pesa transact shortcut (Android only): starts a payment
                session — places the *334# USSD call (calling + SMS-receive
                asked together up front) while the always-on catcher queues
                the confirmation in real time. The user pays in the system
                phone UI; spends pop their receipt on merge. */}
            {isAndroid && (
              <Button
                size="icon"
                aria-label="Transact with M-Pesa"
                title="M-Pesa (*334#)"
                onClick={() => {
                  Events.Once("common:ussd", (ev) => {
                    const data = ev.data as {
                      ok: boolean;
                      listening?: boolean;
                      error?: string;
                    };
                    if (!data?.ok) {
                      toast.error(
                        data?.error === "call permission denied"
                          ? "Calling permission was denied."
                          : "Could not start the M-Pesa session.",
                      );
                      return;
                    }
                    if (data.listening) {
                      toast.info("Waiting for M-Pesa confirmation…");
                    }
                  });
                  startUssdSession("*334#");
                }}
                className="fixed right-4 z-30 size-12 rounded-full shadow-lg"
                style={{
                  bottom: "calc(8rem + env(safe-area-inset-bottom))",
                }}
              >
                <Phone className="size-5" />
              </Button>
            )}
          </SidebarInset>
        </SidebarProvider>

        <ImportStatementDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={handleImported}
        />
        <ImportSmsDialog
          open={smsOpen}
          onOpenChange={setSmsOpen}
          onResult={handleSmsRefresh}
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
