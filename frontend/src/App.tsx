import { HashRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";

function App() {
  return (
    <HashRouter>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
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
  );
}

export default App;
