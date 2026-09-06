import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ImportStatementDialog } from "@/components/import-statement-dialog";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
import { parser } from "../wailsjs/go/models";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

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
        <SidebarInset>
          <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <ImportStatementDialog onImported={setTxs} />

          </header>
          <main className="flex-1 space-y-4 p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
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
