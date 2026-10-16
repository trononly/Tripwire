import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { typeStyle } from "@/lib/transaction-types";
import { formatMoney, formatMoneyShort, formatFullDate } from "@/lib/format";
import type * as recurring from "../../bindings/mpesa-analyzer/internal/recurring/models";

const cadenceStyles: Record<string, { label: string; className: string }> = {
  weekly: {
    label: "Weekly",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  "bi-weekly": {
    label: "Bi-weekly",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  monthly: {
    label: "Monthly",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  quarterly: {
    label: "Quarterly",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
};

function cadenceStyle(cadence: string) {
  return (
    cadenceStyles[cadence] ?? {
      label: cadence,
      className: "bg-muted text-muted-foreground",
    }
  );
}

function byRelevance(
  a: recurring.RecurringPayment,
  b: recurring.RecurringPayment,
): number {
  if (a.count !== b.count) return b.count - a.count;
  if (a.amount !== b.amount) return b.amount - a.amount;
  return a.counterparty.localeCompare(b.counterparty);
}

function PaymentItem({ payment }: { payment: recurring.RecurringPayment }) {
  const { icon: Icon } = typeStyle(payment.type);
  const cadence = cadenceStyle(payment.cadence);
  const variable = payment.amountMin !== payment.amountMax;

  return (
    <div
      className="
        grid gap-3 bg-muted/40 p-4
        transition-colors hover:bg-muted/60

        md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]
        md:items-center
        md:gap-x-5
        md:px-5
      "
    >
      {/* Counterparty */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className="size-[18px] shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />

          <span
            className="truncate text-sm font-medium"
            title={payment.counterparty}
          >
            {payment.counterparty}
          </span>
        </div>

        {/* Mobile-only secondary information */}
        <div className="mt-2 flex items-center gap-2 md:hidden">
          <span
            className={`rounded-full px-2 py-[3px] text-[11px] font-medium ${cadence.className}`}
          >
            {cadence.label}
          </span>

          <span className="text-xs text-muted-foreground">
            {payment.count} {payment.count === 1 ? "payment" : "payments"}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="min-w-0">
        <p className="text-base font-semibold whitespace-nowrap tabular-nums">
          {formatMoney(payment.amount)}
        </p>

        <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
          {variable
            ? `${formatMoneyShort(payment.amountMin)}–${formatMoneyShort(payment.amountMax)}`
            : "Fixed amount"}
        </p>
      </div>

      {/* Cadence */}
      <div className="hidden md:block">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${cadence.className}`}
        >
          {cadence.label}
        </span>
      </div>

      {/* Frequency */}
      <div className="hidden md:block">
        <p className="text-sm whitespace-nowrap tabular-nums">
          {payment.count} {payment.count === 1 ? "payment" : "payments"}
        </p>
      </div>

      {/* Last paid */}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Last paid</p>
        <p className="truncate text-sm whitespace-nowrap">
          {formatFullDate(payment.lastDate)}
        </p>
      </div>
    </div>
  );
}

export function RecurringPayments({
  payments,
}: {
  payments: recurring.RecurringPayment[];
}) {
  const sorted = useMemo(() => [...payments].sort(byRelevance), [payments]);
  // Pager, not a scrolling list: one bill at a time with left/right
  // stepping and a position readout.
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [payments]);
  const current = sorted[Math.min(index, sorted.length - 1)];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Recurring payments</CardTitle>
        {sorted.length > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous bill"
              disabled={index <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="size-8"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
              {Math.min(index, sorted.length - 1) + 1} of {sorted.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next bill"
              disabled={index >= sorted.length - 1}
              onClick={() =>
                setIndex((i) => Math.min(sorted.length - 1, i + 1))
              }
              className="size-8"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {sorted.length === 0 || !current ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No recurring payments detected.
            <br />
            We&rsquo;ll show recurring payments here once your statement
            contains enough consistent payment history.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Desktop column labels */}
            <div
              className="
                hidden px-5 pb-1 text-xs font-medium
                text-muted-foreground
                md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]
                md:gap-3 md:gap-x-5
              "
            >
              <span>Payment</span>
              <span>Amount</span>
              <span>Cadence</span>
              <span>Frequency</span>
              <span>Last paid</span>
            </div>

            <PaymentItem key={current.counterparty} payment={current} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
