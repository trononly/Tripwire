import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDay, formatMoney } from "@/lib/format";
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const chartConfig = {
  balance: { label: "Balance" },
} satisfies ChartConfig;

export function BalanceChart({ data }: { data: analysis.BalancePoint[] }) {
  const points = useMemo(
    () =>
      data.map((p) => ({
        time: p.time,
        balance: p.balance / 100,
      })),
    [data],
  );
  console.log("[BalanceChart] points:", points.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance Trajectory</CardTitle>
        <CardDescription>
          Your account balance across the statement period
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-75 w-full">
          <AreaChart data={points} margin={{ left: 8, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.45}
                />
                <stop
                  offset="95%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tickFormatter={formatDay}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={96}
              tickFormatter={(v: number) => formatMoney(v * 100)}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    formatDay(payload?.[0]?.payload?.time ?? "")
                  }
                  formatter={(value) => formatMoney(Number(value) * 100)}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="balance"
              type="monotone"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#balanceFill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
