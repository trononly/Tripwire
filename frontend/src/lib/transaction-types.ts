// Shared semantic-transaction-type presentation map. The type strings are
// produced by Go (internal/txtype.TypeOf, from the statement description
// alone) and arrive pre-computed on every row; this lookup is the only
// thing the UI does with them. Used by the transaction list and the
// recurring-payment cards so an icon always means the same thing app-wide.
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Briefcase,
  CreditCard,
  Landmark,
  PiggyBank,
  Receipt,
  RotateCcw,
  Send,
  ShoppingBag,
  Smartphone,
  User,
  Wallet,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export type TypeStyle = { icon: LucideIcon; className: string; label: string };

const TINT_GREEN = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
const TINT_RED = "bg-red-500/10 text-red-600 dark:text-red-400";
const TINT_AMBER = "bg-amber-500/10 text-amber-600 dark:text-amber-400";
const TINT_GRAY = "bg-muted text-muted-foreground";

export const TYPE_STYLES: Record<string, TypeStyle> = {
  send_money: { icon: Send, className: TINT_RED, label: "Send Money" },
  paybill: { icon: Receipt, className: TINT_AMBER, label: "Pay Bill" },
  till: { icon: ShoppingBag, className: TINT_RED, label: "Buy Goods" },
  bank_transfer: { icon: Landmark, className: TINT_GRAY, label: "Bank Transfer" },
  withdrawal: { icon: ArrowUpRight, className: TINT_RED, label: "Withdrawal" },
  deposit: { icon: Wallet, className: TINT_GREEN, label: "Deposit" },
  airtime: { icon: Smartphone, className: TINT_GRAY, label: "Airtime" },
  bundles: { icon: Wifi, className: TINT_GRAY, label: "Bundles" },
  fuliza: { icon: CreditCard, className: TINT_AMBER, label: "Fuliza" },
  receive: { icon: ArrowDownLeft, className: TINT_GREEN, label: "Received" },
  salary: { icon: Briefcase, className: TINT_GREEN, label: "Salary" },
  savings: { icon: PiggyBank, className: TINT_GRAY, label: "Savings" },
  reversal: { icon: RotateCcw, className: TINT_GRAY, label: "Reversal" },
  fees: { icon: Receipt, className: TINT_GRAY, label: "Fees" },
  other: { icon: ArrowLeftRight, className: TINT_GRAY, label: "Other" },
};

const FALLBACK_STYLE = TYPE_STYLES.other;

/** Plain record lookup — no inference, no per-render matching. */
export function typeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? FALLBACK_STYLE;
}
