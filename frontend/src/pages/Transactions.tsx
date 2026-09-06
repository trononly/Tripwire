import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
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

const columns: ColumnDef<Transaction>[] = [
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
      <span className="block max-w-[16rem] truncate sm:max-w-xs md:max-w-sm" title={row.original.description}>
        {row.original.description}
      </span>
    ),
  },
  {
    accessorKey: "status",
    meta: { thClass: "hidden md:table-cell", tdClass: "hidden md:table-cell" },
    header: ({ column }) => (
      <div className="hidden md:table-cell">
        <SortButton column={column}>Status</SortButton>
      </div>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.status}</span>
    ),
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

function TxDataTable({ txs }: { txs: Transaction[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const statuses = useMemo(
    () => [...new Set(txs.map((t) => t.status))].sort(),
    [txs],
  );

  // derived, pure: the Select maps to a column filter
  const columnFilters = useMemo<ColumnFiltersState>(
    () => (statusFilter === "all" ? [] : [{ id: "status", value: statusFilter }]),
    [statusFilter],
  );

  const table = useReactTable({
    data: txs,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
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

  return (
    <div className="space-y-4">
      {/* toolbar: search + status filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search transactions…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
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
                  No transactions match your search or filter.
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

export default function Transactions({ txs }: { txs: parser.Transaction[] }) {
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
            {txs.length > 0
              ? `${txs.length} transactions from your latest statement.`
              : "Your transactions will show up here once you load a statement."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {txs.length > 0 ? <TxDataTable txs={txs} /> : (
            <p className="text-sm text-muted-foreground">
              Nothing to display yet. Use “Import statement” to load one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
