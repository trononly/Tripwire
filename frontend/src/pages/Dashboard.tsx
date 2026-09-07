import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { AnalyzeTransactions } from "../../bindings/mpesa-analyzer/parseservice";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CashflowChart, type Granularity } from "@/components/charts/cashflow-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CounterpartyChart } from "@/components/charts/counterparty-chart";
import { TotalsCards } from "@/components/totals-cards";
import { formatMoney } from "@/lib/format";

type SortKey = "pattern" | "amount" | "count" | "medianDays" | "firstDate" | "lastDate";

function intervalLabel(days: number): string {
  // Statements span weeks; describe the gap the way a person would.
  if (days <= 1) return "Daily";
  if (days <= 3) return "A few times a week";
  if (days <= 10) return "Weekly-ish";
  if (days <= 20) return "Bi-weekly";
  if (days <= 45) return "Monthly";
  return `Every ${days}d`;
}

function RecurringTable({ recurring }: { recurring: analysis.RecurringPayment[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const filtered = recurring.filter(
      (r) =>
        r.pattern.toLowerCase().includes(query.toLowerCase()) ||
        r.example.toLowerCase().includes(query.toLowerCase()),
    );
    const dir = sortDesc ? -1 : 1;
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "amount":
          return (Math.abs(a.amount) - Math.abs(b.amount)) * dir;
        case "count":
          return (a.count - b.count) * dir;
        case "medianDays":
          return (a.medianDays - b.medianDays) * dir;
        case "firstDate":
          return a.firstDate.localeCompare(b.firstDate) * dir;
        case "lastDate":
          return a.lastDate.localeCompare(b.lastDate) * dir;
        default:
          return a.pattern.localeCompare(b.pattern) * dir;
      }
    });
  }, [recurring, query, sortKey, sortDesc]);

  const SortHeader = ({ label, k, align = "text-right" }: { label: string; k: SortKey; align?: string }) => {
    const active = sortKey === k;
    const Icon = active ? (sortDesc ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <TableHead className={align}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
          onClick={() => {
            if (active) setSortDesc(!sortDesc);
            else {
              setSortKey(k);
              setSortDesc(true);
            }
          }}
        >
          {label}
          <Icon className="size-3.5" />
        </button>
      </TableHead>
    );
  };

  return (
    <CardContent>
      <div className="mb-4">
        <div className="relative sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recurring payments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <SortHeader label="Payment" k="pattern" align="text-left" />
              <SortHeader label="Amount" k="amount" />
              <SortHeader label="Count" k="count" />
              <SortHeader label="Frequency" k="medianDays" />
              <SortHeader label="First seen" k="firstDate" />
              <SortHeader label="Last seen" k="lastDate" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length > 0 ? (
              sorted.map((r) => (
                // pattern alone is not unique: the same pattern appears once
                // per distinct amount (e.g. Calvin sent 100, 60 and 50).
                <TableRow key={`${r.pattern}|${r.amount}|${r.firstDate}`}>
                  <TableCell className="max-w-[340px] truncate font-medium" title={r.example}>
                    {r.example}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}×</TableCell>
                  <TableCell className="text-right">{intervalLabel(r.medianDays)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.firstDate}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.lastDate}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  {query ? "Nothing matches your search." : "No recurring payments detected in this statement."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  );
}

export default function Dashboard({ transactions }: { transactions: parser.Transaction[] }) {
  const navigate = useNavigate();
  const [result, setResult] = useState<analysis.AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");

  useEffect(() => {
    if (transactions.length === 0) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    AnalyzeTransactions(transactions)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactions]);

  const buckets = useMemo(() => {
    if (!result) return [];
    switch (granularity) {
      case "week":
        return result.cashflowWeekly ?? [];
      case "month":
        return result.cashflowMonthly ?? [];
      default:
        return result.cashflowDaily ?? [];
    }
  }, [result, granularity]);

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your M-Pesa activity.</p>
        </div>
        <Card className="flex min-h-[320px] items-center justify-center border-dashed">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-medium">No statement imported yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use <span className="font-medium">Import Statement</span> above to load an M-Pesa PDF.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your M-Pesa activity.</p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading || !result ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
            <Skeleton className="h-[360px]" />
          </div>
        </div>
      ) : (
        <>
          <TotalsCards totals={result.totals} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CashflowChart
              buckets={buckets}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
            <CategoryDonut
              categories={result.categories ?? []}
              onSelectCategory={(category) =>
                navigate(`/transactions?category=${encodeURIComponent(category)}`)
              }
            />
            <BalanceChart data={result.balanceSeries ?? []} />
            <CounterpartyChart counterparties={result.topCounterparties ?? []} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Recurring Payments</CardTitle>
              <CardDescription>
                Same payment detected 3 or more times. Search and sort to explore.
              </CardDescription>
            </CardHeader>
            <RecurringTable recurring={result.recurring ?? []} />
          </Card>
        </>
      )}
    </div>
  );
}
