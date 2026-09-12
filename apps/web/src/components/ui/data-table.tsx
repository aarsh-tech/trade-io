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
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn("text-xs font-semibold text-muted-foreground", className)}>{title}</div>;
  }

  const isSorted = column.getIsSorted();

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(isSorted === "asc")}
      className={cn(
        "flex items-center gap-1 -ml-1.5 px-1.5 py-1 rounded hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors group cursor-pointer",
        isSorted && "text-foreground font-bold",
        className
      )}
    >
      <span>{title}</span>
      {isSorted === "desc" ? (
        <ArrowDown className="h-3 w-3 text-blue-600" />
      ) : isSorted === "asc" ? (
        <ArrowUp className="h-3 w-3 text-blue-600" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
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

  // Close column dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
              className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border bg-background shadow-2xs"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Columns</span>
            </Button>

            {showColumnMenu && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-border bg-card p-2 shadow-xl z-30 space-y-1 animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                  Toggle Columns
                </div>
                <div className="max-h-56 overflow-y-auto pt-1 space-y-0.5">
                  {table
                    .getAllColumns()
                    .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                    .map((column) => {
                      const isVisible = column.getIsVisible();
                      return (
                        <button
                          key={column.id}
                          type="button"
                          onClick={() => column.toggleVisibility(!isVisible)}
                          className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-left rounded-md hover:bg-muted transition-colors"
                        >
                          <span className="capitalize text-foreground font-medium">
                            {typeof column.columnDef.header === "string"
                              ? column.columnDef.header
                              : column.id}
                          </span>
                          {isVisible && <Check className="h-3.5 w-3.5 text-blue-600" />}
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
