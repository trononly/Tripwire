import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { vibrateIfEnabled, useReduceMotionEnabled } from "@/lib/motion-settings";
import { useInView } from "@/hooks/use-in-view";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatBucketLabel, formatMoney } from "@/lib/format";
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const chartConfig = {
  in: { label: "In", color: "var(--chart-2)" },
  out: { label: "Out", color: "var(--chart-1)" },
} satisfies ChartConfig;

export type Granularity = "day" | "week" | "month";

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
];

/** Cap rendered bars: wider ranges merge adjacent buckets so bars never
 *  collapse into thin needles. Labels span the merged window. */
const MAX_BINS = 32;

type BinnedBucket = { label: string; in: number; out: number };

function binBuckets(
  buckets: analysis.CashflowBucket[],
): BinnedBucket[] {
  const normalized = buckets.map((b) => ({
    raw: b.label,
    label: formatBucketLabel(b.label),
    in: b.in / 100,
    out: b.out / 100,
  }));
  if (normalized.length <= MAX_BINS) return normalized;
  const chunk = Math.ceil(normalized.length / MAX_BINS);
  const out: BinnedBucket[] = [];
  for (let i = 0; i < normalized.length; i += chunk) {
    const slice = normalized.slice(i, i + chunk);
    const first = slice[0];
    const last = slice[slice.length - 1];
    out.push({
      label: slice.length > 1 ? `${first.label}–${last.label}` : first.label,
      in: slice.reduce((n, s) => n + s.in, 0),
      out: slice.reduce((n, s) => n + s.out, 0),
    });
  }
  return out;
}

export function CashflowChart({
  buckets,
  granularity,
  onGranularityChange,
}: {
  buckets: analysis.CashflowBucket[];
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
}) {

  const chartData = useMemo(() => binBuckets(buckets), [buckets]);
  const { ref, inView } = useInView<HTMLDivElement>();
  // Draw-in animation, replayed whenever the dataset or cadence changes
  // (the key remounts the chart). Reduced motion disables it entirely, and
  // the chart only animates while it is actually on screen - off screen it
  // renders static instead of playing to completion in the background.
  const animate = !useReduceMotionEnabled() && inView;
  const animationKey = animate
    ? `${granularity}:${chartData.length}:${chartData[0]?.label ?? ""}:${chartData[chartData.length - 1]?.label ?? ""}`
    : "static";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Cashflow</CardTitle>
          </div>
          <div className="flex gap-1">
            {GRANULARITIES.map((g) => (
              <button
                key={g.key}
                type="button"
                aria-pressed={granularity === g.key}
                className={cn("tile", granularity === g.key && "tile-active")}
                onClick={() => {
                  vibrateIfEnabled(8);
                  onGranularityChange(g.key);
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={ref}>
          <ChartContainer config={chartConfig} className="h-75 w-full">
          <BarChart
            key={animationKey}
            data={chartData}
            margin={{ left: 4, right: 8, top: 8 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={96}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => formatMoney(v * 100)}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{
                            background:
                              name === "in"
                                ? "var(--color-in)"
                                : "var(--color-out)",
                          }}
                        />
                        {name === "in" ? "In" : "Out"}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(Number(value) * 100)}
                      </span>
                    </span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={700}
              animationEasing="ease-out"
              dataKey="in"
              fill="var(--color-in)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              isAnimationActive={animate}
              animationDuration={700}
              animationEasing="ease-out"
              dataKey="out"
              fill="var(--color-out)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
