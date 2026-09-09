import { useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CashflowChart,
  type Granularity,
} from "@/components/charts/cashflow-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { CounterpartyChart } from "@/components/charts/counterparty-chart";
import { TotalsCards } from "@/components/totals-cards";

export default function Dashboard({
  transactions,
  result,
  loading,
  error,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [granularity, setGranularity] = useState<Granularity>("day");
  const renderCount = useRef(0);
  renderCount.current++;

  console.log("Dashboard render", renderCount.current, {
    result,
    loading,
    granularity,
  });

  // Only render when on the root path
  if (location.pathname !== "/") {
    return null;
  }

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
          <p className="text-muted-foreground">
            Overview of your M-Pesa activity.
          </p>
        </div>
        <Card className="flex min-h-80 items-center justify-center border-dashed">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-medium">No statement imported yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use <span className="font-medium">Import Statement</span> above to
              load an M-Pesa PDF.
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
        <p className="text-muted-foreground">
          Overview of your M-Pesa activity.
        </p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
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
            <Skeleton className="h-90" />
            <Skeleton className="h-90" />
            <Skeleton className="h-90" />
            <Skeleton className="h-90" />
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
                navigate(
                  `/transactions?category=${encodeURIComponent(category)}`,
                )
              }
            />

            <BalanceChart data={result.balanceSeries ?? []} />

            <CounterpartyChart
              counterparties={result.topCounterparties ?? []}
            />
          </div>
        </>
      )}
    </div>
  );
}
