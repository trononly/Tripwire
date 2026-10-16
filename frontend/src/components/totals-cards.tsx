import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { useInView } from "@/hooks/use-in-view";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { useReveal } from "@/lib/privacy-mode";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";

function KpiCard({
  label,
  value,
  hint,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "in" | "out" | "neutral";
  /** "primary" = large bold, "secondary" = smaller muted. */
  emphasis?: "primary" | "secondary";
}) {
  const toneClass =
    tone === "in"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "out"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  const isPrimary = emphasis !== "secondary";
  // Privacy Mode: the whole card is the tap target, but only the figure is
  // blurred - labels stay readable.
  const { blurred, reveal } = useReveal();
  return (
    <Card
      className={cn("@container gap-2 min-w-0", blurred && "cursor-pointer")}
      onClick={reveal}
      role={blurred ? "button" : undefined}
      tabIndex={blurred ? 0 : undefined}
      aria-label={blurred ? `Reveal ${label}` : undefined}
      onKeyDown={(e) => {
        if (blurred && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          reveal();
        }
      }}
    >
      <CardHeader className="min-w-0">
        <CardDescription className="truncate font-medium text-neutral-500 dark:text-neutral-400">{label}</CardDescription>
        <CardTitle
          className={`whitespace-nowrap tabular-nums ${isPrimary ? "text-2xl font-bold tracking-tight text-neutral-900 dark:text-white" : "text-lg font-semibold"} ${isPrimary ? "" : toneClass}`}
        >
          <span
            aria-hidden={blurred || undefined}
            className={cn(
              "inline-block transition-[filter,opacity] duration-200",
              blurred && "blur-[7px] select-none opacity-80",
            )}
          >
            {value}
          </span>
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

export function TotalsCards({
  totals,
  currentBalance,
}: {
  totals: analysis.Totals | null;
  currentBalance?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  // Count-ups only run once the row of KPIs is actually on screen.
  const totalIn = useCountUp(totals?.totalIn ?? 0, 800, inView);
  const totalOut = useCountUp(totals?.totalOut ?? 0, 800, inView);
  const netValue = (totals?.totalIn ?? 0) - (totals?.totalOut ?? 0);
  const net = useCountUp(netValue, 800, inView);
  const closingBalance = useCountUp(
    currentBalance ?? totals?.closingBalance ?? 0,
    800,
    inView,
  );

  useEffect(() => {
    if (!totals) return;
    vibrateIfEnabled(12);
  }, [totals]);

  if (!totals) {
    return (
      <div ref={ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Total In", "Total Out", "Net Flow", "Current Balance"].map((l) => (
          <KpiCard key={l} label={l} value="-" hint="No data yet" />
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Current Balance"
        value={formatMoney(closingBalance)}
        emphasis="primary"
      />
      <KpiCard
        label="Net Flow"
        value={formatMoney(net)}
        tone={netValue >= 0 ? "in" : "out"}
        emphasis="secondary"
      />
      <KpiCard
        label="Total In"
        value={formatMoney(totalIn)}
        tone="in"
        emphasis="secondary"
      />
      <KpiCard
        label="Total Out"
        value={formatMoney(totalOut)}
        tone="out"
        hint="Spending & transfers"
        emphasis="secondary"
      />
    </div>
  );
}
