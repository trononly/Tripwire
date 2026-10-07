import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileUp, MessageSquareText } from "lucide-react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CashflowChart,
  type Granularity,
} from "@/components/charts/cashflow-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CounterpartyChart } from "@/components/charts/counterparty-chart";
import { TotalsCards } from "@/components/totals-cards";
import { AnalyzeTransactions } from "../../bindings/mpesa-analyzer/parseservice";
import { cutoffDay, maxDayOf } from "@/lib/date-window";

/** Dashboard-wide time filter, anchored to the newest transaction (not
 * today — imported datasets are often historical). Everything below —
 * totals and every chart — analyzes the filtered subset. */
type RangeKey = "all" | "90" | "30";
const RANGE_KEY = "mpesa-analyzer.range";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
];

function dayOf(dateTime: string) {
  return dateTime.slice(0, 10);
}

/** Latest transaction day in the dataset, "YYYY-MM-DD". */
function maxDay(transactions: parser.Transaction[]) {
  return maxDayOf(transactions.map((t) => t.date));
}

/**
 * Dashboard — the financial interpretation layer. Answers: how much came
 * in, how much went out, and where money is going. Recurring outflows live
 * on Insights; individual rows live on Transactions.
 */
export default function Dashboard({
  transactions,
  result,
  loading,
  error,
  activeStatement,
  historyCount,
  smsMode = false,
  onImport,
  onBrowseHistory,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
  activeStatement: store.StatementMeta | null;
  historyCount: number;
  /** True while the app analyzes the SMS dataset (Android). */
  smsMode?: boolean;
  onImport: () => void;
  onBrowseHistory: () => void;
}) {
  const navigate = useNavigate();
  // Cadence auto-matches the dataset span (daily bars turn to hairlines
  // over multi-month histories); the cashflow card buttons override it.
  const [granularityOverride, setGranularityOverride] =
    useState<Granularity | null>(null);
  const autoGranularity: Granularity = useMemo(() => {
    if (transactions.length === 0) return "day";
    let min = "9";
    let max = "";
    for (const t of transactions) {
      const d = t.date.slice(0, 10);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    const spanDays =
      (Date.parse(`${max}T00:00:00Z`) - Date.parse(`${min}T00:00:00Z`)) /
      86400000;
    if (spanDays > 92) return "month";
    if (spanDays > 31) return "week";
    return "day";
  }, [transactions]);
  const granularity = granularityOverride ?? autoGranularity;
  // Window persists across sessions; first run starts recent (30D), not
  // All — dense histories are unreadable unscoped.
  const [range, setRangeState] = useState<RangeKey>(() => {
    try {
      const s = localStorage.getItem(RANGE_KEY);
      return s === "90" || s === "all" ? (s as RangeKey) : "30";
    } catch {
      return "30";
    }
  });
  const setRange = (next: RangeKey) => {
    setRangeState(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      /* private mode: range stays session-only */
    }
  };

  // The filtered subset, then its own analysis. "All" reuses the app-wide
  // result (no extra call); a bounded range re-analyzes just that window so
  // dense histories stay readable in every chart.
  const filteredTxs = useMemo(() => {
    if (range === "all") return transactions;
    const latest = maxDay(transactions);
    if (!latest) return transactions;
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    if (days === null) return transactions;
    const cutoff = cutoffDay(latest, days);
    return transactions.filter((t) => dayOf(t.date) >= cutoff);
  }, [transactions, range]);

  const [rangedResult, setRangedResult] =
    useState<analysis.AnalysisResult | null>(null);
  useEffect(() => {
    if (range === "all") {
      setRangedResult(null);
      return;
    }
    let cancelled = false;
    setRangedResult(null);
    AnalyzeTransactions(filteredTxs)
      .then((r) => {
        if (!cancelled) setRangedResult(r);
      })
      .catch((e) => {
        if (!cancelled) console.error("Dashboard range analysis failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [filteredTxs, range]);

  const displayResult = range === "all" ? result : rangedResult;
  const displayLoading = loading || (range !== "all" && !rangedResult);

  const buckets = useMemo(() => {
    if (!displayResult) return [];
    switch (granularity) {
      case "week":
        return displayResult.cashflowWeekly ?? [];
      case "month":
        return displayResult.cashflowMonthly ?? [];
      default:
        return displayResult.cashflowDaily ?? [];
    }
  }, [displayResult, granularity]);

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {smsMode
              ? "Overview of your M-Pesa SMS activity."
              : "Overview of your M-Pesa activity."}
          </p>
        </div>
        {smsMode ? (
          <Card className="flex min-h-80 items-center justify-center border-dashed">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">No SMS imported yet</p>
              <p className="text-sm text-muted-foreground">
                Import your M-Pesa messages on the SMS tab and they will show
                up here.
              </p>
              <Button asChild size="lg">
                <Link to="/sms">
                  <MessageSquareText />
                  Go to SMS
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : historyCount === 0 ? (
          <Card className="flex min-h-80 items-center justify-center border-dashed">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">No statements yet</p>
              <p className="text-sm text-muted-foreground">
                Import an M-Pesa PDF statement to see your spending, balances,
                and trends here.
              </p>
              <Button size="lg" onClick={onImport}>
                <FileUp />
                Import Statement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex min-h-80 items-center justify-center border-dashed">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">Nothing active</p>
              <p className="text-sm text-muted-foreground">
                Pick a statement from your history, or import a new one.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={onBrowseHistory}>Choose from history</Button>
                <Button variant="outline" onClick={onImport}>
                  <FileUp />
                  Import new statement
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        {activeStatement && (
          <p className="text-sm text-muted-foreground">
            {`${activeStatement.name} · ${activeStatement.dateRange.start} – ${activeStatement.dateRange.end}`}
          </p>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {displayLoading || !displayResult ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-90 lg:col-span-2" />
            <Skeleton className="h-90" />
            <Skeleton className="h-90 lg:col-span-2" />
            <Skeleton className="h-90" />
          </div>
        </div>
      ) : (
        <>
          <TotalsCards totals={displayResult.totals} />

          {/* Money flow: where and when, with the category share beside it. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <CashflowChart
                buckets={buckets}
                granularity={granularity}
                onGranularityChange={setGranularityOverride}
              />
            </div>
            <div className="min-w-0">
              <CategoryDonut
                categories={displayResult.categories ?? []}
                onSelectCategory={(category) =>
                  navigate(
                    `/transactions?category=${encodeURIComponent(category)}`,
                  )
                }
              />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <BalanceChart data={displayResult.balanceSeries ?? []} />
            </div>
            <div className="min-w-0">
              <CounterpartyChart
                counterparties={displayResult.topCounterparties ?? []}
                onSelectCounterparty={(name) =>
                  navigate(`/transactions?q=${encodeURIComponent(name)}`)
                }
              />
            </div>
          </div>
        </>
      )}
      {/* Breathing room so the last chart scrolls clear of the floating
          time pill. */}
      <div className="h-12" aria-hidden="true" />
      {/* Floating time filter, e-commerce style: one glass pill pinned above
          the bottom nav (own safe-area offset), so the window is always one
          tap away. Cadence stays on the cashflow card itself. */}
      <div
        className="fixed left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-background/50 p-1 shadow-xl backdrop-blur-2xl supports-[backdrop-filter]:bg-background/40"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={range === r.key ? "default" : "ghost"}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
