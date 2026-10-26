import type { ReactNode } from "react";
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
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import { useInView } from "@/hooks/use-in-view";

/**
 * One slice, already normalized by the caller. The built-in M-Pesa
 * categories and the user's own categories share this shape, so the chart
 * stays dumb about where a slice came from. `key` is what a tap returns
 * (a built-in category name, a category id, or "none" for unlabelled).
 */
export type DonutSlice = {
  key: string;
  label: string;
  /** Signed cents; the slice size uses the magnitude. */
  amount: number;
  count: number;
};

// Fixed color per built-in category: adjacent slices never share a hue
// family, and "Other" is always gray. A hand map beats palette cycling -
// cycling put Airtime and Receive on neighboring greens.
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

// User categories have no fixed map, so they cycle a wider palette by slice
// position. Sized so a full category list never runs out of distinct hues.
const FALLBACK_COLORS = [
  "oklch(0.65 0.18 150)",
  "oklch(0.75 0.15 80)",
  "oklch(0.65 0.20 55)",
  "oklch(0.72 0.16 125)",
  "oklch(0.68 0.18 350)",
  "oklch(0.70 0.15 200)",
  "oklch(0.55 0.22 260)",
  "oklch(0.65 0.20 300)",
  "oklch(0.62 0.20 25)",
  "oklch(0.66 0.14 100)",
  "oklch(0.72 0.12 320)",
  "oklch(0.60 0.02 250)",
];

/** Unlabelled rows: the one slice that is deliberately colorless. */
const UNCATEGORIZED_COLOR = "oklch(0.60 0.02 250)";

function colorFor(slice: DonutSlice, index: number) {
  if (slice.key === "none") return UNCATEGORIZED_COLOR;
  return (
    CATEGORY_COLORS[slice.label] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

export function CategoryDonut({
  slices,
  onSelectSlice,
  toolbar,
  footer,
  empty,
  description,
}: {
  slices: DonutSlice[];
  onSelectSlice?: (key: string) => void;
  /** The M-Pesa / My categories switch, rendered beside the title. */
  toolbar?: ReactNode;
  /** Rendered under the chart (the Manage link in the custom view). */
  footer?: ReactNode;
  /** Replaces the chart when there is nothing to draw. */
  empty?: ReactNode;
  description?: string;
}) {
  // Doughnut reads best with absolute magnitudes; sign is shown in the tooltip.
  const data = slices.map((s) => ({
    name: s.label,
    value: Math.abs(s.amount) / 100,
    signed: s.amount,
    count: s.count,
    key: s.key,
  }));
  const config = Object.fromEntries(
    slices.map((s, i) => [
      s.label,
      { label: s.label, color: colorFor(s, i) },
    ]),
  ) satisfies ChartConfig;
  // Draw-in animation, replayed whenever the category mix changes (the key
  // remounts the chart). Reduced motion disables it entirely, and it draws in
  // once, the first time it is on screen: scrolling away and back must not
  // keep replaying it.
  const { ref, inView } = useInView<HTMLDivElement>({ once: true });
  const animate = !useReduceMotionEnabled() && inView;
  const animationKey = animate
    ? data.map((d) => `${d.name}:${d.value}`).join("|")
    : "static";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>By category</CardTitle>
          {toolbar}
        </div>
        <CardDescription>
          {description ??
            `${isAndroidBridge() ? "Tap" : "Click"} a segment to see its transactions.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={ref}>
          {empty ? (
            empty
          ) : (
            <ChartContainer config={config} className="mx-auto h-75 w-full">
              <PieChart key={animationKey}>
                {/* Touch devices get no hover tooltip (same off-screen
                    issue as counterparties); tapping a segment navigates
                    instead. */}
                {!isAndroidBridge() && (
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(_, name, item) => {
                          const p = item?.payload as
                            | { signed: number; count: number }
                            | undefined;
                          return (
                            <span className="flex w-full items-center justify-between gap-4">
                              <span>{name}</span>
                              <span className="font-mono tabular-nums">
                                {formatMoney(p?.signed ?? 0)} · {p?.count ?? 0}{" "}
                                txs
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
                  isAnimationActive={animate}
                  animationDuration={700}
                  animationEasing="ease-out"
                  className={
                    onSelectSlice
                      ? "cursor-pointer outline-hidden"
                      : "outline-hidden"
                  }
                  onClick={(_: unknown, index: number) => {
                    const entry = data[index];
                    if (entry && onSelectSlice) onSelectSlice(entry.key);
                  }}
                >
                  {data.map((d, i) => (
                    <Cell key={d.key} fill={colorFor(slices[i], i)} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}
