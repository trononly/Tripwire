import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Receipt, Smartphone, Store, X } from "lucide-react";
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
  complete: "Menu ready — finish with your PIN.",
  aborted: "Payment stopped.",
};

/** One page of the pager: a user plan with its absorbed detection, or a
 * detected bill on its own. */
type Row =
  | {
      key: string;
      type: "plan";
      plan: RecurringPlan;
      lastPaid: LastPaid | null;
      due: Date;
    }
  | { key: string; type: "detected"; payment: RecurringPayment; due: Date };

function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded-full px-2 py-[3px] text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

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
 * Recurring payments card. Detected bills and the user's own plans share one
 * swipeable pager, so "what I pay" is a single list instead of two features.
 * A plan absorbs the detected bill with the same payee: the detection's stats
 * move onto the plan row and the plan's reminder/Play replace the read-only
 * view. Deleting the plan brings the detected row back.
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

  const rows = useMemo<Row[]>(() => {
    const planRows: Row[] = plans
      .map((plan) => ({
        key: `plan:${plan.id}`,
        type: "plan" as const,
        plan,
        lastPaid: lastPaid[plan.id] ?? null,
        due: nextDue(toPlanLike(plan)),
      }))
      .sort((a, b) => a.due.getTime() - b.due.getTime());

    const detectedRows: Row[] = payments
      .filter((payment) => !dismissed.includes(billKey(payment)))
      .slice()
      .sort(byRelevance)
      .map((payment) => ({
        key: `detected:${billKey(payment)}`,
        type: "detected" as const,
        payment,
        due: new Date(),
      }));

    return [...planRows, ...detectedRows];
  }, [payments, plans, lastPaid, dismissed]);

  function dismiss(payment: RecurringPayment) {
    const next = [...dismissed, billKey(payment)];
    setDismissed(next);
    saveDismissedBills(next);
    toast.success("Hidden. Add a plan any time with Add.");
  }

  const reduceMotion = useReduceMotionEnabled();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringPlan | null>(null);
  const [prefill, setPrefill] = useState<PlanDraft | null>(null);
  const [paying, setPaying] = useState<Extract<Row, { type: "plan" }> | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [runningPlan, setRunningPlan] = useState<string | null>(null);
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const qe = useQuickEntry();

  // A plan added or removed changes the page count; start from the first.
  useEffect(() => {
    setIndex(0);
    scroller.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [rows.length]);

  // The scroller is a flex row, so by default it is as tall as the tallest
  // page (which leaves a large hole under a short plan page). Match the
  // active page's height instead; ResizeObserver keeps it in step when a
  // page grows (a band list, the Pay progress line).
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
  }, [index, rows]);

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
    const next = Math.max(0, Math.min(rows.length - 1, i));
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

  function openEdit(row: Extract<Row, { type: "plan" }>) {
    setEditing(row.plan);
    setPrefill(null);
    setSheetOpen(true);
  }

  function openTrack(payment: RecurringPayment, amount?: number) {
    setEditing(null);
    setPrefill(planFromDetected(payment, amount));
    setSheetOpen(true);
  }

  function openPay(row: Extract<Row, { type: "plan" }>) {
    setPaying(row);
    setPayError(null);
    setPayAmount(
      planAmountShillings(
        toPlanLike(row.plan),
        row.lastPaid?.amount ?? 0,
      ),
    );
  }

  function startPayment() {
    if (!paying) return;
    if (!isValidAmount(payAmount)) {
      setPayError("Enter a whole-shilling amount between 1 and 500,000.");
      return;
    }
    const script = planScript(toPlanLike(paying.plan), payAmount.trim());
    if (!script) {
      setPayError("This payment's details are incomplete. Edit it first.");
      return;
    }
    setRunningPlan(paying.plan.id);
    setPaying(null);
    setPayError(null);
    qe.start(script, simKey);
  }

  const activeStatus = runningPlan ? STATUS_TEXT[qe.status] ?? null : null;
  const busy = runningPlan !== null;

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
        {loading && rows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading your payments…
          </p>
        ) : rows.length === 0 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No recurring payments yet.
            </p>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              Set up rent, tokens or a fixed transfer yourself. We also add
              bills we detect once your statements show enough history.
            </p>
            <Button size="sm" onClick={openAdd} className="gap-1.5">
              <Plus className="size-4" aria-hidden />
              Add your first payment
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              {/* Swipeable pages: one per payment, snapped by CSS. The pager
                  arrows stay for keyboard and desktop pointer users. */}
              <div
                ref={scroller}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.clientWidth === 0) return;
                  const next = Math.round(el.scrollLeft / el.clientWidth);
                  if (next !== index) setIndex(next);
                }}
                style={pageHeight ? { height: pageHeight } : undefined}
                className={`flex items-start snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                  reduceMotion ? "" : "transition-[height] duration-200 ease-out"
                }`}
                aria-live="polite"
              >
                {rows.map((row) => (
                  <div key={row.key} className="min-w-full snap-center">
                    {row.type === "plan" ? (
                      <PlanPage
                        row={row}
                        status={runningPlan === row.plan.id ? activeStatus : null}
                        busy={busy}
                        onPlay={() => openPay(row)}
                        onEdit={() => openEdit(row)}
                      />
                    ) : (
                      <DetectedPage
                        payment={row.payment}
                        bands={bands[billKey(row.payment)] ?? []}
                        onTrack={(amount) => openTrack(row.payment, amount)}
                        onDismiss={() => dismiss(row.payment)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {rows.length > 1 && (
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
                    disabled={index >= rows.length - 1}
                    onClick={() => goTo(index + 1)}
                    className="absolute top-1/2 right-0 hidden size-8 -translate-y-1/2 md:inline-flex"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              )}
            </div>

            {rows.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-4">
                {rows.map((row, i) => {
                  const label =
                    row.type === "plan" ? row.plan.name : row.payment.counterparty;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`${label}, ${i + 1} of ${rows.length}`}
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
                  );
                })}
              </div>
            )}
          </>
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
            <DrawerTitle>{paying?.plan.name ?? "Pay"}</DrawerTitle>
            <DrawerDescription>
              {paying ? planTarget(toPlanLike(paying.plan)) : ""}
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
                Dials *334# on the wallet selected in the header. You enter
                your M-PESA PIN in the phone dialog.
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
  row,
  status,
  busy,
  onPlay,
  onEdit,
}: {
  row: Extract<Row, { type: "plan" }>;
  status: string | null;
  busy: boolean;
  onPlay: () => void;
  onEdit: () => void;
}) {
  const Icon = planIcon(row.plan.kind);
  const cadence = cadenceStyle(row.plan.cadence);
  const amount = row.plan.amount > 0 ? row.plan.amount : row.lastPaid?.amount ?? null;

  return (
    <div className="space-y-4 px-1 py-1">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium" title={row.plan.name}>
              {row.plan.name}
            </p>
            <Chip className="bg-primary/10 text-primary">Yours</Chip>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {planTarget(toPlanLike(row.plan))}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${row.plan.name}`}
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
        <Chip className={cadence.className}>{cadence.label}</Chip>
        {row.plan.amount === 0 && (
          <span className="text-xs text-muted-foreground">asked each time</span>
        )}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Last paid</p>
          <p className="truncate">
            {row.lastPaid
              ? `${formatFullDate(row.lastPaid.date)} · ${formatMoney(row.lastPaid.amount)}`
              : "Not paid yet"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{dueLabel(row.due)}</p>
          <p className="truncate">{reminderLabel(toPlanLike(row.plan))}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onPlay} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
          {busy ? "Paying…" : "Pay now"}
        </Button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

function DetectedPage({
  payment,
  bands,
  onTrack,
  onDismiss,
}: {
  payment: RecurringPayment;
  bands: AmountBand[];
  onTrack: (amount?: number) => void;
  onDismiss: () => void;
}) {
  const { icon: Icon, label: method } = typeStyle(payment.type);
  const cadence = cadenceStyle(payment.cadence);
  const variable = payment.amountMin !== payment.amountMax;

  return (
    <div className="space-y-4 px-1 py-1">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium" title={payment.counterparty}>
              {payment.counterparty}
            </p>
            <Chip className="bg-muted text-muted-foreground">Detected</Chip>
          </div>
          <p className="text-xs text-muted-foreground">
            {method} · {payment.count} {payment.count === 1 ? "payment" : "payments"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Hide ${payment.counterparty}`}
          onClick={onDismiss}
          className="size-8 shrink-0 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {formatMoney(payment.amount)}
        </p>
        <Chip className={cadence.className}>{cadence.label}</Chip>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Last paid</p>
          <p className="truncate">{formatFullDate(payment.lastDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Amounts</p>
          <p className="truncate tabular-nums">
            {variable
              ? `${formatMoneyShort(payment.amountMin)}–${formatMoneyShort(payment.amountMax)}`
              : "Same every time"}
          </p>
        </div>
      </div>

      {bands.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            This looks like more than one payment. Track each one separately:
          </p>
          {bands.map((band) => (
            <button
              key={`${band.min}-${band.max}`}
              type="button"
              onClick={() => onTrack(band.amount)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block text-sm tabular-nums">
                  {band.min === band.max
                    ? formatMoneyShort(band.amount)
                    : `${formatMoneyShort(band.min)}–${formatMoneyShort(band.max)}`}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {band.count} {band.count === 1 ? "payment" : "payments"} · about{" "}
                  {formatMoneyShort(band.amount)}
                </span>
              </span>
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={() => onTrack()} className="w-full gap-1.5">
        <Plus className="size-4" aria-hidden />
        {bands.length > 1 ? "Track another amount" : "Track & set a reminder"}
      </Button>
    </div>
  );
}
