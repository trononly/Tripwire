import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

// Code-split the Dashboard: Recharts (~ is only fetched when the
// Dashboard route actually renders, keeping first load snappy.
const Dashboard = lazy(() => import("@/pages/Dashboard"));

import type * as parser from "../bindings/mpesa-analyzer/internal/parser/models";
import { SafeArea } from "../bindings/mpesa-analyzer/mobileinfoservice";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
      Loading dashboard…
    </div>
  );
}

function App() {
  const [txs, setTxs] = useState<parser.Transaction[]>([]);

  // Apply native system-bar insets (Android edge-to-edge) as CSS variables.
  // Physical pixels are divided by devicePixelRatio to get CSS pixels.
  useEffect(() => {
    const apply = async () => {
      try {
        const insets = await SafeArea();
        const dpr = window.devicePixelRatio || 1;
        const style = document.documentElement.style;
        style.setProperty("--safe-area-top", `${(insets.top ?? 0) / dpr}px`);
        style.setProperty(
          "--safe-area-bottom",
          `${(insets.bottom ?? 0) / dpr}px`,
        );
        style.setProperty("--safe-area-left", `${(insets.left ?? 0) / dpr}px`);
        style.setProperty(
          "--safe-area-right",
          `${(insets.right ?? 0) / dpr}px`,
        );
      } catch {
        // Desktop stub or runtime not ready: keep the env() CSS fallback.
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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
                      <Dashboard transactions={txs} />
                    </Suspense>
                  }
                />
                <Route
                  path="/transactions"
                  element={<Transactions transactions={txs} />}
                />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
