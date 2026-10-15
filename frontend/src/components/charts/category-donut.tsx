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
import { isAndroidBridge } from "@/lib/sms-bridge";
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

// Fixed color per category: adjacent slices never share a hue family, and
// "Other" is always gray. A hand map beats palette cycling — cycling put
// Airtime and Receive on neighboring greens.
const CATEGORY_COLORS: Record<string, string> = {
  Receive: "oklch(0.65 0.18 150)",
  "Send Money": "oklch(0.75 0.15 80)",
  "Pay Bill": "oklch(0.65 0.20 55)",
  Withdraw: "oklch(0.72 0.16 125)",
  "Buy Goods": "oklch(0.68 0.18 350)",
  Bundles: "oklch(0.70 0.15 200)",
  Airtime: "oklch(0.55 0.22 260)",
  "Bank & Savings": "oklch(0.65 0.20 300)",
  Fees: "oklch(0.62 0.20 25)",
  Other: "oklch(0.60 0.02 250)",
};
const FALLBACK_COLORS = [
  "oklch(0.65 0.18 150)",
  "oklch(0.65 0.18 255)",
  "oklch(0.75 0.15 80)",
  "oklch(0.68 0.18 350)",
];

function colorFor(name: string, index: number) {
  return (
    CATEGORY_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

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
      { label: c.name, color: colorFor(c.name, i) },
    ]),
  ) satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the money went</CardTitle>
        <CardDescription>
          {isAndroidBridge() ? "Tap" : "Click"} a segment to see its
          transactions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="mx-auto h-75 w-full">
          <PieChart>
            {/* Touch devices get no hover tooltip (same off-screen issue
                as counterparties); tapping a segment navigates instead. */}
            {!isAndroidBridge() && (
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
            )}
            <ChartLegend
              content={
                <ChartLegendContent
                  nameKey="name"
                  className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
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
              {data.map((d, i) => (
                <Cell key={i} fill={colorFor(d.name, i)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
