"use client";

import { OrderWindow } from "@/components/dashboard/OrderWindow";
import { LiveAlgoPositionsCard } from "@/components/dashboard/LiveAlgoPositionsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMarketData } from "@/hooks/use-market-data";
import { useBrokers } from "@/hooks/useBrokers";
import { useDashboard } from "@/hooks/useDashboard";
import { FeedStatusBadge } from "@/components/dashboard/FeedStatusBadge";
import { usePortfolio } from "@/hooks/usePortfolio";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import {
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
import React, { useMemo, useState, useEffect } from "react";
import { formatINR } from "@/lib/format";
interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
}

interface MarginSegment {
  enabled?: boolean;
  net?: number;
  available?: {
    cash?: number;
    live_balance?: number;
    opening_balance?: number;
    collateral?: number;
    intraday_payin?: number;
    adhoc_margin?: number;
    [key: string]: any;
  };
  utilised?: {
    debits?: number;
    exposure?: number;
    m2m_realised?: number;
    m2m_unrealised?: number;
    option_premium?: number;
    pnl?: number;
    span?: number;
    [key: string]: any;
  };
}

interface Margin {
  equity?: MarginSegment;
  commodity?: MarginSegment;
}

interface Broker {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { movers, feed, isLoading: isDashboardLoading, refresh: refreshDashboard } = useDashboard();
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

  // Auto-detect Zerodha request_token on desktop redirect
  useEffect(() => {
    if (typeof window === "undefined" || !activeBroker?.id) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("request_token") || params.get("requestToken");

    // Only auto-submit redirect tokens that carry our signed login state (see getLoginUrl).
    const state = params.get("state");
    if (token && state && (!params.get("status") || params.get("status") === "success")) {
      renewSession({ token, state })
        .then(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("request_token");
          url.searchParams.delete("requestToken");
          url.searchParams.delete("state");
          url.searchParams.delete("action");
          url.searchParams.delete("status");
          url.searchParams.delete("type");
          const nextUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
          window.history.replaceState({}, document.title, nextUrl);
        })
        .catch((err) => {
          console.error("Auto token renewal failed:", err);
        });
    }
  }, [activeBroker?.id, renewSession]);

  const handleOpenLogin = async () => {
    const url = await getLoginUrl();
    if (url) window.open(url, "_blank");
  };

  const handleAutomatedLogin = async () => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("request_token") || urlParams.get("requestToken");
      const urlState = urlParams.get("state");
      if (urlToken && urlState) {
        try {
          await renewSession({ token: urlToken, state: urlState });
          setShowRenewModal(false);
          setRequestToken("");
          return;
        } catch { }
      }

      try {
        if (navigator?.clipboard?.readText) {
          const clipText = await navigator.clipboard.readText();
          let token = (clipText || "").trim();
          if (token.includes("request_token=")) {
            const match = token.match(/request_token=([a-zA-Z0-9]+)/);
            if (match && match[1]) token = match[1];
          }
          if (token && token.length >= 10 && !token.includes(" ")) {
            setRequestToken(token);
            await renewSession(token);
            setShowRenewModal(false);
            setRequestToken("");
            return;
          }
        }
      } catch { }
    }

    await handleOpenLogin();
  };

  const handleRenewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestToken) return;
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
      safeMargins?.equity?.net ??
      0;
    const marginsUsed = safeMargins?.equity?.utilised?.debits ?? 0;
    const openingBalance =
      safeMargins?.equity?.available?.opening_balance ?? marginAvailable;

    const commodityMarginAvailable =
      safeMargins?.commodity?.available?.live_balance ??
      safeMargins?.commodity?.available?.cash ??
      safeMargins?.commodity?.net ??
      0;
    const commodityMarginsUsed = safeMargins?.commodity?.utilised?.debits ?? 0;
    const commodityOpeningBalance =
      safeMargins?.commodity?.available?.opening_balance ?? commodityMarginAvailable;

    return {
      totalInvestment,
      currentValue,
      pnl,
      pnlPercent,
      marginAvailable,
      marginsUsed,
      openingBalance,
      commodityMarginAvailable,
      commodityMarginsUsed,
      commodityOpeningBalance,
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
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Loading Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-3.5 animate-[fade-up_0.3s_ease_both] pb-8 font-sans">
      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-0.5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Hi, {firstName}
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Real-time algorithmic trading capital, execution telemetry, and market movers
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <FeedStatusBadge feed={feed} />
          {activeBroker && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs h-8 font-medium shadow-2xs rounded-lg"
              onClick={() => setShowRenewModal(true)}
            >
              <Zap className="h-3 w-3 text-amber-600" /> Daily Login
            </Button>
          )}

          <Button
            size="sm"
            className="gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 shadow-xs rounded-lg"
            onClick={() =>
              setOrderState({
                isOpen: true,
                type: "BUY",
                symbol: "",
                ltp: 0,
              })
            }
          >
            <ShoppingCart className="h-3 w-3" /> Place Order
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border bg-card hover:bg-muted/50 shadow-2xs rounded-lg"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCcw
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground",
                isRefreshing && "animate-spin text-blue-600"
              )}
            />
          </Button>
        </div>
      </div>

      {/* ── 2. Live Algo Execution & Positions Card ── */}
      <LiveAlgoPositionsCard activeBroker={activeBroker} />

      {/* ── 3. Unified Financial Capital & Holdings Row (3-Grid) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-3.5">
        {/* Equity Margin */}
        <Card className="border-border/90 bg-card shadow-xs rounded-xl overflow-hidden hover:border-border transition-colors">
          <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <LayoutGrid className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-xs font-bold text-foreground tracking-tight">
                Equity Margin
              </CardTitle>
            </div>
            <Link
              href="/portfolio"
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5 group"
            >
              <span>Statement</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </CardHeader>

          <CardContent className="p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-[10px] font-medium text-muted-foreground block uppercase tracking-wider">
                  Margin Available
                </span>
                <div className="text-xl font-bold font-mono text-foreground tracking-tight mt-0.5">
                  {formatINR(stats.marginAvailable)}
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground block">Margins Used</span>
                <span className="font-mono font-semibold text-foreground text-xs">
                  {formatINR(stats.marginsUsed)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Opening Balance</span>
                <span className="font-mono font-semibold text-foreground text-xs">
                  {formatINR(stats.openingBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commodity Margin */}
        <Card className="border-border/90 bg-card shadow-xs rounded-xl overflow-hidden hover:border-border transition-colors">
          <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                <History className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-xs font-bold text-foreground tracking-tight">
                Commodity Margin
              </CardTitle>
            </div>
            <Link
              href="/portfolio"
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5 group"
            >
              <span>Statement</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </CardHeader>

          <CardContent className="p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-[10px] font-medium text-muted-foreground block uppercase tracking-wider">
                  Margin Available
                </span>
                <div className="text-xl font-bold font-mono text-foreground tracking-tight mt-0.5">
                  {formatINR(stats.commodityMarginAvailable)}
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground block">Margins Used</span>
                <span className="font-mono font-semibold text-foreground text-xs">
                  {formatINR(stats.commodityMarginsUsed)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Opening Balance</span>
                <span className="font-mono font-semibold text-foreground text-xs">
                  {formatINR(stats.commodityOpeningBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Holdings & Net P&L */}
        <Card className="border-border/90 bg-card shadow-xs rounded-xl overflow-hidden hover:border-border transition-colors">
          <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <PieChartIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-xs font-bold text-foreground tracking-tight">
                  Holdings
                </CardTitle>
                <Badge variant="secondary" className="text-[9.5px] font-mono py-0 px-1 bg-muted text-foreground/75">
                  {stats.holdingsCount} Assets
                </Badge>
              </div>
            </div>

            <Link
              href="/portfolio"
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5 group"
            >
              <span>Portfolio</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </CardHeader>

          <CardContent className="p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-[10px] font-medium text-muted-foreground block uppercase tracking-wider">
                  Unrealized P&L
                </span>
                <div
                  className={cn(
                    "text-xl font-bold font-mono tracking-tight mt-0.5 flex items-center gap-1",
                    stats.pnl > 0
                      ? "text-emerald-600"
                      : stats.pnl < 0
                        ? "text-rose-600"
                        : "text-foreground"
                  )}
                >
                  {stats.pnl > 0 ? "+" : ""}
                  {formatINR(stats.pnl)}
                  <span className="text-[11px] font-bold">
                    ({stats.pnl >= 0 ? "+" : ""}{stats.pnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground block">Current Value</span>
                <span className="font-mono font-semibold text-foreground text-xs">
                  {formatINR(stats.currentValue)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Invested Value</span>
                <span className="font-mono font-semibold text-foreground/75 text-xs">
                  {formatINR(stats.totalInvestment)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 4. Market Movers: Top Gainers & Top Losers (2-Grid) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5">
        {/* Top Gainers */}
        <Card className="border-border/90 bg-card shadow-xs rounded-xl overflow-hidden hover:border-border transition-colors">
          <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-xs font-bold text-foreground tracking-tight">
                Top Gainers
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[9.5px] font-semibold text-muted-foreground bg-muted/50 py-0 px-1.5">
                1D
              </Badge>
              <Badge variant="outline" className="text-[9.5px] font-semibold text-muted-foreground bg-muted/50 py-0 px-1.5">
                NIFTY 500
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-border text-xs">
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
                    className="py-2 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <div>
                      <div className="font-bold text-foreground text-xs uppercase group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                        {item.symbol}
                        <span className="text-[9.5px] font-semibold text-muted-foreground bg-muted px-1 py-0.2 rounded">
                          {item.exchange || "NSE"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Click to place order
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-foreground">
                        {formatINR((livePrice || 0))}
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
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Scanning live gainers...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Losers */}
        <Card className="border-border/90 bg-card shadow-xs rounded-xl overflow-hidden hover:border-border transition-colors">
          <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-xs font-bold text-foreground tracking-tight">
                Top Losers
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[9.5px] font-semibold text-muted-foreground bg-muted/50 py-0 px-1.5">
                1D
              </Badge>
              <Badge variant="outline" className="text-[9.5px] font-semibold text-muted-foreground bg-muted/50 py-0 px-1.5">
                NIFTY 500
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-border text-xs">
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
                    className="py-2 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <div>
                      <div className="font-bold text-foreground text-xs uppercase group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                        {item.symbol}
                        <span className="text-[9.5px] font-semibold text-muted-foreground bg-muted px-1 py-0.2 rounded">
                          {item.exchange || "NSE"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Click to place order
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-foreground">
                        {formatINR((livePrice || 0))}
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
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Scanning live losers...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>


      {/* ── 5. Renew Session Modal (Pure White Background) ── */}
      <Dialog open={showRenewModal} onOpenChange={setShowRenewModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-card text-foreground border border-border shadow-2xl">
          <div className="p-6 pb-2 bg-card">
            <div className="flex items-start gap-3.5 mb-1">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-amber-600" />
              </div>
              <div className="pr-6">
                <DialogTitle className="text-lg font-bold text-foreground">
                  Broker Daily Login
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Brokers require a fresh daily authentication token. Follow these quick steps to sync your account:
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 space-y-3.5 bg-card">
            {/* Step 1 Card */}
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  1
                </span>
                <span className="text-xs font-semibold text-foreground">
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
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  2
                </span>
                <span className="text-xs font-semibold text-foreground">
                  Sync Session Token
                </span>
              </div>

              <form onSubmit={handleRenewSession} className="space-y-3">
                <Button
                  type="button"
                  onClick={handleAutomatedLogin}
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
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    OR PASTE MANUALLY
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <Input
                  value={requestToken}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    if (val.includes("request_token=")) {
                      const match = val.match(/request_token=([a-zA-Z0-9]+)/);
                      if (match && match[1]) val = match[1];
                    }
                    setRequestToken(val);
                  }}
                  placeholder="Paste token or redirect URL here..."
                  className="h-9 border-border bg-card text-foreground text-xs focus:ring-1 focus:ring-blue-500 placeholder:text-muted-foreground"
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

          <div className="bg-muted/50 px-6 py-3 border-t border-border flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground text-xs h-8"
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
