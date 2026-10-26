// User-defined recurring payments: schedule maths, statement matching and
// the generated *334# script behind the Play button.
//
// The detector in internal/recurring only finds patterns already present in
// the statements. A plan is the user's own entry for everything it misses
// (weekly tokens, fixed rent) and it is also what absorbs a detected payment
// once the user tracks it, so the card never shows the same payee twice.

import type { RecurringPayment } from "../../bindings/mpesa-analyzer/internal/recurring/models";
import type {
  PlanReminder,
  RecurringPlan,
} from "../../bindings/mpesa-analyzer/internal/store/models";
import type { Transaction } from "../../bindings/mpesa-analyzer/internal/parser/models";
import { formatMoney } from "@/lib/format";
import {
  buildPaybillScript,
  buildSendScript,
  buildTillScript,
  normalizePhone,
  type QuickEntryScript,
} from "@/lib/ussd-menus";

export type PlanKind = "send" | "pochi" | "paybill" | "till";
export type PlanCadence = "weekly" | "bi-weekly" | "monthly" | "quarterly";

/** Editable fields of a plan; the store adds id and createdAt. */
export interface PlanDraft {
  name: string;
  kind: PlanKind;
  number: string;
  account: string;
  amount: number;
  cadence: PlanCadence;
  anchorDay: number;
  anchorWeekday: number;
  dueTime: string;
  /** Minutes before the due occurrence; 0 is on the due date. */
  reminders: PlanReminder[];
  /** First offset, kept for older callers. */
  leadDays: number;
  remind: boolean;
  simId: string;
}

export interface PlanLike extends PlanDraft {
  id: string;
  createdAt: string;
  /** "YYYY-MM-DD" occurrence marked as handled (cash paid or skipped). */
  skippedFor?: string;
}

/**
 * Bridge a stored plan to the draft shape. Go validates kind/cadence before
 * saving, so the generated `string` fields are safe to narrow here; this is
 * the single place that assumption lives.
 */
export function toPlanLike(plan: RecurringPlan): PlanLike {
  return {
    id: plan.id,
    name: plan.name,
    kind: plan.kind as PlanKind,
    number: plan.number,
    account: plan.account,
    amount: plan.amount,
    cadence: plan.cadence as PlanCadence,
    anchorDay: plan.anchorDay,
    anchorWeekday: plan.anchorWeekday,
    dueTime: plan.dueTime,
    reminders:
      plan.reminders && plan.reminders.length > 0
        ? plan.reminders
        : [{ offsetMinutes: 0 }],
    leadDays: plan.leadDays,
    remind: plan.remind,
    simId: plan.simId,
    createdAt: plan.createdAt,
    skippedFor: plan.skippedFor,
  };
}

export const KIND_LABELS: Record<PlanKind, string> = {  send: "Send money",
  pochi: "Pochi La Biashara",
  paybill: "Paybill",
  till: "Buy goods",
};

export const CADENCE_LABELS: Record<PlanCadence, string> = {
  weekly: "Weekly",
  "bi-weekly": "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Every 3 months",
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const REMIND_LEAD_OPTIONS = [0, 1, 2, 3, 7];

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseTime(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map((part) => Number(part));
  return {
    h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 9,
    m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

function atTime(day: Date, hhmm: string): Date {
  const { h, m } = parseTime(hhmm);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The day-of-month a plan uses in a given month: 31 clamps to Feb 28/29. */
export function clampedDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}

/** Local "YYYY-MM-DD", the form the store keeps for a skipped occurrence. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The next time this plan is due at or after `from` (local time). A skipped
 * occurrence is stepped over: after "Skip this cycle" the card shows the
 * following date and the reminder for that cycle cannot fire.
 */
export function nextDue(plan: PlanDraft, from: Date = new Date()): Date {
  const due = computeDue(plan, from);
  const skipped = "skippedFor" in plan ? String(plan.skippedFor ?? "").trim() : "";
  if (skipped && dayKey(due) === skipped) {
    return computeDue(plan, new Date(due.getTime() + 60_000));
  }
  return due;
}

function computeDue(plan: PlanDraft, from: Date): Date {
  const created = "createdAt" in plan ? new Date(String(plan.createdAt)) : from;
  const base = Number.isNaN(created.getTime()) ? from : created;

  switch (plan.cadence) {
    case "weekly": {
      const day = startOfDay(from);
      const delta = (plan.anchorWeekday - day.getDay() + 7) % 7;
      let candidate = atTime(new Date(day.getTime() + delta * DAY_MS), plan.dueTime);
      if (candidate <= from) {
        candidate = new Date(candidate.getTime() + 7 * DAY_MS);
      }
      return candidate;
    }
    case "bi-weekly": {
      // Anchor the fortnight to the week the plan was created, so "every two
      // weeks on Friday" stays on the same parity instead of drifting.
      let day = startOfDay(base);
      day = new Date(day.getTime() + ((plan.anchorWeekday - day.getDay() + 7) % 7) * DAY_MS);
      let candidate = atTime(day, plan.dueTime);
      while (candidate < from) {
        candidate = new Date(candidate.getTime() + 14 * DAY_MS);
      }
      return candidate;
    }
    case "monthly": {
      const year = from.getFullYear();
      const month = from.getMonth();
      let candidate = new Date(
        year,
        month,
        clampedDay(year, month, plan.anchorDay),
        parseTime(plan.dueTime).h,
        parseTime(plan.dueTime).m,
      );
      if (candidate < from) {
        candidate = new Date(
          year,
          month + 1,
          clampedDay(year, month + 1, plan.anchorDay),
          parseTime(plan.dueTime).h,
          parseTime(plan.dueTime).m,
        );
      }
      return candidate;
    }
    case "quarterly": {
      // Quarters follow the creation month: a plan set up in March is due in
      // March, June, September and December.
      let year = base.getFullYear();
      let month = base.getMonth();
      let candidate = atTime(new Date(year, month, clampedDay(year, month, plan.anchorDay)), plan.dueTime);
      let guard = 0;
      while (candidate < from && guard < 400) {
        month += 3;
        if (month > 11) {
          month -= 12;
          year += 1;
        }
        candidate = atTime(new Date(year, month, clampedDay(year, month, plan.anchorDay)), plan.dueTime);
        guard += 1;
      }
      return candidate;
    }
  }
}

/** The next `count` occurrences, for the native reminder scheduler. */
export function upcoming(plan: PlanDraft, count: number, from: Date = new Date()): Date[] {
  const out: Date[] = [];
  let cursor = from;
  for (let i = 0; i < count; i += 1) {
    const due = nextDue(plan, cursor);
    out.push(due);
    cursor = new Date(due.getTime() + 60_000);
  }
  return out;
}

/** "Due today" / "Due tomorrow" / "Due Mon 3 Nov" / "3 days overdue". */
export function dueLabel(due: Date, now: Date = new Date()): string {
  const a = startOfDay(due).getTime();
  const b = startOfDay(now).getTime();
  const diff = Math.round((a - b) / DAY_MS);
  if (diff < -1) return `${-diff} days overdue`;
  if (diff === -1) return "1 day overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due ${due.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}`;
}

const UNIT_MINUTES = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
} as const;

export type ReminderUnit = keyof typeof UNIT_MINUTES;

/** The largest unit that divides the offset evenly, so 2880 reads as 2 days. */
export function reminderUnit(offsetMinutes: number): {
  unit: ReminderUnit;
  value: number;
} {
  const before = Math.abs(offsetMinutes);
  if (before >= UNIT_MINUTES.weeks && before % UNIT_MINUTES.weeks === 0) {
    return { unit: "weeks", value: before / UNIT_MINUTES.weeks };
  }
  if (before >= UNIT_MINUTES.days && before % UNIT_MINUTES.days === 0) {
    return { unit: "days", value: before / UNIT_MINUTES.days };
  }
  if (before >= UNIT_MINUTES.hours && before % UNIT_MINUTES.hours === 0) {
    return { unit: "hours", value: before / UNIT_MINUTES.hours };
  }
  return { unit: "minutes", value: before };
}

export function reminderPhrase(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "on the due date";
  const { unit, value } = reminderUnit(offsetMinutes);
  return `${value} ${value === 1 ? unit.slice(0, -1) : unit} before`;
}

export function reminderLabel(plan: PlanDraft): string {
  if (!plan.remind) return "Reminders off";
  const list = plan.reminders?.length
    ? plan.reminders
    : [{ offsetMinutes: 0 }];
  const phrases = list.map((reminder) =>
    reminderPhrase(reminder.offsetMinutes),
  );
  const joined =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  return `Remind ${joined}`;
}

/** Date arithmetic used by the reminder picker; local time throughout. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Kenyan local form variants, so "0712…" also matches "254712…". */
function phoneVariants(number: string): string[] {
  const d = digits(number);
  const local = d.startsWith("254") ? `0${d.slice(3)}` : d;
  const intl = local.startsWith("0") ? `254${local.slice(1)}` : local;
  return [local, intl, d].filter((v, i, all) => v.length >= 9 && all.indexOf(v) === i);
}

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

/** True when a statement description belongs to this plan. */
function descriptionMatches(plan: PlanLike, description: string): boolean {
  const text = description.toUpperCase();
  if (plan.kind === "paybill") {
    if (!text.includes(plan.number)) return false;
    return !plan.account || text.includes(plan.account.toUpperCase());
  }
  if (plan.kind === "till") {
    return text.includes(plan.number);
  }
  // Send/Pochi statements usually print the name; the phone is present only
  // sometimes (and often masked), so the name is the reliable key.
  const name = normalizedName(plan.name);
  if (name.length >= 3 && text.includes(name)) return true;
  return phoneVariants(plan.number).some((variant) => digits(text).includes(variant));
}

export interface LastPaid {
  date: string;
  amount: number;
}

/** The newest outgoing transaction that matches a plan, if any. */
export function lastPaidOf(
  plan: PlanLike,
  transactions: Transaction[],
): LastPaid | null {
  let best: LastPaid | null = null;
  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // outflow only
    if (!descriptionMatches(plan, tx.description)) continue;
    if (!best || tx.date > best.date) {
      best = { date: tx.date, amount: Math.abs(tx.amount) };
    }
  }
  return best;
}

/** How a detected payment's transaction type maps to a plan target. */
export function detectedKind(type: string): PlanKind | null {
  switch (type) {
    case "paybill":
      return "paybill";
    case "till":
      return "till";
    case "send_money":
      return "send";
    default:
      return null;
  }
}

/** A detected payment's next expected date, from its own median gap. */
export function detectedNextDue(payment: RecurringPayment): Date {
  const day = payment.lastDate.slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1);
  return new Date(base.getTime() + payment.medianGapDays * DAY_MS);
}

/** Ready-to-run script for a plan, or null when the target is incomplete. */
export function planScript(plan: PlanLike, amountShillings: string): QuickEntryScript | null {
  switch (plan.kind) {
    case "send":
      return buildSendScript("send", plan.number, amountShillings);
    case "pochi":
      return buildSendScript("pochi", plan.number, amountShillings);
    case "paybill":
      return buildPaybillScript(plan.number, plan.account, amountShillings);
    case "till":
      return buildTillScript(plan.number, amountShillings);
  }
}

/** Whole-shilling display amount for a plan (0 means "ask me"). */
export function planAmountShillings(plan: PlanLike, fallbackCents = 0): string {
  const cents = plan.amount > 0 ? plan.amount : fallbackCents;
  if (cents <= 0) return "";
  return String(Math.round(cents / 100));
}

/** "Paybill 888880 · 0145…" / "0712 345 678" for the row subtitle. */
export function planTarget(plan: PlanLike): string {
  if (plan.kind === "paybill") return `Paybill ${plan.number} · ${plan.account}`;
  if (plan.kind === "till") return `Till ${plan.number}`;
  return plan.number;
}

/** Defaults for the add sheet: monthly, due today, remind the day before. */
export function emptyPlan(now: Date = new Date()): PlanDraft {
  return {
    name: "",
    kind: "send",
    number: "",
    account: "",
    amount: 0,
    cadence: "monthly",
    anchorDay: now.getDate(),
    anchorWeekday: now.getDay(),
    dueTime: "09:00",
    reminders: [{ offsetMinutes: 0 }],
    leadDays: 0,
    remind: true,
    simId: "",
  };
}

/** A Kenyan mobile number embedded in a statement counterparty, if any. */
function phoneInCounterparty(name: string): string {
  const match = name.match(/(?:\+?254|0)?[17]\d{8}\b/);
  return match ? normalizePhone(match[0]) : "";
}

/** Pre-fill the sheet from a detected payment ("Track this"). */
export function planFromDetected(
  payment: RecurringPayment,
  amount?: number,
): PlanDraft {
  const draft = emptyPlan();
  const day = payment.lastDate.slice(0, 10);
  const [, , dayOfMonth] = day.split("-").map(Number);
  const kind = detectedKind(payment.type) ?? "send";
  // Send-money statements usually print the phone after the name. Split it
  // out so the dialog opens with a usable number and a clean payee name.
  const phone = kind === "send" || kind === "pochi" ? phoneInCounterparty(payment.counterparty) : "";
  const name = phone
    ? payment.counterparty.replace(phone, "").replace(/[\s-]+$/, "").trim()
    : payment.counterparty;
  return {
    ...draft,
    name,
    kind,
    number: phone,
    amount: amount ?? payment.amount,
    cadence: (payment.cadence as PlanCadence) || "monthly",
    anchorDay: dayOfMonth || draft.anchorDay,
    anchorWeekday: new Date(`${day}T00:00:00`).getDay(),
  };
}

export function isPlanCadence(value: string): value is PlanCadence {
  return value in CADENCE_LABELS;
}

/** True when a saved plan already points at this phone/paybill/till. */
export function samePlanTarget(
  plan: PlanLike,
  kind: string,
  number: string,
  account: string,
): boolean {
  if (plan.kind !== kind) return false;
  if (kind === "send" || kind === "pochi") {
    const a = digits(plan.number);
    const b = digits(number);
    return a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9);
  }
  if (digits(plan.number) !== digits(number)) return false;
  if (kind === "paybill") {
    return plan.account.trim().toUpperCase() === account.trim().toUpperCase();
  }
  return true;
}

/** Stable identity for a detected bill across re-analyses. */
export function billKey(payment: RecurringPayment): string {
  return `${payment.counterparty}|${payment.type}|${payment.lastDate}`;
}

const DISMISSED_BILLS_KEY = "mpesa-analyzer.dismissed-bills";

/** Detected bills the user dismissed, persisted so they stay hidden. */
export function loadDismissedBills(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_BILLS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveDismissedBills(keys: string[]): void {
  try {
    localStorage.setItem(DISMISSED_BILLS_KEY, JSON.stringify(keys));
  } catch {
    /* private mode: hidden for this session only */
  }
}

export interface AmountBand {
  min: number;
  max: number;
  /** Median amount in the band, the value a plan starts from. */
  amount: number;
  count: number;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Amounts for one detected payee grouped into bands. A single payee can have
 * genuinely different payments (a KES 69 bundle and a KES 16,500 transfer to
 * the same person); a wide min–max range is unreadable and hides both
 * patterns. Bands are split only at large ratios (3x or more) so ordinary
 * bill variation stays one band, and singletons are folded into their
 * nearest neighbour so one odd payment never becomes a band of its own.
 */
export function amountBands(
  transactions: Transaction[],
  payment: RecurringPayment,
): AmountBand[] {
  const name = normalizedName(payment.counterparty);
  if (name.length < 3) return [];

  const amounts = transactions
    .filter((tx) => tx.amount < 0 && normalizedName(tx.description).includes(name))
    .map((tx) => Math.abs(tx.amount))
    .sort((a, b) => a - b);
  if (amounts.length < 3) return [];

  // Greedy ratio split, then fold small clusters into their closest
  // neighbour until every band has at least two payments.
  const clusters: number[][] = [];
  for (const amount of amounts) {
    const last = clusters[clusters.length - 1];
    if (!last || amount <= last[last.length - 1] * 3) {
      if (last) last.push(amount);
      else clusters.push([amount]);
    } else {
      clusters.push([amount]);
    }
  }

  while (clusters.length > 1 && clusters.some((c) => c.length < 2)) {
    const index = clusters.findIndex((c) => c.length < 2);
    const before = clusters[index - 1];
    const after = clusters[index + 1];
    let target = index - 1;
    if (!before) target = index + 1;
    else if (after) {
      const medianOf = (c: number[]) => median(c);
      const own = medianOf(clusters[index]);
      target =
        Math.abs(medianOf(before) - own) <= Math.abs(medianOf(after) - own)
          ? index - 1
          : index + 1;
    }
    const [small] = clusters.splice(index, 1);
    const into = index < target ? target - 1 : target;
    clusters[into] = [...clusters[into], ...small].sort((a, b) => a - b);
  }

  // Keep the output to three bands by merging the closest pair.
  while (clusters.length > 3) {
    let best = 0;
    let bestRatio = Infinity;
    for (let i = 1; i < clusters.length; i += 1) {
      const ratio = median(clusters[i]) / Math.max(1, median(clusters[i - 1]));
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = i;
      }
    }
    clusters[best - 1] = [...clusters[best - 1], ...clusters[best]].sort((a, b) => a - b);
    clusters.splice(best, 1);
  }

  if (clusters.length < 2) return [];
  return clusters.map((band) => ({
    min: band[0],
    max: band[band.length - 1],
    amount: median(band),
    count: band.length,
  }));
}

/** True when a saved plan already covers this detected payment (or amount). */
export function planCoversDetected(
  plan: PlanLike,
  payment: RecurringPayment,
  amount?: number,
): boolean {
  const kind = detectedKind(payment.type);
  if (!kind) return false;
  const compatible =
    plan.kind === kind ||
    (plan.kind === "pochi" && kind === "send") ||
    (plan.kind === "send" && kind === "till");
  if (!compatible) return false;

  // The detected counterparty often carries the phone; the plan name usually
  // does not, so containment in either direction is the practical match.
  const a = normalizedName(plan.name);
  const b = normalizedName(payment.counterparty);
  if (a.length < 3 || !(b.includes(a) || a.includes(b))) return false;

  if (amount === undefined) return true;
  return plan.amount > 0 && plan.amount === amount;
}

const SUGGESTIONS_OPEN_KEY = "mpesa-analyzer.suggestions-open";
const EXPANDED_BILLS_KEY = "mpesa-analyzer.expanded-bills";

/** Whether the statement-suggestion list was left open. */
export function loadSuggestionsOpen(): boolean {
  try {
    return localStorage.getItem(SUGGESTIONS_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveSuggestionsOpen(open: boolean): void {
  try {
    localStorage.setItem(SUGGESTIONS_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private mode: session-only */
  }
}

/** Suggestion rows the user left expanded. */
export function loadExpandedBills(): string[] {
  try {
    const raw = localStorage.getItem(EXPANDED_BILLS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveExpandedBills(keys: string[]): void {
  try {
    localStorage.setItem(EXPANDED_BILLS_KEY, JSON.stringify(keys));
  } catch {
    /* private mode: session-only */
  }
}

export interface ReminderItem {
  id: string;
  planId: string;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  at: number;
}

function paidForOccurrence(
  lastPaidDate: string,
  occurrence: Date,
  cadence: PlanCadence,
): boolean {
  const paid = new Date(lastPaidDate.replace(" ", "T"));
  if (Number.isNaN(paid.getTime())) return false;
  const halfCycleDays =
    cadence === "weekly"
      ? 3
      : cadence === "bi-weekly"
        ? 7
        : cadence === "monthly"
          ? 15
          : 45;
  const start = occurrence.getTime() - halfCycleDays * DAY_MS;
  // A payment from the middle of the cycle to the day after it counts for
  // this occurrence. The previous cycle's payment is older than that window.
  return paid.getTime() >= start && paid.getTime() <= occurrence.getTime() + DAY_MS;
}

/**
 * Fire times for every enabled reminder on every plan, ready for the native
 * scheduler. Occurrences already paid for are skipped, so a receipt silences
 * the reminder even when the app never sent it. Capped at 100 items, six
 * occurrences per plan, which covers half a year of monthly reminders.
 */
export function buildReminderItems(
  plans: RecurringPlan[],
  lastPaid: Record<string, LastPaid | null>,
  now: Date = new Date(),
  privacy = false,
): ReminderItem[] {
  const items: ReminderItem[] = [];

  for (const plan of plans) {
    if (!plan.remind) continue;
    const like = toPlanLike(plan);
    const offsets =
      like.reminders.length > 0
        ? like.reminders
        : [{ offsetMinutes: 0 }];
    const paid = lastPaid[plan.id] ?? null;

    for (const occurrence of upcoming(like, 6, now)) {
      if (paid && paidForOccurrence(paid.date, occurrence, like.cadence)) continue;

      const when = dueLabel(occurrence, now).replace(/^Due /, "");
      const amount = plan.amount > 0 ? plan.amount : paid?.amount ?? 0;
      const body = privacy
        ? `Payment due ${when}`
        : amount > 0
          ? `${formatMoney(amount)} due ${when}`
          : `Payment due ${when}`;

      for (const offset of offsets) {
        const at = new Date(
          occurrence.getTime() + offset.offsetMinutes * 60_000,
        );
        if (at.getTime() <= now.getTime() + 60_000) continue;
        items.push({
          id: `${plan.id}:${dayKey(occurrence)}:${offset.offsetMinutes}`,
          planId: plan.id,
          title: plan.name,
          body,
          at: at.getTime(),
        });
      }
    }
  }

  return items.sort((a, b) => a.at - b.at).slice(0, 100);
}
