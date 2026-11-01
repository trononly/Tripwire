import { formatDay, formatMoney } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { useInView } from "@/hooks/use-in-view";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { useReveal } from "@/lib/privacy-mode";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import type * as analysis from "../../bindings/mpesa-analyzer/internal/analysis/models";

type Tone = "in" | "out" | "neutral";

function KpiCell({
  label,
  value,
  hint,
  tone = "neutral",
  emphasis,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  /** "primary" = the answer figure; "secondary" = a sibling. */
  emphasis?: "primary" | "secondary";
  className?: string;
}) {
  const { blurred, reveal } = useReveal();
  const isPrimary = emphasis === "primary";
  const toneClass =
    tone === "in"
      ? "text-money-in"
      : tone === "out"
        ? "text-money-out"
        : "text-foreground";
  return (
    <div
      className={cn(
        "min-w-0 bg-card px-4 py-4 sm:px-5",
        blurred && "cursor-pointer",
        className,
      )}
      onClick={reveal}
      role={blurred ? "button" : undefined}
      tabIndex={blurred ? 0 : undefined}
      aria-label={blurred ? `Reveal ${label}` : undefined}
      onKeyDown={(e) => {
        if (blurred && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          reveal();
        }
      }}
    >
      <p className="truncate text-[13px] font-medium text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "num mt-1.5 whitespace-nowrap font-semibold tracking-tight",
          isPrimary
            ? "text-[clamp(20px,6vw,30px)] leading-none"
            : "text-[clamp(16px,4.6vw,20px)] leading-tight",
          toneClass,
        )}
      >
        <span
          aria-hidden={blurred || undefined}
          className={cn(
            "inline-block transition-[filter,opacity] duration-200",
            blurred && "blur-[7px] select-none opacity-80",
          )}
        >
          {value}
        </span>
      </p>
      {hint ? (
        <p className="mt-1.5 truncate text-[12px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TotalsCards({
  totals,
  currentBalance,
  asOf,
}: {
  totals: analysis.Totals | null;
  currentBalance?: number;
  asOf?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ once: true });
  const totalIn = useCountUp(totals?.totalIn ?? 0, 800, inView);
  const totalOut = useCountUp(totals?.totalOut ?? 0, 800, inView);
  const netValue = totals?.net ?? (totals?.totalIn ?? 0) - (totals?.totalOut ?? 0);
  const net = useCountUp(netValue, 800, inView);
  const closingBalance = useCountUp(
    currentBalance ?? totals?.closingBalance ?? 0,
    800,
    inView,
  );
  const fees = totals?.totalFees ?? 0;

  useEffect(() => {
    if (!totals) return;
    vibrateIfEnabled(12);
  }, [totals]);

  if (!totals) {
    return (
      <div ref={ref} className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
        {["Balance", "Money in", "Money out", "Net"].map((l) => (
          <KpiCell key={l} label={l} value="—" hint="No data yet" />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-px overflow-hidden border bg-border lg:grid-cols-4"
    >
      <KpiCell
        label="Balance"
        value={formatMoney(closingBalance)}
        hint={asOf ? `as of ${formatDay(asOf)}` : "Latest transaction"}
        emphasis="primary"
      />
      <KpiCell
        label="Money in"
        value={formatMoney(totalIn)}
        tone="in"
        emphasis="secondary"
      />
      <KpiCell
        label="Money out"
        value={formatMoney(totalOut)}
        hint={fees > 0 ? `+ ${formatMoney(fees)} M-Pesa fees` : undefined}
        tone="out"
        emphasis="secondary"
      />
      <KpiCell
        label="Net"
        value={formatMoney(net)}
        hint={fees > 0 ? "after fees" : "in − out"}
        tone={netValue < 0 ? "out" : "neutral"}
        emphasis="secondary"
      />
    </div>
  );
}
