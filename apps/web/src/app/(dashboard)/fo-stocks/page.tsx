"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Zap,
  Layers,
  Wifi,
  Flame,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  SlidersHorizontal,
  RefreshCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarketData } from "@/hooks/use-market-data";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface FoStockItem {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  lotSize: number;
  basePrice: number;
}

const ALPHABETS = [
  "ALL", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
];

const CATEGORIES = ["ALL", "Indices", "Banking", "IT", "Energy & Metals", "Auto", "FMCG", "Pharma"];

export default function FoStocksPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedAlphabet, setSelectedAlphabet] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sortBy, setSortBy] = useState<"symbol" | "lotSize" | "price">("symbol");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Fetch F&O stocks list from backend API
  const { data: apiResponse, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fo-stocks"],
    queryFn: async () => {
      try {
        const res = await api.get("/market/fo-stocks");
        return res.data?.data || [];
      } catch {
        return [];
      }
    },
  });

  const stocksList: FoStockItem[] = useMemo(() => {
    if (apiResponse && apiResponse.length > 0) {
      return apiResponse.map((item: any) => ({
        symbol: item.symbol,
        name: item.name || item.symbol,
        exchange: item.exchange || "NSE",
        category: item.category || "Equity",
        lotSize: item.lotSize || 1,
        basePrice: item.ltp || item.close || 100,
      }));
    }
    return [];
  }, [apiResponse]);

  // Extract keys for WebSocket live subscription
  const symbolsToSubscribe = useMemo(() => {
    return stocksList.map((s) => `${s.exchange}:${s.symbol}`);
  }, [stocksList]);

  // Connect to Zerodha WebSocket live market ticker
  const { prices } = useMarketData(symbolsToSubscribe);

  // Price change animations tracking
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [flashStates, setFlashStates] = useState<Record<string, "up" | "down" | null>>({});

  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      const newFlashes: Record<string, "up" | "down" | null> = {};
      Object.keys(prices).forEach((key) => {
        const current = prices[key];
        const previous = prevPrices[key];
        if (previous && current !== previous) {
          newFlashes[key] = current > previous ? "up" : "down";
        }
      });
      setFlashStates((prev) => ({ ...prev, ...newFlashes }));
      setPrevPrices(prices);

      const timer = setTimeout(() => {
        setFlashStates({});
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [prices]);

  // Filter & Sort Logic
  const filteredStocks = useMemo(() => {
    return stocksList
      .filter((s) => {
        const matchAlphabet =
          selectedAlphabet === "ALL" || s.symbol.toUpperCase().startsWith(selectedAlphabet);
        const matchCategory = selectedCategory === "ALL" || s.category === selectedCategory;
        const matchSearch =
          s.symbol.toLowerCase().includes(search.toLowerCase()) ||
          s.name.toLowerCase().includes(search.toLowerCase());
        return matchAlphabet && matchCategory && matchSearch;
      })
      .sort((a, b) => {
        let valA: any = a.symbol;
        let valB: any = b.symbol;

        if (sortBy === "lotSize") {
          valA = a.lotSize;
          valB = b.lotSize;
        } else if (sortBy === "price") {
          valA = prices[`${a.exchange}:${a.symbol}`] || a.basePrice;
          valB = prices[`${b.exchange}:${b.symbol}`] || b.basePrice;
        }

        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [stocksList, selectedAlphabet, selectedCategory, search, sortBy, sortOrder, prices]);

  // Paginated stocks
  const totalPages = Math.ceil(filteredStocks.length / pageSize) || 1;
  const paginatedStocks = useMemo(() => {
    if (pageSize === -1) return filteredStocks;
    const start = (page - 1) * pageSize;
    return filteredStocks.slice(start, start + pageSize);
  }, [filteredStocks, page, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedAlphabet, selectedCategory, pageSize]);

  const toggleSort = (field: "symbol" | "lotSize" | "price") => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both] pb-12 font-sans">
      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Flame className="h-6 w-6 text-blue-600" />
            NSE F&O Securities Master
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            180+ liquid stock futures & indices with live Zerodha WebSocket streaming
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Wifi className="h-3.5 w-3.5 text-emerald-600" />
            <span>Live Ticks</span>
          </div>

          <Badge variant="secondary" className="h-9 px-3 text-xs font-mono font-bold bg-slate-100 text-slate-800 border-slate-200">
            {stocksList.length} F&O Contracts
          </Badge>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-slate-200 bg-white hover:bg-slate-50 shadow-2xs"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCcw className={cn("h-4 w-4 text-slate-500", isFetching && "animate-spin text-blue-600")} />
          </Button>
        </div>
      </div>

      {/* ── 2. Alphabetical Filter Bar (A-Z) ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 whitespace-nowrap shrink-0">
              Filter A-Z:
            </span>
            {ALPHABETS.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedAlphabet(letter)}
                className={cn(
                  "min-w-[28px] h-7 px-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center shrink-0",
                  selectedAlphabet === letter
                    ? "bg-blue-600 text-white shadow-sm font-bold"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Category Filter & View Toolbar ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Category Pills */}
            <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-slate-50 border border-slate-200/80">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                    selectedCategory === cat
                      ? "bg-white text-blue-600 shadow-2xs font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Right Controls: Search, View Mode, Rows per page */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Search */}
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search stock symbol..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 pr-3 text-xs bg-white border-slate-200 text-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* View Switcher */}
              <div className="flex items-center p-1 rounded-lg bg-slate-50 border border-slate-200/80">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1",
                    viewMode === "table" ? "bg-white text-blue-600 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
                  )}
                  title="Table View"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1",
                    viewMode === "grid" ? "bg-white text-blue-600 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
                  )}
                  title="Grid View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>

              {/* Rows Per Page */}
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={-1}>Show All</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Main Content: Table or Grid ── */}
      {viewMode === "table" ? (
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 cursor-pointer hover:text-slate-700 transition-colors" onClick={() => toggleSort("symbol")}>
                    <div className="flex items-center gap-1">
                      Symbol & Name <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-700 transition-colors" onClick={() => toggleSort("lotSize")}>
                    <div className="flex items-center justify-end gap-1">
                      F&O Lot Size <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-700 transition-colors" onClick={() => toggleSort("price")}>
                    <div className="flex items-center justify-end gap-1">
                      Live LTP (₹) <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Strategy Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStocks.map((stock, idx) => {
                  const wsKey = `${stock.exchange}:${stock.symbol}`;
                  const livePrice = prices[wsKey] || stock.basePrice;
                  const flash = flashStates[wsKey];
                  const globalIdx = (page - 1) * (pageSize === -1 ? 0 : pageSize) + idx + 1;

                  return (
                    <tr
                      key={stock.symbol}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors group",
                        flash === "up" && "bg-emerald-50/60",
                        flash === "down" && "bg-rose-50/60"
                      )}
                    >
                      <td className="py-3 px-4 text-center text-slate-400 font-mono">{globalIdx}</td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                            {stock.symbol}
                          </span>
                          <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1 text-slate-500">
                            {stock.exchange}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{stock.name}</p>
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-[10px] font-medium">
                          {stock.category}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          {stock.lotSize.toLocaleString("en-IN")} Shares
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={cn(
                            "text-sm font-bold transition-colors duration-300",
                            flash === "up" ? "text-emerald-600" : flash === "down" ? "text-rose-600" : "text-slate-900"
                          )}
                        >
                          ₹{livePrice.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            router.push(
                              `/strategies/new?symbol=${encodeURIComponent(stock.symbol)}&lotSize=${stock.lotSize}&type=STOCK_OPTIONS_BUYING`
                            );
                          }}
                          className="h-7 px-3 border-blue-200 text-blue-600 hover:bg-blue-50 text-[11px] font-semibold gap-1 transition-all"
                        >
                          <Zap className="h-3 w-3" /> Trade Option
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedStocks.map((stock) => {
            const wsKey = `${stock.exchange}:${stock.symbol}`;
            const livePrice = prices[wsKey] || stock.basePrice;
            const flash = flashStates[wsKey];

            return (
              <Card
                key={stock.symbol}
                className={cn(
                  "border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-sm transition-all group",
                  flash === "up" && "bg-emerald-50/40 border-emerald-300",
                  flash === "down" && "bg-rose-50/40 border-rose-300"
                )}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {stock.symbol}
                        </h3>
                        <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1">
                          {stock.exchange}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{stock.name}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700">
                      {stock.category}
                    </Badge>
                  </div>

                  <div className="flex items-end justify-between pt-2 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-slate-400">Lot Size</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 mt-0.5">
                        {stock.lotSize.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] uppercase font-semibold text-slate-400">Live Price</p>
                      <div
                        className={cn(
                          "text-base font-bold font-mono transition-colors",
                          flash === "up" ? "text-emerald-600" : flash === "down" ? "text-rose-600" : "text-slate-900"
                        )}
                      >
                        ₹{livePrice.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      router.push(
                        `/strategies/new?symbol=${encodeURIComponent(stock.symbol)}&lotSize=${stock.lotSize}&type=STOCK_OPTIONS_BUYING`
                      );
                    }}
                    className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs font-semibold rounded-lg shadow-2xs"
                  >
                    <Zap className="h-3.5 w-3.5" /> Trade Option Strategy
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 5. Pagination ── */}
      {pageSize !== -1 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 font-medium">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredStocks.length)} of {filteredStocks.length} F&O securities
          </p>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs font-mono font-semibold px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5 text-xs gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {filteredStocks.length === 0 && (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-12 text-center space-y-3">
            <Layers className="h-10 w-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">No F&O Securities Found</h3>
            <p className="text-xs text-slate-500">
              Try selecting another letter or clearing your search filters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
