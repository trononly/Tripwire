import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileUp, MessageSquareText, Calendar, ChevronDown } from "lucide-react";
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
import { maxDayOf } from "@/lib/date-window";
import { useDateRange, type RangeKey } from "@/hooks/use-date-range";
import { FilterSheet, type FilterRangeKey } from "@/components/filter-sheet";

/** Dashboard-wide time filter, anchored to the newest transaction (not
 * today — imported datasets are often historical). Everything below —
 * totals and every chart — analyzes the filtered subset. */

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
  onImportSms,
  importing = false,
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
  /** Android only: open the SMS import straight away (asks for SMS access
   * on the spot instead of routing through the SMS page). */
  onImportSms: () => void;
  /** True while an SMS import is in flight: show skeletons, not buttons. */
  importing?: boolean;
  onBrowseHistory: () => void;
}) {
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  // Autohide: the filter bar tucks up underneath the main header on scroll
  // down and slides back on scroll up, so it never owns screen space.
  const [filterHidden, setFilterHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setFilterHidden(y > last && y > 140 && !filterOpen);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [filterOpen]);
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
  const latestDay = maxDay(transactions);
  const {
    rangeKey: range,
    range: dateRange,
    label: rangeLabel,
    setRangeKey: setRange,
    setCustom,
  } = useDateRange(latestDay);

  // The filtered subset, then its own analysis. "All" reuses the app-wide
  // result (no extra call); a bounded range re-analyzes just that window so
  // dense histories stay readable in every chart.
  const filteredTxs = useMemo(() => {
    if (range === "all") return transactions;
    return transactions.filter(
      (t) => dayOf(t.date) >= dateRange.start && dayOf(t.date) <= dateRange.end,
    );
  }, [transactions, range, dateRange]);

  const [rangedResult, setRangedResult] =
    useState<analysis.AnalysisResult | null>(null);
  // True while a bounded-range re-analysis is in flight. The previous
  // result stays on screen (dimmed) instead of flashing skeletons, so new
  // transactions roll the KPIs up instead of remounting the whole page.
  const [rangedLoading, setRangedLoading] = useState(false);
  useEffect(() => {
    if (range === "all") {
      setRangedResult(null);
      setRangedLoading(false);
      return;
    }
    let cancelled = false;
    setRangedLoading(true);
    AnalyzeTransactions(filteredTxs)
      .then((r) => {
        if (!cancelled) {
          setRangedResult(r);
          setRangedLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("Dashboard range analysis failed:", e);
          setRangedLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filteredTxs, range]);

  const displayResult = range === "all" ? result : rangedResult;
  // The last good result stays mounted while a re-analysis is in flight,
  // so range switches and new transactions never flash full-page skeletons:
  // KPIs roll prev→next via useCountUp and the same chart components update
  // in place. Skeletons appear only when nothing has ever rendered, delayed
  // 250ms so fast local analyses never flash at all.
  const lastGood = useRef<analysis.AnalysisResult | null>(null);
  if (displayResult) lastGood.current = displayResult;
  const visible = displayResult ?? lastGood.current;
  const updating = visible !== null && (loading || rangedLoading);
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (visible) {
      setSlowLoad(false);
      return;
    }
    const t = setTimeout(() => setSlowLoad(true), 250);
    return () => clearTimeout(t);
  }, [visible]);

  const buckets = useMemo(() => {
    if (!visible) return [];
    switch (granularity) {
      case "week":
        return visible.cashflowWeekly ?? [];
      case "month":
        return visible.cashflowMonthly ?? [];
      default:
        return visible.cashflowDaily ?? [];
    }
  }, [visible, granularity]);

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {smsMode
              ? "Overview of your M-Pesa SMS activity."
              : "Overview of your M-Pesa activity."}
          </p>
        </div>
        {smsMode ? (
          importing ? (
            <div className="space-y-4" aria-busy="true">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-90" />
            </div>
          ) : (
            <Card className="flex min-h-80 items-center justify-center border-dashed">
              <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
                <p className="text-lg font-medium">No SMS imported yet</p>
                <p className="text-sm text-muted-foreground">
                  Import your M-Pesa messages and they will show up here.
                </p>
                <Button size="lg" onClick={onImportSms}>
                  <MessageSquareText />
                  Import SMS
                </Button>
              </CardContent>
            </Card>
          )
        ) : historyCount === 0 ? (
          <Card className="flex min-h-80 items-center justify-center border-dashed">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">No statements yet</p>
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
    <>
      <div
        className={`sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 -mt-4 border-b border-border bg-background/90 px-4 py-1.5 backdrop-blur-md transition-transform duration-200 md:-mx-6 md:-mt-6 ${filterHidden ? "-translate-y-[110%]" : "translate-y-0"}`}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setFilterOpen(true)}
        >
          <Calendar className="size-3.5" />
          {rangeLabel}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </div>
      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        rangeKey={
          range === "7"
            ? "7D"
            : range === "30"
              ? "30D"
              : range === "90"
                ? "90D"
                : range === "ytd"
                  ? "YTD"
                  : range === "custom"
                    ? "Custom"
                    : "All"
        }
        range={dateRange}
        label={rangeLabel}
        onRangeChange={(k: FilterRangeKey) => {
          const next: RangeKey =
            k === "7D"
              ? "7"
              : k === "30D"
                ? "30"
                : k === "90D"
                  ? "90"
                  : k === "YTD"
                    ? "ytd"
                    : k === "Custom"
                      ? "custom"
                      : "all";
          setRange(next);
        }}
        onCustomSubmit={(s, e) => {
          setCustom({ start: s, end: e });
        }}
      />
      <div className="space-y-6">
        {activeStatement && (
          <p className="text-sm text-muted-foreground">
            {`${activeStatement.name} · ${activeStatement.dateRange.start} – ${activeStatement.dateRange.end}`}
          </p>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {!visible ? (
          slowLoad ? (
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
            <div aria-hidden="true" className="min-h-[60vh]" />
          )
        ) : (
          <div
            aria-busy={updating}
            className={updating ? "space-y-6 opacity-70" : "space-y-6"}
          >
            <TotalsCards
              totals={visible.totals}
              currentBalance={result?.totals?.closingBalance}
            />

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
                  categories={visible.categories ?? []}
                  onSelectCategory={(category) =>
                    navigate(
                      `/transactions?category=${encodeURIComponent(category)}`,
                    )
                  }
                />
              </div>
              <div className="min-w-0 lg:col-span-2">
                <BalanceChart data={visible.balanceSeries ?? []} />
              </div>
              <div className="min-w-0">
                <CounterpartyChart
                  counterparties={visible.topCounterparties ?? []}
                  onSelectCounterparty={(name) =>
                    navigate(`/transactions?q=${encodeURIComponent(name)}`)
                  }
                />
              </div>
            </div>
          </div>
        )}
        <div className="h-12" aria-hidden="true" />
      </div>
    </>
  );
}
