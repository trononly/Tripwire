import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import { safeFormatTick, safeFormatFull } from "@/lib/safe-date";
import { useReduceMotionEnabled } from "@/lib/motion-settings";
// safe-date import if needed
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const chartConfig = {
  balance: { label: "Balance" },
} satisfies ChartConfig;

export function BalanceChart({ data }: { data: analysis.BalancePoint[] }) {
  const points = useMemo(() => {
    // Group intraday transactions by calendar day, keeping end-of-day
    // closing balance for each date.
    const byDay = new Map<string, analysis.BalancePoint>();
    for (const p of data) {
      const day = (p.time ?? "").slice(0, 10);
      if (!day) continue;
      byDay.set(day, p);
    }
    return Array.from(byDay.values())
      .map((p) => ({
        date: p.time,
        balance: p.balance / 100,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data]);
  // Draw-in animation, replayed whenever the dataset changes (the key
  // remounts the chart). Reduced motion disables it entirely and keeps the
  // key stable so nothing replays.
  const animate = !useReduceMotionEnabled();
  const animationKey = animate
    ? `${points.length}:${points[0]?.date ?? ""}:${points[points.length - 1]?.date ?? ""}`
    : "static";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance Trajectory</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full h-[220px]">
          <AreaChart
            key={animationKey}
            data={points}
            margin={{ left: 8, right: 8, top: 8 }}
          >
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.45}
                />
                <stop
                  offset="95%"
                  stopColor="var(--primary)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              hide={false}
              tickFormatter={(val) => safeFormatTick(String(val ?? ""))}
              stroke="var(--muted-foreground)"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={{ stroke: "var(--muted-foreground)" }}
              fontSize={11}
              interval="preserveStartEnd"
              minTickGap={35}
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
                  labelFormatter={(label) =>
                    safeFormatFull(String(label ?? ""))
                  }
                  formatter={(value) => formatMoney(Number(value) * 100)}
                />
              }
            />
            <Area
              dataKey="balance"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#balanceFill)"
              isAnimationActive={animate}
              animationDuration={700}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
