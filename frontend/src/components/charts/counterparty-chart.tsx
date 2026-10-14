import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import { formatMoney } from "@/lib/format";
import { isAndroidBridge } from "@/lib/sms-bridge";
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const chartConfig = {
  count: { label: "Transactions", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CounterpartyChart({
  counterparties,
  onSelectCounterparty,
}: {
  counterparties: analysis.Counterparty[];
  onSelectCounterparty?: (name: string) => void;
}) {
  // Backend is sorted by count descending; recharts renders vertical-layout
  // bars bottom-up, so feed the data as-is to get the biggest bar on top.
  const data = counterparties.map((c) => ({
    name: c.name,
    count: c.count,
    amount: c.amount,
    in: c.in,
    out: c.out,
  }));

  // Reserve just enough axis room for the longest name instead of
  // truncating long labels with a fixed width.
  const maxNameLen = Math.max(10, ...data.map((d) => d.name.length));
  const axisWidth = Math.min(200, Math.max(80, maxNameLen * 6 + 8));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Counterparties</CardTitle>
        <CardDescription>
          {isAndroidBridge() ? "Tap" : "Click"} a bar to see its transactions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-75 w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 24, top: 8 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={axisWidth}
              tickMargin={4}
            />
            {/* No hover tooltip on touch devices: it spawns at the tap
                point and slides off-screen, and the tap itself already
                navigates to these transactions. */}
            {!isAndroidBridge() && (
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(_, __, item) => {
                    const p = item?.payload as
                      { in: number; out: number } | undefined;
                    if (!p) return null;
                    // Show the direction breakdown; a flat net of KSh 0.00
                    // (e.g. sent + received the same amount) is meaningless.
                    const parts: string[] = [];
                    if (p.in > 0) parts.push(`In ${formatMoney(p.in)}`);
                    if (p.out > 0) parts.push(`Out ${formatMoney(p.out)}`);
                    return (
                      <span className="flex w-full max-w-[calc(100vw-4rem)] flex-col gap-0.5 break-words">
                        <span className="font-medium">
                          {(item?.payload as { name: string })?.name}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {parts.length > 0
                            ? parts.join(" · ")
                            : "No money flow"}
                          {" · "}
                          {item?.value} txs
                        </span>
                      </span>
                    );
                  }}
                />
              }
            />
            )}
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              barSize={16}
              className={
                onSelectCounterparty
                  ? "cursor-pointer outline-hidden"
                  : "outline-hidden"
              }
              onClick={(_: unknown, index: number) => {
                const entry = data[index];
                if (entry && onSelectCounterparty)
                  onSelectCounterparty(entry.name);
              }}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
