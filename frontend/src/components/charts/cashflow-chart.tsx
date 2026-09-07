import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function CashflowChart({
  buckets,
  granularity,
  onGranularityChange,
}: {
  buckets: analysis.CashflowBucket[];
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
}) {
  const data = buckets.map((b) => ({ ...b, label: formatBucketLabel(b.label), in: b.in / 100, out: b.out / 100 }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Cashflow</CardTitle>
            <CardDescription>Money in vs out over time</CardDescription>
          </div>
          <div className="flex gap-1">
            {GRANULARITIES.map((g) => (
              <Button
                key={g.key}
                size="sm"
                variant={granularity === g.key ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => onGranularityChange(g.key)}
              >
                {g.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={96}
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
                          style={{ background: name === "in" ? "var(--color-in)" : "var(--color-out)" }}
                        />
                        {name === "in" ? "In" : "Out"}
                      </span>
                      <span className="font-mono tabular-nums">{formatMoney(Number(value) * 100)}</span>
                    </span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="in" fill="var(--color-in)" radius={[4, 4, 0, 0]} animationDuration={700} />
            <Bar dataKey="out" fill="var(--color-out)" radius={[4, 4, 0, 0]} animationDuration={700} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
