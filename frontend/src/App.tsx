import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { ImportSmsDialog } from "@/components/import-sms-dialog";
import { HistorySheet } from "@/components/history-sheet";
import { ScrollToTop } from "@/components/scroll-to-top";
import { ChevronDown, FileUp, MessageSquareText } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

import type * as parser from "../bindings/mpesa-analyzer/internal/parser/models";
import type * as analysis from "../bindings/mpesa-analyzer/internal/analysis/models";
import type * as store from "../bindings/mpesa-analyzer/internal/store/models";
import {
  ActivateStatement,
  AnalyzeTransactions,
  DeleteStatement,
  ListStatements,
} from "../bindings/mpesa-analyzer/parseservice";
import { isAndroidBridge } from "@/lib/sms-bridge";
import { cn } from "@/lib/utils";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import Insights from "./pages/Insights";
import Dashboard from "@/pages/Dashboard";

/**
 * Import mode menu. Deliberately not a Radix DropdownMenu: its pointer-
 * capture/dismissal logic does not fire reliably inside the Android
 * WebView (dialogs do). This is plain state + a backdrop — a tap always
 * works, on desktop and phone alike.
 */
function ImportMenu({
  isAndroid,
  onStatement,
  onSms,
}: {
  isAndroid: boolean;
  onStatement: () => void;
  onSms: () => void;
}) {
  const [open, setOpen] = useState(false);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <FileUp />
        Import
        <ChevronDown
          className={cn("opacity-70 transition-transform", open && "rotate-180")}
        />
      </Button>
      {open && (
        <>
          {/* Tapping anywhere else closes the menu. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-sm hover:bg-muted active:bg-muted"
              onClick={() => choose(onStatement)}
            >
              <FileUp />
              Import statement (PDF)
            </button>
            {isAndroid && (
              <button
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-sm hover:bg-muted active:bg-muted"
                onClick={() => choose(onSms)}
              >
                <MessageSquareText />
                Import SMS
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
      Loading dashboard…
    </div>
  );
}

function App() {
  const [txs, setTxs] = useState<parser.Transaction[]>([]);
  const [analysisResult, setAnalysisResult] =
    useState<analysis.AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Statement history. The active id is session-only: nothing auto-loads
  // on launch, the user picks a statement (or imports one) every session.
  const [statements, setStatements] = useState<store.StatementMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // SMS import is Android-only; the injected bridge is checked once after
  // mount so desktop rendering never touches window.wails.
  const [smsOpen, setSmsOpen] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(isAndroidBridge());
  }, []);

  useEffect(() => {
    ListStatements()
      .then((list) => setStatements(list ?? []))
      .catch((e) => console.error("Loading statement history failed:", e));
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

  function handleImported(record: store.StatementRecord) {
    const meta: store.StatementMeta = {
      id: record.id,
      name: record.name,
      dateRange: record.dateRange,
      txCount: record.txCount,
      importedAt: record.importedAt,
    };
    setStatements((prev) => [meta, ...prev]);
    setActiveId(record.id);
    setTxs(record.txs ?? []);
  }

  function handleActivate(id: string) {
    ActivateStatement(id)
      .then((loaded) => {
        setActiveId(id);
        setTxs(loaded ?? []);
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
          setTxs([]);
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
          <AppSidebar />
          <Toaster position="bottom-right" richColors />
          <SidebarInset className="min-w-0 overflow-x-hidden">
            <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
              <SidebarTrigger />

              <div className="flex items-center gap-2">
                {statements.length > 0 && (
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
                <ImportMenu
                  isAndroid={isAndroid}
                  onStatement={() => setImportOpen(true)}
                  onSms={() => setSmsOpen(true)}
                />
              </div>
            </header>
            <main className="min-w-0 flex-1 space-y-4 p-6">
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
                        historyCount={statements.length}
                        onImport={() => setImportOpen(true)}
                        onBrowseHistory={() => setHistoryOpen(true)}
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/transactions"
                  element={<Transactions transactions={txs} />}
                />
                <Route path="/settings" element={<Settings />} />
                <Route path="/insights" element={<Insights result={analysisResult} />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>

        <ImportStatementDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={handleImported}
        />
        <ImportSmsDialog open={smsOpen} onOpenChange={setSmsOpen} />
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
