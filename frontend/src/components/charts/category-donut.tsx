import { Cell, Pie, PieChart } from "recharts";

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
import { formatMoney } from "@/lib/format";
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function CategoryDonut({
  categories,
  onSelectCategory,
}: {
  categories: analysis.CategoryTotal[];
  onSelectCategory?: (category: string) => void;
}) {
  // Doughnut reads best with absolute magnitudes; sign is shown in the tooltip.
  const data = categories.map((c) => ({
    name: c.name,
    value: Math.abs(c.amount) / 100,
    signed: c.amount,
    count: c.count,
  }));
  const config = Object.fromEntries(
    categories.map((c, i) => [
      c.name,
      { label: c.name, color: COLORS[i % COLORS.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the money went</CardTitle>
        <CardDescription>
          Spending by category, share of volume. Click a segment to see its
          transactions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="mx-auto h-75 w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(_, name, item) => {
                    const p = item?.payload as
                      { signed: number; count: number } | undefined;
                    return (
                      <span className="flex w-full items-center justify-between gap-4">
                        <span>{name}</span>
                        <span className="font-mono tabular-nums">
                          {formatMoney(p?.signed ?? 0)} · {p?.count ?? 0} txs
                        </span>
                      </span>
                    );
                  }}
                />
              }
            />
            <ChartLegend
              content={
                <ChartLegendContent
                  nameKey="name"
                  className="flex-wrap gap-x-3 gap-y-2 text-xs sm:gap-x-4"
                />
              }
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={95}
              paddingAngle={2}
              strokeWidth={2}
              stroke="var(--background)"
              isAnimationActive={false}
              className={
                onSelectCategory
                  ? "cursor-pointer outline-hidden"
                  : "outline-hidden"
              }
              onClick={(_: unknown, index: number) => {
                const entry = data[index];
                if (entry && onSelectCategory) onSelectCategory(entry.name);
              }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
