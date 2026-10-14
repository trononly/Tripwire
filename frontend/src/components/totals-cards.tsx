import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { vibrateIfEnabled } from "@/lib/motion-settings";
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
      ? "text-emerald-400"
      : tone === "out"
        ? "text-red-400"
        : "text-white";
  const isPrimary = emphasis !== "secondary";
  return (
    <Card className="@container gap-2 min-w-0">
      <CardHeader className="min-w-0">
        <CardDescription className="truncate">{label}</CardDescription>
        <CardTitle
          className={`whitespace-nowrap tabular-nums ${isPrimary ? "text-lg @[10rem]:text-xl @[13rem]:text-2xl @[16rem]:text-3xl font-bold" : "text-sm @[10rem]:text-base @[13rem]:text-lg font-medium text-muted-foreground"} ${toneClass}`}
        >
          {value}
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

export function TotalsCards({ totals }: { totals: analysis.Totals | null }) {
  const totalIn = useCountUp(totals?.totalIn ?? 0);
  const totalOut = useCountUp(totals?.totalOut ?? 0);
  const net = useCountUp(totals?.net ?? 0);
  const closingBalance = useCountUp(totals?.closingBalance ?? 0);

  useEffect(() => {
    if (!totals) return;
    vibrateIfEnabled(12);
  }, [totals]);

  if (!totals) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Total In", "Total Out", "Net Flow", "Current Balance"].map((l) => (
          <KpiCard key={l} label={l} value="—" hint="No data yet" />
        ))}
      </div>
    );
  }

  const netAbs = Math.abs(net);
  const netHint =
    totals.net >= 0
      ? `+ ${formatMoney(netAbs)} Surplus`
      : `- ${formatMoney(netAbs)} Deficit`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Current Balance"
        value={formatMoney(closingBalance)}
        emphasis="primary"
      />
      <KpiCard
        label="Net Flow"
        value={formatMoney(net)}
        tone={totals.net >= 0 ? "in" : "out"}
        hint={netHint}
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
