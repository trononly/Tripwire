import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

// Code-split the Dashboard: Recharts (~ is only fetched when the
// Dashboard route actually renders, keeping first load snappy.
const Dashboard = lazy(() => import("@/pages/Dashboard"));

import type { parser } from "../wailsjs/go/models";
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
  const [txs, setTxs] = useState<parser.Transaction[]>([])
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
            <Separator orientation="vertical" className="h-5" />
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
              <Route path="/transactions" element={<Transactions transactions={txs} />} />
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
