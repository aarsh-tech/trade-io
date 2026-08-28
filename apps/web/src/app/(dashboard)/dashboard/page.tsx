"use client";

import { OrderWindow } from "@/components/dashboard/OrderWindow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMarketData } from "@/hooks/use-market-data";
import { useBrokers } from "@/hooks/useBrokers";
import { useDashboard } from "@/hooks/useDashboard";
import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  History,
  LayoutGrid,
  Loader2,
  PieChart as PieChartIcon,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap
} from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";
interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
}

interface Margin {
  equity: {
    available: {
      cash: number;
      live_balance?: number;
      opening_balance?: number;
    };
    utilised: { debits: number };
  };
  commodity?: {
    available: { cash: number };
    utilised: { debits: number };
  };
}

interface Broker {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { movers, isLoading: isDashboardLoading, refresh: refreshDashboard } = useDashboard();
  const { brokers } = useBrokers();

  const moverSymbols = useMemo(() => {
    const gainers = (movers?.topGainers || []).map((g: any) => g.symbol);
    const losers = (movers?.topLosers || []).map((l: any) => l.symbol);
    return [...gainers, ...losers];
  }, [movers]);

  const { prices } = useMarketData(moverSymbols);

  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Order Window State (Kite Style)
  const [orderState, setOrderState] = React.useState<{
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

  // Pick active broker
  const activeBroker = useMemo(() => {
    const brokerList = (brokers || []) as Broker[];
    return (
      brokerList.find((b) => b.isActive && b.broker === "ZERODHA") ||
      brokerList.find((b) => b.isActive) ||
      brokerList[0]
    );
  }, [brokers]);

  const {
    holdings = [],
    margins,
    isLoading: isPortfolioLoading,
    refreshHoldings,
    renewSession,
    isRenewing,
    getLoginUrl,
  } = usePortfolio(activeBroker?.id);

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
    } catch { }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshDashboard(), refreshHoldings()]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Calculate Real Portfolio Stats
  const stats = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    const safeMargins = margins as Margin | null;

    const totalInvestment = safeHoldings.reduce(
      (acc, h) => acc + Number(h.avgPrice || 0) * Number(h.qty || 0),
      0
    );
    const currentValue = safeHoldings.reduce(
      (acc, h) => acc + Number(h.ltp || 0) * Number(h.qty || 0),
      0
    );
    const pnl = currentValue - totalInvestment;
    const pnlPercent = totalInvestment > 0 ? (pnl / totalInvestment) * 100 : 0;

    const marginAvailable =
      safeMargins?.equity?.available?.live_balance ??
      safeMargins?.equity?.available?.cash ??
      0;
    const marginsUsed = safeMargins?.equity?.utilised?.debits ?? 0;
    const openingBalance =
      safeMargins?.equity?.available?.opening_balance ?? marginAvailable;

    return {
      totalInvestment,
      currentValue,
      pnl,
      pnlPercent,
      marginAvailable,
      marginsUsed,
      openingBalance,
      holdingsCount: safeHoldings.length,
    };
  }, [holdings, margins]);

  // Holdings allocation breakdown
  const allocationBars = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    if (safeHoldings.length === 0 || stats.currentValue === 0) return [];

    const colors = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#ec4899",
      "#06b6d4",
      "#64748b",
    ];

    return safeHoldings
      .map((h, i) => {
        const val = (h.ltp || 0) * (h.qty || 0);
        const pct = (val / stats.currentValue) * 100;
        return {
          symbol: h.symbol,
          pct,
          color: colors[i % colors.length],
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
  }, [holdings, stats.currentValue]);

  const firstName = useMemo(() => {
    if (user?.name) {
      return user.name.split(" ")[0];
    }
    return "Aarsh";
  }, [user]);

  if (isDashboardLoading && isPortfolioLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Loading Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both] pb-12 font-sans">
      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Hi, {firstName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor trading capital, equity valuation, and live market movers
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {activeBroker && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs h-9 font-medium shadow-2xs"
              onClick={() => setShowRenewModal(true)}
            >
              <Zap className="h-3.5 w-3.5 text-amber-600" /> Daily Login
            </Button>
          )}

          <Button
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 shadow-sm"
            onClick={() =>
              setOrderState({
                isOpen: true,
                type: "BUY",
                symbol: "",
                ltp: 0,
              })
            }
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Place Order
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-slate-200 bg-white hover:bg-slate-50 shadow-2xs"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCcw
              className={cn(
                "h-4 w-4 text-slate-500",
                isRefreshing && "animate-spin text-blue-600"
              )}
            />
          </Button>
        </div>
      </div>

      {/* ── 2. Top Row: Equity & Commodity Cards (2-Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity Card */}
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
          <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <LayoutGrid className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">
                Equity Margin
              </CardTitle>
            </div>
            <Link
              href="/portfolio"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group"
            >
              <span>View statement</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </CardHeader>

          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-bold font-mono text-slate-900 tracking-tight">
                  ₹{stats.marginAvailable.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Margin available
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-3 space-y-1.5 sm:min-w-[180px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Margins used</span>
                  <span className="font-mono font-semibold text-slate-800">
                    ₹{stats.marginsUsed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Opening balance</span>
                  <span className="font-mono font-semibold text-slate-800">
                    ₹{stats.openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commodity Card */}
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
          <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <History className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">
                Commodity Margin
              </CardTitle>
            </div>
            <Link
              href="/portfolio"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group"
            >
              <span>View statement</span>
              <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </CardHeader>

          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-bold font-mono text-slate-900 tracking-tight">
                  0.00
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Margin available
                </p>
              </div>

              <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-3 space-y-1.5 sm:min-w-[180px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Margins used</span>
                  <span className="font-mono font-semibold text-slate-800">0.00</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Opening balance</span>
                  <span className="font-mono font-semibold text-slate-800">0.00</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Holdings Summary Card (Full Width) ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
        <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PieChartIcon className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">
                Holdings
              </CardTitle>
              <Badge variant="secondary" className="text-[10.5px] font-mono py-0 px-1.5 bg-slate-100 text-slate-700">
                {stats.holdingsCount} Assets
              </Badge>
            </div>
          </div>

          <Link
            href="/portfolio"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 group"
          >
            <span>Analytics & Details</span>
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* P&L Display */}
            <div>
              <div
                className={cn(
                  "text-3xl font-bold font-mono tracking-tight flex items-center gap-1.5",
                  stats.pnl > 0
                    ? "text-emerald-600"
                    : stats.pnl < 0
                      ? "text-rose-600"
                      : "text-slate-900"
                )}
              >
                {stats.pnl > 0 ? "+" : ""}
                ₹{stats.pnl.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {stats.pnl > 0 ? (
                  <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                ) : stats.pnl < 0 ? (
                  <ArrowDownRight className="h-5 w-5 text-rose-600" />
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={stats.pnl >= 0 ? "success" : "destructive"}
                  className="text-[10.5px] font-mono py-0 px-1.5 font-bold"
                >
                  {stats.pnl >= 0 ? "+" : ""}
                  {stats.pnlPercent.toFixed(2)}%
                </Badge>
                <span className="text-xs text-slate-400 font-medium">
                  Total Unrealized P&L
                </span>
              </div>
            </div>

            {/* Current Value & Investment */}
            <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Current Value:</span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{stats.currentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Total Investment:</span>
                <span className="font-mono font-semibold text-slate-700">
                  ₹{stats.totalInvestment.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Asset Allocation */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-600 block">
                Portfolio Distribution
              </span>
              {allocationBars.length > 0 ? (
                <>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    {allocationBars.map((bar) => (
                      <div
                        key={bar.symbol}
                        style={{
                          width: `${bar.pct}%`,
                          backgroundColor: bar.color,
                        }}
                        className="h-full transition-all"
                        title={`${bar.symbol}: ${bar.pct.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                    {allocationBars.map((bar) => (
                      <div key={bar.symbol} className="flex items-center gap-1">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: bar.color }}
                        />
                        <span className="font-semibold text-slate-700">{bar.symbol}</span>
                        <span className="text-slate-400 font-mono">{bar.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 italic py-1">
                  No open delivery holdings recorded
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Market Movers: Top Gainers & Top Losers (2-Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Gainers */}
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
          <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">
                Top Gainers
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-semibold text-slate-500 bg-slate-50">
              NIFTY 500
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 text-xs">
              {(movers?.topGainers || []).slice(0, 8).map((item: any) => {
                const livePrice = prices[item.symbol] || item.ltp;
                const basePrice = item.prevClose || item.close || (item.ltp ? item.ltp / (1 + (item.changePercent / 100)) : livePrice);
                const liveChangePct = basePrice > 0 ? ((livePrice - basePrice) / basePrice) * 100 : item.changePercent;

                return (
                  <div
                    key={item.symbol}
                    onClick={() =>
                      setOrderState({
                        isOpen: true,
                        type: "BUY",
                        symbol: item.symbol,
                        ltp: livePrice || 0,
                      })
                    }
                    className="py-3 px-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-xs uppercase group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                        {item.symbol}
                        <span className="text-[9.5px] font-semibold text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                          {item.exchange || "NSE"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Click to place order
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-slate-900">
                        ₹{(livePrice || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px] font-mono font-bold text-emerald-600 flex items-center justify-end gap-0.5 mt-0.5">
                        <ChevronUp className="h-3 w-3 stroke-[2.5]" />+
                        {Math.abs(liveChangePct || 0).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
              {(movers?.topGainers || []).length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  Scanning live gainers...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Losers */}
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
          <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">
                Top Losers
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-semibold text-slate-500 bg-slate-50">
              NIFTY 500
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 text-xs">
              {(movers?.topLosers || []).slice(0, 8).map((item: any) => {
                const livePrice = prices[item.symbol] || item.ltp;
                const basePrice = item.prevClose || item.close || (item.ltp ? item.ltp / (1 + (item.changePercent / 100)) : livePrice);
                const liveChangePct = basePrice > 0 ? ((livePrice - basePrice) / basePrice) * 100 : item.changePercent;

                return (
                  <div
                    key={item.symbol}
                    onClick={() =>
                      setOrderState({
                        isOpen: true,
                        type: "BUY",
                        symbol: item.symbol,
                        ltp: livePrice || 0,
                      })
                    }
                    className="py-3 px-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-xs uppercase group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                        {item.symbol}
                        <span className="text-[9.5px] font-semibold text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                          {item.exchange || "NSE"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Click to place order
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-slate-900">
                        ₹{(livePrice || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px] font-mono font-bold text-rose-600 flex items-center justify-end gap-0.5 mt-0.5">
                        <ChevronDown className="h-3 w-3 stroke-[2.5]" />
                        {Math.abs(liveChangePct || 0).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
              {(movers?.topLosers || []).length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  Scanning live losers...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 5. Renew Session Modal (Pure White Background) ── */}
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
                  onClick={() => handleRenewSession({ preventDefault: () => { } } as any)}
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

      {/* ── 6. Zerodha Kite Style Order Window ── */}
      <OrderWindow
        isOpen={orderState.isOpen}
        onClose={() => setOrderState((prev) => ({ ...prev, isOpen: false }))}
        symbol={orderState.symbol}
        type={orderState.type}
        ltp={orderState.ltp}
        availableMargin={stats.marginAvailable}
        brokerId={activeBroker?.id}
        onTypeChange={(newType) => setOrderState((prev) => ({ ...prev, type: newType }))}
      />
    </div>
  );
}
