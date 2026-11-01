import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileUp,
  MessageSquareText,
  Calendar,
  ChevronDown,
  Tags,
} from "lucide-react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CashflowChart,
  type Granularity,
} from "@/components/charts/cashflow-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import {
  CategoryBreakdown,
  type SpendSlice,
} from "@/components/charts/category-breakdown";
import { CounterpartyCard } from "@/components/counterparty-card";
import { PageHeader } from "@/components/page-header";
import { TotalsCards } from "@/components/totals-cards";
import { Private, PrivateText } from "@/components/privacy";
import { AnalyzeTransactions } from "../../bindings/mpesa-analyzer/parseservice";
import { maxDayOf } from "@/lib/date-window";
import { useDateRange, type RangeKey } from "@/hooks/use-date-range";
import { useCustomCategoryTotals } from "@/hooks/use-custom-category-totals";
import { useDonutMode } from "@/lib/donut-mode";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { cn } from "@/lib/utils";
import { formatMoneyShort } from "@/lib/format";
import { FilterSheet, type FilterRangeKey } from "@/components/filter-sheet";

/** Dashboard-wide time filter, anchored to the newest transaction (not
 * today - imported datasets are often historical). Everything below -
 * totals and every chart - analyzes the filtered subset. */

function dayOf(dateTime: string) {
  return dateTime.slice(0, 10);
}

/** Latest transaction day in the dataset, "YYYY-MM-DD". */
function maxDay(transactions: parser.Transaction[]) {
  return maxDayOf(transactions.map((t) => t.date));
}

/**
 * Dashboard - the financial interpretation layer. Answers: how much came
 * in, how much went out, and where money is going. Recurring outflows live
 * on Insights; individual rows live on Transactions.
 */
export default function Dashboard({
  transactions,
  result,
  loading,
  error,
  historyCount,
  smsMode = false,
  onImport,
  onImportSms,
  importing = false,
  booting = false,
  onBrowseHistory,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
  historyCount: number;
  /** True while the app analyzes the SMS dataset (Android). */
  smsMode?: boolean;
  onImport: () => void;
  /** Android only: open the SMS import straight away (asks for SMS access
   * on the spot instead of routing through the SMS page). */
  onImportSms: () => void;
  /** True while an SMS import is in flight: show skeletons, not buttons. */
  importing?: boolean;
  /** True until the launch-time history read settles: an empty list then
   * means "not loaded yet", so the empty state must wait. */
  booting?: boolean;
  onBrowseHistory: () => void;
}) {
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const latestDay = maxDay(transactions);
  const {
    rangeKey: range,
    range: dateRange,
    label: rangeLabel,
    setRangeKey: setRange,
    setCustom,
  } = useDateRange(latestDay);

  const filteredTxs = useMemo(() => {
    if (range === "all") return transactions;
    return transactions.filter(
      (t) => dayOf(t.date) >= dateRange.start && dayOf(t.date) <= dateRange.end,
    );
  }, [transactions, range, dateRange]);

  // The cadence follows the *selected* window, not the whole file: a 30-day
  // filter gets daily bars, a 90-day filter weekly, a year monthly. The old
  // rule read the full dataset span, so "Last 30 Days" rendered five weekly
  // bars in a mostly-empty plot.
  const [granularityOverride, setGranularityOverride] =
    useState<Granularity | null>(null);
  const autoGranularity: Granularity = useMemo(() => {
    if (filteredTxs.length === 0) return "day";
    let min = "9999";
    let max = "";
    for (const t of filteredTxs) {
      const d = t.date.slice(0, 10);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    const spanDays =
      (Date.parse(`${max}T00:00:00Z`) - Date.parse(`${min}T00:00:00Z`)) /
      86400000;
    if (spanDays > 180) return "month";
    if (spanDays > 45) return "week";
    return "day";
  }, [filteredTxs]);
  const granularity = granularityOverride ?? autoGranularity;

  useEffect(() => {
    setGranularityOverride(null);
  }, [range, dateRange.start, dateRange.end]);

  const [rangedResult, setRangedResult] =
    useState<analysis.AnalysisResult | null>(null);
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

  const [donutMode, setDonutMode] = useDonutMode();
  const { totals: customTotals, loading: customLoading } =
    useCustomCategoryTotals(filteredTxs, donutMode === "custom");
  const builtInSlices: SpendSlice[] = (visible?.categories ?? []).map((c) => ({
    key: c.name,
    label: c.name,
    amount: c.amount,
    count: c.count,
  }));
  const customSlices: SpendSlice[] = customTotals.map((t) => ({
    key: t.id || "none",
    label: t.name,
    amount: t.amount,
    count: t.count,
  }));
  const hasCustomSpend = customSlices.some((s) => s.amount < 0);

  const finding = useMemo(() => {
    if (!visible) return "Your M-Pesa activity at a glance.";
    const top = [...(visible.categories ?? [])]
      .filter((c) => c.amount < 0)
      .sort((a, b) => a.amount - b.amount)[0];
    const fee = visible.totals.totalFees;
    const bits: string[] = [];
    if (fee > 0) bits.push(`Fees ${formatMoneyShort(fee)}`);
    if (top && top.name !== "Fees") bits.push(`Most went to ${top.name}`);
    if (bits.length === 0) {
      return visible.totals.count > 0
        ? "No spending in this window."
        : "No transactions in this window.";
    }
    return `${bits.join(" · ")}.`;
  }, [visible]);

  // Transactions loaded but the first analysis has not landed: render the
  // skeleton, never a dashboard of zeroes that fills in a moment later. Once
  // a result exists it stays on screen through a re-analysis, so the cards
  // are not torn down and re-animated when the dataset is refreshed.
  if (transactions.length > 0 && !result && !error) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title="Dashboard" />
        <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-none" />
          ))}
        </div>
        <Skeleton className="h-90 rounded-none" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        {smsMode ? (
          importing || booting ? (
            <div className="space-y-4" aria-busy="true">
              <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-none" />
                ))}
              </div>
              <Skeleton className="h-90 rounded-none" />
            </div>
          ) : (
            <Card className="flex min-h-72 items-center justify-center">
              <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
                <p className="text-lg font-medium">No SMS imported yet</p>
                <Button size="lg" onClick={onImportSms}>
                  <MessageSquareText />
                  Import SMS
                </Button>
              </CardContent>
            </Card>
          )
        ) : historyCount === 0 ? (
          <Card className="flex min-h-72 items-center justify-center">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
              <p className="text-lg font-medium">No statements yet</p>
              <Button size="lg" onClick={onImport}>
                <FileUp />
                Import statement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex min-h-72 items-center justify-center">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-4 text-center">
              <p className="text-lg font-medium">Nothing active</p>
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
      <PageHeader
        title="Dashboard"
        subtitle={<PrivateText label="Tap to reveal the summary">{finding}</PrivateText>}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setFilterOpen(true)}
          >
            <Calendar className="size-4" />
            {rangeLabel}
            <ChevronDown className="size-4 opacity-60" />
          </Button>
        }
      />
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
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {!visible ? (
          slowLoad ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-none" />
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-90 rounded-none lg:col-span-2" />
                <Skeleton className="h-90 rounded-none" />
                <Skeleton className="h-90 rounded-none lg:col-span-2" />
                <Skeleton className="h-90 rounded-none" />
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
              asOf={latestDay}
            />

            {/* Money flow: where and when, with the spending share beside it. */}
            <div className="grid items-stretch gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <Private
                  className="h-full w-full [&>div]:h-full"
                  label="Tap to reveal the cashflow chart"
                >
                  <CashflowChart
                    buckets={buckets}
                    granularity={granularity}
                    onGranularityChange={setGranularityOverride}
                  />
                </Private>
              </div>
              <div className="min-w-0">
                <Private
                  className="h-full w-full [&>div]:h-full"
                  label="Tap to reveal the spending breakdown"
                >
                  <CategoryBreakdown
                    slices={
                      donutMode === "custom" ? customSlices : builtInSlices
                    }
                    onSelectSlice={(key) =>
                      navigate(
                        donutMode === "custom"
                          ? `/transactions?custom=${encodeURIComponent(key)}`
                          : `/transactions?category=${encodeURIComponent(key)}`,
                      )
                    }
                    toolbar={
                      <div
                        className="flex gap-1"
                        role="group"
                        aria-label="Category view"
                      >
                        {(
                          [
                            { key: "mpesa", label: "Standard" },
                            { key: "custom", label: "Custom" },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            aria-pressed={donutMode === option.key}
                            className={cn(
                              "tile",
                              donutMode === option.key && "tile-active",
                            )}
                            onClick={() => {
                              vibrateIfEnabled(8);
                              setDonutMode(option.key);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    }
                    footer={
                      donutMode === "custom" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full justify-center gap-1.5 text-xs text-muted-foreground"
                          onClick={() => navigate("/categories")}
                        >
                          <Tags className="size-3.5" />
                          Manage categories
                        </Button>
                      ) : undefined
                    }
                    empty={
                      donutMode === "custom" ? (
                        customLoading && customTotals.length === 0 ? (
                          <Skeleton className="mx-auto h-56 w-full" />
                        ) : !hasCustomSpend ? (
                          <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-4 text-center">
                            <Tags className="size-6 text-muted-foreground" />
                            <p className="text-sm font-medium">
                              Nothing labelled yet
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Tap a transaction&rsquo;s icon to give it a
                              category; it shows up here.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate("/transactions")}
                            >
                              Label transactions
                            </Button>
                          </div>
                        ) : undefined
                      ) : undefined
                    }
                  />
                </Private>
              </div>
              <div className="min-w-0 lg:col-span-2">
                <Private
                  className="h-full w-full [&>div]:h-full"
                  label="Tap to reveal the balance chart"
                >
                  <BalanceChart data={visible.balanceSeries ?? []} />
                </Private>
              </div>
              <div className="min-w-0">
                <Private
                  className="h-full w-full [&>div]:h-full"
                  label="Tap to reveal the top counterparties"
                >
                  <CounterpartyCard
                    counterparties={visible.topCounterparties ?? []}
                    onSelectCounterparty={(name) =>
                      navigate(`/transactions?q=${encodeURIComponent(name)}`)
                    }
                  />
                </Private>
              </div>
            </div>
          </div>
        )}
        <div className="h-6" aria-hidden="true" />
      </div>
    </>
  );
}
