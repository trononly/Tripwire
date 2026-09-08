import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GetRecurringPayments } from "../../bindings/mpesa-analyzer/parseservice";
import type { RecurringView } from "../../bindings/mpesa-analyzer/internal/analysis/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryStyle, formatAmount } from "@/components/transaction-list";

/** Debounced Go binding: search + sort happen server-side, never in JS. */
function useRecurringPayments(
  txs: parser.Transaction[],
  search: string,
  sortBy: string,
) {
  const [rows, setRows] = useState<RecurringView[]>([]);
  useEffect(() => {
    if (txs.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    // Debounce so typing in the search box doesn't spam the bridge.
    const timer = setTimeout(() => {
      GetRecurringPayments(txs, search, sortBy)
        .then((r) => {
          if (!cancelled) setRows(r ?? []);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [txs, search, sortBy]);
  return rows;
}

// Cadence badge tints (per spec: Daily → danger, few/week → warning,
// Weekly-ish → accent blue, Monthly/Irregular → neutral).
const CADENCE_STYLES: Record<string, string> = {
  Daily: "bg-red-500/10 text-red-600 dark:text-red-400",
  "A few times a week": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Weekly-ish": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Monthly: "bg-muted text-muted-foreground",
  Irregular: "bg-muted text-muted-foreground",
};

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function RecurringRow({ r }: { r: RecurringView }) {
  const navigate = useNavigate();
  const { icon: Icon, className: tint } = categoryStyle(r.category);
  const cadence = CADENCE_STYLES[r.frequencyLabel] ?? CADENCE_STYLES.Irregular;
  const nextDue = r.nextDue ? ` · again ~${shortDate(r.nextDue)}` : "";
  return (
    <button
      type="button"
      onClick={() => navigate(`/transactions?q=${encodeURIComponent(r.label)}`)}
      title={`View all transactions with ${r.label}`}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tint}`}
        aria-hidden
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-5">
          {r.label}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${cadence}`}
          >
            {r.frequencyLabel}
          </span>
          <span className="truncate">
            {r.count}×{nextDue}
          </span>
        </span>
      </span>

      <span
        className={`shrink-0 whitespace-nowrap text-[15px] font-medium tabular-nums ${
          r.direction === "in"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {formatAmount(r.direction === "in" ? Math.round(r.amount * 100) : -Math.round(r.amount * 100))}
      </span>
    </button>
  );
}

const SORT_OPTIONS = [
  { value: "impact", label: "Impact" },
  { value: "amount", label: "Amount" },
  { value: "frequency", label: "Frequency" },
  { value: "next_due", label: "Next due" },
];

export function RecurringPayments({ transactions }: { transactions: parser.Transaction[] }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("impact");
  const rows = useRecurringPayments(transactions, search, sortBy);

  return (
    <div className="space-y-3">
      {/* toolbar: search + sort, both wired straight to the Go binding */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search recurring payments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="sm:w-36">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {rows.length} pattern{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* single card container, thin dividers, no table */}
      <div className="overflow-hidden rounded-xl border">
        {rows.length > 0 ? (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <RecurringRow key={`${r.label}|${r.direction}`} r={r} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {search
              ? "Nothing matches your search."
              : "No recurring payments detected in this statement."}
          </div>
        )}
      </div>
    </div>
  );
}
