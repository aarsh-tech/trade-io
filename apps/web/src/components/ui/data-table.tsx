"use client";

import * as React from "react";
import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  SlidersHorizontal,
  Inbox,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Column Header Helper with Sorting ───────────────────────────────────────
interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  align?: "left" | "center" | "right";
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  align,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const isRight = align === "right" || className?.includes("justify-end") || className?.includes("text-right");
  const isCenter = align === "center" || className?.includes("justify-center") || className?.includes("text-center");

  if (!column.getCanSort()) {
    return (
      <div
        className={cn(
          "text-xs font-semibold text-muted-foreground",
          isRight ? "text-right" : isCenter ? "text-center" : "text-left",
          className
        )}
      >
        {title}
      </div>
    );
  }

  const isSorted = column.getIsSorted();

  return (
    <div className={cn("flex items-center w-full", isRight ? "justify-end" : isCenter ? "justify-center" : "justify-start")}>
      <button
        type="button"
        onClick={() => column.toggleSorting(isSorted === "asc")}
        className={cn(
          "inline-flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors group cursor-pointer select-none",
          !isRight && !isCenter && "-ml-1.5",
          isRight && "-mr-1.5",
          isSorted && "text-foreground font-bold",
          className
        )}
      >
        <span>{title}</span>
        {isSorted === "desc" ? (
          <ArrowDown className="h-3 w-3 text-blue-600 shrink-0" />
        ) : isSorted === "asc" ? (
          <ArrowUp className="h-3 w-3 text-blue-600 shrink-0" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </button>
    </div>
  );
}

// ─── Column Title Normalizer ───────────────────────────────────────────────
const COLUMN_LABEL_MAP: Record<string, string> = {
  symbol: "Instrument",
  product: "Product",
  qty: "Quantity",
  avgPrice: "Avg. Price",
  ltp: "LTP",
  pnl: "Current P&L",
  pnlPct: "Change %",
  action: "Action",
  createdAt: "Time (IST)",
  side: "Side",
  productType: "Product",
  orderType: "Order Type",
  price: "Price / Trigger",
  status: "Status",
  name: "User Details",
  role: "Role",
  isActive: "Account Status",
  hasActiveSession: "Live Session",
};

function getColumnTitle(column: Column<any, any>): string {
  if ((column.columnDef.meta as any)?.title) {
    return (column.columnDef.meta as any).title;
  }
  if (typeof column.columnDef.header === "string") {
    return column.columnDef.header;
  }
  if (COLUMN_LABEL_MAP[column.id]) {
    return COLUMN_LABEL_MAP[column.id];
  }
  // Convert camelCase to title case
  return column.id
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// ─── Reusable DataTable Component ───────────────────────────────────────────
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  actions?: React.ReactNode;
  toolbarExtra?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search records...",
  isLoading = false,
  emptyMessage = "No records found.",
  pageSize = 10,
  actions,
  toolbarExtra,
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState<string>("");
  const [showColumnMenu, setShowColumnMenu] = React.useState(false);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const columnMenuRef = React.useRef<HTMLDivElement>(null);

  // Close column dropdown on outside click or Escape
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowColumnMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── Toolbar: Search, Filters, and Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          {searchKey ? (
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder}
                value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
                onChange={(e) =>
                  table.getColumn(searchKey)?.setFilterValue(e.target.value)
                }
                className="pl-9 h-9 text-xs border-border bg-background shadow-2xs"
              />
            </div>
          ) : (
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={searchPlaceholder}
                value={globalFilter ?? ""}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 h-9 text-xs border-border bg-background shadow-2xs"
              />
            </div>
          )}
          {toolbarExtra}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Column Visibility Toggle */}
          <div className="relative" ref={columnMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColumnMenu((prev) => !prev)}
              className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border bg-card shadow-2xs"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Columns</span>
            </Button>

            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border dark:border-slate-800 bg-card dark:bg-slate-900 p-2 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border dark:border-slate-800">
                  <span>Toggle Columns</span>
                  <button
                    type="button"
                    onClick={() => {
                      table.getAllColumns().forEach((col) => {
                        if (col.getCanHide()) col.toggleVisibility(true);
                      });
                    }}
                    className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer lowercase first-letter:uppercase"
                  >
                    Reset
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto pt-1 space-y-0.5 custom-scrollbar">
                  {table
                    .getAllColumns()
                    .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                    .map((column) => {
                      const isVisible = column.getIsVisible();
                      const title = getColumnTitle(column);
                      return (
                        <button
                          key={column.id}
                          type="button"
                          onClick={() => column.toggleVisibility(!isVisible)}
                          className={cn(
                            "w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left rounded-md transition-colors cursor-pointer",
                            isVisible
                              ? "text-foreground font-medium hover:bg-muted"
                              : "text-muted-foreground hover:bg-muted/50"
                          )}
                        >
                          <span className="truncate pr-2">{title}</span>
                          <div
                            className={cn(
                              "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                              isVisible
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "border-border dark:border-slate-700 bg-transparent"
                            )}
                          >
                            {isVisible && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {actions}
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-b border-border">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, colIdx) => (
                    <TableCell key={colIdx} className="py-3.5">
                      <div className="h-4 w-full max-w-[120px] bg-muted/60 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    "hover:bg-muted/30 transition-colors border-b border-border/70",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-44 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 stroke-[1.5] opacity-50" />
                    <p className="text-xs font-medium">{emptyMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination Controls ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground px-1 py-1">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {[10, 20, 30, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="hidden sm:inline">
            Showing{" "}
            <strong className="text-foreground font-mono">
              {table.getFilteredRowModel().rows.length > 0
                ? table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1
                : 0}
            </strong>{" "}
            to{" "}
            <strong className="text-foreground font-mono">
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}
            </strong>{" "}
            of{" "}
            <strong className="text-foreground font-mono">
              {table.getFilteredRowModel().rows.length}
            </strong>{" "}
            records
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="font-mono text-xs text-muted-foreground mr-2">
            Page <strong className="text-foreground">{table.getState().pagination.pageIndex + 1}</strong> of{" "}
            <strong className="text-foreground">{table.getPageCount() || 1}</strong>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="h-8 w-8 border-border bg-background text-foreground shadow-2xs"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 w-8 border-border bg-background text-foreground shadow-2xs"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 w-8 border-border bg-background text-foreground shadow-2xs"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="h-8 w-8 border-border bg-background text-foreground shadow-2xs"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
