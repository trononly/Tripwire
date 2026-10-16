import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Loader2, SlidersHorizontal, X } from "lucide-react";
import {
  TransactionList,
  useTransactionGroups,
} from "@/components/transaction-list";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { filterGroups } from "@/lib/transaction-filter";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

/** Local-day "YYYY-MM-DD" helpers for the quick date presets. */
function toDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  return toDayStr(new Date());
}

function startOfWeekStr(now = new Date()): string {
  const d = new Date(now);
  // Monday-start week: Sun (0) rolls back 6 days, else back to Monday.
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toDayStr(d);
}

function startOfMonthStr(now = new Date()): string {
  return toDayStr(new Date(now.getFullYear(), now.getMonth(), 1));
}

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function presetRange(preset: DatePreset): { from: string; to: string } {
  const today = todayStr();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: startOfWeekStr(), to: today };
    case "month":
      return { from: startOfMonthStr(), to: today };
    case "all":
      return { from: "", to: "" };
    case "custom":
    default:
      return { from: "", to: "" };
  }
}

/** Guess which preset the current from/to dates correspond to. */
function inferPreset(from: string, to: string): DatePreset {
  if (!from && !to) return "all";
  const today = todayStr();
  if (from === today && to === today) return "today";
  if (from === startOfWeekStr() && to === today) return "week";
  if (from === startOfMonthStr() && to === today) return "month";
  return "custom";
}

function TxDataTable({ txs }: { txs: parser.Transaction[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const groups = useTransactionGroups(txs);

  const [globalFilter, setGlobalFilter] = useState("");
  // Applied filters drive the list behind the drawer.
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") ?? "all",
  );
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">(
    "all",
  );
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Draft filters: edited inside the drawer, committed on "Show N".
  // Chips + presets update the draft (and its live preview count)
  // instantly with no secondary picker.
  const [draftCategory, setDraftCategory] = useState(categoryFilter);
  const [draftDirection, setDraftDirection] = useState<"all" | "in" | "out">(
    directionFilter,
  );
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  const [draftPreset, setDraftPreset] = useState<DatePreset>("all");

  // Opening the drawer snapshots applied -> draft so canceling (swipe
  // down) discards edits and applying commits them in one gesture.
  useEffect(() => {
    if (filtersOpen) {
      setDraftCategory(categoryFilter);
      setDraftDirection(directionFilter);
      setDraftFrom(fromDate);
      setDraftTo(toDate);
      setDraftPreset(inferPreset(fromDate, toDate));
    }
  }, [filtersOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setDraftCategory("all");
      setDraftDirection("all");
      setDraftFrom("");
      setDraftTo("");
      setDraftPreset("all");
      return;
    }
    const fromUrl = searchParams.get("category");
    if (fromUrl) {
      setCategoryFilter(fromUrl);
      setDraftCategory(fromUrl);
    }
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

  // Live preview of the draft while the drawer is open.
  const previewGroups = useMemo(
    () =>
      filterGroups(
        groups,
        globalFilter,
        draftCategory,
        draftDirection,
        draftFrom,
        draftTo,
      ),
    [groups, globalFilter, draftCategory, draftDirection, draftFrom, draftTo],
  );
  const previewCount = useMemo(
    () => previewGroups.reduce((n, g) => n + g.txs.length, 0),
    [previewGroups],
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

  const applyDraft = () => {
    vibrateIfEnabled(12);
    setCategoryFilter(draftCategory);
    setDirectionFilter(draftDirection);
    setFromDate(draftFrom);
    setToDate(draftTo);
    if (draftCategory === "all") setSearchParams({}, { replace: true });
    else
      setSearchParams({ category: draftCategory }, { replace: true });
    setFiltersOpen(false);
  };

  const resetAll = () => {
    setCategoryFilter("all");
    setDirectionFilter("all");
    setFromDate("");
    setToDate("");
    setDraftCategory("all");
    setDraftDirection("all");
    setDraftFrom("");
    setDraftTo("");
    setDraftPreset("all");
    setGlobalFilter("");
    setSearchParams({}, { replace: true });
  };

  const pickPreset = (preset: DatePreset) => {
    vibrateIfEnabled(8);
    setDraftPreset(preset);
    if (preset !== "custom") {
      const r = presetRange(preset);
      setDraftFrom(r.from);
      setDraftTo(r.to);
    }
  };

  const chipClass = (active: boolean) =>
    cn("tile", active && "tile-active");

  const datePresets: { key: DatePreset; label: string }[] = [
    { key: "all", label: "All time" },
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-4">
      {/* Header row: search + filter button, pinned under the main header. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 -mt-4 border-b border-border bg-background/90 px-4 py-1.5 backdrop-blur-md md:-mx-6 md:-mt-6">
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
            className="relative size-8 shrink-0"
          >
            <SlidersHorizontal className="size-4" />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </Button>
        </div>
      </div>
      {/* Filter sheet: chip toggles + presets + sticky count CTA. */}
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <div className="flex items-center justify-between gap-2">
              <DrawerTitle>Filter transactions</DrawerTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAll}
                disabled={
                  draftCategory === "all" &&
                  draftDirection === "all" &&
                  !draftFrom &&
                  !draftTo &&
                  globalFilter.trim() === ""
                }
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset all
              </Button>
            </div>
          </DrawerHeader>
          <div className="space-y-5 overflow-y-auto p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Category</p>
              <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex flex-nowrap gap-2 pb-1" role="group" aria-label="Category">
                <button
                  type="button"
                  aria-pressed={draftCategory === "all"}
                  onClick={() => {
                    vibrateIfEnabled(8);
                    setDraftCategory("all");
                  }}
                  className={chipClass(draftCategory === "all")}
                >
                  All
                </button>
                {allCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={draftCategory === c}
                    onClick={() => {
                      vibrateIfEnabled(8);
                      setDraftCategory(draftCategory === c ? "all" : c);
                    }}
                    className={chipClass(draftCategory === c)}
                  >
                    {c}
                  </button>
                ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Direction</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Direction">
                {(
                  [
                    { value: "all", label: "All" },
                    { value: "in", label: "Money In" },
                    { value: "out", label: "Money Out" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={draftDirection === d.value}
                    onClick={() => {
                      vibrateIfEnabled(8);
                      setDraftDirection(d.value);
                    }}
                    className={chipClass(draftDirection === d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Date</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Date preset">
                {datePresets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={draftPreset === p.key}
                    onClick={() => pickPreset(p.key)}
                    className={chipClass(draftPreset === p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {draftPreset === "custom" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">From date</label>
                    <Input
                      type="date"
                      aria-label="From date"
                      value={draftFrom}
                      onChange={(e) => setDraftFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">To date</label>
                    <Input
                      type="date"
                      aria-label="To date"
                      value={draftTo}
                      onChange={(e) => setDraftTo(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DrawerFooter className="sticky bottom-0 border-t border-border bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button
              onClick={applyDraft}
              className="h-12 w-full rounded-none bg-brand text-sm font-semibold text-white hover:brightness-110"
            >
              Show {previewCount.toLocaleString()}{" "}
              {previewCount === 1 ? "Transaction" : "Transactions"}
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
  // Infinite scroll companion: appears past ~600px, jumps to top.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
      {showTop && (
        <Button
          size="icon"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 size-11 rounded-full shadow-lg"
        >
          <ArrowUp className="size-5" />
        </Button>
      )}
    </div>
  );
}
