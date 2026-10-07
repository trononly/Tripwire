import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "in" | "out" | "neutral";
}) {
  const toneClass =
    tone === "in"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "out"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    // @container makes the font size respond to the *card's* width, not the
    // viewport — at odd screen sizes a 1/6-width card shrinks its value text
    // instead of letting "KSh 62,725.32" overflow the padding.
    <Card className="@container gap-2 min-w-0">
      <CardHeader className="min-w-0">
        <CardDescription className="truncate">{label}</CardDescription>
        <CardTitle
          className={`whitespace-nowrap tabular-nums text-base @[10rem]:text-lg @[13rem]:text-xl @[16rem]:text-2xl ${toneClass}`}
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
  if (!totals) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          "Total In",
          "Total Out",
          "Fees",
          "Net",
          "Transactions",
          "Closing Balance",
        ].map((l) => (
          <KpiCard key={l} label={l} value="—" hint="No data yet" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Total In"
        value={formatMoney(totals.totalIn)}
        tone="in"
        hint={`${totals.count} transactions`}
      />
      <KpiCard
        label="Total Out"
        value={formatMoney(totals.totalOut)}
        tone="out"
        hint="Spending & transfers"
      />
      <KpiCard
        label="Fees"
        value={formatMoney(totals.totalFees)}
        tone="out"
        hint="Charges & overdraft"
      />
      <KpiCard
        label="Net"
        value={formatMoney(totals.net)}
        tone={totals.net >= 0 ? "in" : "out"}
        hint={
          totals.net >= 0 ? "Saved this period" : "Spent more than received"
        }
      />
      <KpiCard
        label="Opening → Closing"
        value={formatMoney(totals.closingBalance)}
        hint={`From ${formatMoney(totals.openingBalance)}`}
      />
      <KpiCard
        label="Transactions"
        value={String(totals.count)}
        hint="Across the statement period"
      />
    </div>
  );
}
