"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";
import { useMarketData } from "@/hooks/use-market-data";
import { QuickTradePanel, QuickTradeStock } from "@/components/dashboard/QuickTradePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  SlidersHorizontal,
  Table as TableIcon,
  LayoutGrid,
  ShieldCheck,
  Target,
  Sparkles,
  ArrowUpDown,
  Filter,
  Layers,
  Flame,
  CheckCircle2,
  Info,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WhatsAppAlertsModal } from "@/components/dashboard/WhatsAppAlertsModal";

interface OhlStockItem {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  lotSize: number;
  isFnO: boolean;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  changeFromOpen: number;
  changeFromOpenPct: number;
  diffOpenLow: number;
  diffOpenLowPct: number;
  diffOpenHigh: number;
  diffOpenHighPct: number;
  signal: "OPEN_LOW" | "OPEN_HIGH" | "NEAR_OPEN_LOW" | "NEAR_OPEN_HIGH" | "NEUTRAL";
  signalType: "BULLISH" | "BEARISH" | "NEUTRAL";
  signalStrength: "STRONG" | "MODERATE" | "WEAK";
  suggestedAction: "BUY" | "SELL" | "WATCH";
  suggestedSL: number;
  suggestedTarget1: number;
  suggestedTarget2: number;
  riskReward: string;
  riskPerShare: number;
  lastUpdated: string;
}

const CATEGORIES = ["ALL", "Banking", "IT", "Auto", "Energy & Metals", "Pharma", "FMCG", "Construction", "Capital Goods"];
const ALPHABETS = ["ALL", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

export default function LiveOhlScreenerPage() {
  // State filters
  const [activeTab, setActiveTab] = useState<"all" | "open_low" | "open_high" | "near_open_low" | "near_open_high">("all");
  const [universe, setUniverse] = useState<"fno" | "nifty50">("fno");
  const [tolerance, setTolerance] = useState<number>(0.05); // 0.05%
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedAlphabet, setSelectedAlphabet] = useState("ALL");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sortBy, setSortBy] = useState<"symbol" | "changePct" | "diff" | "volume">("changePct");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Quick Trade Modal State
  const [quickTradeStock, setQuickTradeStock] = useState<QuickTradeStock | null>(null);

  // WhatsApp Alerts Modal State
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Fetch data
  const { data: response, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ohl-stocks", universe, tolerance],
    queryFn: async () => {
      const res = await marketApi.getOhlStocks({ universe, tolerance, filter: "all" });
      return res.data?.data;
    },
    refetchInterval: 10000, // background refresh every 10s
    staleTime: 4000,
  });

  const rawStocks: OhlStockItem[] = useMemo(() => response?.stocks || [], [response]);
  const summary = response?.summary || {
    openLowCount: 0,
    openHighCount: 0,
    nearOpenLowCount: 0,
    nearOpenHighCount: 0,
    advances: 0,
    declines: 0,
    unchanged: 0,
  };

  // Subscribe to real-time WebSocket ticks for all visible stock symbols
  const subscriptionSymbols = useMemo(() => {
    return rawStocks.slice(0, 100).map((s) => s.symbol);
  }, [rawStocks]);

  const { prices: livePrices, getPrice } = useMarketData(subscriptionSymbols);

  // Keep track of price flash animations
  const [priceFlashes, setPriceFlashes] = useState<Record<string, "up" | "down">>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const newFlashes: Record<string, "up" | "down"> = {};
    Object.entries(livePrices).forEach(([sym, newPrice]) => {
      const oldPrice = prevPricesRef.current[sym];
      if (oldPrice && newPrice !== oldPrice) {
        newFlashes[sym] = newPrice > oldPrice ? "up" : "down";
      }
      prevPricesRef.current[sym] = newPrice;
    });

    if (Object.keys(newFlashes).length > 0) {
      setPriceFlashes((prev) => ({ ...prev, ...newFlashes }));
      const timer = setTimeout(() => {
        setPriceFlashes({});
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [livePrices]);

  // Combine REST data with live WebSocket price overrides
  const enrichedStocks = useMemo(() => {
    return rawStocks.map((stock) => {
      const wsPrice = getPrice(stock.symbol);
      const ltp = wsPrice && wsPrice > 0 ? wsPrice : stock.ltp;
      const change = stock.close > 0 ? Number((ltp - stock.close).toFixed(2)) : stock.change;
      const changePct = stock.close > 0 ? Number((((ltp - stock.close) / stock.close) * 100).toFixed(2)) : stock.changePct;
      const changeFromOpen = stock.open > 0 ? Number((ltp - stock.open).toFixed(2)) : stock.changeFromOpen;
      const changeFromOpenPct = stock.open > 0 ? Number((((ltp - stock.open) / stock.open) * 100).toFixed(2)) : stock.changeFromOpenPct;

      return {
        ...stock,
        ltp,
        change,
        changePct,
        changeFromOpen,
        changeFromOpenPct,
      };
    });
  }, [rawStocks, livePrices, getPrice]);


  // Filtered & Sorted Stocks
  const filteredStocks = useMemo(() => {
    let list = enrichedStocks;

    // Tab Filter
    if (activeTab === "open_low") {
      list = list.filter((s) => s.signal === "OPEN_LOW");
    } else if (activeTab === "open_high") {
      list = list.filter((s) => s.signal === "OPEN_HIGH");
    } else if (activeTab === "near_open_low") {
      list = list.filter((s) => s.signal === "NEAR_OPEN_LOW");
    } else if (activeTab === "near_open_high") {
      list = list.filter((s) => s.signal === "NEAR_OPEN_HIGH");
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }

    // Category Filter
    if (selectedCategory !== "ALL") {
      list = list.filter((s) => s.category.toLowerCase().includes(selectedCategory.toLowerCase()));
    }

    // Alphabet Filter
    if (selectedAlphabet !== "ALL") {
      list = list.filter((s) => s.symbol.toUpperCase().startsWith(selectedAlphabet));
    }

    // Sorting
    list = [...list].sort((a, b) => {
      let valA: number = 0;
      let valB: number = 0;

      if (sortBy === "symbol") {
        return sortOrder === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      } else if (sortBy === "changePct") {
        valA = a.changePct;
        valB = b.changePct;
      } else if (sortBy === "diff") {
        valA = a.signalType === "BULLISH" ? a.diffOpenLowPct : a.diffOpenHighPct;
        valB = b.signalType === "BULLISH" ? b.diffOpenLowPct : b.diffOpenHighPct;
      } else if (sortBy === "volume") {
        valA = a.volume;
        valB = b.volume;
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return list;
  }, [enrichedStocks, activeTab, search, selectedCategory, selectedAlphabet, sortBy, sortOrder]);

  // Pagination slice
  const totalPages = Math.ceil(filteredStocks.length / pageSize) || 1;
  const paginatedStocks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredStocks.slice(start, start + pageSize);
  }, [filteredStocks, page, pageSize]);

  // Handle Quick Trade trigger
  const handleOpenTrade = (stock: OhlStockItem, direction: "LONG" | "SHORT") => {
    const sl = direction === "LONG" ? stock.suggestedSL || stock.low : stock.suggestedSL || stock.high;
    const tgt1 = direction === "LONG" ? stock.suggestedTarget1 || stock.ltp * 1.015 : stock.suggestedTarget1 || stock.ltp * 0.985;
    const tgt2 = direction === "LONG" ? stock.suggestedTarget2 || stock.ltp * 1.03 : stock.suggestedTarget2 || stock.ltp * 0.97;

    setQuickTradeStock({
      symbol: stock.symbol,
      exchange: stock.exchange || "NSE",
      direction,
      entryPrice: stock.ltp,
      stopLoss: sl,
      target1: tgt1,
      target2: tgt2,
      currentPrice: stock.ltp,
      suggestedQty: stock.lotSize || 1,
      product: "MIS",
      isFnO: stock.isFnO,
      lotSize: stock.lotSize,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-border/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-blue-600/30 border border-blue-500/30 text-blue-400">
                <Zap className="h-6 w-6" />
              </span>
              Live Open=High & Open=Low Screener
            </h1>
            <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              LIVE TICKER STREAMING
            </Badge>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl">
            Real-time scanner identifying institutional opening drive momentum. Pinpoint stocks with <b>Open = Low</b> (Bullish Long) and <b>Open = High</b> (Bearish Short) for Monday morning & daily execution.
          </p>
        </div>

        {/* Universe & Quick Settings */}
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          {/* Universe selector */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl p-1 text-xs">
            <button
              onClick={() => setUniverse("fno")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all",
                universe === "fno" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              F&O Liquid ({FO_STOCKS_COUNT || 200})
            </button>
            <button
              onClick={() => setUniverse("nifty50")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all",
                universe === "nifty50" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              Nifty 50
            </button>
          </div>

          {/* Tolerance selector */}
          <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl p-1 text-xs">
            <button
              onClick={() => setTolerance(0.00)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg font-medium transition-all",
                tolerance === 0.00 ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
              title="Exact 0.00% equality (Open == Low or Open == High)"
            >
              Exact (0.00%)
            </button>
            <button
              onClick={() => setTolerance(0.05)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg font-medium transition-all",
                tolerance === 0.05 ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
              title="Near Open=Low / Open=High (within 0.05% threshold)"
            >
              0.05% Tol
            </button>
            <button
              onClick={() => setTolerance(0.10)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg font-medium transition-all",
                tolerance === 0.10 ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
              title="Within 0.10% threshold"
            >
              0.10% Tol
            </button>
          </div>

          {/* WhatsApp Alerts Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsWhatsAppModalOpen(true)}
            className="bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 hover:text-white rounded-xl text-xs gap-1.5 font-bold"
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
            WhatsApp Alerts
          </Button>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white rounded-xl text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-blue-400")} />
            {isFetching ? "Scanning..." : "Refresh"}
          </Button>
        </div>

        {/* WhatsApp Alerts Modal */}
        <WhatsAppAlertsModal
          open={isWhatsAppModalOpen}
          onOpenChange={setIsWhatsAppModalOpen}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Open = Low Card */}
        <Card
          onClick={() => setActiveTab("open_low")}
          className={cn(
            "cursor-pointer transition-all border rounded-xl overflow-hidden hover:scale-[1.02]",
            activeTab === "open_low" ? "ring-2 ring-emerald-500 border-emerald-500/50 bg-emerald-500/5" : "bg-card hover:border-emerald-500/40"
          )}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Open = Low (Bullish)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-foreground">{summary.openLowCount}</span>
                <span className="text-xs text-muted-foreground">stocks</span>
              </div>
              <p className="text-[11px] text-muted-foreground">100% Buyer dominance from open</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Open = High Card */}
        <Card
          onClick={() => setActiveTab("open_high")}
          className={cn(
            "cursor-pointer transition-all border rounded-xl overflow-hidden hover:scale-[1.02]",
            activeTab === "open_high" ? "ring-2 ring-rose-500 border-rose-500/50 bg-rose-500/5" : "bg-card hover:border-rose-500/40"
          )}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Open = High (Bearish)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-foreground">{summary.openHighCount}</span>
                <span className="text-xs text-muted-foreground">stocks</span>
              </div>
              <p className="text-[11px] text-muted-foreground">100% Seller dominance from open</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600">
              <TrendingDown className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Near Open Match Card */}
        <Card
          onClick={() => setActiveTab(activeTab === "near_open_low" ? "near_open_high" : "near_open_low")}
          className={cn(
            "cursor-pointer transition-all border rounded-xl overflow-hidden hover:scale-[1.02]",
            activeTab === "near_open_low" || activeTab === "near_open_high"
              ? "ring-2 ring-blue-500 border-blue-500/50 bg-blue-500/5"
              : "bg-card hover:border-blue-500/40"
          )}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="h-3 w-3" />
                Near Match (≤{tolerance}%)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-foreground">
                  {summary.nearOpenLowCount + summary.nearOpenHighCount}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({summary.nearOpenLowCount} 🟢 / {summary.nearOpenHighCount} 🔴)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Potential breakout setups</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600">
              <Sparkles className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Market Breadth Card */}
        <Card className="border rounded-xl bg-card">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1 w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Market Breadth
                </span>
                <span className="text-xs font-bold text-foreground">
                  {summary.advances} Adv / {summary.declines} Dec
                </span>
              </div>
              {/* Progress ratio bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden flex my-1.5">
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${summary.advances + summary.declines > 0 ? (summary.advances / (summary.advances + summary.declines)) * 100 : 50}%`,
                  }}
                />
                <div
                  className="bg-rose-500 transition-all duration-500"
                  style={{
                    width: `${summary.advances + summary.declines > 0 ? (summary.declines / (summary.advances + summary.declines)) * 100 : 50}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center justify-between">
                <span>🟢 {summary.advances} Positive</span>
                <span>🔴 {summary.declines} Negative</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Filter & Tabs Bar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Signal Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/80 overflow-x-auto">
            <button
              onClick={() => { setActiveTab("all"); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                activeTab === "all" ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Stocks ({enrichedStocks.length})
            </button>
            <button
              onClick={() => { setActiveTab("open_low"); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === "open_low"
                  ? "bg-emerald-500 text-white shadow-sm font-semibold"
                  : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Open = Low 🟢 ({summary.openLowCount})
            </button>
            <button
              onClick={() => { setActiveTab("open_high"); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === "open_high"
                  ? "bg-rose-500 text-white shadow-sm font-semibold"
                  : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              Open = High 🔴 ({summary.openHighCount})
            </button>
            <button
              onClick={() => { setActiveTab("near_open_low"); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                activeTab === "near_open_low" ? "bg-blue-600 text-white shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Near O=L ({summary.nearOpenLowCount})
            </button>
            <button
              onClick={() => { setActiveTab("near_open_high"); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                activeTab === "near_open_high" ? "bg-purple-600 text-white shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Near O=H ({summary.nearOpenHighCount})
            </button>
          </div>

          {/* Search & View Mode Switcher */}
          <div className="flex items-center gap-2.5">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search stock symbol or name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-xs bg-card border-border/80 rounded-xl"
              />
            </div>

            {/* View Mode */}
            <div className="flex items-center border border-border/80 rounded-xl p-0.5 bg-card">
              <button
                onClick={() => setViewMode("table")}
                className={cn("p-1.5 rounded-lg text-xs transition-colors", viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Table View"
              >
                <TableIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn("p-1.5 rounded-lg text-xs transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Card Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Categories Pill Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-muted-foreground text-[11px] font-semibold flex items-center gap-1 shrink-0 mr-1">
            <Filter className="h-3 w-3" /> Sector:
          </span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setSelectedCategory(cat); setPage(1); }}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all shrink-0 font-medium",
                selectedCategory === cat
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Alphabet Bar */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
          <span className="text-muted-foreground font-semibold shrink-0 mr-1">A-Z:</span>
          {ALPHABETS.map((letter) => (
            <button
              key={letter}
              onClick={() => { setSelectedAlphabet(letter); setPage(1); }}
              className={cn(
                "h-6 px-1.5 min-w-[24px] rounded font-medium transition-colors shrink-0",
                selectedAlphabet === letter
                  ? "bg-blue-600 text-white font-bold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / Grid View */}
      {viewMode === "table" ? (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* ─── Mobile Stock Cards (< md) ─── */}
          <div className="block md:hidden divide-y divide-border/60">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="p-4 space-y-2.5 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-10 bg-muted/60 rounded-xl" />
                </div>
              ))
            ) : paginatedStocks.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground px-4">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-semibold text-sm">No stocks matching the selected criteria</p>
                <p className="text-xs text-muted-foreground mt-1">Try switching tabs or adjusting tolerance settings.</p>
              </div>
            ) : (
              paginatedStocks.map((stock) => {
                const isUp = stock.change >= 0;
                const flash = priceFlashes[stock.symbol] || priceFlashes[`NSE:${stock.symbol}`];
                const isBullish = stock.signalType === "BULLISH";

                return (
                  <div key={stock.symbol} className="p-3.5 space-y-3 bg-card hover:bg-muted/15 transition-colors">
                    {/* Row 1: Symbol & LTP */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-foreground">{stock.symbol}</span>
                        {stock.isFnO && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-500 bg-blue-500/5">
                            Lot {stock.lotSize}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{stock.name}</span>
                      </div>

                      <div className="text-right">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded transition-all duration-300 inline-block font-mono font-bold text-sm",
                            flash === "up" && "bg-emerald-500/30 text-emerald-400 scale-105",
                            flash === "down" && "bg-rose-500/30 text-rose-400 scale-105"
                          )}
                        >
                          ₹{stock.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div className={cn("flex items-center justify-end gap-0.5 font-bold text-[11px] font-mono", isUp ? "text-emerald-500" : "text-rose-500")}>
                          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          <span>{isUp ? "+" : ""}{stock.changePct.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Signal Badge & O-L/O-H Gap */}
                    <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-xl border border-border/60 text-xs">
                      <div>
                        {stock.signal === "OPEN_LOW" && (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            OPEN = LOW 🟢
                          </Badge>
                        )}
                        {stock.signal === "OPEN_HIGH" && (
                          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-bold gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            OPEN = HIGH 🔴
                          </Badge>
                        )}
                        {stock.signal === "NEAR_OPEN_LOW" && (
                          <Badge variant="outline" className="text-[9px] border-blue-500/40 text-blue-500 bg-blue-500/5">
                            NEAR O=L ({stock.diffOpenLowPct.toFixed(2)}%)
                          </Badge>
                        )}
                        {stock.signal === "NEAR_OPEN_HIGH" && (
                          <Badge variant="outline" className="text-[9px] border-purple-500/40 text-purple-500 bg-purple-500/5">
                            NEAR O=H ({stock.diffOpenHighPct.toFixed(2)}%)
                          </Badge>
                        )}
                        {stock.signal === "NEUTRAL" && (
                          <span className="text-[10px] text-muted-foreground">Neutral</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[10.5px]">
                        <span className="text-rose-500">SL: ₹{stock.suggestedSL}</span>
                        <span className="text-emerald-500">TGT: ₹{stock.suggestedTarget1}</span>
                      </div>
                    </div>

                    {/* Row 3: Quick Action Buttons */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button
                        size="sm"
                        onClick={() => handleOpenTrade(stock, "LONG")}
                        className="h-8 flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
                      >
                        BUY (Long)
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenTrade(stock, "SHORT")}
                        className="h-8 flex-1 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg shadow-sm"
                      >
                        SELL (Short)
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ─── Desktop Table (>= md) ─── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border text-[11px] uppercase tracking-wider">
                <tr>
                  <th
                    className="py-3.5 px-4 cursor-pointer hover:text-foreground"
                    onClick={() => {
                      if (sortBy === "symbol") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      else { setSortBy("symbol"); setSortOrder("asc"); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Stock / Symbol</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Live LTP (₹)</th>
                  <th
                    className="py-3.5 px-4 cursor-pointer hover:text-foreground"
                    onClick={() => {
                      if (sortBy === "changePct") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      else { setSortBy("changePct"); setSortOrder("desc"); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Day Change (%)</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Open</th>
                  <th className="py-3.5 px-4">High</th>
                  <th className="py-3.5 px-4">Low</th>
                  <th
                    className="py-3.5 px-4 cursor-pointer hover:text-foreground"
                    onClick={() => {
                      if (sortBy === "diff") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      else { setSortBy("diff"); setSortOrder("asc"); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>O-L / O-H Diff</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Signal & Strength</th>
                  <th className="py-3.5 px-4">Suggested SL & TGT</th>
                  <th className="py-3.5 px-4 text-right">Quick Execution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td colSpan={10} className="py-4 px-4">
                        <div className="h-4 bg-muted rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : paginatedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm">No stocks matching the selected criteria</p>
                      <p className="text-xs text-muted-foreground mt-1">Try switching tabs or adjusting tolerance settings.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedStocks.map((stock) => {
                    const isUp = stock.change >= 0;
                    const flash = priceFlashes[stock.symbol] || priceFlashes[`NSE:${stock.symbol}`];
                    const isBullish = stock.signalType === "BULLISH";
                    const isBearish = stock.signalType === "BEARISH";

                    return (
                      <tr
                        key={stock.symbol}
                        className={cn(
                          "transition-colors hover:bg-muted/40",
                          stock.signal === "OPEN_LOW" && "bg-emerald-500/[0.03]",
                          stock.signal === "OPEN_HIGH" && "bg-rose-500/[0.03]"
                        )}
                      >
                        {/* Symbol & Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-foreground">{stock.symbol}</span>
                              {stock.isFnO && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/30 text-blue-500 bg-blue-500/5">
                                  Lot {stock.lotSize}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground truncate max-w-[170px]">{stock.name}</span>
                          </div>
                        </td>

                        {/* Live LTP with Flash Animation */}
                        <td className="py-3.5 px-4 font-bold text-sm">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded transition-all duration-300 inline-block font-mono",
                              flash === "up" && "bg-emerald-500/30 text-emerald-400 scale-105",
                              flash === "down" && "bg-rose-500/30 text-rose-400 scale-105"
                            )}
                          >
                            ₹{stock.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Day Change (%) */}
                        <td className="py-3.5 px-4">
                          <div className={cn("flex items-center gap-1 font-bold text-xs font-mono", isUp ? "text-emerald-500" : "text-rose-500")}>
                            {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                            <span>{isUp ? "+" : ""}{stock.changePct.toFixed(2)}%</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">₹{stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)}</span>
                        </td>

                        {/* Open */}
                        <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                          ₹{stock.open.toFixed(2)}
                        </td>

                        {/* High */}
                        <td className="py-3.5 px-4 font-mono text-muted-foreground">
                          <span className={cn(stock.signal === "OPEN_HIGH" && "text-rose-500 font-bold")}>
                            ₹{stock.high.toFixed(2)}
                          </span>
                        </td>

                        {/* Low */}
                        <td className="py-3.5 px-4 font-mono text-muted-foreground">
                          <span className={cn(stock.signal === "OPEN_LOW" && "text-emerald-500 font-bold")}>
                            ₹{stock.low.toFixed(2)}
                          </span>
                        </td>

                        {/* O-L / O-H Difference */}
                        <td className="py-3.5 px-4">
                          {isBullish ? (
                            <div className="flex flex-col">
                              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                ₹{stock.diffOpenLow.toFixed(2)} ({stock.diffOpenLowPct.toFixed(2)}%)
                              </span>
                              <span className="text-[10px] text-muted-foreground">O-L Gap</span>
                            </div>
                          ) : isBearish ? (
                            <div className="flex flex-col">
                              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                                ₹{stock.diffOpenHigh.toFixed(2)} ({stock.diffOpenHighPct.toFixed(2)}%)
                              </span>
                              <span className="text-[10px] text-muted-foreground">O-H Gap</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>

                        {/* Signal Badge */}
                        <td className="py-3.5 px-4">
                          {stock.signal === "OPEN_LOW" && (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-bold gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              OPEN = LOW 🟢
                            </Badge>
                          )}
                          {stock.signal === "OPEN_HIGH" && (
                            <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[11px] font-bold gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              OPEN = HIGH 🔴
                            </Badge>
                          )}
                          {stock.signal === "NEAR_OPEN_LOW" && (
                            <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-500 bg-blue-500/5">
                              NEAR O=L ({stock.diffOpenLowPct.toFixed(2)}%)
                            </Badge>
                          )}
                          {stock.signal === "NEAR_OPEN_HIGH" && (
                            <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-500 bg-purple-500/5">
                              NEAR O=H ({stock.diffOpenHighPct.toFixed(2)}%)
                            </Badge>
                          )}
                          {stock.signal === "NEUTRAL" && (
                            <span className="text-[11px] text-muted-foreground">Neutral</span>
                          )}
                        </td>

                        {/* Suggested SL & Target */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-rose-500">SL: ₹{stock.suggestedSL}</span>
                            <span className="text-emerald-500">TGT: ₹{stock.suggestedTarget1}</span>
                          </div>
                        </td>

                        {/* Action Execution Buttons */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => handleOpenTrade(stock, "LONG")}
                              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
                            >
                              BUY
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleOpenTrade(stock, "SHORT")}
                              className="h-7 px-2.5 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg shadow-sm"
                            >
                              SELL
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground">{paginatedStocks.length}</span> of{" "}
              <span className="font-semibold text-foreground">{filteredStocks.length}</span> stocks
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="bg-card border border-border rounded px-2 py-1 text-xs text-foreground"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 p-0 rounded-lg"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 font-medium">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 w-7 p-0 rounded-lg"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedStocks.map((stock) => {
            const isUp = stock.change >= 0;
            const flash = priceFlashes[stock.symbol] || priceFlashes[`NSE:${stock.symbol}`];

            return (
              <Card
                key={stock.symbol}
                className={cn(
                  "border rounded-2xl overflow-hidden hover:shadow-lg transition-all",
                  stock.signal === "OPEN_LOW" && "border-emerald-500/40 bg-emerald-500/[0.02]",
                  stock.signal === "OPEN_HIGH" && "border-rose-500/40 bg-rose-500/[0.02]"
                )}
              >
                <CardHeader className="p-4 pb-2 border-b border-border/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-foreground">{stock.symbol}</CardTitle>
                        {stock.isFnO && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/30 text-blue-500">
                            Lot {stock.lotSize}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{stock.name}</p>
                    </div>

                    {stock.signal === "OPEN_LOW" && (
                      <Badge className="bg-emerald-500 text-white font-bold text-xs">OPEN = LOW 🟢</Badge>
                    )}
                    {stock.signal === "OPEN_HIGH" && (
                      <Badge className="bg-rose-500 text-white font-bold text-xs">OPEN = HIGH 🔴</Badge>
                    )}
                    {stock.signal === "NEAR_OPEN_LOW" && (
                      <Badge variant="outline" className="border-blue-500 text-blue-500 text-[10px]">NEAR O=L</Badge>
                    )}
                    {stock.signal === "NEAR_OPEN_HIGH" && (
                      <Badge variant="outline" className="border-purple-500 text-purple-500 text-[10px]">NEAR O=H</Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {/* Price & Change */}
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground block">Live Price</span>
                      <span
                        className={cn(
                          "text-xl font-bold font-mono inline-block px-1 rounded transition-colors",
                          flash === "up" && "bg-emerald-500/20 text-emerald-400",
                          flash === "down" && "bg-rose-500/20 text-rose-400"
                        )}
                      >
                        ₹{stock.ltp.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">Day Change</span>
                      <span className={cn("font-bold text-sm font-mono flex items-center gap-0.5 justify-end", isUp ? "text-emerald-500" : "text-rose-500")}>
                        {isUp ? "+" : ""}{stock.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* OHLC metrics grid */}
                  <div className="grid grid-cols-3 gap-2 bg-muted/40 p-2.5 rounded-xl text-center text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Open</span>
                      <span className="font-semibold text-foreground">₹{stock.open.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">High</span>
                      <span className={cn("font-semibold", stock.signal === "OPEN_HIGH" ? "text-rose-500 font-bold" : "text-foreground")}>
                        ₹{stock.high.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-sans">Low</span>
                      <span className={cn("font-semibold", stock.signal === "OPEN_LOW" ? "text-emerald-500 font-bold" : "text-foreground")}>
                        ₹{stock.low.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Suggested Levels */}
                  <div className="flex items-center justify-between text-xs font-mono pt-1">
                    <span className="text-rose-500">SL: ₹{stock.suggestedSL}</span>
                    <span className="text-emerald-500">Target: ₹{stock.suggestedTarget1}</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      onClick={() => handleOpenTrade(stock, "LONG")}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 rounded-xl shadow-sm"
                    >
                      BUY (Long)
                    </Button>
                    <Button
                      onClick={() => handleOpenTrade(stock, "SHORT")}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 rounded-xl shadow-sm"
                    >
                      SELL (Short)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Trade Execution Modal */}
      {quickTradeStock && (
        <QuickTradePanel
          stock={quickTradeStock}
          onClose={() => setQuickTradeStock(null)}
        />
      )}
    </div>
  );
}

const FO_STOCKS_COUNT = 200;
