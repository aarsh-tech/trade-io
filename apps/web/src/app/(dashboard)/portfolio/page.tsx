"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Briefcase, TrendingUp, TrendingDown, RefreshCcw, Zap, Search,
  ShoppingCart, Plus, Minus, Info, Box, Settings2, Calculator,
  ChevronDown, MousePointer2, LayoutGrid, BarChart3, Clock, Wallet,
  ArrowUpRight, ArrowDownRight, Layers, Activity, Loader2, CheckCircle2,
  ShieldCheck, AlertCircle, Sparkles, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { OrderWindow } from "@/components/dashboard/OrderWindow";
import Link from "next/link";

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl?: number;
  pnlPct?: number;
  exchange?: string;
  isin?: string;
  closePrice?: number;
}

interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  side: "BUY" | "SELL";
  product: string;
}

export default function PortfolioPage() {
  const { brokers = [], isLoading: brokersLoading } = useBrokers();
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"holdings" | "positions">("holdings");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PROFIT" | "LOSS">("ALL");
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");

  // Automatically select the active broker if none manually chosen
  const activeBrokerId = useMemo(() => {
    if (selectedBroker) return selectedBroker;
    const active =
      (brokers as any[]).find((b) => b.isActive && b.broker === "ZERODHA") ||
      (brokers as any[]).find((b) => b.isActive) ||
      brokers[0];
    return active?.id || null;
  }, [brokers, selectedBroker]);

  const currentBroker = useMemo(() => {
    return (brokers as any[]).find((b) => b.id === activeBrokerId);
  }, [brokers, activeBrokerId]);

  // Order Window State (Zerodha Kite Style)
  const [orderState, setOrderState] = useState<{
    isOpen: boolean;
    type: "BUY" | "SELL";
    symbol: string;
    ltp: number;
  }>({
    isOpen: false,
    type: "BUY",
    symbol: "",
    ltp: 0,
  });

  const {
    holdings = [],
    positions = [],
    margins,
    isHoldingsLoading,
    isPositionsLoading,
    refreshHoldings,
    refreshPositions,
    renewSession,
    isRenewing,
    getLoginUrl,
  } = usePortfolio(activeBrokerId);

  // Portfolio metrics calculations
  const metrics = useMemo(() => {
    let totalCurrentValue = 0;
    let totalInvested = 0;
    let profitableHoldings = 0;
    let losingHoldings = 0;

    (holdings as Holding[]).forEach((h) => {
      const curr = (h.ltp || 0) * (h.qty || 0);
      const inv = (h.avgPrice || 0) * (h.qty || 0);
      totalCurrentValue += curr;
      totalInvested += inv;

      const pnl = h.pnl !== undefined ? h.pnl : curr - inv;
      if (pnl > 0) profitableHoldings++;
      else if (pnl < 0) losingHoldings++;
    });

    const totalHoldingPnl = totalCurrentValue - totalInvested;
    const totalHoldingPnlPct = totalInvested > 0 ? (totalHoldingPnl / totalInvested) * 100 : 0;

    let totalPosPnl = 0;
    (positions as Position[]).forEach((p) => {
      totalPosPnl += p.pnl || 0;
    });

    const availableCash =
      margins?.equity?.available?.live_balance ??
      margins?.equity?.available?.cash ??
      margins?.equity?.net ??
      0;

    return {
      totalCurrentValue,
      totalInvested,
      totalHoldingPnl,
      totalHoldingPnlPct,
      profitableHoldings,
      losingHoldings,
      totalPosPnl,
      availableCash,
    };
  }, [holdings, positions, margins]);

  // Filtered Holdings
  const filteredHoldings = useMemo(() => {
    return (holdings as Holding[]).filter((h) => {
      const matchesSearch =
        searchQuery.trim() === ""
          ? true
          : h.symbol.toLowerCase().includes(searchQuery.toLowerCase());

      const curr = (h.ltp || 0) * (h.qty || 0);
      const inv = (h.avgPrice || 0) * (h.qty || 0);
      const pnl = h.pnl !== undefined ? h.pnl : curr - inv;

      const matchesFilter =
        filterType === "ALL"
          ? true
          : filterType === "PROFIT"
          ? pnl > 0
          : pnl < 0;

      return matchesSearch && matchesFilter;
    });
  }, [holdings, searchQuery, filterType]);

  // Filtered Positions
  const filteredPositions = useMemo(() => {
    return (positions as Position[]).filter((p) => {
      const matchesSearch =
        searchQuery.trim() === ""
          ? true
          : p.symbol.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter =
        filterType === "ALL"
          ? true
          : filterType === "PROFIT"
          ? p.pnl > 0
          : p.pnl < 0;

      return matchesSearch && matchesFilter;
    });
  }, [positions, searchQuery, filterType]);

  const openTrade = (item?: any, side: "BUY" | "SELL" = "BUY") => {
    if (!activeBrokerId) {
      toast.error("Please connect and select a broker account first");
      return;
    }
    setOrderState({
      isOpen: true,
      type: side,
      symbol: item ? item.symbol : "",
      ltp: item ? item.ltp || item.avgPrice || 0 : 0,
    });
  };

  const handleOpenLogin = async () => {
    const url = await getLoginUrl();
    if (url) window.open(url, "_blank");
  };

  const handleRenewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await renewSession(requestToken);
      setShowRenewModal(false);
      setRequestToken("");
    } catch {}
  };

  const isDataLoading = isHoldingsLoading || isPositionsLoading;

  const handleRefresh = () => {
    if (activeTab === "holdings") {
      refreshHoldings();
    } else {
      refreshPositions();
    }
    toast.success("Refreshing portfolio data...");
  };

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-blue-500" />
            Portfolio & Holdings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time holdings breakdown, intraday positions, valuation, and capital allocation
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Broker Selector */}
          <select
            className="h-9 px-3 rounded-lg border border-border bg-card text-foreground text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            value={activeBrokerId || ""}
            onChange={(e) => setSelectedBroker(e.target.value)}
          >
            <option value="" disabled>
              Select Broker Account
            </option>
            {(brokers as any[])?.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.broker} ({b.clientId}) {b.isActive ? "● Active" : ""}
              </option>
            ))}
            {brokers?.length === 0 && !brokersLoading && (
              <option disabled>No brokers connected</option>
            )}
          </select>

          {activeBrokerId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-xs h-9"
              onClick={() => setShowRenewModal(true)}
            >
              <Zap className="h-3.5 w-3.5" /> Daily Login
            </Button>
          )}

          <Button
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 shadow-sm"
            size="sm"
            onClick={() => openTrade()}
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Place Order
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-border"
            onClick={handleRefresh}
            disabled={isDataLoading}
          >
            <RefreshCcw
              className={cn("h-4 w-4 text-muted-foreground", isDataLoading && "animate-spin text-blue-500")}
            />
          </Button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Portfolio Value */}
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Total Portfolio Value</span>
              <Wallet className="h-4 w-4 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground tracking-tight">
              ₹{metrics.totalCurrentValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <span>Invested:</span>
              <span className="font-mono font-medium text-foreground">
                ₹{metrics.totalInvested.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Unrealized P&L */}
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Overall Holdings P&L</span>
              {metrics.totalHoldingPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold font-mono flex items-center gap-1.5 tracking-tight",
                metrics.totalHoldingPnl > 0
                  ? "text-emerald-500"
                  : metrics.totalHoldingPnl < 0
                  ? "text-rose-500"
                  : "text-foreground"
              )}
            >
              {metrics.totalHoldingPnl > 0 ? "+" : ""}
              ₹{metrics.totalHoldingPnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {metrics.totalHoldingPnl > 0 ? (
                <ArrowUpRight className="h-5 w-5 text-emerald-500" />
              ) : metrics.totalHoldingPnl < 0 ? (
                <ArrowDownRight className="h-5 w-5 text-rose-500" />
              ) : null}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={metrics.totalHoldingPnl >= 0 ? "success" : "destructive"}
                className="text-[10px] font-mono py-0 px-1.5"
              >
                {metrics.totalHoldingPnl >= 0 ? "+" : ""}
                {metrics.totalHoldingPnlPct.toFixed(2)}%
              </Badge>
              <span className="text-xs text-muted-foreground">
                {metrics.profitableHoldings} Up / {metrics.losingHoldings} Down
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Available Margin */}
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Available Cash / Margin</span>
              <ShieldCheck className="h-4 w-4 text-blue-500/60" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground tracking-tight">
              ₹{metrics.availableCash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Live equity trading balance
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Broker Session Status */}
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Broker Session</span>
              <Activity className="h-4 w-4 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-3 w-3 rounded-full",
                  activeBrokerId ? "bg-emerald-500 animate-pulse" : "bg-muted"
                )}
              />
              <span className="text-lg font-bold text-foreground truncate">
                {currentBroker ? `${currentBroker.broker}` : "Disconnected"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {currentBroker
                ? `ID: ${currentBroker.clientId} (${holdings.length} Holdings)`
                : "No active trading account"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Table Card */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        {/* Table Controls & Tabs Bar */}
        <CardHeader className="border-b border-border py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("holdings")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-2",
                activeTab === "holdings"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Holdings</span>
              <Badge
                variant={activeTab === "holdings" ? "secondary" : "outline"}
                className={cn(
                  "text-[10px] px-1.5 py-0 font-mono",
                  activeTab === "holdings" ? "bg-blue-700 text-white border-transparent" : ""
                )}
              >
                {holdings?.length || 0}
              </Badge>
            </button>

            <button
              onClick={() => setActiveTab("positions")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-2",
                activeTab === "positions"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Positions</span>
              <Badge
                variant={activeTab === "positions" ? "secondary" : "outline"}
                className={cn(
                  "text-[10px] px-1.5 py-0 font-mono",
                  activeTab === "positions" ? "bg-blue-700 text-white border-transparent" : ""
                )}
              >
                {positions?.length || 0}
              </Badge>
            </button>
          </div>

          {/* Search and Profit/Loss Filters */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Filter Pills */}
            <div className="flex items-center rounded-lg bg-muted/40 p-0.5 border border-border">
              <button
                onClick={() => setFilterType("ALL")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  filterType === "ALL"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("PROFIT")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  filterType === "PROFIT"
                    ? "bg-emerald-500/10 text-emerald-500 font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Profit
              </button>
              <button
                onClick={() => setFilterType("LOSS")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  filterType === "LOSS"
                    ? "bg-rose-500/10 text-rose-500 font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Loss
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-card border-border focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Table Content */}
        <CardContent className="p-0">
          {!activeBrokerId ? (
            <div className="py-24 text-center px-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <Briefcase className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Select a Broker Account</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                Connect your trading account to monitor your live holdings, asset valuation, and open positions.
              </p>
              <Link href="/brokers">
                <Button size="sm" variant="default" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                  <Zap className="h-4 w-4" /> Manage Brokers
                </Button>
              </Link>
            </div>
          ) : isDataLoading && ((activeTab === "holdings" && holdings.length === 0) || (activeTab === "positions" && positions.length === 0)) ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Fetching portfolio data from broker...</p>
            </div>
          ) : activeTab === "holdings" ? (
            filteredHoldings.length === 0 ? (
              <div className="py-24 text-center px-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                  <Layers className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">No Holdings Found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                  {searchQuery || filterType !== "ALL"
                    ? "No holdings match the current filter or search criteria."
                    : "You currently have no equity delivery holdings in this broker account, or a daily login is required."}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowRenewModal(true)}
                  >
                    <Zap className="h-4 w-4 text-amber-500" />
                    Broker Daily Login
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                    onClick={() => openTrade()}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Place New Order
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-3 px-4">Instrument</th>
                      <th className="py-3 px-4 text-right font-mono">Qty</th>
                      <th className="py-3 px-4 text-right font-mono">Avg Price</th>
                      <th className="py-3 px-4 text-right font-mono">LTP</th>
                      <th className="py-3 px-4 text-right font-mono">Current Value</th>
                      <th className="py-3 px-4 text-right font-mono">P&L / Returns</th>
                      <th className="py-3 px-4 text-center">Quick Trade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredHoldings.map((h: Holding, idx: number) => {
                      const currValue = (h.ltp || 0) * (h.qty || 0);
                      const invValue = (h.avgPrice || 0) * (h.qty || 0);
                      const pnl = h.pnl !== undefined ? h.pnl : currValue - invValue;
                      const pnlPct =
                        h.pnlPct !== undefined
                          ? h.pnlPct
                          : invValue > 0
                          ? (pnl / invValue) * 100
                          : 0;
                      const isProfit = pnl >= 0;

                      return (
                        <tr
                          key={h.symbol + idx}
                          className="hover:bg-muted/30 transition-colors group"
                        >
                          {/* Instrument */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-foreground text-sm group-hover:text-blue-500 transition-colors">
                                {h.symbol}
                              </div>
                              <Badge variant="outline" className="text-[10px] font-medium py-0 px-1">
                                {h.exchange || "NSE"}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Invested: ₹{invValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </td>

                          {/* Qty */}
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                            {h.qty}
                          </td>

                          {/* Avg Price */}
                          <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                            ₹{(h.avgPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* LTP */}
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                            ₹{(h.ltp || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Current Value */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                            ₹{currValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* P&L */}
                          <td className="py-3.5 px-4 text-right">
                            <div
                              className={cn(
                                "font-mono font-bold flex items-center justify-end gap-1",
                                isProfit ? "text-emerald-500" : "text-rose-500"
                              )}
                            >
                              {isProfit ? "+" : ""}₹{pnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {isProfit ? (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div
                              className={cn(
                                "text-[11px] font-mono mt-0.5",
                                isProfit ? "text-emerald-500/80" : "text-rose-500/80"
                              )}
                            >
                              {isProfit ? "+" : ""}
                              {pnlPct.toFixed(2)}%
                            </div>
                          </td>

                          {/* Quick Actions */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-[11px] font-semibold border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                                onClick={() => openTrade(h, "BUY")}
                              >
                                BUY
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-[11px] font-semibold border-rose-500/30 text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/50"
                                onClick={() => openTrade(h, "SELL")}
                              >
                                SELL
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // Positions Tab Table
            filteredPositions.length === 0 ? (
              <div className="py-24 text-center px-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                  <Activity className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">No Open Positions</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                  {searchQuery || filterType !== "ALL"
                    ? "No positions match the current filter or search criteria."
                    : "You currently have no open intraday or derivative positions in this account."}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Link href="/live-screener">
                    <Button size="sm" variant="default" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                      <Zap className="h-4 w-4" /> Live OHL Screener
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => openTrade()}
                  >
                    <ShoppingCart className="h-4 w-4" /> Place Order
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-3 px-4">Product / Side</th>
                      <th className="py-3 px-4">Instrument</th>
                      <th className="py-3 px-4 text-right font-mono">Net Qty</th>
                      <th className="py-3 px-4 text-right font-mono">Avg Price</th>
                      <th className="py-3 px-4 text-right font-mono">LTP</th>
                      <th className="py-3 px-4 text-right font-mono">Unrealized P&L</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredPositions.map((pos: Position, idx: number) => {
                      const isLong = pos.qty > 0;
                      const isProfit = (pos.pnl || 0) >= 0;

                      return (
                        <tr
                          key={pos.symbol + idx}
                          className="hover:bg-muted/30 transition-colors group"
                        >
                          <td className="py-3.5 px-4 font-mono text-xs">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={isLong ? "default" : "destructive"}
                                className={cn(
                                  "text-[10px] font-bold py-0 px-1.5",
                                  isLong
                                    ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                                    : "bg-orange-500/10 text-orange-500 border-orange-500/30"
                                )}
                              >
                                {isLong ? "BUY" : "SELL"}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] font-bold">
                                {pos.product || "MIS"}
                              </Badge>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-foreground">
                            {pos.symbol}
                          </td>

                          <td
                            className={cn(
                              "py-3.5 px-4 text-right font-mono font-semibold",
                              isLong ? "text-emerald-500" : "text-rose-500"
                            )}
                          >
                            {pos.qty > 0 ? `+${pos.qty}` : pos.qty}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono text-foreground">
                            ₹{(pos.avgPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                            ₹{(pos.ltp || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div
                              className={cn(
                                "font-mono font-bold flex items-center justify-end gap-1",
                                isProfit ? "text-emerald-500" : "text-rose-500"
                              )}
                            >
                              {isProfit ? "+" : ""}₹{(pos.pnl || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {isProfit ? (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-[11px] font-semibold border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                                onClick={() => openTrade(pos, "BUY")}
                              >
                                Add
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-[11px] font-semibold border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                                onClick={() => openTrade(pos, "SELL")}
                              >
                                Exit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Renew Session Modal */}
      <Dialog open={showRenewModal} onOpenChange={setShowRenewModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-white text-slate-900 border border-slate-200 shadow-2xl">
          <div className="p-6 pb-2 bg-white">
            <div className="flex items-start gap-3.5 mb-1">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
              <div className="pr-6">
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Broker Daily Login
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Brokers require a fresh daily authentication token. Follow these quick steps to sync your account:
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 space-y-3.5 bg-white">
            {/* Step 1 Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  1
                </span>
                <span className="text-xs font-semibold text-slate-900">
                  Authenticate on Broker Portal
                </span>
              </div>
              <Button
                onClick={handleOpenLogin}
                className="w-full h-9 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs gap-1.5 shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open Broker Login Page
              </Button>
            </div>

            {/* Step 2 Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  2
                </span>
                <span className="text-xs font-semibold text-slate-900">
                  Sync Session Token
                </span>
              </div>

              <form onSubmit={handleRenewSession} className="space-y-3">
                <Button
                  type="button"
                  onClick={() => handleRenewSession({ preventDefault: () => {} } as any)}
                  disabled={isRenewing}
                  className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
                >
                  {isRenewing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Logging in...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Run Automated Login
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2 py-0.5">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    OR PASTE MANUALLY
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <Input
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="Paste token or session ID here..."
                  className="h-9 border-slate-200 bg-white text-slate-900 text-xs focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
                />

                <Button
                  type="submit"
                  disabled={isRenewing || !requestToken}
                  className="w-full h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs disabled:opacity-50 shadow-sm"
                >
                  {isRenewing ? "Activating..." : "Activate Manual Session"}
                </Button>
              </form>
            </div>
          </div>

          <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500 hover:text-slate-800 text-xs h-8"
              onClick={() => setShowRenewModal(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zerodha Kite Style Order Window */}
      <OrderWindow
        isOpen={orderState.isOpen}
        onClose={() => setOrderState((prev) => ({ ...prev, isOpen: false }))}
        symbol={orderState.symbol}
        type={orderState.type}
        ltp={orderState.ltp}
        availableMargin={metrics.availableCash}
        brokerId={activeBrokerId || undefined}
        onTypeChange={(newType) => setOrderState((prev) => ({ ...prev, type: newType }))}
      />
    </div>
  );
}
