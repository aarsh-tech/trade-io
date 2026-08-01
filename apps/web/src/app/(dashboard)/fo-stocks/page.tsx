"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Wifi,
  Activity,
  Flame,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
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
  const { data: apiResponse } = useQuery({
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

  const totalCount = stocksList.length;

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both] pb-10">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">NSE F&O Securities Master</h1>
              <p className="text-sm text-slate-300">
                180+ liquid stock futures & indices with verified Zerodha WebSocket streaming
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Wifi className="h-3.5 w-3.5" /> Live Tick Stream
          </div>
        </div>
      </div>

      {/* Alphabetical Index Bar (Dhan Style) */}
      <Card className="border-border">
        <CardContent className="p-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-muted-foreground mr-2 whitespace-nowrap">Filter A-Z:</span>
            {ALPHABETS.map((letter) => (
              <button
                key={letter}
                onClick={() => setSelectedAlphabet(letter)}
                className={cn(
                  "min-w-[28px] h-7 px-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center",
                  selectedAlphabet === letter
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filter & View Switcher Bar */}
      <Card className="border-border">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-muted/60 border border-border w-full md:w-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    selectedCategory === cat
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Controls: Search, View Mode & Rows per Page */}
            <div className="flex items-center gap-3 w-full md:w-auto ml-auto">
              <div className="relative flex-1 md:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Search stock..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full pl-9 pr-3 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {/* View Switcher Buttons */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted border border-border">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1",
                    viewMode === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                  title="Table View"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1",
                    viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                  title="Grid View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>

              {/* Page Size Selector */}
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 px-2 rounded-lg bg-background border border-border text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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

      {/* Main Content Area: Table View vs Grid View */}
      {viewMode === "table" ? (
        <Card className="border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/80 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 cursor-pointer hover:text-foreground" onClick={() => toggleSort("symbol")}>
                    <div className="flex items-center gap-1">
                      Symbol & Company <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("lotSize")}>
                    <div className="flex items-center justify-end gap-1">
                      F&O Lot Size <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("price")}>
                    <div className="flex items-center justify-end gap-1">
                      Live Price (LTP) <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedStocks.map((stock, idx) => {
                  const wsKey = `${stock.exchange}:${stock.symbol}`;
                  const livePrice = prices[wsKey] || stock.basePrice;
                  const flash = flashStates[wsKey];
                  const globalIdx = (page - 1) * (pageSize === -1 ? 0 : pageSize) + idx + 1;

                  return (
                    <tr
                      key={stock.symbol}
                      className={cn(
                        "hover:bg-muted/40 transition-colors group",
                        flash === "up" && "bg-emerald-500/10",
                        flash === "down" && "bg-rose-500/10"
                      )}
                    >
                      <td className="py-3 px-4 text-center text-xs text-muted-foreground font-mono">{globalIdx}</td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground group-hover:text-indigo-400 transition-colors">
                                {stock.symbol}
                              </span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 border-indigo-500/30 text-indigo-400">
                                {stock.exchange}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{stock.name}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                          {stock.category}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-extrabold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {stock.lotSize.toLocaleString("en-IN")}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={cn(
                            "text-sm font-extrabold transition-colors duration-300",
                            flash === "up" ? "text-emerald-400" : flash === "down" ? "text-rose-400" : "text-foreground"
                          )}
                        >
                          ₹{livePrice.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            router.push(
                              `/strategies/new?symbol=${encodeURIComponent(stock.symbol)}&lotSize=${stock.lotSize}&type=STOCK_OPTIONS_BUYING`
                            );
                          }}
                          className="h-8 px-3 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white text-xs font-semibold gap-1.5 transition-all"
                        >
                          <Zap className="h-3.5 w-3.5" /> Trade Option
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
        /* Grid Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedStocks.map((stock) => {
            const wsKey = `${stock.exchange}:${stock.symbol}`;
            const livePrice = prices[wsKey] || stock.basePrice;
            const flash = flashStates[wsKey];

            return (
              <Card
                key={stock.symbol}
                className={cn(
                  "group relative overflow-hidden transition-all duration-300 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10",
                  flash === "up" && "bg-emerald-500/10 border-emerald-500/50",
                  flash === "down" && "bg-rose-500/10 border-rose-500/50"
                )}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-foreground group-hover:text-indigo-400 transition-colors">
                          {stock.symbol}
                        </h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 border-indigo-500/30 text-indigo-400">
                          {stock.exchange}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{stock.name}</p>
                    </div>
                    <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                      {stock.category}
                    </Badge>
                  </div>

                  <div className="flex items-end justify-between pt-2 border-t border-border/50">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">F&O Lot Size</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {stock.lotSize.toLocaleString("en-IN")} Shares
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Live Price</p>
                      <div
                        className={cn(
                          "text-lg font-extrabold tracking-tight transition-colors duration-300",
                          flash === "up" ? "text-emerald-400" : flash === "down" ? "text-rose-400" : "text-foreground"
                        )}
                      >
                        ₹{livePrice.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        router.push(
                          `/strategies/new?symbol=${encodeURIComponent(stock.symbol)}&lotSize=${stock.lotSize}&type=STOCK_OPTIONS_BUYING`
                        );
                      }}
                      className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-md shadow-indigo-600/20 gap-2 text-xs font-semibold rounded-lg"
                    >
                      <Zap className="h-3.5 w-3.5" /> Trade Option Strategy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {pageSize !== -1 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredStocks.length)} of {filteredStocks.length} F&O securities
          </p>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs font-semibold px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2 text-xs gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {filteredStocks.length === 0 && (
        <Card className="border-border">
          <CardContent className="p-12 text-center space-y-3">
            <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
            <h3 className="text-lg font-bold">No F&O Securities Found</h3>
            <p className="text-sm text-muted-foreground">
              Try selecting another letter or clearing search filters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
