import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

import type * as parser from "../bindings/mpesa-analyzer/internal/parser/models";
import type * as analysis from "../bindings/mpesa-analyzer/internal/analysis/models";
import { AnalyzeTransactions } from "../bindings/mpesa-analyzer/parseservice";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import Insights from "./pages/Insights";
import Dashboard from "@/pages/Dashboard";

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

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <HashRouter>
        <SidebarProvider>
          <AppSidebar />
          <Toaster position="bottom-right" richColors />
          <SidebarInset className="min-w-0 overflow-x-hidden">
            <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
              <SidebarTrigger />

              <ImportStatementDialog onImported={setTxs} />
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
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/transactions"
                  element={<Transactions transactions={txs} />}
                />
                <Route path="/settings" element={<Settings />} />
                <Route path="/insights" element={<Insights />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
