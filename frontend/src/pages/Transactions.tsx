import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  TransactionList,
  useTransactionGroups,
} from "@/components/transaction-list";
import type { Group } from "@/components/transaction-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  return (
    <div className="space-y-4">
      {/* toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search transactions…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            if (v === "all") setSearchParams({}, { replace: true });
          }}
        >
          <SelectTrigger className="sm:w-44">
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
        <Select
          value={directionFilter}
          onValueChange={(v) => setDirectionFilter(v as "all" | "in" | "out")}
        >
          <SelectTrigger className="sm:w-32">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Money in & out</SelectItem>
            <SelectItem value="in">Money in</SelectItem>
            <SelectItem value="out">Money out</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-38"
          />
          <span>to</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-38]"
          />
        </div>
        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCategoryFilter("all");
              setDirectionFilter("all");
              setFromDate("");
              setToDate("");
              setSearchParams({}, { replace: true });
            }}
          >
            Clear filters ({activeFilters})
          </Button>
        )}
      </div>

      <TransactionList groups={filteredGroups} />
    </div>
  );
}

export default function Transactions({
  transactions,
}: {
  transactions: parser.Transaction[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">
          Browse and search your M-Pesa transactions.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Transactions</CardTitle>
          <CardDescription>
            {transactions.length > 0
              ? `${transactions.length} transactions from your latest statement.`
              : "Your transactions will show up here once you load a statement."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <TxDataTable txs={transactions} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to display yet. Use “Import statement” to load one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
