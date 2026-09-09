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
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const chartConfig = {
  count: { label: "Transactions", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CounterpartyChart({
  counterparties,
}: {
  counterparties: analysis.Counterparty[];
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
  const axisWidth = Math.min(230, Math.max(100, maxNameLen * 7 + 20));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Counterparties</CardTitle>
        <CardDescription>
          People and businesses you transact with most
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-75 w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 4, right: 24, top: 8 }}
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
            />
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
                      <span className="flex w-full flex-col gap-0.5">
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
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              barSize={16}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
