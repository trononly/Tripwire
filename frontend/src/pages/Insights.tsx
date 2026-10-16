import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Lightbulb,
} from "lucide-react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import { AnalyzeTransactions } from "../../bindings/mpesa-analyzer/parseservice";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SponsorCard } from "@/components/sponsor-card";
import { useAdsEnabled } from "@/lib/ads";
import { RecurringPayments } from "@/components/recurring-payments";
import { formatMoney } from "@/lib/format";
import { maxDayOf } from "@/lib/date-window";
import { cn } from "@/lib/utils";

/**
 * Insights - the depth layer on top of the same analysis result the
 * Dashboard uses. Every tile reads from AnalysisResult; a tile with no
 * underlying data yet shows an honest empty state, never invented numbers.
 */

function TileEmpty({ children }: { children: React.ReactNode }) {
  return (
    <CardContent className="pt-0 max-sm:px-4 max-sm:py-4 sm:pt-0">
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {children}
      </p>
    </CardContent>
  );
}

/** Bills & subscriptions: detection always runs on full history (a monthly
 * cadence cannot be established from one month of transactions), while the
 * *display* is scoped: a selected month shows the bills active in it,
 * otherwise only bills paid within 30 days of the newest activity. */
function BillsTile({
  result,
  month,
}: {
  result: analysis.AnalysisResult | null;
  month: string;
}) {
  const payments = useMemo(() => {
    const all = result?.recurringPayments ?? [];
    if (all.length === 0) return [];
    if (month !== "all") {
      return all.filter(
        (p) =>
          p.firstDate.slice(0, 7) <= month && month <= p.lastDate.slice(0, 7),
      );
    }
    // Live bills only. Monthly bills show while last paid within two
    // months; other cadences show while their next round is due (or became
    // due within the last week), so a lapsed weekly pattern stays hidden.
    // "Now" is the newest bill activity, not today - datasets are
    // historical.
    const latest = maxDayOf(all.map((p) => p.lastDate));
    const nowMs = Date.parse(`${latest}T00:00:00Z`);
    const twoMonthsMs = 60 * 86400000;
    const graceMs = 7 * 86400000;
    return all.filter((p) => {
      const lastMs = Date.parse(`${p.lastDate.slice(0, 10)}T00:00:00Z`);
      if (p.cadence === "monthly") return nowMs - lastMs <= twoMonthsMs;
      return lastMs + p.medianGapDays * 86400000 + graceMs >= nowMs;
    });
  }, [result, month]);
  if (payments.length > 0) {
    return <RecurringPayments payments={payments} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bills &amp; subscriptions</CardTitle>
      </CardHeader>
      <TileEmpty>
        {month === "all"
          ? "No recent recurring payments. Import a statement covering a few months of activity."
          : `No recurring payments were active in ${monthLabel(month)}.`}
      </TileEmpty>
    </Card>
  );
}

/** Fee radar: what Safaricom took, straight from the Fees category and the
 * totals the analyzer already computes, split by fee kind so the Fuliza
 * access-fee part is visible on its own row. */
function FeeRadarTile({ result }: { result: analysis.AnalysisResult | null }) {
  const fees = result?.categories?.find((c) => c.name === "Fees");
  const totalOut = result?.totals.totalOut ?? 0;
  const totalFees = result?.totals.totalFees ?? 0;
  const percent = totalOut > 0 ? ((totalFees / totalOut) * 100).toFixed(1) : null;
  const byType = result?.feesByType ?? [];
  const fulizaOwed = result?.fulizaOutstanding ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee radar</CardTitle>
        <CardDescription>
          What M-Pesa charged: transfer fees, Fuliza interest and charge rows.
        </CardDescription>
      </CardHeader>
      {!fees && totalFees === 0 ? (
        <TileEmpty>No fee transactions in this dataset yet.</TileEmpty>
      ) : (
        <CardContent className="space-y-3 pt-0 max-sm:px-4 max-sm:py-4 sm:pt-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Total fees</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(totalFees)}
            </span>
          </div>
          {byType.length > 0 && (
            <div className="space-y-1.5">
              {byType.map((f) => (
                <div
                  key={f.key}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="text-sm text-muted-foreground">
                    {f.label} · {f.count}
                  </span>
                  <span className="text-sm tabular-nums">
                    {formatMoney(f.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {fulizaOwed > 0 && (
            <div className="flex items-baseline justify-between gap-2 border-t pt-2">
              <span className="text-sm text-muted-foreground">
                Fuliza owed
              </span>
              <span className="text-sm font-medium tabular-nums">
                {formatMoney(fulizaOwed)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              Share of money out
            </span>
            <span className="text-sm tabular-nums">
              {percent ? `${percent}%` : "-"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Fee entries</span>
            <span className="text-sm tabular-nums">
              {fees?.count ?? 0}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** vs last month: the last two monthly cashflow buckets compared. Two
 * months of coverage are required - with less, there is nothing honest to
 * compare. When Insights is scoped to one month, the comparison reaches
 * back into full history for the preceding month instead of erroring. */
function VsLastMonthTile({
  result,
  fullMonths,
  selectedMonth,
}: {
  result: analysis.AnalysisResult | null;
  fullMonths: analysis.CashflowBucket[];
  selectedMonth: string;
}) {
  const months = result?.cashflowMonthly ?? [];
  let prev: analysis.CashflowBucket | undefined;
  let last: analysis.CashflowBucket | undefined;
  if (selectedMonth === "all") {
    prev = months[months.length - 2];
    last = months[months.length - 1];
  } else {
    const i = fullMonths.findIndex(
      (b) => b.start.slice(0, 7) === selectedMonth,
    );
    if (i > 0) {
      prev = fullMonths[i - 1];
      last = fullMonths[i];
    } else if (i === 0) {
      last = fullMonths[0];
    }
  }

  const rows: { label: string; value: string; delta: string | null; up: boolean }[] =
    [];
  if (prev && last) {
    for (const [label, a, b] of [
      ["Money in", prev.in, last.in],
      ["Money out", prev.out, last.out],
    ] as const) {
      const diff = b - a;
      rows.push({
        label,
        value: formatMoney(b),
        delta: diff === 0 ? "no change" : `${formatMoney(Math.abs(diff))} ${diff > 0 ? "more" : "less"}`,
        up: diff > 0,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>vs last month</CardTitle>
        <CardDescription>
          {prev && last
            ? `${monthLong(prev.start.slice(0, 7))} compared with ${monthLong(last.start.slice(0, 7))}.`
            : "Monthly cashflow, compared."}
        </CardDescription>
      </CardHeader>
      {!prev || !last ? (
        <TileEmpty>
          Needs at least two months of transactions. Import a statement that
          spans multiple months.
        </TileEmpty>
      ) : (
        <CardContent className="space-y-3 pt-0 max-sm:px-4 max-sm:py-4 sm:pt-0">
          {rows.map((r) => (
            <div key={r.label} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-muted-foreground">{r.label}</span>
                <span className="text-sm font-medium tabular-nums">
                  {r.value}
                </span>
              </div>
              <p
                className={cn(
                  "text-xs",
                  r.up ? "text-amber-600" : "text-emerald-600",
                )}
              >
                {r.delta}
              </p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

/** Reports & sharing: no implementation behind it yet - an honest empty
 * state instead of a placeholder button. Hidden on phones until the
 * feature exists; a dead-end card earns no mobile screen space. */
function ReportsTile() {
  return (
    <Card className="hidden md:block">
      <CardHeader>
        <CardTitle>Reports &amp; sharing</CardTitle>
      </CardHeader>
      <TileEmpty>
        Reports are not built yet. Nothing is lost - the tiles above are
        computed from your stored statements, so this will work once
        available.
      </TileEmpty>
    </Card>
  );
}

export default function Insights({
  transactions,
  result,
  loading,
  error,
  activeStatement,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
  activeStatement: store.StatementMeta | null;
}) {
  // Per-month window over the active dataset. The pick persists across
  // sessions; without one, start at the newest month (not All) when there
  // is more than one.
  const MONTH_KEY = "mpesa-analyzer.insights-month";
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) set.add(t.date.slice(0, 7));
    return [...set].sort().reverse();
  }, [transactions]);
  const [month, setMonthState] = useState<string>("all");
  const setMonth = (next: string | ((prev: string) => string)) => {
    const value = typeof next === "function" ? next(month) : next;
    setMonthState(value);
    try {
      localStorage.setItem(MONTH_KEY, value);
    } catch {
      /* private mode: month stays session-only */
    }
  };
  useEffect(() => {
    if (months.length === 0) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MONTH_KEY);
    } catch {
      /* ignore */
    }
    if (stored && (stored === "all" || months.includes(stored))) {
      if (stored !== month) setMonthState(stored);
      return;
    }
    const next = months.length > 1 ? months[0] : "all";
    if (next !== month) setMonth(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);
  const monthPickerRef = useRef<HTMLInputElement>(null);
  // Native month picker for long histories: jump straight to a far month
  // instead of stepping chip by chip. Out-of-range picks are blocked by
  // min/max; an in-range month with no transactions shows honest empties.
  const openMonthPicker = () => {
    const el = monthPickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through to click/focus */
      }
    }
    el.focus();
    el.click();
  };
  const filteredTxs = useMemo(
    () =>
      month === "all"
        ? transactions
        : transactions.filter((t) => t.date.slice(0, 7) === month),
    [transactions, month],
  );
  const [monthResult, setMonthResult] =
    useState<analysis.AnalysisResult | null>(null);
  useEffect(() => {
    if (month === "all") {
      setMonthResult(null);
      return;
    }
    let cancelled = false;
    setMonthResult(null);
    AnalyzeTransactions(filteredTxs)
      .then((r) => {
        if (!cancelled) setMonthResult(r);
      })
      .catch((e) => {
        if (!cancelled) console.error("Insights month analysis failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [filteredTxs, month]);
  const displayResult = month === "all" ? result : monthResult;
  const displayLoading = loading || (month !== "all" && !monthResult);
  // Sponsor slot visibility - user opt-out lives in Settings.
  const showSponsor = useAdsEnabled();
  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Deeper answers about your money, computed from the active
            dataset.
          </p>
        </div>
        <Card className="flex min-h-80 items-center justify-center border-dashed">
          <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
            <Lightbulb className="size-8 text-muted-foreground" />
            <p className="text-lg font-medium">No data to analyze yet</p>
            <p className="text-sm text-muted-foreground">
              Import a PDF statement (or, on Android, save your SMS
              transactions) and Insights will fill in from the same analysis
              the Dashboard uses.
            </p>
            <Button asChild size="lg">
              <Link to="/">
                <FileUp />
                Go to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {activeStatement && (
            <p className="truncate text-sm text-muted-foreground">
              {`${activeStatement.name} · ${activeStatement.dateRange.start} – ${activeStatement.dateRange.end}`}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
          <Link to="/">
            Open Dashboard
            <ArrowRight />
          </Link>
        </Button>
      </div>
      {/* Month window for every tile below: centered stepper (tap the
          month itself for the calendar picker - handy when history is
          long), arrows walk oldest ↔ newest. */}
      {months.length > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Older month"
            disabled={month === months[months.length - 1]}
            onClick={() =>
              setMonth((m) => {
                const i = months.indexOf(m);
                // From All start at the newest, then walk older.
                if (i === -1) return months[0];
                return months[Math.min(months.length - 1, i + 1)];
              })
            }
            className="h-8 w-8 shrink-0 px-0"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <button
            type="button"
            onClick={openMonthPicker}
            aria-label={
              month === "all" ? "Pick a month" : `Month: ${monthLabel(month)}`
            }
            className="min-w-36 rounded-md border bg-card px-4 py-1.5 text-sm font-semibold tabular-nums transition-colors hover:bg-accent/50"
          >
            {month === "all" ? "All months" : monthLabel(month).toUpperCase()}
          </button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Newer month"
            disabled={month === "all"}
            onClick={() =>
              setMonth((m) => {
                const i = months.indexOf(m);
                // Walking newer past the newest month returns to All.
                if (i <= 0) return "all";
                return months[i - 1];
              })
            }
            className="h-8 w-8 shrink-0 px-0"
          >
            <ChevronRight className="size-4" />
          </Button>
          <input
            ref={monthPickerRef}
            type="month"
            aria-hidden="true"
            tabIndex={-1}
            className="h-0 w-0 opacity-0"
            min={months[months.length - 1]}
            max={months[0]}
            value={month === "all" ? "" : month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {displayLoading || !displayResult ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <BillsTile result={result} month={month} />
          <FeeRadarTile result={displayResult} />
          {showSponsor && <SponsorCard />}
          <VsLastMonthTile
            result={displayResult}
            fullMonths={result?.cashflowMonthly ?? []}
            selectedMonth={month}
          />
          {/* Full-width closer: otherwise the last row leaves an orphan
              hole in the second column on desktop. */}
          <div className="lg:col-span-2">
            <ReportsTile />
          </div>
        </div>
      )}
    </div>
  );
}

/** "2026-09" → "September 2026". */
function monthLong(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[(m ?? 1) - 1] ?? m} ${y ?? ""}`;
}

/** "2026-09" → "Sep 26". */
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[(m ?? 1) - 1] ?? m} '${String(y ?? "").slice(2)}`;
}
