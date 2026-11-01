import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One spending label, already normalised by the caller. The built-in M-Pesa
 * categories and the user's own categories share this shape.
 */
export type SpendSlice = {
  key: string;
  label: string;
  /** Signed cents; only outflows (negative) are drawn here. */
  amount: number;
  count: number;
};

/**
 * "Where it went": a ranked, one-hue breakdown instead of an eight-slice
 * rainbow. The row's bar is the share, the figure is the amount and the
 * small grey number is the percentage. A row is the whole tap target.
 */
export function CategoryBreakdown({
  slices,
  onSelectSlice,
  toolbar,
  footer,
  empty,
  description,
}: {
  slices: SpendSlice[];
  onSelectSlice?: (key: string) => void;
  /** The M-Pesa / My categories switch, rendered beside the title. */
  toolbar?: ReactNode;
  /** Rendered under the list (the Manage link in the custom view). */
  footer?: ReactNode;
  /** Replaces the chart when there is nothing to draw. */
  empty?: ReactNode;
  description?: string;
}) {
  const rows = slices
    .filter((slice) => slice.amount < 0)
    .map((slice) => ({ ...slice, value: Math.abs(slice.amount) }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const largest = rows[0]?.value ?? 1;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Where it went</CardTitle>
          {toolbar}
        </div>
        <CardDescription>
          {description ??
            (total > 0
              ? `${formatMoney(total)} across ${rows.length} ${
                  rows.length === 1 ? "category" : "categories"
                }`
              : "No spending in this period.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {empty ? (
          empty
        ) : rows.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No spending in this period.
          </div>
        ) : (
          <ul className="-mx-1 divide-y divide-border/70">
            {rows.map((row) => {
              const share = total > 0 ? (row.value / total) * 100 : 0;
              const width = Math.max(2, (row.value / largest) * 100);
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => onSelectSlice?.(row.key)}
                    className="group flex w-full flex-col gap-1.5 px-1 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-foreground">
                        {row.label}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-foreground">
                        {formatMoney(row.value)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 min-w-0 flex-1 bg-muted">
                        <span
                          className={cn(
                            "block h-full transition-[width] duration-300",
                            row === rows[0]
                              ? "bg-primary group-hover:bg-primary/90"
                              : "bg-muted-foreground/35 group-hover:bg-muted-foreground/50",
                          )}
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                        {share.toFixed(1)}%
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
