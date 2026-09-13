import { RecurringPayments } from "@/components/recurring-payments";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";

/**
 * Insights — the home of paid depth (see CONTEXT.md). v1 ships the
 * recurring-payments tile ("Bills & subscriptions" lineage): periodic
 * outflows the detector found in the active statement.
 */
export default function Insights({
  result,
}: {
  result: analysis.AnalysisResult | null;
}) {
  const payments = result?.recurringPayments ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        <p className="text-muted-foreground">
          Understand your money — what leaves every month and how it changes.
        </p>
      </div>
      <RecurringPayments payments={payments} />
    </div>
  );
}
