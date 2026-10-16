import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { isAndroidBridge } from "@/lib/sms-bridge";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";

/** Row granularity of the card: rank by money received or money sent. */
type Direction = "in" | "out";

/** The In/Out choice persists so the card reopens on the last view. */
const DIRECTION_KEY = "mpesa-analyzer.counterparty-direction";

function readDirection(): Direction {
  try {
    return localStorage.getItem(DIRECTION_KEY) === "in" ? "in" : "out";
  } catch {
    return "out";
  }
}

/** Display name: tills, accounts, phone masks and trailing counters crowd a
 *  row, so numeric tokens go. The number is surfaced on its own line; the
 *  full name still drives filtering and navigation.
 */
export function counterpartyDisplayName(name: string): string {
  const kept = name
    .split(/\s+/)
    .filter(
      (tok) =>
        tok !== "" &&
        /[a-z0-9]/i.test(tok) &&
        !/[\d]/.test(tok) &&
        !/^acc\.?$/i.test(tok),
    );
  return kept.length > 0 ? kept.join(" ") : name;
}

function CounterpartyRow({
  name,
  number,
  amount,
  count,
  direction,
  onSelect,
}: {
  name: string;
  number: string;
  amount: number;
  count: number;
  direction: Direction;
  onSelect?: (name: string) => void;
}) {
  const display = counterpartyDisplayName(name);
  // The number line always carries something: the reference when the
  // statement recorded one, otherwise how often this counterparty appears.
  const secondary =
    number !== "" && number !== display
      ? number
      : `${count} ${count === 1 ? "transaction" : "transactions"}`;
  return (
    <button
      type="button"
      data-testid="counterparty-row"
      onClick={() => {
        vibrateIfEnabled(8);
        onSelect?.(display);
      }}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{display}</span>
        <span className="block truncate text-xs tabular-nums text-muted-foreground">
          {secondary}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-sm font-medium tabular-nums",
          direction === "in"
            ? "text-emerald-600 dark:text-money-in"
            : "text-rose-600 dark:text-money-out",
        )}
      >
        {formatMoney(amount)}
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}

/**
 * Top Counterparties as a compact leaderboard: the five names the money
 * flowed to (or from) most in the current period, each linking into the
 * search filter. The In/Out toggle re-ranks by that direction's total.
 */
export function CounterpartyCard({
  counterparties,
  onSelectCounterparty,
}: {
  counterparties: analysis.Counterparty[];
  onSelectCounterparty?: (name: string) => void;
}) {
  const [direction, setDirectionState] = useState<Direction>(readDirection);

  // Remember the chosen direction across sessions instead of always
  // snapping back to the default "out" ranking.
  const setDirection = (next: Direction) => {
    setDirectionState(next);
    try {
      localStorage.setItem(DIRECTION_KEY, next);
    } catch {
      /* private mode: selection stays session-only */
    }
  };

  const data = useMemo(() => {
    return counterparties
      .map((c) => ({
        name: c.name,
        number: c.number ?? "",
        count: c.count,
        in: c.in,
        out: c.out,
        value: direction === "in" ? c.in : c.out,
      }))
      .filter((c) => c.value > 0)
      .sort(
        (a, b) =>
          b.value - a.value ||
          b.in + b.out - (a.in + a.out) ||
          b.count - a.count ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 5);
  }, [counterparties, direction]);

  const directions: { key: Direction; label: string }[] = [
    { key: "in", label: "Money in" },
    { key: "out", label: "Money out" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Top Counterparties</CardTitle>
            <CardDescription>
              {isAndroidBridge() ? "Tap" : "Click"} a name to see its
              transactions.
            </CardDescription>
          </div>
          <div className="flex gap-1" role="group" aria-label="Money direction">
            {directions.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={direction === d.key}
                className={cn("tile", direction === d.key && "tile-active")}
                onClick={() => {
                  vibrateIfEnabled(8);
                  setDirection(d.key);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {data.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No {direction === "in" ? "money received" : "money sent"} to a
            counterparty in this period.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {data.map((c) => (
              <CounterpartyRow
                key={c.name}
                name={c.name}
                number={c.number}
                amount={c.value}
                count={c.count}
                direction={direction}
                onSelect={onSelectCounterparty}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
