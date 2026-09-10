import { useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp } from "lucide-react";
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
  historyCount,
  onImport,
  onBrowseHistory,
}: {
  transactions: parser.Transaction[];
  result: analysis.AnalysisResult | null;
  loading: boolean;
  error: string | null;
  historyCount: number;
  onImport: () => void;
  onBrowseHistory: () => void;
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
        {historyCount === 0 ? (
          <Card className="flex min-h-80 items-center justify-center border-dashed">
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">No statements yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Import an M-Pesa PDF statement to see your spending,
                balances, and trends here.
              </p>
              <Button size="lg" onClick={onImport}>
                <FileUp />
                Import Statement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex min-h-80 items-center justify-center border-dashed">
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">Nothing active</p>
              <p className="max-w-sm text-sm text-muted-foreground">
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
