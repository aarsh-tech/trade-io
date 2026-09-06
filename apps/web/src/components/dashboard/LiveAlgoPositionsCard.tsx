"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  ShieldAlert,
  Square,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useMarketData } from "@/hooks/use-market-data";
import { strategyApi, brokerApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LiveAlgoPositionsCardProps {
  activeBroker: {
    id: string;
    broker: string;
    isActive: boolean;
  } | null;
}

interface Strategy {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isPaperTrade?: boolean;
  autoStart?: boolean;
  config?: any;
  latestExecution?: {
    id: string;
    status: string;
    startedAt: string;
  };
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

export function LiveAlgoPositionsCard({ activeBroker }: LiveAlgoPositionsCardProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [isStrategiesLoading, setIsStrategiesLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Square off all confirmation dialog
  const [showBulkSquareOff, setShowBulkSquareOff] = useState(false);
  const [isBulkSquaringOff, setIsBulkSquaringOff] = useState(false);

  // Fetch broker positions
  const {
    positions = [],
    isPositionsLoading,
    refreshPositions,
  } = usePortfolio(activeBroker?.id);

  // Load user strategies
  const loadStrategies = useCallback(async () => {
    try {
      const res = await strategyApi.list();
      const list = res.data?.data ?? [];
      setStrategies(list);
    } catch {
      // ignore
    } finally {
      setIsStrategiesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStrategies();
    const interval = setInterval(() => {
      loadStrategies();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadStrategies]);

  // Extract open position symbols for live WebSocket market data streaming
  const positionSymbols = useMemo(() => {
    return (positions as Position[])
      .map((p) => p.symbol)
      .filter(Boolean);
  }, [positions]);

  const { getPrice, isConnected } = useMarketData(positionSymbols);

  // Compute live real-time positions with WebSocket LTP overrides
  const livePositions = useMemo(() => {
    return (positions as Position[]).map((pos) => {
      const liveLtp = getPrice(pos.symbol);
      const currentPrice = typeof liveLtp === "number" ? liveLtp : Number(pos.ltp || pos.avgPrice);
      const quantity = Number(pos.qty);
      const avgPrice = Number(pos.avgPrice);

      let currentPnl = Number(pos.pnl);
      let pnlPercent = 0;

      if (quantity !== 0 && avgPrice > 0) {
        currentPnl = (currentPrice - avgPrice) * quantity;
        pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
        if (quantity < 0) {
          currentPnl = -currentPnl;
          pnlPercent = -pnlPercent;
        }
      }

      return {
        ...pos,
        ltp: currentPrice,
        pnl: currentPnl,
        pnlPercent,
        hasLiveTick: typeof liveLtp === "number",
      };
    });
  }, [positions, getPrice]);

  // Open active positions (non-zero qty)
  const openPositions = useMemo(() => {
    return livePositions.filter((p) => Number(p.qty) !== 0);
  }, [livePositions]);

  // Active running strategies
  const activeStrategies = useMemo(() => {
    return strategies.filter((s) => s.isActive);
  }, [strategies]);

  // Aggregate Metrics
  const totalNetMtm = useMemo(() => {
    return openPositions.reduce((sum, p) => sum + p.pnl, 0);
  }, [openPositions]);

  const totalOpenExposure = useMemo(() => {
    return openPositions.reduce(
      (sum, p) => sum + Math.abs(Number(p.qty) * (p.ltp || p.avgPrice)),
      0
    );
  }, [openPositions]);

  const totalClosedPnl = useMemo(() => {
    return livePositions
      .filter((p) => Number(p.qty) === 0)
      .reduce((sum, p) => sum + Number(p.pnl), 0);
  }, [livePositions]);

  // Map positions to their parent running strategy
  const strategyPositionMap = useMemo(() => {
    const unmappedPositions = [...openPositions];
    const map: Array<{
      strategy: Strategy;
      positions: typeof livePositions;
    }> = [];

    for (const strat of activeStrategies) {
      const cfg = typeof strat.config === "string" ? JSON.parse(strat.config || "{}") : strat.config || {};
      const stratSymbol = cfg.symbol ? cfg.symbol.toUpperCase().trim() : "";

      const matched: typeof livePositions = [];

      for (let i = unmappedPositions.length - 1; i >= 0; i--) {
        const p = unmappedPositions[i];
        const pSym = p.symbol.toUpperCase();

        const isMatch =
          stratSymbol &&
          stratSymbol !== "AUTO" &&
          (pSym === stratSymbol || pSym.startsWith(stratSymbol));

        const isAutoOptionMatch =
          strat.type === "STOCK_OPTIONS_BUYING" &&
          (p.product === "MIS" || p.product === "NRML") &&
          (pSym.endsWith("CE") || pSym.endsWith("PE"));

        const isAutoEquityMatch =
          (strat.type === "EMA_VWAP_CROSSOVER" || strat.type === "BREAKOUT_15MIN") &&
          p.product === "MIS" &&
          !pSym.endsWith("CE") &&
          !pSym.endsWith("PE");

        if (isMatch || isAutoOptionMatch || isAutoEquityMatch) {
          matched.push(p);
          unmappedPositions.splice(i, 1);
        }
      }

      map.push({ strategy: strat, positions: matched });
    }

    return { mapped: map, unmapped: unmappedPositions };
  }, [activeStrategies, openPositions]);

  // Square off an individual strategy's trade
  const handleSquareOffStrategy = async (strat: Strategy) => {
    setActionInProgress(`exit-${strat.id}`);
    try {
      await strategyApi.squareOff(strat.id);
      toast.success(`Square-off exit executed for ${strat.name}`);
      await Promise.all([refreshPositions(), loadStrategies()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to square off strategy");
    } finally {
      setActionInProgress(null);
    }
  };

  // Square off an unmapped individual broker position
  const handleSquareOffSinglePosition = async (pos: Position) => {
    if (!activeBroker?.id) return;
    setActionInProgress(`exit-pos-${pos.symbol}`);
    try {
      const exitSide = Number(pos.qty) > 0 ? "SELL" : "BUY";
      const exitQty = Math.abs(Number(pos.qty));

      await brokerApi.placeOrder(activeBroker.id, {
        symbol: pos.symbol,
        exchange: pos.symbol.includes("-") || pos.symbol.startsWith("NIFTY") || pos.symbol.startsWith("BANKNIFTY") ? "NFO" : "NSE",
        side: exitSide,
        product: pos.product || "MIS",
        orderType: "MARKET",
        qty: exitQty,
        price: 0,
      });

      toast.success(`Square-off order placed for ${exitQty} ${pos.symbol}`);
      await refreshPositions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to square off position");
    } finally {
      setActionInProgress(null);
    }
  };

  // Bulk Square-Off All
  const handleSquareOffAll = async () => {
    if (!activeBroker?.id) {
      toast.error("No active broker connected");
      return;
    }
    setIsBulkSquaringOff(true);
    try {
      for (const strat of activeStrategies) {
        await strategyApi.squareOff(strat.id).catch(() => { });
      }

      let closedCount = 0;
      for (const pos of openPositions) {
        const exitSide = Number(pos.qty) > 0 ? "SELL" : "BUY";
        const exitQty = Math.abs(Number(pos.qty));

        await brokerApi.placeOrder(activeBroker.id, {
          symbol: pos.symbol,
          exchange: pos.symbol.includes("-") || pos.symbol.startsWith("NIFTY") || pos.symbol.startsWith("BANKNIFTY") ? "NFO" : "NSE",
          side: exitSide,
          product: pos.product || "MIS",
          orderType: "MARKET",
          qty: exitQty,
          price: 0,
        }).then(() => closedCount++).catch(() => { });
      }

      toast.success(`Successfully squared off all positions (${closedCount} orders executed)`);
      setShowBulkSquareOff(false);
      await Promise.all([refreshPositions(), loadStrategies()]);
    } catch (err: any) {
      toast.error("Error executing bulk square-off");
    } finally {
      setIsBulkSquaringOff(false);
    }
  };

  const hasAnyExecution = activeStrategies.length > 0 || openPositions.length > 0;

  return (
    <div className="space-y-2.5">
      {/* ─── Compact Main Execution Card ─── */}
      <Card className="border-border/70 bg-card shadow-xs rounded-xl overflow-hidden">
        {/* Compact Header Bar */}
        <div className="py-2.5 px-3.5 sm:px-4 border-b border-border/50 flex flex-row items-center justify-between gap-2 bg-secondary/15">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Activity className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 truncate">
              <h2 className="text-xs sm:text-sm font-bold text-foreground tracking-tight truncate">
                Live Algo Execution & Positions
              </h2>
              {activeStrategies.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  {activeStrategies.length} Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground border border-border/70 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Standby
                </span>
              )}

              {/* WebSocket Pulse Badge */}
              <span
                className={cn(
                  "hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.2 rounded-full border",
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                )}
                title={isConnected ? "WebSocket streaming live ticks" : "Connecting to market feed..."}
              >
                <Radio className={cn("h-2.5 w-2.5", isConnected && "animate-pulse")} />
                {isConnected ? "Live Ticks" : "Polling"}
              </span>
            </div>
          </div>

          {/* Action Header Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refreshPositions();
                loadStrategies();
              }}
              title="Refresh Positions and Strategies"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>

            {/* Square Off All Positions Button */}
            {openPositions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkSquareOff(true)}
                disabled={isBulkSquaringOff}
                className="h-7 px-2 text-[11px] font-bold gap-1 border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 rounded-lg shadow-2xs"
              >
                <ShieldAlert className="h-3 w-3" />
                <span>Square Off All ({openPositions.length})</span>
              </Button>
            )}

            <Link href="/strategies">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] font-semibold gap-0.5 border-border/80 text-foreground hover:bg-accent rounded-lg"
              >
                <span>Strategies</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>

        {/* ─── Compact 4-Metric Strip ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/60 bg-card border-b border-border/50">
          {/* Total Net Live MTM */}
          <div className="py-2 px-3.5 sm:px-4">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Total Net Live MTM
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span
                className={cn(
                  "text-lg sm:text-xl font-bold font-mono tracking-tight",
                  totalNetMtm > 0
                    ? "text-emerald-600"
                    : totalNetMtm < 0
                      ? "text-rose-600"
                      : "text-foreground"
                )}
              >
                {totalNetMtm > 0 ? "+" : ""}
                ₹{totalNetMtm.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {totalNetMtm !== 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold inline-flex items-center",
                    totalNetMtm > 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {totalNetMtm > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground block truncate">
              {openPositions.length} open {openPositions.length === 1 ? "position" : "positions"}
            </span>
          </div>

          {/* Open Market Exposure */}
          <div className="py-2 px-3.5 sm:px-4">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Open Exposure
            </span>
            <div className="mt-0.5 text-lg sm:text-xl font-bold font-mono text-foreground tracking-tight">
              ₹{totalOpenExposure.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Capital deployed
            </span>
          </div>

          {/* Realized P&L Today */}
          <div className="py-2 px-3.5 sm:px-4">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Realized P&L Today
            </span>
            <div
              className={cn(
                "mt-0.5 text-lg sm:text-xl font-bold font-mono tracking-tight",
                totalClosedPnl > 0
                  ? "text-emerald-600"
                  : totalClosedPnl < 0
                    ? "text-rose-600"
                    : "text-muted-foreground"
              )}
            >
              {totalClosedPnl > 0 ? "+" : ""}
              ₹{totalClosedPnl.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Closed session trades
            </span>
          </div>

          {/* Execution Engines */}
          <div className="py-2 px-3.5 sm:px-4">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Algorithmic Engines
            </span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-foreground tracking-tight">
                {activeStrategies.length}
              </span>
              <span className="text-[11px] text-muted-foreground">
                / {strategies.length} active
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Automated runners
            </span>
          </div>
        </div>

        {/* ─── High-Density Strategy & Position Rows ─── */}
        <div className="p-2.5 sm:p-3 space-y-2 bg-secondary/5">
          {isStrategiesLoading || isPositionsLoading ? (
            <div className="py-4 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-xs text-muted-foreground">Loading live positions...</span>
            </div>
          ) : !hasAnyExecution ? (
            /* Standby State */
            <div className="py-4 px-3 text-center rounded-lg bg-card border border-dashed border-border/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-left">
                <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">
                    No Algorithmic Strategies or Positions Active
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Start an engine or arm 09:15 AM Auto-Start in Trading Strategies.
                  </p>
                </div>
              </div>
              <Link href="/strategies">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-7 px-3 rounded-lg shadow-xs gap-1 shrink-0">
                  <Play className="h-3 w-3 fill-white" />
                  View Strategies
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 1. Strategy-Linked Positions & Active Engines */}
              {strategyPositionMap.mapped.map(({ strategy: strat, positions: stratPositions }) => {
                const cfg = typeof strat.config === "string" ? JSON.parse(strat.config || "{}") : strat.config || {};
                const isStockOptions = strat.type === "STOCK_OPTIONS_BUYING";
                const is15Min = strat.type === "BREAKOUT_15MIN";
                const isEmaVwap = strat.type === "EMA_VWAP_CROSSOVER";
                const isNiftyScalper = strat.type === "NIFTY_OPTIONS_SCALPER";

                return (
                  <div
                    key={strat.id}
                    className="rounded-lg border border-border/70 bg-card p-2.5 transition-all hover:border-border hover:shadow-xs space-y-2"
                  >
                    {/* Strategy Header Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded border",
                            isStockOptions && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                            isNiftyScalper && "bg-purple-500/10 text-purple-600 border-purple-500/20",
                            is15Min && "bg-blue-500/10 text-blue-600 border-blue-500/20",
                            isEmaVwap && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          )}
                        >
                          {isStockOptions && <Flame className="h-2.5 w-2.5" />}
                          {isNiftyScalper && <Target className="h-2.5 w-2.5" />}
                          {is15Min && <Activity className="h-2.5 w-2.5" />}
                          {isEmaVwap && <TrendingUp className="h-2.5 w-2.5" />}
                          <span>
                            {isStockOptions
                              ? "Stock Options"
                              : isNiftyScalper
                                ? "Nifty Scalper"
                                : is15Min
                                  ? "15-Min Breakout"
                                  : isEmaVwap
                                    ? "15-EMA & VWAP"
                                    : strat.type}
                          </span>
                        </span>

                        <span className="text-xs font-bold text-foreground truncate">
                          {strat.name}
                        </span>

                        <span className="text-[10px] text-muted-foreground font-mono">
                          ({cfg.symbol || "AUTO"} • {cfg.product || "MIS"})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Link href={`/strategies/${strat.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10.5px] font-semibold text-muted-foreground hover:text-blue-600 rounded"
                          >
                            <ExternalLink className="h-2.5 w-2.5 mr-0.5" />
                            Details
                          </Button>
                        </Link>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionInProgress === `stop-${strat.id}`}
                          onClick={async () => {
                            setActionInProgress(`stop-${strat.id}`);
                            try {
                              await strategyApi.stop(strat.id);
                              toast.info(`Engine stopped for ${strat.name}`);
                              await loadStrategies();
                            } catch (e: any) {
                              toast.error(e?.response?.data?.message || "Failed to stop engine");
                            } finally {
                              setActionInProgress(null);
                            }
                          }}
                          className="h-6 px-2 text-[10.5px] font-semibold text-amber-600 border-amber-500/30 hover:bg-amber-500/10 rounded"
                        >
                          <Pause className="h-2.5 w-2.5 mr-0.5" />
                          Pause
                        </Button>
                      </div>
                    </div>

                    {/* Positions or Active Scanning Ribbon */}
                    {stratPositions.length > 0 ? (
                      <div className="space-y-1.5">
                        {stratPositions.map((pos) => {
                          const isProfitable = pos.pnl >= 0;
                          return (
                            <div
                              key={pos.symbol}
                              className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-2 rounded-md bg-secondary/30 border border-border/50 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "font-bold text-[9.5px] px-1.5 py-0 uppercase shrink-0",
                                    Number(pos.qty) > 0
                                      ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                      : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                  )}
                                >
                                  {Number(pos.qty) > 0 ? "BUY" : "SELL"} {pos.product}
                                </Badge>

                                <div className="truncate">
                                  <span className="font-extrabold text-foreground text-xs mr-1.5">
                                    {pos.symbol}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    Qty: <strong className="text-foreground">{pos.qty}</strong> • Avg: ₹{Number(pos.avgPrice).toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 sm:gap-4 shrink-0 ml-auto">
                                <div className="text-right">
                                  <span className="text-[9.5px] text-muted-foreground block leading-tight">LTP</span>
                                  <span className="text-xs font-bold font-mono text-foreground">
                                    ₹{Number(pos.ltp).toFixed(2)}
                                  </span>
                                </div>

                                <div className="text-right min-w-[90px]">
                                  <span className="text-[9.5px] text-muted-foreground block leading-tight">Net MTM</span>
                                  <span
                                    className={cn(
                                      "text-xs font-extrabold font-mono",
                                      isProfitable ? "text-emerald-600" : "text-rose-600"
                                    )}
                                  >
                                    {isProfitable ? "+" : ""}
                                    ₹{Number(pos.pnl).toLocaleString("en-IN", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[9.5px] font-bold block leading-none",
                                      isProfitable ? "text-emerald-600" : "text-rose-600"
                                    )}
                                  >
                                    {isProfitable ? "+" : ""}{pos.pnlPercent.toFixed(2)}%
                                  </span>
                                </div>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={actionInProgress === `exit-${strat.id}` || actionInProgress === `exit-pos-${pos.symbol}`}
                                  onClick={() => handleSquareOffStrategy(strat)}
                                  className="h-6 px-2 text-[10.5px] font-bold gap-1 text-rose-600 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 rounded shrink-0"
                                >
                                  {actionInProgress === `exit-${strat.id}` ? (
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <Square className="h-2.5 w-2.5 fill-rose-600" />
                                  )}
                                  <span>Square Off</span>
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Active Scanning Ribbon */
                      <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-secondary/30 border border-border/40 text-[11px]">
                        <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="font-medium text-foreground/90 truncate">
                            {isStockOptions
                              ? "Active — Scanning 180+ F&O stocks for momentum setups"
                              : is15Min
                                ? "Active — Monitoring 15-Min breakout & CPR levels"
                                : isEmaVwap
                                  ? "Active — Monitoring 15-EMA & VWAP triggers"
                                  : "Active — Monitoring market triggers"}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline ml-2">
                          ₹{Number(cfg.maxCapital || 25000).toLocaleString("en-IN")} • 09:15–15:05
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 2. Unmapped / Direct Broker Positions */}
              {strategyPositionMap.unmapped.length > 0 && (
                <div className="rounded-lg border border-border/70 bg-card p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-border/40 text-[11px]">
                    <span className="font-bold uppercase tracking-wider text-muted-foreground">
                      Other Open Positions ({strategyPositionMap.unmapped.length})
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Direct Broker Orders
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {strategyPositionMap.unmapped.map((pos) => {
                      const isProfitable = pos.pnl >= 0;
                      return (
                        <div
                          key={pos.symbol}
                          className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-2 rounded-md bg-secondary/30 border border-border/50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-bold text-[9.5px] px-1.5 py-0 uppercase shrink-0",
                                Number(pos.qty) > 0
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              )}
                            >
                              {Number(pos.qty) > 0 ? "BUY" : "SELL"} {pos.product}
                            </Badge>

                            <div className="truncate">
                              <span className="font-extrabold text-foreground text-xs mr-1.5">
                                {pos.symbol}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Qty: <strong className="text-foreground">{pos.qty}</strong> • Avg: ₹{Number(pos.avgPrice).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 sm:gap-4 shrink-0 ml-auto">
                            <div className="text-right">
                              <span className="text-[9.5px] text-muted-foreground block leading-tight">LTP</span>
                              <span className="text-xs font-bold font-mono text-foreground">
                                ₹{Number(pos.ltp).toFixed(2)}
                              </span>
                            </div>

                            <div className="text-right min-w-[90px]">
                              <span className="text-[9.5px] text-muted-foreground block leading-tight">Net MTM</span>
                              <span
                                className={cn(
                                  "text-xs font-extrabold font-mono",
                                  isProfitable ? "text-emerald-600" : "text-rose-600"
                                )}
                              >
                                {isProfitable ? "+" : ""}
                                ₹{Number(pos.pnl).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span
                                className={cn(
                                  "text-[9.5px] font-bold block leading-none",
                                  isProfitable ? "text-emerald-600" : "text-rose-600"
                                )}
                              >
                                {isProfitable ? "+" : ""}{pos.pnlPercent.toFixed(2)}%
                              </span>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionInProgress === `exit-pos-${pos.symbol}`}
                              onClick={() => handleSquareOffSinglePosition(pos)}
                              className="h-6 px-2 text-[10.5px] font-bold gap-1 text-rose-600 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 rounded shrink-0"
                            >
                              {actionInProgress === `exit-pos-${pos.symbol}` ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <Square className="h-2.5 w-2.5 fill-rose-600" />
                              )}
                              <span>Square Off</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ─── Bulk Square Off Confirmation Dialog ─── */}
      <ConfirmDialog
        open={showBulkSquareOff}
        onOpenChange={setShowBulkSquareOff}
        onConfirm={handleSquareOffAll}
        title="Confirm Bulk Square-Off"
        description={`Are you sure you want to square off all ${openPositions.length} active market position(s)? This will immediately place MARKET exit orders to your broker and halt active algorithmic execution.`}
        confirmText={isBulkSquaringOff ? "Squaring Off..." : "Square Off All Positions"}
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}
