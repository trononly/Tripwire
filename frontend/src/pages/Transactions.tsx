import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TransactionCategories } from "../../wailsjs/go/main/App";
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { parser } from "../../wailsjs/go/models";

type Transaction = parser.Transaction;

const PAGE_SIZES = [10, 20, 30, 50];
const DEFAULT_PAGE_SIZE = 20;

const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatMoney(cents: number): string {
  const value = (cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `KES ${value}`;
}

function formatDate(iso: string): string {
  // backend format: "2006-01-02 15:04:05"
  const [date, time] = iso.split(" ");
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

function SortButton({
  column,
  children,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; getToggleSortingHandler: () => unknown };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 font-medium"
      onClick={column.getToggleSortingHandler() as React.MouseEventHandler}
    >
      {children}
      <Icon className={`size-3.5 ${sorted ? "" : "opacity-40"}`} />
    </Button>
  );
}

function buildColumns(categories: Map<string, string>, allCategories: string[]): ColumnDef<Transaction>[] {
  return [
    {
      accessorKey: "date",
      header: ({ column }) => <SortButton column={column}>Date</SortButton>,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.date)}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => <SortButton column={column}>Description</SortButton>,
      cell: ({ row }) => (
        <span className="block max-w-[14rem] truncate sm:max-w-xs md:max-w-sm" title={row.original.description}>
          {row.original.description}
        </span>
      ),
    },
    {
      accessorKey: "category",
      meta: { thClass: "hidden lg:table-cell", tdClass: "hidden lg:table-cell" },
      header: () => <div className="hidden lg:table-cell text-muted-foreground">Category</div>,
      cell: ({ row }) => {
        const cat = categories.get(row.original.id) ?? "Other";
        const i = allCategories.indexOf(cat);
        return (
          <span className="hidden lg:inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: CATEGORY_COLORS[(i < 0 ? 0 : i) % CATEGORY_COLORS.length] }}
            />
            {cat}
          </span>
        );
      },
    },
    {
      accessorKey: "amount",
      enableGlobalFilter: false,
      header: ({ column }) => (
        <div className="text-right">
          <SortButton column={column}>Amount</SortButton>
        </div>
      ),
      cell: ({ row }) => (
        <span
          className={`whitespace-nowrap tabular-nums ${
            row.original.amount < 0
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {formatMoney(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: "balance",
      enableGlobalFilter: false,
      meta: { thClass: "hidden sm:table-cell", tdClass: "hidden sm:table-cell" },
      header: ({ column }) => (
        <div className="hidden sm:table-cell text-right">
          <SortButton column={column}>Balance</SortButton>
        </div>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-right tabular-nums">
          {formatMoney(row.original.balance)}
        </span>
      ),
    },
  ];
}

function TxDataTable({ txs }: { txs: Transaction[] }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // Filters: category (deep-linkable via ?category=), direction, date range.
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") ?? "all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const fromUrl = searchParams.get("category");
    if (fromUrl) setCategoryFilter(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (txs.length === 0) return;
    let cancelled = false;
    TransactionCategories(txs).then((m) => {
      if (!cancelled) setCategories(new Map(Object.entries(m)));
    });
    return () => {
      cancelled = true;
    };
  }, [txs]);

  const allCategories = useMemo(
    () => [...new Set(txs.map((t) => categories.get(t.id) ?? "Other"))].sort(),
    [txs, categories],
  );

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (categoryFilter !== "all" && (categories.get(t.id) ?? "Other") !== categoryFilter) return false;
      if (directionFilter === "in" && t.amount < 0) return false;
      if (directionFilter === "out" && t.amount >= 0) return false;
      const day = t.date.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [txs, categories, categoryFilter, directionFilter, fromDate, toDate]);

  const columns = useMemo(
    () => buildColumns(categories, allCategories),
    [categories, allCategories],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const totalFiltered = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
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
        <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as "all" | "in" | "out")}>
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
            className="w-[9.5rem]"
          />
          <span>to</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-[9.5rem]"
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

      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[540px]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { thClass?: string }
                    | undefined;
                  return (
                    <TableHead key={header.id} className={meta?.thClass}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { tdClass?: string }
                      | undefined;
                    return (
                      <TableCell key={cell.id} className={meta?.tdClass}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No transactions match your search or filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* footer: page size + pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => {
              setPagination((p) => ({ ...p, pageSize: Number(value), pageIndex: 0 }));
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
            · {totalFiltered} transaction{totalFiltered === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {pageCount === 0 ? 0 : pagination.pageIndex + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions({ transactions }: { transactions: parser.Transaction[] }) {
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
          {transactions.length > 0 ? <TxDataTable txs={transactions} /> : (
            <p className="text-sm text-muted-foreground">
              Nothing to display yet. Use “Import statement” to load one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
