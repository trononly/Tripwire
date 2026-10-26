import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { typeStyle } from "@/lib/transaction-types";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/privacy";
import { formatMoney } from "@/lib/format";
import { TransactionReceiptDialog } from "@/components/transaction-receipt-dialog";
import { TransactionGroups } from "../../bindings/mpesa-analyzer/parseservice";
import type { DayGroup } from "../../bindings/mpesa-analyzer/models";

/** Non-null normalized day group (Go slices arrive nullable at the bridge). */
export type Group = {
  dayKey: string;
  endBalance: number;
  endOwed: number;
  txs: TransactionView[];
};
export type TransactionView = NonNullable<DayGroup["txs"]>[number];
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { CategoryIcon } from "@/components/category-icon";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import { useCategoryVersion } from "@/lib/category-refresh";

const BATCH_SIZE = 20;

// Semantic transaction type -> icon, tint and label: shared with the
// recurring-payment cards, see lib/transaction-types.

// ---------------------------------------------------------------------------
// Display helpers (presentation-only: locale strings, icons, prefixes)
// ---------------------------------------------------------------------------

/** Signed amount without currency (currency context is per-group). */
export function formatAmount(cents: number): string {
  const value = (Math.abs(cents) / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "-" : "+"}KES ${value}`;
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
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
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
  // Category rules are resolved in Go. A revision bump re-runs the grouping
  // so the row badges update the moment a category is assigned.
  const categoryVersion = useCategoryVersion();
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
            endOwed: d.endOwed ?? 0,
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
  }, [txs, categoryVersion]);
  return groups;
}

// Row

function TxRow({
  tx,
  expanded,
  onToggle,
  onVeil,
  onSetCategory,
}: {
  tx: TransactionView;
  expanded: boolean;
  onToggle: () => void;
  onVeil: () => void;
  onSetCategory?: (tx: TransactionView) => void;
}) {
  // Who: the counterparty extracted in Go, falling back to the type label
  // when the statement names none ("Airtime Purchase", "Fuliza M-Pesa",
  // "Fuliza Access Fee", "Fuliza Repayment ...").
  // What: the user's category when set, otherwise the type label, plus time.
  // The full raw description stays in the expanded detail.
  const { icon: Icon, className: tint, label: typeLabel } = typeStyle(tx.type);
  const title = tx.counterparty || typeLabel;
  const category = tx.customCategoryId
    ? { name: tx.customCategoryName, icon: tx.customCategoryIcon }
    : null;
  const moneyIn = tx.amount >= 0;
  // Long-press (touch) or right-click (mouse) veils the ledger into the
  // receipt dialog. The click after a touch long-press is swallowed.
  const pressTimer = useRef<number | null>(null);
  const veiledPress = useRef(false);
  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const badge = (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-shadow group-hover/badge:ring-2 group-hover/badge:ring-primary/25 ${tint}`}
      aria-hidden
    >
      {category ? (
        <CategoryIcon icon={category.icon} className="size-4.5" />
      ) : (
        <Icon className="size-4.5" strokeWidth={1.75} />
      )}
    </span>
  );
  return (
    <div>
      <div className="flex w-full items-stretch transition-colors hover:bg-muted/50">
        {/* The badge is its own tap target: the row click expands, the icon
            labels. A nested button would be invalid HTML, so the row is a
            container with two sibling buttons. */}
        {onSetCategory ? (
          <button
            type="button"
            onClick={() => {
              vibrateIfEnabled(8);
              onSetCategory(tx);
            }}
            className="group/badge flex shrink-0 touch-manipulation items-center justify-center py-2.5 pl-3 [-webkit-touch-callout:none]"
            aria-label={`${
              category ? `Change category, currently ${category.name}` : "Set category"
            } for ${title}`}
          >
            {badge}
          </button>
        ) : (
          <span className="flex shrink-0 items-center justify-center py-2.5 pl-3">
            {badge}
          </span>
        )}

        <button
          type="button"
          onClick={() => {
            if (veiledPress.current) {
              veiledPress.current = false;
              return;
            }
            onToggle();
          }}
          onTouchStart={() => {
            veiledPress.current = false;
            clearPress();
            pressTimer.current = window.setTimeout(() => {
              veiledPress.current = true;
              onVeil();
            }, 550);
          }}
          onTouchMove={clearPress}
          onTouchEnd={clearPress}
          onTouchCancel={clearPress}
          onContextMenu={(e) => {
            e.preventDefault();
            onVeil();
          }}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 py-2.5 pr-3 pl-3 text-left select-none [-webkit-touch-callout:none]"
        >
          {/* text block */}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium leading-5">
              {title}
            </span>
            <span className="block truncate text-[13px] leading-4 text-muted-foreground">
              {category
                ? `${category.name} · `
                : tx.counterparty
                  ? `${typeLabel} · `
                  : ""}
              {tx.date.slice(11, 16)}
            </span>
          </span>

          {/* amount */}
          <span className="flex shrink-0 items-center gap-1">
            <span
              className={`whitespace-nowrap text-[15px] font-medium tabular-nums ${
                moneyIn
                  ? "text-emerald-600 dark:text-money-in"
                  : "text-rose-600 dark:text-money-out"
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
      </div>

      {expanded && (
        <div className="space-y-1 border-t border-border/60 bg-muted/40 px-3 py-2.5 text-[13px] select-text">
          {category && (
            <DetailRow
              label="Category"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <CategoryIcon icon={category.icon} className="size-4" />
                  {category.name}
                </span>
              }
            />
          )}
          {category && <DetailRow label="Type" value={typeLabel} />}
          <DetailRow label="Description" value={tx.description} wrap />
          <DetailRow label="Reference" value={tx.id} mono wrap />
          <DetailRow
            label="Balance after"
            value={formatMoney(tx.balance)}
          />
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
  label: string;
  value: ReactNode;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${wrap ? "wrap-break-words" : "truncate"}`}
      >
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
  groups: Group[];
  /** Render the inline load-more footer. Default true. */
  showPagination?: boolean;
  /** Opens the category picker for a row's badge. Omit for read-only lists. */
  onSetCategory?: (tx: TransactionView) => void;
};

/** Slices the first `limit` rows out of the groups, preserving group headers. */
function sliceGroups(
  groups: Group[],
  limit: number,
): { page: Group[]; totalRows: number } {
  let totalRows = 0;
  for (const g of groups) totalRows += g.txs.length;
  const page: Group[] = [];
  let count = 0;
  for (const g of groups) {
    if (count >= limit) break;
    const take = Math.min(g.txs.length, limit - count);
    // Carry the group's true end-of-day balance even when a day is split
    // across load-more boundaries.
    page.push({ ...g, txs: g.txs.slice(0, take) });
    count += take;
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
  onSetCategory,
}: TransactionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Long-press inspection veil (receipt dialog over a censored ledger).
  const [veiled, setVeiled] = useState<TransactionView | null>(null);
  // Infinite scroll: rows render in batches; the sentinel below loads more.
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [groups]);

  const { page, totalRows } = useMemo(
    () => sliceGroups(groups, visibleCount),
    [groups, visibleCount],
  );
  const shownCount = page.reduce((n, g) => n + g.txs.length, 0);
  const hasMore = shownCount < totalRows;

  // Loading more never replaces rendered rows, so no scroll jump to manage.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + BATCH_SIZE, totalRows));
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, totalRows]);

  return (
    <div className="space-y-4">
      {page.length ? (
        <div className="space-y-3">
          {page.map((g) => (
            <section
              key={g.dayKey}
              className="rounded-none border"
            >
              <header className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                <span className="text-[13px] font-medium">
                  {dateGroupLabel(g.dayKey)}
                </span>
                <Private label="Tap to reveal the balance">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Bal {formatMoney(g.endBalance)}
                    {g.endOwed > 0 ? ` · Owes ${formatMoney(g.endOwed)}` : ""}
                  </span>
                </Private>
              </header>
              <div className="divide-y divide-border">
                {g.txs.map((t) => (
                  <TxRow
                    key={t.id}
                    tx={t}
                    expanded={expandedId === t.id}
                    onToggle={() =>
                      setExpandedId((e) => (e === t.id ? null : t.id))
                    }
                    onVeil={() => setVeiled(t)}
                    onSetCategory={onSetCategory}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-none border py-8 text-center text-sm text-muted-foreground">
          No transactions match your search or filters.
        </div>
      )}

      {showPagination && totalRows > 0 && (
        <div className="flex items-center justify-between gap-2 px-1 py-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            Showing {shownCount.toLocaleString()} of{" "}
            {totalRows.toLocaleString()} tx{totalRows === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button
              variant="outline"
              onClick={() =>
                setVisibleCount((c) => Math.min(c + BATCH_SIZE, totalRows))
              }
            >
              Load more
            </Button>
          )}
        </div>
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" />}

      <TransactionReceiptDialog
        tx={veiled}
        onClose={() => setVeiled(null)}
        onViewAll={() => setVeiled(null)}
        title="Transaction details"
        showViewAll={false}
      />
    </div>
  );
}
