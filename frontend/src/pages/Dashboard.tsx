import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CashflowChart, type Granularity } from "@/components/charts/cashflow-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CounterpartyChart } from "@/components/charts/counterparty-chart";
import { TotalsCards } from "@/components/totals-cards";

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
        </>
      )}
    </div>
  );
}
