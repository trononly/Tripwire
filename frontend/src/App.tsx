import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { TransactionReceiptDialog } from "@/components/transaction-receipt-dialog";
import { ScrollToTop } from "@/components/scroll-to-top";
import { BackToPrimaryTabs, PageFallback } from "@/components/router-helpers";
import { AppHeader } from "@/components/app-header";
import { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

import type * as analysis from "../bindings/mpesa-analyzer/internal/analysis/models";
import type * as store from "../bindings/mpesa-analyzer/internal/store/models";
import { AnalyzeTransactions } from "../bindings/mpesa-analyzer/parseservice";
import { useSmsPermissions } from "@/hooks/use-sms-permissions";
import { useUpdater } from "@/hooks/use-updater";
import { UpdateDialog } from "@/components/update-dialog";
import { RestrictedSettingsGuide } from "@/components/restricted-settings-guide";
import { MobileNav } from "@/components/mobile-nav";
import { useStatements } from "@/hooks/use-statements";
import { useSmsEngine } from "@/hooks/use-sms-engine";
import { useSimNames } from "@/hooks/use-sim-names";
import { loadInitialMode, saveMode, type DataMode } from "@/lib/data-mode";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import Sms from "@/pages/Sms";
import Dashboard from "@/pages/Dashboard";
import Insights from "@/pages/Insights";
import Send from "@/pages/Send";
import Lipa from "@/pages/Lipa";
import Withdraw from "@/pages/Withdraw";

function App() {
  const [mode, setModeState] = useState<DataMode>(loadInitialMode);
  const stmts = useStatements();
  // Live grant state for READ_SMS / RECEIVE_SMS / CALL_PHONE. Refreshes on
  // foreground; every SMS path consults it before doing work.
  const { permissions: smsPerms, refresh: refreshSmsPerms } = useSmsPermissions();
  const sms = useSmsEngine({
    statements: stmts.statements,
    upsertMeta: stmts.upsertMeta,
    refreshPerms: refreshSmsPerms,
    enterSmsMode: () => setMode("sms"),
  });
  const sims = useSimNames({
    setStatements: stmts.setStatements,
    refreshPerms: refreshSmsPerms,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // In-app updates (Android only): auto-checks the GitHub Releases page and
  // prompts with the release notes when a newer Tripwire-x.y.z build exists.
  const updater = useUpdater();

  const txs = mode === "sms" ? sms.smsTxs : stmts.statementTxs;
  const [analysisResult, setAnalysisResult] =
    useState<analysis.AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // SMS records are one-per-SIM: the switcher lists them and the active one
  // feeds SMS mode. Newest import first, same order as History.
  const smsMetas = stmts.statements.filter((s) => s.source === "sms");

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

  // Mode switch from Settings. Each mode lazily loads its own dataset so
  // switching is instant and works after a restart.
  function setMode(next: DataMode) {
    setModeState(next);
    saveMode(next);
    if (next === "sms" && sms.smsTxs.length === 0 && sms.smsRecordId === null) {
      const latestSms = stmts.statements.find((s) => s.source === "sms");
      if (latestSms) sms.loadSmsRecord(latestSms.id);
    }
    if (next === "statements" && stmts.statementTxs.length === 0 && stmts.activeId) {
      stmts.loadStatement(stmts.activeId);
    }
  }

  function handleImported(record: store.StatementRecord) {
    stmts.importRecord(record);
    // Importing a statement is an explicit move back to statements mode.
    if (mode !== "statements") setMode("statements");
  }

  function handleDelete(id: string) {
    void stmts
      .removeRecord(id)
      .then(() => sms.clearSmsRecord(id));
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
            <AppHeader
              statements={stmts.statements}
              mode={mode}
              isAndroid={sms.isAndroid}
              smsMetas={smsMetas}
              smsRecordId={sms.smsRecordId}
              simNumbers={sims.simNumbers}
              smsImporting={sms.smsImporting}
              historyOpen={historyOpen}
              activeId={stmts.activeId}
              setHistoryOpen={setHistoryOpen}
              setImportOpen={setImportOpen}
              onActivate={stmts.handleActivate}
              onDelete={handleDelete}
              onSwitchSim={sms.handleSwitchSim}
              onImportSms={sms.startSmsImport}
            />
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
                          mode === "statements" ? stmts.activeStatement : null
                        }
                        historyCount={stmts.statements.length}
                        smsMode={mode === "sms"}
                        onImport={() => setImportOpen(true)}
                        onImportSms={sms.startSmsImport}
                        importing={sms.smsImporting}
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
                      onRefresh={() => sms.refreshSmsNow()}
                    />
                  }
                />
                <Route
                  path="/sms"
                  element={
                    <Sms
                      result={sms.smsResult}
                      bridgeCount={sms.smsBridgeCount}
                      isAndroid={sms.isAndroid}
                      importing={sms.smsImporting}
                      onImport={sms.startSmsImport}
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
                          mode === "statements" ? stmts.activeStatement : null
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
                      isAndroid={sms.isAndroid}
                      smsPermissions={smsPerms}
                      statements={stmts.statements}
                      statementTxCount={stmts.statementTxs.length}
                      smsTxCount={sms.smsTxs.length}
                      activeSmsId={sms.smsRecordId}
                      onSwitchSim={sms.handleSwitchSim}
                      numbers={sims.simNumbers}
                      onRefreshSimNames={sims.refreshSimNames}
                      onRequestSimNames={sims.requestSimNamesGrant}
                      onTestArrival={sms.testArrivalAnnouncement}
                      updater={updater}
                    />
                  }
                />
              </Routes>
            </main>
            <MobileNav />          </SidebarInset>
        </SidebarProvider>

        <ImportStatementDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={handleImported}
        />
        <TransactionReceiptDialog
          tx={sms.receiptTx}
          onClose={() => sms.setReceiptTx(null)}
          onViewAll={() => {
            window.location.hash = "#/transactions";
          }}
        />
        <UpdateDialog updater={updater} />
        <RestrictedSettingsGuide
          open={sms.guideOpen}
          onOpenChange={sms.setGuideOpen}
          onRetry={sms.startSmsImport}
        />
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
