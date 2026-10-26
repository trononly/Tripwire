import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { RecurringPlan } from "../../bindings/mpesa-analyzer/internal/store/models";
import {
  CADENCE_LABELS,
  KIND_LABELS,
  REMIND_LEAD_OPTIONS,
  WEEKDAYS,
  emptyPlan,
  planTarget,
  samePlanTarget,
  toPlanLike,
  type PlanCadence,
  type PlanDraft,
  type PlanKind,
} from "@/lib/recurring-plans";
import { formatMoney } from "@/lib/format";
import {
  isValidAccount,
  isValidAmount,
  isValidPaybill,
  isValidTill,
  normalizePhone,
} from "@/lib/ussd-menus";

export interface RecurringPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing plan to edit; null adds a new one. */
  plan: RecurringPlan | null;
  /** Prefill for a new plan, e.g. "Track this" on a detected payment. */
  prefill?: PlanDraft | null;
  /** Every saved plan, to show the other payments for the same contact. */
  plans: RecurringPlan[];
  onSave: (draft: PlanDraft, id: string | null) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  /** Switch the sheet to another plan for the same contact. */
  onEditPlan: (plan: RecurringPlan) => void;
}

const KINDS: PlanKind[] = ["send", "pochi", "paybill", "till"];
const CADENCES: PlanCadence[] = ["weekly", "bi-weekly", "monthly", "quarterly"];
const DAYS_IN_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

function toCents(value: string): number {
  const n = Number(value.trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function amountInput(cents: number): string {
  return cents > 0 ? String(cents / 100) : "";
}

/**
 * Set up or edit one recurring payment: target, amount, schedule and when to
 * be reminded. The same sheet is used by "Add payment" and by "Track this" on
 * a detected bill, so a detected pattern becomes a plan in one step.
 *
 * A contact can have several plans. The sheet lists the other plans for the
 * same target and lets the user jump straight into editing one, instead of
 * blocking a second entry.
 */
export function RecurringPlanSheet({
  open,
  onOpenChange,
  plan,
  prefill,
  plans,
  onSave,
  onDelete,
  onEditPlan,
}: RecurringPlanSheetProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlanKind>("send");
  const [kindTouched, setKindTouched] = useState(false);
  const [number, setNumber] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [askAmount, setAskAmount] = useState(false);
  const [cadence, setCadence] = useState<PlanCadence>("monthly");
  const [anchorDay, setAnchorDay] = useState(1);
  const [anchorWeekday, setAnchorWeekday] = useState(0);
  const [dueTime, setDueTime] = useState("09:00");
  const [leadDays, setLeadDays] = useState(1);
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the row each time the sheet opens, never mid-edit on a re-render.
  useEffect(() => {
    if (!open) return;
    const source: PlanDraft | null = plan
      ? {
          name: plan.name,
          kind: plan.kind as PlanKind,
          number: plan.number,
          account: plan.account,
          amount: plan.amount,
          cadence: plan.cadence as PlanCadence,
          anchorDay: plan.anchorDay,
          anchorWeekday: plan.anchorWeekday,
          dueTime: plan.dueTime,
          leadDays: plan.leadDays,
          remind: plan.remind,
          simId: plan.simId,
        }
      : prefill ?? emptyPlan();
    setName(source.name);
    setKind(source.kind);
    // Tracking a detected payment has already inferred a type; treat that as
    // the user's choice so typing the number does not overwrite it.
    setKindTouched(plan !== null || prefill !== null);
    setNumber(source.number);
    setAccount(source.account);
    setAmount(amountInput(source.amount));
    setAskAmount(plan ? plan.amount <= 0 : prefill ? prefill.amount <= 0 : false);
    setCadence(source.cadence);
    setAnchorDay(source.anchorDay);
    setAnchorWeekday(source.anchorWeekday);
    setDueTime(source.dueTime || "09:00");
    setLeadDays(source.leadDays);
    setRemind(source.remind);
    setSaving(false);
    setConfirmDelete(false);
    setError(null);
  }, [open, plan, prefill]);

  const numberLabel =
    kind === "paybill" ? "Paybill number" : kind === "till" ? "Till number" : "Phone number";

  const targetValid = useMemo(() => {
    if (kind === "send" || kind === "pochi") return normalizePhone(number) !== "";
    if (kind === "paybill") return isValidPaybill(number);
    return isValidTill(number);
  }, [kind, number]);

  const amountValid = askAmount || isValidAmount(amount);

  /** Other plans for the same phone/paybill/till, editable from here. */
  const siblings = useMemo(
    () =>
      plans.filter(
        (other) =>
          other.id !== plan?.id &&
          samePlanTarget(toPlanLike(other), kind, number, account),
      ),
    [plans, plan, kind, number, account],
  );

  function chooseKind(next: PlanKind) {
    setKind(next);
    setKindTouched(true);
    setError(null);
  }

  /** Guess the flow from the number, until the user picks a type. */
  function changeNumber(value: string) {
    setNumber(value);
    if (kindTouched) return;
    if (normalizePhone(value)) {
      if (kind !== "pochi") setKind("send");
      return;
    }
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 4 && (kind === "send" || kind === "pochi")) {
      setKind("paybill");
    }
  }

  async function handleSave() {
    setError(null);
    if (!targetValid) {
      setError(
        kind === "send" || kind === "pochi"
          ? "Enter a valid Kenyan phone number."
          : kind === "paybill"
            ? "Paybill numbers are 4 to 7 digits."
            : "Till numbers are 5 to 7 digits.",
      );
      return;
    }
    if (kind === "paybill" && !isValidAccount(account)) {
      setError("Enter the paybill account (no * or #).");
      return;
    }
    if (!amountValid) {
      setError("Enter a whole-shilling amount between 1 and 500,000.");
      return;
    }
    if (!name.trim() && (kind === "send" || kind === "pochi")) {
      setError("Give this payment a name.");
      return;
    }

    const draft: PlanDraft = {
      name: name.trim() || number.trim(),
      kind,
      number: number.trim(),
      account: kind === "paybill" ? account.trim() : "",
      amount: askAmount ? 0 : toCents(amount),
      cadence,
      anchorDay,
      anchorWeekday,
      dueTime,
      leadDays,
      remind,
      simId: "",
    };

    setSaving(true);
    const ok = await onSave(draft, plan?.id ?? null);
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  async function handleDelete() {
    if (!plan) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const ok = await onDelete(plan.id);
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{plan ? "Edit recurring payment" : "New recurring payment"}</DrawerTitle>
          {plan && <DrawerDescription>{planTarget(toPlanLike(plan))}</DrawerDescription>}
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agnes Muiruri"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label>Pay with</Label>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => chooseKind(k)}
                  aria-pressed={kind === k}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    kind === k
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-number">{numberLabel}</Label>
            <Input
              id="plan-number"
              value={number}
              onChange={(e) => changeNumber(e.target.value)}
              placeholder={
                kind === "send" || kind === "pochi"
                  ? "0712 345 678"
                  : kind === "paybill"
                    ? "888880"
                    : "543210"
              }
              inputMode="tel"
              autoComplete="off"
            />
          </div>

          {kind === "paybill" && (
            <div className="space-y-2">
              <Label htmlFor="plan-account">Account</Label>
              <Input
                id="plan-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="01450540651"
                autoComplete="off"
              />
            </div>
          )}

          {siblings.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Also set up for this contact
              </p>
              {siblings.map((other) => {
                const otherPlan = toPlanLike(other);
                return (
                  <div key={other.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{other.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {other.amount > 0 ? formatMoney(other.amount) : "Ask each time"} ·{" "}
                        {CADENCE_LABELS[otherPlan.cadence]}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${other.name}`}
                      onClick={() => onEditPlan(other)}
                      className="size-8 shrink-0"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="plan-amount">Amount (KES)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="plan-amount"
                value={askAmount ? "" : amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={askAmount ? "Asked each time" : "250"}
                inputMode="numeric"
                disabled={askAmount}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => {
                  setAskAmount((v) => !v);
                  setError(null);
                }}
                aria-pressed={askAmount}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  askAmount
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                Ask each time
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>How often</Label>
            <div className="grid grid-cols-2 gap-2">
              {CADENCES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCadence(c)}
                  aria-pressed={cadence === c}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    cadence === c
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {CADENCE_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-anchor">
              {cadence === "weekly" || cadence === "bi-weekly" ? "Day of the week" : "Day of the month"}
            </Label>
            {cadence === "weekly" || cadence === "bi-weekly" ? (
              <select
                id="plan-anchor"
                value={anchorWeekday}
                onChange={(e) => setAnchorWeekday(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {WEEKDAYS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="plan-anchor"
                value={anchorDay}
                onChange={(e) => setAnchorDay(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {DAYS_IN_MONTH.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            )}
            {cadence === "monthly" && anchorDay > 28 && (
              <p className="text-xs text-muted-foreground">
                Shorter months use their last day.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setRemind((v) => !v)}
              aria-pressed={remind}
              className="flex w-full items-center justify-between gap-3 p-3 text-left"
            >
              <span className="text-sm font-medium">Reminder</span>
              <span
                aria-hidden
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  remind ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-all ${
                    remind ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            {remind && (
              <div className="grid grid-cols-2 gap-3 border-t border-border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-time" className="text-xs">
                    Time
                  </Label>
                  <Input
                    id="plan-time"
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-lead" className="text-xs">
                    Days before
                  </Label>
                  <select
                    id="plan-lead"
                    value={leadDays}
                    onChange={(e) => setLeadDays(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {REMIND_LEAD_OPTIONS.map((days) => (
                      <option key={days} value={days}>
                        {days === 0 ? "On the day" : days === 1 ? "1 day" : `${days} days`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DrawerFooter className="gap-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || (plan ? false : !targetValid)}
            className="w-full"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {plan ? "Save changes" : "Add payment"}
          </Button>
          {plan && (
            <Button
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
              onClick={handleDelete}
              disabled={saving}
              className="w-full text-muted-foreground"
            >
              <Trash2 className="size-4" aria-hidden />
              {confirmDelete ? "Tap again to delete" : "Delete payment"}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
