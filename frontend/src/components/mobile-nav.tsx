import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Lightbulb,
  Settings as SettingsIcon,
  Plus,
  Send as SendIcon,
  ShoppingCart,
  Banknote,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  useReduceMotionEnabled,
  vibrateIfEnabled,
} from "@/lib/motion-settings";

// Bottom nav destinations. Pay is not a route: the center button opens
// the M-Pesa pay overlay. The other four are real tabs.
const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight, end: false },
  null,
  { to: "/insights", label: "Insights", icon: Lightbulb, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
] as const;

const actions = [
  {
    to: "/send",
    label: "Send Money",
    icon: SendIcon,
    color: "bg-brand",
    dx: -88,
    dy: -96,
  },
  {
    to: "/lipa",
    label: "Lipa na M-PESA",
    icon: ShoppingCart,
    color: "bg-brand",
    dx: 0,
    dy: -128,
  },
  {
    to: "/withdraw",
    label: "Withdraw",
    icon: Banknote,
    color: "bg-brand",
    dx: 88,
    dy: -96,
  },
] as const;

export function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // In-app Reduce motion (or the OS preference) stops the satellite
  // spring-in and the pulsating halo, so the menu appears statically.
  const reduceMotion = useReduceMotionEnabled();

  // Close the overlay on any route change: system back, satellite tap, or
  // a navbar tap while the Pay menu is open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {open && (
        <button
          aria-label="Close Pay menu"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div className="pointer-events-none fixed inset-0 z-[60] md:hidden">
          {/* Zero-size anchor exactly at the Pay button center: the nav is
              5 equal columns, so column 3 (Pay) is centered at left-1/2.
              Bottom offset lands on the Pay circle center. */}
          <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-1/2 h-0 w-0">
            {actions.map(({ to, label, icon: Icon, color, dx, dy }, i) => (
              <div
                key={to}
                className="absolute left-0 top-0"
                style={{
                  transform: `translate(calc(-50% + ${dx}px), ${dy}px)`,
                }}
              >
                <div
                  className="relative"
                  style={
                    reduceMotion
                      ? undefined
                      : {
                          animation:
                            "pay-satellite-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
                          animationDelay: `${i * 60}ms`,
                        }
                  }
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-none border border-border bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-md pointer-events-none">
                    {label}
                  </span>
                  <button
                    aria-label={label}
                    onClick={() => {
                      vibrateIfEnabled(10);
                      setOpen(false);
                      navigate(to);
                    }}
                    className={cn(
                      "pointer-events-auto relative flex size-14 items-center justify-center rounded-full text-white shadow-lg",
                      color,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-0 rounded-full opacity-25 motion-reduce:animate-none",
                        !reduceMotion && "animate-ping",
                        color,
                      )}
                    />
                    <Icon className="relative size-6" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pay-satellite-in {
          from { opacity: 0; scale: 0.4; }
          to { opacity: 1; scale: 1; }
        }
      `}</style>

      <nav
        className="fixed inset-x-0 bottom-0 z-[70] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {items.map((item) =>
            item === null ? (
              <button
                key="pay"
                aria-label="Pay"
                aria-expanded={open}
                onClick={() => {
                  vibrateIfEnabled(10);
                  setOpen((v) => !v);
                }}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-brand text-white font-semibold shadow-lg">
                  <Plus className="size-6" strokeWidth={2} />
                </span>
                Pay
              </button>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => {
                  vibrateIfEnabled(10);
                  setOpen(false);
                }}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                    isActive && "text-primary",
                  )
                }
              >
                <item.icon className="size-5" strokeWidth={1.75} />
                {item.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </>
  );
}
