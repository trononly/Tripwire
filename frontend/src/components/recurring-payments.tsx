import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Receipt, Smartphone, Store, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecurringPlanSheet } from "@/components/recurring-plan-sheet";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import {
  billKey,
  dueLabel,
  loadDismissedBills,
  nextDue,
  planAmountShillings,
  planCoversDetected,
  planFromDetected,
  planScript,
  planTarget,
  reminderLabel,
  saveDismissedBills,
  toPlanLike,
  type AmountBand,
  type LastPaid,
  type PlanDraft,
  type PlanLike,
} from "@/lib/recurring-plans";
import { formatMoney, formatMoneyShort, formatFullDate } from "@/lib/format";
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import { isValidAmount } from "@/lib/ussd-menus";
import { typeStyle } from "@/lib/transaction-types";
import type { RecurringPayment } from "../../bindings/mpesa-analyzer/internal/recurring/models";
import type { RecurringPlan } from "../../bindings/mpesa-analyzer/internal/store/models";

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

function planIcon(kind: string) {
  switch (kind) {
    case "paybill":
      return Receipt;
    case "till":
      return Store;
    case "pochi":
      return Smartphone;
    default:
      return Banknote;
  }
}

function byRelevance(a: RecurringPayment, b: RecurringPayment): number {
  if (a.count !== b.count) return b.count - a.count;
  if (a.amount !== b.amount) return b.amount - a.amount;
  return a.counterparty.localeCompare(b.counterparty);
}

const STATUS_TEXT: Record<string, string> = {
  starting: "Opening the M-PESA menu…",
  step: "Filling the menu…",
  "awaiting-pin": "Enter your M-PESA PIN in the phone dialog.",
  complete: "Menu ready - finish with your PIN.",
  aborted: "Payment stopped.",
};

export interface RecurringPaymentsProps {
  /** Detector output, already scoped by the Insights month filter. */
  payments: RecurringPayment[];
  /** The user's own plans. */
  plans: RecurringPlan[];
  /** Last paid per plan id, matched against the active statements. */
  lastPaid: Record<string, LastPaid | null>;
  /** Amount bands per detected bill key, for wide amount ranges. */
  bands?: Record<string, AmountBand[]>;
  loading?: boolean;
  /** The SIM of the wallet selected in the header, or null in statements mode. */
  simKey?: string | null;
  onSavePlan: (draft: PlanDraft, id: string | null) => Promise<boolean>;
  onDeletePlan: (id: string) => Promise<boolean>;
}

/**
 * Recurring payments: the payments you set up are the card, with Play and
 * reminders. Detected bills are suggestions below them, not another kind of
 * payment page - they either become a plan or get dismissed. No "Yours" /
 * "Detected" badges: where a row sits already says what it is.
 */
export function RecurringPayments({
  payments,
  plans,
  lastPaid,
  bands = {},
  loading,
  simKey,
  onSavePlan,
  onDeletePlan,
}: RecurringPaymentsProps) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissedBills());

  const planRows = useMemo(
    () =>
      plans
        .map((plan) => ({
          plan,
          lastPaid: lastPaid[plan.id] ?? null,
          due: nextDue(toPlanLike(plan)),
        }))
        .sort((a, b) => a.due.getTime() - b.due.getTime()),
    [plans, lastPaid],
  );

  const suggestions = useMemo(
    () =>
      payments
        .filter((payment) => !dismissed.includes(billKey(payment)))
        .slice()
        .sort(byRelevance),
    [payments, dismissed],
  );

  const reduceMotion = useReduceMotionEnabled();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringPlan | null>(null);
  const [prefill, setPrefill] = useState<PlanDraft | null>(null);
  const [paying, setPaying] = useState<RecurringPlan | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [runningPlan, setRunningPlan] = useState<string | null>(null);
  const qe = useQuickEntry();

  // Adding or removing a plan changes the page count; start from the first.
  useEffect(() => {
    setIndex(0);
    scroller.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [planRows.length]);

  // The scroller is a flex row, so by default it is as tall as the tallest
  // page. Match the active page's height instead; ResizeObserver keeps it in
  // step when a page grows (the Pay progress line).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const slides = Array.from(el.children) as HTMLElement[];
    const measure = () => {
      const slide = slides[Math.min(index, slides.length - 1)];
      if (slide) setPageHeight(slide.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [index, planRows]);

  useEffect(() => {
    if (qe.status === "aborted") {
      toast.error(qe.reason ? `Payment stopped: ${qe.reason}` : "Payment stopped.");
      setRunningPlan(null);
    }
    if (qe.status === "complete") setRunningPlan(null);
  }, [qe.status, qe.reason]);

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.max(0, Math.min(planRows.length - 1, i));
    el.scrollTo({
      left: next * el.clientWidth,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setIndex(next);
  }

  function openAdd() {
    setEditing(null);
    setPrefill(null);
    setSheetOpen(true);
  }

  function openEdit(plan: RecurringPlan) {
    setEditing(plan);
    setPrefill(null);
    setSheetOpen(true);
  }

  function openTrack(payment: RecurringPayment, amount?: number) {
    setEditing(null);
    setPrefill(planFromDetected(payment, amount));
    setSheetOpen(true);
  }

  function dismiss(payment: RecurringPayment) {
    const next = [...dismissed, billKey(payment)];
    setDismissed(next);
    saveDismissedBills(next);
  }

  function openPay(plan: RecurringPlan) {
    setPaying(plan);
    setPayError(null);
    setPayAmount(
      planAmountShillings(toPlanLike(plan), lastPaid[plan.id]?.amount ?? 0),
    );
  }

  function startPayment() {
    if (!paying) return;
    if (!isValidAmount(payAmount)) {
      setPayError("Enter a whole-shilling amount between 1 and 500,000.");
      return;
    }
    const script = planScript(toPlanLike(paying), payAmount.trim());
    if (!script) {
      setPayError("This payment's details are incomplete. Edit it first.");
      return;
    }
    setRunningPlan(paying.id);
    setPaying(null);
    setPayError(null);
    qe.start(script, simKey);
  }

  const busy = runningPlan !== null;
  const activeStatus = runningPlan ? STATUS_TEXT[qe.status] ?? null : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Recurring payments</CardTitle>
        <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </CardHeader>

      <CardContent>
        {loading && planRows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading your payments…
          </p>
        ) : planRows.length === 0 ? (
          <div className="space-y-3 py-5 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing set up yet.
            </p>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="size-4" aria-hidden />
              Add a payment
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <div
                ref={scroller}
                style={pageHeight ? { height: pageHeight } : undefined}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.clientWidth === 0) return;
                  const next = Math.round(el.scrollLeft / el.clientWidth);
                  if (next !== index) setIndex(next);
                }}
                className={`flex items-start snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                  reduceMotion ? "" : "transition-[height] duration-200 ease-out"
                }`}
                aria-live="polite"
              >
                {planRows.map((row) => (
                  <div key={row.plan.id} className="min-w-full snap-center">
                    <PlanPage
                      plan={row.plan}
                      lastPaid={row.lastPaid}
                      due={row.due}
                      status={runningPlan === row.plan.id ? activeStatus : null}
                      busy={busy}
                      onPlay={() => openPay(row.plan)}
                      onEdit={() => openEdit(row.plan)}
                    />
                  </div>
                ))}
              </div>

              {planRows.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous payment"
                    disabled={index <= 0}
                    onClick={() => goTo(index - 1)}
                    className="absolute top-1/2 left-0 hidden size-8 -translate-y-1/2 md:inline-flex"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next payment"
                    disabled={index >= planRows.length - 1}
                    onClick={() => goTo(index + 1)}
                    className="absolute top-1/2 right-0 hidden size-8 -translate-y-1/2 md:inline-flex"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              )}
            </div>

            {planRows.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-4">
                {planRows.map((row, i) => (
                  <button
                    key={row.plan.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`${row.plan.name}, ${i + 1} of ${planRows.length}`}
                    aria-current={i === index ? "true" : undefined}
                    className="group -m-2 p-2"
                  >
                    <span
                      className={`block h-1.5 rounded-full transition-all ${
                        i === index
                          ? "w-5 bg-foreground"
                          : "w-1.5 bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {suggestions.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">
              From your statements
            </p>
            {suggestions.map((payment) => (
              <SuggestionRow
                key={billKey(payment)}
                payment={payment}
                plans={plans}
                bands={bands[billKey(payment)] ?? []}
                onTrack={(amount) => openTrack(payment, amount)}
                onDismiss={() => dismiss(payment)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <RecurringPlanSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        plan={editing}
        prefill={prefill}
        plans={plans}
        onSave={onSavePlan}
        onDelete={onDeletePlan}
        onEditPlan={(next) => {
          setEditing(next);
          setPrefill(null);
        }}
      />

      <Drawer open={paying !== null} onOpenChange={(open) => !open && setPaying(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{paying?.name ?? "Pay"}</DrawerTitle>
            <DrawerDescription>
              {paying ? planTarget(toPlanLike(paying)) : ""}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 px-4 pb-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount (KES)</Label>
              <Input
                id="pay-amount"
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  setPayError(null);
                }}
                inputMode="numeric"
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                *334# opens on the selected wallet; enter your PIN in the phone
                dialog.
              </p>
              {payError && <p className="text-sm text-destructive">{payError}</p>}
            </div>
          </div>

          <DrawerFooter>
            <Button type="button" onClick={startPayment} className="w-full">
              Open *334#
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}

function PlanPage({
  plan,
  lastPaid,
  due,
  status,
  busy,
  onPlay,
  onEdit,
}: {
  plan: RecurringPlan;
  lastPaid: LastPaid | null;
  due: Date;
  status: string | null;
  busy: boolean;
  onPlay: () => void;
  onEdit: () => void;
}) {
  const Icon = planIcon(plan.kind);
  const cadence = cadenceStyle(plan.cadence);
  const amount = plan.amount > 0 ? plan.amount : lastPaid?.amount ?? null;

  return (
    <div className="space-y-4 px-1 py-1">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={plan.name}>
            {plan.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {planTarget(toPlanLike(plan))}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${plan.name}`}
          onClick={onEdit}
          className="size-8 shrink-0"
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {amount !== null ? formatMoney(amount) : "Variable amount"}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cadence.className}`}>
          {cadence.label}
        </span>
        {plan.amount === 0 && (
          <span className="text-xs text-muted-foreground">asked each time</span>
        )}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Last paid</p>
          <p className="truncate">
            {lastPaid
              ? `${formatFullDate(lastPaid.date)} · ${formatMoney(lastPaid.amount)}`
              : "Not paid yet"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{dueLabel(due)}</p>
          <p className="truncate">{reminderLabel(toPlanLike(plan))}</p>
        </div>
      </div>

      <Button onClick={onPlay} disabled={busy} className="w-full">
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Smartphone className="size-4" aria-hidden />
        )}
        {busy ? "Paying…" : "Pay now"}
      </Button>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

function SuggestionRow({
  payment,
  plans,
  bands,
  onTrack,
  onDismiss,
}: {
  payment: RecurringPayment;
  plans: RecurringPlan[];
  bands: AmountBand[];
  onTrack: (amount?: number) => void;
  onDismiss: () => void;
}) {
  const { icon: Icon, label: method } = typeStyle(payment.type);
  const cadence = cadenceStyle(payment.cadence);
  const variable = payment.amountMin !== payment.amountMax;
  const isTracked = (amount?: number) =>
    plans.some((plan) =>
      planCoversDetected(toPlanLike(plan), payment, amount),
    );

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <Icon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={payment.counterparty}>
            {payment.counterparty}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {method} · {payment.count} {payment.count === 1 ? "payment" : "payments"} ·{" "}
            {cadence.label}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Hide ${payment.counterparty}`}
          onClick={onDismiss}
          className="-mt-1 -mr-1 size-8 shrink-0 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm tabular-nums">
          {variable
            ? `${formatMoneyShort(payment.amountMin)}–${formatMoneyShort(payment.amountMax)}`
            : formatMoneyShort(payment.amount)}
        </span>
        <span className="text-xs text-muted-foreground">
          last paid {formatFullDate(payment.lastDate)}
        </span>
      </div>

      {bands.length > 1 ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {bands.map((band) => {
            const tracked = isTracked(band.amount);
            return (
              <button
                key={`${band.min}-${band.max}`}
                type="button"
                onClick={() => onTrack(band.amount)}
                disabled={tracked}
                className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                  tracked
                    ? "border-border/60 text-muted-foreground"
                    : "border-border hover:bg-muted/60"
                }`}
              >
                <span className="text-xs tabular-nums">
                  {band.min === band.max
                    ? formatMoneyShort(band.amount)
                    : `${formatMoneyShort(band.min)}–${formatMoneyShort(band.max)}`}
                  <span className="text-muted-foreground"> · {band.count}</span>
                </span>
                {tracked ? (
                  <Check className="size-3.5 shrink-0" aria-label="Tracked" />
                ) : (
                  <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTrack()}
          className="mt-2 w-full gap-1.5"
        >
          {isTracked() ? (
            <>
              <Check className="size-4" aria-hidden />
              Tracked - add another
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden />
              Track this
            </>
          )}
        </Button>
      )}
    </div>
  );
}
