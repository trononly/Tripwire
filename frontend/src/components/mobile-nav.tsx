import { NavLink } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";
import { vibrateIfEnabled } from "@/lib/motion-settings";

// SMS is not a destination: the data mode in Settings decides what the
// Dashboard/Transactions/Insights analyze, and the SMS audit lives behind
// Settings and the SMS-mode empty states.
const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  {
    to: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    end: false,
  },
  { to: "/insights", label: "Insights", icon: Lightbulb, end: false },
];

/**
 * Bottom tab bar for phones — the only phone navigation. The sidebar is
 * desktop-only; Settings sits in the header so the four primary
 * destinations get one-tap reach.
 */
export function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => vibrateIfEnabled(10)}
            className={({ isActive }) =>
              cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                isActive && "text-primary",
              )
            }
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
