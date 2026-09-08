import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Receipt,
  Send,
  ShoppingBag,
  Smartphone,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { TransactionGroups } from "../../bindings/mpesa-analyzer/parseservice";
import type { DayGroup } from "../../bindings/mpesa-analyzer/models";

/** Non-null normalized day group (Go slices arrive nullable at the bridge). */
export type Group = { dayKey: string; endBalance: number; txs: TransactionView[] };
type TransactionView = NonNullable<DayGroup["txs"]>[number];
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

const PAGE_SIZES = [10, 20, 30, 50];
const DEFAULT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Category -> icon/colour mapping (matches the Go classifier in
// internal/analysis.CategoryOf, whose labels arrive pre-computed on each
// row). Flat tinted badges, token-based colours so dark mode adapts.
// ---------------------------------------------------------------------------

export type CategoryStyle = { icon: LucideIcon; className: string };

const TINT_GREEN = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
const TINT_RED = "bg-red-500/10 text-red-600 dark:text-red-400";
const TINT_AMBER = "bg-amber-500/10 text-amber-600 dark:text-amber-400";
const TINT_GRAY = "bg-muted text-muted-foreground";

// Handles both CategoryOf display names ("Buy Goods") and the normalized
// keys sent by RecurringView ("buy_goods").
export function categoryStyle(cat: string): CategoryStyle {
  const c = cat.toLowerCase().replace(/_/g, " ");
  if (c.includes("receive") || c.includes("salary") || c.includes("funds"))
    return { icon: ArrowDownLeft, className: TINT_GREEN };
  if (c.includes("buy goods") || c.includes("merchant"))
    return { icon: ShoppingBag, className: TINT_RED };
  if (c.includes("pay bill"))
    return { icon: Receipt, className: TINT_AMBER };
  if (c.includes("airtime"))
    return { icon: Smartphone, className: TINT_GRAY };
  if (c.includes("withdraw"))
    return { icon: ArrowUpRight, className: TINT_RED };
  if (c.includes("send"))
    return { icon: Send, className: TINT_RED };
  if (c.includes("bundles"))
    return { icon: Wifi, className: TINT_GRAY };
  if (c.includes("bank") || c.includes("savings"))
    return { icon: Landmark, className: TINT_GRAY };
  if (c.includes("fees"))
    return { icon: Receipt, className: TINT_GRAY };
  return { icon: ArrowLeftRight, className: TINT_GRAY };
}

// ---------------------------------------------------------------------------
// Display helpers (presentation-only: locale strings, icons, prefixes)
// ---------------------------------------------------------------------------

/** Signed amount without currency (currency context is per-group). */
export function formatAmount(cents: number): string {
  const value = (Math.abs(cents) / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "-" : "+"}${value}`;
}

/** Compresses verbose M-Pesa description prefixes into compact labels. */
const DESCRIPTION_REWRITES: [string, string][] = [
  ["Merchant Payment to ", "Merchant "],
  ["Pay Bill Online to ", "Paybill "],
  ["Pay Bill to ", "Paybill "],
  ["Customer Transfer to ", "Send to "],
  ["Funds received from ", "From "],
  ["Salary Payment from ", "Salary from "],
  ["Customer Bundle Purchase to ", "Bundles "],
  ["BUNDLES by ", "Bundles "],
  ["Airtime Purchase", "Airtime"],
  ["Fuliza M-Pesa", "Fuliza"],
];

function shortenDescription(description: string): string {
  for (const [from, to] of DESCRIPTION_REWRITES) {
    if (description.startsWith(from)) return to + description.slice(from.length);
  }
  return description;
}

/** Local calendar-day key ("YYYY-MM-DD") for a Date. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "Today, 28 Apr" / "Yesterday, 27 Apr" / "28 Apr" / "28 Apr 2024". */
function dateGroupLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const today = localDayKey(new Date());
  const yesterday = localDayKey(new Date(Date.now() - 86_400_000));
  if (dayKey === today) return `Today, ${day}`;
  if (dayKey === yesterday) return `Yesterday, ${day}`;
  if (date.getFullYear() === new Date().getFullYear()) return day;
  return `${day} ${y}`;
}

// ---------------------------------------------------------------------------
// Data hook: grouping/sorting/categorization happen in Go, once per dataset.
// ---------------------------------------------------------------------------

/**
 * Calls the Go backend to sort, categorize and day-group the dataset.
 * Returns groups with true end-of-day balances, ready to render.
 */
export function useTransactionGroups(txs: parser.Transaction[]): Group[] {
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    if (txs.length === 0) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    TransactionGroups(txs)
      .then((g) => {
        if (cancelled) return;
        // Normalize nullable Go slices once at the boundary.
        setGroups(
          (g ?? []).map((d) => ({
            dayKey: d.dayKey,
            endBalance: d.endBalance,
            txs: d.txs ?? [],
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [txs]);
  return groups;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function TxRow({
  tx,
  expanded,
  onToggle,
}: {
  tx: TransactionView
  expanded: boolean
  onToggle: () => void
}) {
  const { icon: Icon, className: tint } = categoryStyle(tx.category);
  const moneyIn = tx.amount >= 0;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        {/* category badge */}
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tint}`}
          aria-hidden
        >
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </span>

        {/* text block */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-5">
            {shortenDescription(tx.description)}
          </span>
          <span className="block truncate text-[13px] leading-4 text-muted-foreground">
            {tx.date.slice(11, 16)} · {tx.category}
          </span>
        </span>

        {/* amount */}
        <span className="flex shrink-0 items-center gap-1">
          <span
            className={`whitespace-nowrap text-[15px] font-medium tabular-nums ${
              moneyIn ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatAmount(tx.amount)}
          </span>
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-border/60 bg-muted/40 px-3 py-2.5 text-[13px]">
          <DetailRow label="Description" value={tx.description} wrap />
          <DetailRow label="Reference" value={tx.id} mono />
          <DetailRow label="Balance after" value={formatMoney(tx.balance)} />
          <DetailRow label="Timestamp" value={tx.date} />
          {tx.status && tx.status.toLowerCase() !== "completed" && (
            <DetailRow label="Status" value={tx.status} />
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  wrap,
}: {
  label: string
  value: string
  mono?: boolean
  wrap?: boolean
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${wrap ? "break-words" : "truncate"}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export type TransactionListProps = {
  /** Prepared day groups (from useTransactionGroups), already filtered. */
  groups: Group[]
  /** Render the page-size select + pager footer. Default true. */
  showPagination?: boolean
}

/** Slices one page of rows out of the groups, preserving group headers. */
function paginateGroups(
  groups: Group[],
  pageIndex: number,
  pageSize: number,
): { page: Group[]; totalRows: number } {
  let totalRows = 0;
  for (const g of groups) totalRows += g.txs.length;
  const start = pageIndex * pageSize;
  const end = start + pageSize;
  const page: Group[] = [];
  let count = 0;
  for (const g of groups) {
    const gStart = count;
    count += g.txs.length;
    const gEnd = gStart + g.txs.length;
    if (gEnd <= start || gStart >= end) continue;
    const from = Math.max(0, start - gStart);
    const to = Math.min(g.txs.length, end - gStart);
    // Carry the group's true end-of-day balance even when a day is split
    // across page boundaries.
    page.push({ ...g, txs: g.txs.slice(from, to) });
  }
  return { page, totalRows };
}

/**
 * Shared transaction renderer: one bordered card per calendar day, each with
 * a date header + end-of-day balance. Grouping, sorting and categorization
 * are computed in Go (see ParseService.TransactionGroups); this component
 * only paginates and renders.
 */
export function TransactionList({
  groups,
  showPagination = true,
}: TransactionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [groups, pageSize]);

  const { page, totalRows } = useMemo(
    () => paginateGroups(groups, pageIndex, pageSize),
    [groups, pageIndex, pageSize],
  );
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-4">
      {page.length ? (
        <div className="space-y-3">
          {page.map((g) => (
            <section key={g.dayKey} className="overflow-hidden rounded-xl border">
              <header className="flex items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                <span className="text-[13px] font-medium">{dateGroupLabel(g.dayKey)}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Bal {formatMoney(g.endBalance)}
                </span>
              </header>
              <div className="divide-y divide-border">
                {g.txs.map((t) => (
                  <TxRow
                    key={t.id}
                    tx={t}
                    expanded={expandedId === t.id}
                    onToggle={() => setExpandedId((e) => (e === t.id ? null : t.id))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border py-8 text-center text-sm text-muted-foreground">
          No transactions match your search or filters.
        </div>
      )}

      {showPagination && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageIndex(0);
                setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-20" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              · {totalRows} transaction{totalRows === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPageIndex((p) => p - 1)}
              disabled={pageIndex <= 0}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPageIndex((p) => Math.min(p + 1, pageCount - 1))}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
