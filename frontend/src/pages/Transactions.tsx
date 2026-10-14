import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import {
  TransactionList,
  useTransactionGroups,
} from "@/components/transaction-list";
import type { Group } from "@/components/transaction-list";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

/** Applies the page toolbar's filters to the prepared day groups. */
function filterGroups(
  groups: Group[],
  search: string,
  categoryFilter: string,
  directionFilter: "all" | "in" | "out",
  fromDate: string,
  toDate: string,
): Group[] {
  const q = search.trim().toLowerCase();
  const out: Group[] = [];
  for (const g of groups) {
    const txs = g.txs.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter)
        return false;
      if (directionFilter === "in" && t.amount < 0) return false;
      if (directionFilter === "out" && t.amount >= 0) return false;
      const day = t.date.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      if (
        q &&
        !t.description.toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    if (txs.length > 0) out.push({ ...g, txs });
  }
  return out;
}

function TxDataTable({ txs }: { txs: parser.Transaction[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const groups = useTransactionGroups(txs);

  const [globalFilter, setGlobalFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") ?? "all",
  );
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">(
    "all",
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    // Deep links: ?category=X (from dashboard charts). A ?q= navigation starts a fresh view:
    // it becomes the search term and other filters reset.
    const q = searchParams.get("q");
    if (q !== null) {
      setGlobalFilter(q);
      setCategoryFilter("all");
      setDirectionFilter("all");
      setFromDate("");
      setToDate("");
      return;
    }
    const fromUrl = searchParams.get("category");
    if (fromUrl) setCategoryFilter(fromUrl);
  }, [searchParams]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const t of g.txs) set.add(t.category);
    return [...set].sort();
  }, [groups]);

  const filteredGroups = useMemo(
    () =>
      filterGroups(
        groups,
        globalFilter,
        categoryFilter,
        directionFilter,
        fromDate,
        toDate,
      ),
    [groups, globalFilter, categoryFilter, directionFilter, fromDate, toDate],
  );

  const activeFilters =
    (categoryFilter !== "all" ? 1 : 0) +
    (directionFilter !== "all" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);
  const shownCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.txs.length, 0),
    [filteredGroups],
  );
  const totalCount = useMemo(
    () => groups.reduce((n, g) => n + g.txs.length, 0),
    [groups],
  );
  const isFiltered = globalFilter.trim() !== "" || activeFilters > 0;

  const clearFilters = () => {
    setCategoryFilter("all");
    setDirectionFilter("all");
    setFromDate("");
    setToDate("");
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="space-y-4">
      {/* Header row: search + filter button. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Search transactions…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pr-9"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={() => setGlobalFilter("")}
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Filters"
          onClick={() => setFiltersOpen(true)}
          className="relative size-10 shrink-0"
        >
          <SlidersHorizontal className="size-4" />
          {activeFilters > 0 && (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilters}
            </span>
          )}
        </Button>
      </div>
      {/* Filter sheet: all filter controls in a bottom sheet, like modern mobile apps. */}
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Filter transactions</DrawerTitle>
            <DrawerDescription>
              {shownCount} of {totalCount} transactions match.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={categoryFilter}
                onValueChange={(v) => {
                  setCategoryFilter(v);
                  if (v === "all") setSearchParams({}, { replace: true });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {allCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Direction</label>
              <Select
                value={directionFilter}
                onValueChange={(v) => setDirectionFilter(v as "all" | "in" | "out")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Money in & out</SelectItem>
                  <SelectItem value="in">Money in</SelectItem>
                  <SelectItem value="out">Money out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">From date</label>
                <Input
                  type="date"
                  aria-label="From date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">To date</label>
                <Input
                  type="date"
                  aria-label="To date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={clearFilters} disabled={activeFilters === 0}>
              Clear filters
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {isFiltered
          ? `Showing ${shownCount.toLocaleString()} of ${totalCount.toLocaleString()} transactions`
          : `${totalCount.toLocaleString()} transactions`}
      </p>

      <TransactionList groups={filteredGroups} />
    </div>
  );
}

export default function Transactions({
  transactions,
  onRefresh,
}: {
  transactions: parser.Transaction[];
  /** Pull-to-refresh action: drains new arrivals and resolves when done. */
  onRefresh: () => Promise<unknown>;
}) {
  // Pull-to-refresh: dragging down from the very top reveals an arrow that
  // rotates with pull distance; releasing past threshold merges arrivals.
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  return (
    <div
      className="space-y-6"
      onTouchStart={(e) => {
        if (window.scrollY <= 0 && !refreshing) {
          startY.current = e.touches[0].clientY;
        }
      }}
      onTouchMove={(e) => {
        if (startY.current === null || refreshing) return;
        const d = e.touches[0].clientY - startY.current;
        setPull(d > 0 ? Math.min(d * 0.5, 96) : 0);
      }}
      onTouchEnd={() => {
        startY.current = null;
        if (pull >= 64 && !refreshing) {
          setRefreshing(true);
          const started = Date.now();
          onRefresh().finally(() => {
            const wait = Math.max(0, 700 - (Date.now() - started));
            window.setTimeout(() => {
              setRefreshing(false);
              setPull(0);
            }, wait);
          });
        } else {
          setPull(0);
        }
      }}
    >
      {(pull > 0 || refreshing) && (
        <div
          className="flex items-start justify-center overflow-hidden"
          style={{ height: refreshing ? 44 : pull }}
          aria-hidden="true"
        >
          {refreshing ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <ArrowDown
              className="size-5 text-muted-foreground transition-transform"
              style={{ transform: `rotate(${Math.min(pull / 64, 1) * 180}deg)` }}
            />
          )}
        </div>
      )}
      {transactions.length > 0 ? (
        <TxDataTable txs={transactions} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Normalized financial transactions from PDF and SMS imports.
          </p>
          <Card className="flex min-h-64 items-center justify-center border-dashed">
            <CardContent className="flex max-w-sm flex-col items-center gap-4 pt-6 text-center">
              <p className="text-lg font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground">
                Import a PDF statement or, on Android, M-Pesa SMS messages to
                see normalized transactions here.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
