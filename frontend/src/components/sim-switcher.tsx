import { useEffect, useRef, useState } from "react";
import { Check, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StatementMeta } from "../../bindings/mpesa-analyzer/internal/store/models";
import { Button } from "@/components/ui/button";

/**
 * A wallet's display name. The bridge sends the carrier's own SIM name
 * ("Safaricom", "Airtel"); records written before SIMs were captured have
 * only the derived key, so fall back to "SIM <slot>".
 */
export function simName(meta: StatementMeta): string {
  const label = meta.simLabel?.trim();
  if (label) return label;
  const keyed = /^(?:sim|sub)-(\d+)$/.exec(meta.simId ?? "");
  if (keyed) {
    // Slot keys are zero-based; subscription keys are not, but a friendly
    // ordinal is the best either can offer when the carrier name is missing.
    return `SIM ${/^sim-/.test(meta.simId ?? "") ? Number(keyed[1]) + 1 : keyed[1]}`;
  }
  return "SIM";
}

/**
 * SIM switcher for SMS mode. M-Pesa SMS are identical on every SIM, so an
 * import that spans two SIMs produces one record per SIM; this picks which
 * wallet the Dashboard, Transactions and Insights analyze. Rendered only
 * with two or more SIM records - a single-SIM phone needs no picker.
 *
 * Deliberately not a portaled menu: the list renders in place under the
 * header button so it can never cover or displace the header on small
 * screens.
 */
export function SimSwitcher({
  sims,
  activeId,
  numbers = {},
  onSwitch,
}: {
  sims: StatementMeta[];
  activeId: string | null;
  /** Phone numbers by SIM key, shown as subtext when set. */
  numbers?: Record<string, string>;
  onSwitch: (meta: StatementMeta) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  if (sims.length < 2) return null;

  const active = sims.find((s) => s.id === activeId) ?? sims[0];

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Wallet SIM: ${simName(active)}`}
        aria-expanded={open}
        title="Switch M-Pesa wallet SIM"
        onClick={() => setOpen((v) => !v)}
      >
        <Smartphone />
        <span className="max-w-24 truncate sm:max-w-none">
          {simName(active)}
        </span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="M-Pesa wallet"
          className="absolute top-full right-0 z-50 mt-2 w-52 overflow-hidden rounded-md border bg-popover shadow-md"
        >
          <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
            M-Pesa wallet
          </p>
          {sims.map((sim) => {
            const isActive = sim.id === active.id;
            const number = numbers[sim.simId ?? ""];
            return (
              <button
                key={sim.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSwitch(sim);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  isActive && "font-medium",
                )}
              >
                <Smartphone
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "opacity-100" : "opacity-40",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{simName(sim)}</span>
                  {number && (
                    <span className="block truncate text-xs text-muted-foreground tabular-nums">
                      {number}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {sim.txCount.toLocaleString()}
                </span>
                {isActive && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
