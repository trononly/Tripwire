import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Receipt, Smartphone, Store, X } from "lucide-react";
import { Events } from "@wailsio/runtime";
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
import { useAutomationAvailable } from "@/components/automation-gate";
import { RecurringPlanSheet } from "@/components/recurring-plan-sheet";
import { useQuickEntry } from "@/hooks/use-quick-entry";
import {
  billKey,
  dayKey,
  dueLabel,
  loadExpandedBills,
  loadSuggestionsOpen,
  loadDismissedBills,
  nextDue,
  planAmountShillings,
  planCoversDetected,
  planFromDetected,
  planScript,
  planTarget,
  reminderLabel,
  saveDismissedBills,
  saveExpandedBills,
  saveSuggestionsOpen,
  toPlanLike,
  type AmountBand,
  type LastPaid,
  type PlanDraft,
  type PlanLike,
} from "@/lib/recurring-plans";
import { formatMoney, formatMoneyShort, formatFullDate } from "@/lib/format";
import { useReduceMotionEnabled } from "@/lib/motion-settings";
import {
  isAndroidBridge,
  openUssdAutomationSettings,
} from "@/lib/sms-bridge";
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

function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(year, (month ?? 1) - 1, date ?? 1);
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  /** Mark one due date as handled (cash paid or skipped); "" undoes it. */
  onSkipPlan: (id: string, due: string) => Promise<boolean>;
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
  onSkipPlan,
}: RecurringPaymentsProps) {
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissedBills());
  const [suggestionsOpen, setSuggestionsOpen] = useState(() =>
    loadSuggestionsOpen(),
  );
  const [expandedBills, setExpandedBills] = useState<string[]>(() =>
    loadExpandedBills(),
  );
  const auto = useAutomationAvailable();

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

  useEffect(() => {
    if (qe.status === "aborted") {
      toast.error(qe.reason ? `Payment stopped: ${qe.reason}` : "Payment stopped.");
      setRunningPlan(null);
    }
    if (qe.status === "complete" || qe.status === "idle") {
      setRunningPlan(null);
    }
  }, [qe.status, qe.reason]);

  // A receipt landing means the run is over, even if the automation event
  // never reached the WebView.
  useEffect(() => {
    const onTransaction = () => setRunningPlan(null);
    window.addEventListener("mpesa:transactions", onTransaction);
    return () => window.removeEventListener("mpesa:transactions", onTransaction);
  }, []);

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

  function toggleSuggestions() {
    setSuggestionsOpen((open) => {
      saveSuggestionsOpen(!open);
      return !open;
    });
  }

  function toggleBill(key: string) {
    setExpandedBills((open) => {
      const next = open.includes(key)
        ? open.filter((k) => k !== key)
        : [...open, key];
      saveExpandedBills(next);
      return next;
    });
  }

  /** Skip the occurrence the card is showing; the next one moves up. */
  async function skipCycle(plan: RecurringPlan) {
    await onSkipPlan(plan.id, dayKey(nextDue(toPlanLike(plan))));
  }

  /** Open the amount prompt only for "ask each time" plans. A fixed plan
   * dials straight away: Pay now means pay now. */
  function openPay(plan: RecurringPlan) {
    if (plan.amount > 0) {
      startPlanPayment(plan, String(Math.round(plan.amount / 100)));
      return;
    }
    setPaying(plan);
    setPayError(null);
    setPayAmount(
      planAmountShillings(toPlanLike(plan), lastPaid[plan.id]?.amount ?? 0),
    );
  }

  function startPlanPayment(plan: RecurringPlan, amountShillings: string) {
    if (!isValidAmount(amountShillings)) {
      setPayError("Enter a whole-shilling amount between 1 and 500,000.");
      return;
    }
    const script = planScript(toPlanLike(plan), amountShillings.trim());
    if (!script) {
      setPayError("This payment's details are incomplete. Edit it first.");
      return;
    }
    if (!isAndroidBridge()) {
      toast.info("Guided payments need the Android app.");
      return;
    }
    if (!auto.available) {
      auto.recheck();
      toast.error("Turn on M-Pesa automation first.", {
        action: { label: "Open settings", onClick: openUssdAutomationSettings },
      });
      return;
    }
    Events.Once("common:ussd", (ev) => {
      const data = ev.data as { ok: boolean; error?: string };
      if (!data?.ok) {
        toast.error(
          data?.error === "call permission denied"
            ? "Call permission was denied."
            : data?.error === "automation disabled"
              ? "Automation was switched off."
              : "Could not start the transaction.",
        );
      }
    });
    setRunningPlan(plan.id);
    setPaying(null);
    setPayError(null);
    qe.start(script, simKey);
  }

  function startPayment() {
    if (!paying) return;
    startPlanPayment(paying, payAmount);
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
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.clientWidth === 0) return;
                  const next = Math.round(el.scrollLeft / el.clientWidth);
                  if (next !== index) setIndex(next);
                }}
                className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      onSkip={() => void skipCycle(row.plan)}
                      onUnskip={() => void onSkipPlan(row.plan.id, "")}
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
          <div className="mt-5 border-t border-border pt-3">
            <button
              type="button"
              onClick={toggleSuggestions}
              aria-expanded={suggestionsOpen}
              className="flex w-full items-center justify-between gap-2 py-1 text-left"
            >
              <span className="text-xs font-medium text-muted-foreground">
                From your statements
              </span>
              <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                {suggestions.length}
                <ChevronDown
                  className={`size-4 transition-transform ${suggestionsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </span>
            </button>

            {suggestionsOpen && (
              <div className="space-y-2 pt-2">
                {suggestions.map((payment) => {
                  const key = billKey(payment);
                  return (
                    <SuggestionRow
                      key={key}
                      payment={payment}
                      plans={plans}
                      bands={bands[key] ?? []}
                      expanded={expandedBills.includes(key)}
                      onToggle={() => toggleBill(key)}
                      onTrack={(amount) => openTrack(payment, amount)}
                      onDismiss={() => dismiss(payment)}
                    />
                  );
                })}
              </div>
            )}
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
              {payError && <p className="text-sm text-destructive">{payError}</p>}
            </div>
          </div>

          <DrawerFooter>
            <Button type="button" onClick={startPayment} className="w-full">
              Pay now
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
  onSkip,
  onUnskip,
}: {
  plan: RecurringPlan;
  lastPaid: LastPaid | null;
  due: Date;
  status: string | null;
  busy: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onSkip: () => void;
  onUnskip: () => void;
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

      {plan.skippedFor && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground">
            Skipped {shortDay(plan.skippedFor)}
          </span>
          <button
            type="button"
            onClick={onUnskip}
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Undo
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onPlay} disabled={busy} className="flex-1">
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Smartphone className="size-4" aria-hidden />
          )}
          {busy ? "Paying…" : "Pay now"}
        </Button>
        <Button
          variant="outline"
          onClick={onSkip}
          disabled={busy}
          aria-label="Skip this cycle"
          className="shrink-0"
        >
          Skip
        </Button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

function SuggestionRow({
  payment,
  plans,
  bands,
  expanded,
  onToggle,
  onTrack,
  onDismiss,
}: {
  payment: RecurringPayment;
  plans: RecurringPlan[];
  bands: AmountBand[];
  expanded: boolean;
  onToggle: () => void;
  onTrack: (amount?: number) => void;
  onDismiss: () => void;
}) {
  const { icon: Icon, label: method } = typeStyle(payment.type);
  const cadence = cadenceStyle(payment.cadence);
  const variable = payment.amountMin !== payment.amountMax;
  const isTracked = (amount?: number) =>
    plans.some((plan) => planCoversDetected(toPlanLike(plan), payment, amount));

  // Fixed and wide ranges use the same row component, so "add this amount"
  // looks the same everywhere instead of one band buttons and one big button.
  const rows =
    bands.length > 1
      ? bands.map((band) => ({
          key: `${band.min}-${band.max}`,
          amount: band.amount,
          label:
            band.min === band.max
              ? formatMoneyShort(band.amount)
              : `${formatMoneyShort(band.min)}-${formatMoneyShort(band.max)}`,
          detail: `${band.count} ${band.count === 1 ? "payment" : "payments"} around ${formatMoneyShort(band.amount)}`,
        }))
      : [
          {
            key: "fixed",
            amount: payment.amount,
            label: formatMoneyShort(payment.amount),
            detail: variable ? "About this amount" : "Fixed amount",
          },
        ];

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-start gap-1 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <Icon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" title={payment.counterparty}>
              {payment.counterparty}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {method} · {payment.count} {payment.count === 1 ? "payment" : "payments"} ·{" "}
              {cadence.label}
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="tabular-nums">
                {variable
                  ? `${formatMoneyShort(payment.amountMin)}-${formatMoneyShort(payment.amountMax)}`
                  : formatMoneyShort(payment.amount)}
              </span>
              <span className="text-muted-foreground">
                last paid {formatFullDate(payment.lastDate)}
              </span>
            </span>
          </span>
          <ChevronDown
            className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>
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

      {expanded && (
        <div className="space-y-1.5 border-t border-border p-2">
          {rows.map((row) => (
            <TrackAmountRow
              key={row.key}
              label={row.label}
              detail={row.detail}
              tracked={isTracked(row.amount)}
              onAdd={() => onTrack(row.amount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackAmountRow({
  label,
  detail,
  tracked,
  onAdd,
}: {
  label: string;
  detail: string;
  tracked: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={tracked}
      className={`flex w-full items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
        tracked
          ? "border-border/60 text-muted-foreground"
          : "border-border hover:bg-muted/60"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-xs tabular-nums">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {detail}
        </span>
      </span>
      {tracked ? (
        <Check className="size-3.5 shrink-0" aria-label="Tracked" />
      ) : (
        <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}
