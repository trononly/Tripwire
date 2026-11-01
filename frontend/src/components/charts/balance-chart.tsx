import { Area, AreaChart, XAxis, YAxis } from "recharts";
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
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDay, formatMoney, formatMoneyShort } from "@/lib/format";
import { safeFormatTick, safeFormatFull } from "@/lib/safe-date";
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import { useInView } from "@/hooks/use-in-view";
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
  // remounts the chart). Reduced motion disables it entirely, and it draws in
  // once, the first time it is on screen - scrolling back does not replay it.
  const { ref, inView } = useInView<HTMLDivElement>({ once: true });
  const animate = !useReduceMotionEnabled() && inView;
  const animationKey = animate
    ? `${points.length}:${points[0]?.date ?? ""}:${points[points.length - 1]?.date ?? ""}`
    : "static";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Balance</CardTitle>
        {points.length > 1 ? (
          <CardDescription>
            {formatDay(points[0].date)} → {formatDay(points[points.length - 1].date)} ·{" "}
            {(() => {
              const delta =
                points[points.length - 1].balance - points[0].balance;
              if (delta === 0) return "no change";
              return `${delta > 0 ? "+" : "−"}${formatMoneyShort(
                Math.abs(delta) * 100,
              )}`;
            })()}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <div ref={ref}>
          <ChartContainer config={chartConfig} className="w-full h-[220px]">
          <AreaChart
            key={animationKey}
            data={points}
            margin={{ left: 8, right: 8, top: 8 }}
          >
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
              width={76}
              tickFormatter={(v: number) => formatMoneyShort(v * 100)}
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
              type="linear"
              stroke="var(--money-in)"
              strokeWidth={2}
              fill="var(--money-in)"
              fillOpacity={0.12}
              isAnimationActive={animate}
              animationDuration={700}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 4, fill: "var(--money-in)" }}
            />
          </AreaChart>
        </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
