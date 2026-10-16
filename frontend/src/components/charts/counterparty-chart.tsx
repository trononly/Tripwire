import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

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
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import type * as analysis from "../../../bindings/mpesa-analyzer/internal/analysis/models";

const chartConfig = {
  volume: { label: "Volume", color: "var(--brand)" },
} satisfies ChartConfig;

/** Axis display name: tills, accounts, phone masks and trailing counters
 *  crowd a 12px axis, so numeric tokens go. The full name still drives
 *  filtering, tooltips and navigation.
 */
export function counterpartyDisplayName(name: string): string {
  const kept = name
    .split(/\s+/)
    .filter(
      (tok) => tok !== "" && !/[\d]/.test(tok) && !/^acc\.?$/i.test(tok),
    );
  return kept.length > 0 ? kept.join(" ") : name;
}

/** Split a display name into at most two balanced lines for the axis tick. */
export function counterpartyLabelLines(name: string): string[] {
  const display = counterpartyDisplayName(name);
  const words = display.split(" ").filter(Boolean);
  if (words.length < 2 || display.length <= 16) return [display];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(
      display.length / 2 - words.slice(0, i).join(" ").length,
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")].map(
    (line) => (line.length > 20 ? `${line.slice(0, 19)}…` : line),
  );
}

/** Right-aligned axis tick rendering the wrapped display name. Recharts'
 *  default single-line tick clips long names against the chart edge; an
 *  explicit two-line tick never overflows the reserved width.
 */
function CounterpartyAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  const lines = counterpartyLabelLines(String(props.payload?.value ?? ""));
  return (
    <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
      <text textAnchor="end" fill="var(--muted-foreground)" fontSize={12}>
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={0}
            dy={i === 0 ? -(lines.length - 1) * 7.5 + 4 : 15}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function CounterpartyChart({
  counterparties,
  onSelectCounterparty,
}: {
  counterparties: analysis.Counterparty[];
  onSelectCounterparty?: (name: string) => void;
}) {
  // Ranked by total money moved (in + out), top 5 only: a slim leaderboard
  // of where the money actually goes. Recharts renders vertical-layout
  // bars bottom-up, so the pre-sorted array puts the biggest bar on top.
  const data = counterparties
    .map((c) => ({
      name: c.name,
      count: c.count,
      amount: c.amount,
      in: c.in,
      out: c.out,
      volume: c.in + c.out,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);
  // Traffic-scaled intensity: the heaviest flow glows full brand red,
  // lighter ones fade toward dull.
  const maxVolume = Math.max(1, ...data.map((d) => d.volume));
  const intensity = (volume: number) =>
    0.3 + 0.7 * (volume / maxVolume);

  // Reserve just enough axis room for the longest display line instead of
  // truncating long labels with a fixed width. Display names drop numeric
  // tokens, so they measure much shorter than the full names.
  const longestLine = Math.max(
    10,
    ...data.flatMap((d) =>
      counterpartyLabelLines(d.name).map((line) => line.length),
    ),
  );
  const axisWidth = Math.min(200, Math.max(80, longestLine * 7 + 12));
  // Draw-in animation, replayed whenever the leaderboard changes (the key
  // remounts the chart). Reduced motion disables it entirely and keeps the
  // key stable so nothing replays.
  const animate = !useReduceMotionEnabled();
  const animationKey = animate
    ? data.map((d) => `${d.name}:${d.volume}`).join("|")
    : "static";

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
            key={animationKey}
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
              hide
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={axisWidth}
              tickMargin={4}
              tick={<CounterpartyAxisTick />}
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
                      { in: number; out: number; count: number } | undefined;
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
                        <span className="tabular-nums text-muted-foreground">
                          {parts.length > 0
                            ? parts.join(" · ")
                            : "No money flow"}
                          {" · "}
                          {p.count} tx{p.count === 1 ? "" : "s"}
                        </span>
                      </span>
                    );
                  }}
                />
              }
            />
            )}
            <Bar
              dataKey="volume"
              fill="var(--color-volume)"
              radius={[0, 4, 4, 0]}
              isAnimationActive={animate}
              animationDuration={700}
              animationEasing="ease-out"
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
            >
              {data.map((d) => (
                <Cell
                  key={d.name}
                  fill="var(--color-volume)"
                  fillOpacity={intensity(d.volume)}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
