"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMarketData } from "@/hooks/use-market-data";
import { usePortfolio } from "@/hooks/usePortfolio";
import { brokerApi, strategyApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlarmClock,
  Bot,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  ShieldAlert,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * Format raw Indian market symbol into human-readable Zerodha Kite style:
 * e.g. "NIFTY2690823900PE" -> "NIFTY 8th ʷ SEP 23900 PE"
 * e.g. "SBIN24SEP820CE"   -> "SBIN SEP 820 CE"
 */
export function formatKiteInstrument(rawSymbol: string): {
  display: string;
  exchange: string;
  isWeekly?: boolean;
} {
  if (!rawSymbol) return { display: "", exchange: "NSE" };

  const sym = rawSymbol.trim().toUpperCase();
  const exchange = sym.includes("CE") || sym.includes("PE") || sym.includes("FUT") ? "NFO" : "NSE";

  // 1. Weekly Option: e.g. NIFTY2490823900PE, NIFTY2690823900PE, BANKNIFTY24O1048000CE
  const weeklyMatch = sym.match(/^([A-Z]+)(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$/);
  if (weeklyMatch) {
    const [, base, , mChar, dayStr, strike, type] = weeklyMatch;
    const monthMap: Record<string, string> = {
      "1": "JAN", "2": "FEB", "3": "MAR", "4": "APR", "5": "MAY", "6": "JUN",
      "7": "JUL", "8": "AUG", "9": "SEP", "O": "OCT", "N": "NOV", "D": "DEC",
    };
    const month = monthMap[mChar] || "EXP";
    const day = parseInt(dayStr, 10);
    const suffix =
      day === 1 || day === 21 || day === 31
        ? "st"
        : day === 2 || day === 22
          ? "nd"
          : day === 3 || day === 23
            ? "rd"
            : "th";

    return {
      display: `${base} ${day}${suffix} ʷ ${month} ${strike} ${type}`,
      exchange,
      isWeekly: true,
    };
  }

  // 2. Monthly Option: e.g. NIFTY24SEP23900PE, SBIN24OCT820CE
  const monthlyMatch = sym.match(/^([A-Z]+)(\d{2})([A-Z]{3})(\d+)(CE|PE)$/);
  if (monthlyMatch) {
    const [, base, , mmm, strike, type] = monthlyMatch;
    return {
      display: `${base} ${mmm} ${strike} ${type}`,
      exchange,
      isWeekly: false,
    };
  }

  // 3. Futures: e.g. NIFTY24SEPFUT, RELIANCE24OCTFUT
  const futMatch = sym.match(/^([A-Z]+)(\d{2})([A-Z]{3})FUT$/);
  if (futMatch) {
    const [, base, , mmm] = futMatch;
    return {
      display: `${base} ${mmm} FUT`,
      exchange,
    };
  }

  // 4. Default Equity (e.g. INFY, RELIANCE)
  return {
    display: sym,
    exchange,
  };
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

  // Strategy Counts
  const activeStrategies = useMemo(() => strategies.filter((s) => s.isActive), [strategies]);
  const scheduledStrategies = useMemo(
    () => strategies.filter((s) => s.autoStart && !s.isActive),
    [strategies]
  );

  // Aggregate Metrics
  const totalNetMtm = useMemo(() => {
    return openPositions.reduce((sum, p) => sum + p.pnl, 0);
  }, [openPositions]);

  // Toggle Start / Stop Engine
  const handleToggleStrategy = async (strat: Strategy) => {
    setActionInProgress(`toggle-${strat.id}`);
    try {
      if (strat.isActive) {
        await strategyApi.stop(strat.id);
        toast.info(`Engine paused for ${strat.name}`);
      } else {
        await strategyApi.start(strat.id);
        toast.success(`Engine started for ${strat.name}`);
      }
      await loadStrategies();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update strategy");
    } finally {
      setActionInProgress(null);
    }
  };

  // Square off an individual position
  const handleSquareOffSinglePosition = async (pos: Position) => {
    if (!activeBroker?.id) return;
    setActionInProgress(`exit-${pos.symbol}`);
    try {
      const exitSide = Number(pos.qty) > 0 ? "SELL" : "BUY";
      const exitQty = Math.abs(Number(pos.qty));

      await brokerApi.placeOrder(activeBroker.id, {
        symbol: pos.symbol,
        exchange:
          pos.symbol.includes("-") ||
            pos.symbol.startsWith("NIFTY") ||
            pos.symbol.startsWith("BANKNIFTY")
            ? "NFO"
            : "NSE",
        side: exitSide,
        product: pos.product || "MIS",
        orderType: "MARKET",
        qty: exitQty,
        price: 0,
      });

      toast.success(`Square-off exit order placed for ${exitQty} ${pos.symbol}`);
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
          exchange:
            pos.symbol.includes("-") ||
              pos.symbol.startsWith("NIFTY") ||
              pos.symbol.startsWith("BANKNIFTY")
              ? "NFO"
              : "NSE",
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

  return (
    <div className="space-y-3">
      {/* ─── Main Unified Card ─── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden">
        {/* ── 1. Top Header: Zerodha Style ── */}
        <div className="py-2.5 px-4 border-b border-slate-100 flex flex-row items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-900">
              Positions ({openPositions.length})
            </h2>

            {/* Total MTM Pill */}
            {openPositions.length > 0 && (
              <span
                className={cn(
                  "font-mono font-bold text-xs px-2 py-0.5 rounded",
                  totalNetMtm >= 0
                    ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                    : "text-rose-700 bg-rose-50 border border-rose-200"
                )}
              >
                MTM: {totalNetMtm >= 0 ? "+" : ""}
                ₹{totalNetMtm.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            )}

            {/* Active / Scheduled Quick Counters */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span>•</span>
              <span className="font-semibold text-emerald-600">
                {activeStrategies.length} Live
              </span>
              <span>•</span>
              <span className="font-semibold text-amber-600">
                {scheduledStrategies.length} Scheduled (09:15 AM)
              </span>
            </div>

            {/* Live Socket Dot */}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded",
                isConnected
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              )}
              title={isConnected ? "WebSocket streaming live ticks" : "Connecting..."}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                )}
              />
              {isConnected ? "Live Ticks" : "Connecting"}
            </span>
          </div>

          {/* Action Header Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {openPositions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkSquareOff(true)}
                disabled={isBulkSquaringOff}
                className="h-7 px-2.5 text-xs font-semibold gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 rounded"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Square Off All</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refreshPositions();
                loadStrategies();
              }}
              title="Refresh telemetry"
              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 rounded"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── 2. Zerodha-Style Positions Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="border-b border-slate-100 text-[11px] font-medium text-slate-400 bg-white">
              <tr>
                <th className="py-2.5 px-4 w-16">Product</th>
                <th className="py-2.5 px-4">Instrument</th>
                <th className="py-2.5 px-4 text-right">Qty.</th>
                <th className="py-2.5 px-4 text-right">Avg.</th>
                <th className="py-2.5 px-4 text-right">LTP</th>
                <th className="py-2.5 px-4 text-right">P&L</th>
                <th className="py-2.5 px-4 text-right">Chg.</th>
                <th className="py-2.5 px-4 text-center w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {isPositionsLoading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-blue-600" />
                    Loading open positions...
                  </td>
                </tr>
              ) : openPositions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-5 px-4 text-center text-slate-400 text-xs italic">
                    No open market positions. Algorithmic strategies will automatically execute orders when setups trigger.
                  </td>
                </tr>
              ) : (
                openPositions.map((pos) => {
                  const isProfitable = pos.pnl >= 0;
                  const formatted = formatKiteInstrument(pos.symbol);

                  return (
                    <tr
                      key={pos.symbol}
                      className="hover:bg-slate-50/70 transition-colors group text-xs text-slate-800"
                    >
                      {/* Product Tag */}
                      <td className="py-2.5 px-4">
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                            pos.product === "MIS"
                              ? "bg-blue-50 text-blue-600 border border-blue-200"
                              : "bg-purple-50 text-purple-600 border border-purple-200"
                          )}
                        >
                          {pos.product || "NRML"}
                        </span>
                      </td>

                      {/* Formatted Zerodha Instrument Name */}
                      <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{formatted.display}</span>
                          <span className="text-[10px] font-medium text-slate-400 uppercase">
                            {formatted.exchange}
                          </span>
                          {pos.hasLiveTick && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                          )}
                        </div>
                      </td>

                      {/* Qty (Blue like Zerodha) */}
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-blue-600 whitespace-nowrap">
                        {pos.qty}
                      </td>

                      {/* Avg Price */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                        {Number(pos.avgPrice).toFixed(2)}
                      </td>

                      {/* Live LTP */}
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                        {Number(pos.ltp).toFixed(2)}
                      </td>

                      {/* P&L (Red / Green like Zerodha) */}
                      <td
                        className={cn(
                          "py-2.5 px-4 text-right font-mono font-bold whitespace-nowrap",
                          isProfitable ? "text-emerald-600" : "text-[#df514c]"
                        )}
                      >
                        {isProfitable ? "+" : ""}
                        {Number(pos.pnl).toFixed(2)}
                      </td>

                      {/* Chg % */}
                      <td
                        className={cn(
                          "py-2.5 px-4 text-right font-mono font-medium whitespace-nowrap",
                          isProfitable ? "text-emerald-600" : "text-[#df514c]"
                        )}
                      >
                        {isProfitable ? "+" : ""}
                        {pos.pnlPercent.toFixed(2)}%
                      </td>

                      {/* Action: Square Off */}
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionInProgress === `exit-${pos.symbol}`}
                          onClick={() => handleSquareOffSinglePosition(pos)}
                          className="h-6 px-2 text-[11px] font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 rounded"
                        >
                          {actionInProgress === `exit-${pos.symbol}` ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Square className="h-2.5 w-2.5 fill-rose-600 mr-1" />
                          )}
                          Square Off
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Total P&L Footer like Zerodha */}
            {openPositions.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50/50 text-xs">
                <tr>
                  <td colSpan={5} className="py-2 px-4 text-right font-semibold text-slate-600">
                    Total P&L
                  </td>
                  <td
                    className={cn(
                      "py-2 px-4 text-right font-mono font-bold text-sm",
                      totalNetMtm >= 0 ? "text-emerald-600" : "text-[#df514c]"
                    )}
                  >
                    {totalNetMtm >= 0 ? "+" : ""}
                    {totalNetMtm.toFixed(2)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── 3. Deployed Strategies & 09:15 AM Schedules ── */}
        <div className="border-t border-slate-100 bg-slate-50/30 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Active Algorithmic Strategies ({strategies.length})
              </h3>
            </div>
            <Link
              href="/strategies"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
            >
              <span>Manage all ({strategies.length})</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {isStrategiesLoading ? (
            <div className="py-3 text-center text-xs text-slate-400">
              Loading strategies...
            </div>
          ) : strategies.length === 0 ? (
            <div className="py-3 text-center text-xs text-slate-400">
              No strategies configured.{" "}
              <Link href="/strategies/new" className="text-blue-600 underline font-semibold">
                Create one now
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {strategies.map((s) => {
                const cfg =
                  typeof s.config === "string" ? JSON.parse(s.config || "{}") : s.config || {};
                const isStockOptions = s.type === "STOCK_OPTIONS_BUYING";
                const isNiftyScalper = s.type === "NIFTY_OPTIONS_SCALPER";
                const is15Min = s.type === "BREAKOUT_15MIN";
                const isEmaVwap = s.type === "EMA_VWAP_CROSSOVER";

                return (
                  <div
                    key={s.id}
                    className={cn(
                      "p-2.5 rounded-lg border bg-white transition-all flex items-center justify-between gap-2.5",
                      s.isActive
                        ? "border-emerald-300 shadow-2xs"
                        : s.autoStart
                          ? "border-amber-300 shadow-2xs"
                          : "border-slate-200"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {/* Status Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {s.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[9.5px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                            LIVE ACTIVE
                          </span>
                        ) : s.autoStart ? (
                          <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            <AlarmClock className="h-3 w-3" />
                            09:15 AM ARMED
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[9.5px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                            PAUSED
                          </span>
                        )}

                        <span
                          className={cn(
                            "text-[9.5px] font-semibold px-1.5 py-0.2 rounded border",
                            isStockOptions && "bg-amber-50 text-amber-700 border-amber-200",
                            isNiftyScalper && "bg-purple-50 text-purple-700 border-purple-200",
                            is15Min && "bg-blue-50 text-blue-700 border-blue-200",
                            isEmaVwap && "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}
                        >
                          {isStockOptions
                            ? "Stock Options"
                            : isNiftyScalper
                              ? "Nifty Scalper"
                              : is15Min
                                ? "15-Min Breakout"
                                : isEmaVwap
                                  ? "15-EMA & VWAP"
                                  : s.type}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 truncate" title={s.name}>
                        {s.name}
                      </h4>

                      <p className="text-[10.5px] text-slate-400 mt-0.5 truncate">
                        {isStockOptions
                          ? `180+ F&O Scanner • Capital: ₹${Number(cfg.maxCapital || 25000).toLocaleString("en-IN")}`
                          : `${cfg.symbol || "AUTO"} • ${cfg.product || "MIS"} • 09:15–15:05 IST`}
                      </p>
                    </div>

                    {/* Start / Pause Action */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionInProgress === `toggle-${s.id}`}
                        onClick={() => handleToggleStrategy(s)}
                        className={cn(
                          "h-6 px-2 text-[10.5px] font-semibold rounded",
                          s.isActive
                            ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        )}
                      >
                        {actionInProgress === `toggle-${s.id}` ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : s.isActive ? (
                          <>
                            <Pause className="h-2.5 w-2.5 mr-0.5" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="h-2.5 w-2.5 mr-0.5 fill-emerald-600" />
                            Start
                          </>
                        )}
                      </Button>

                      <Link href={`/strategies/${s.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600 rounded"
                          title="View Execution Telemetry & Logs"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ── Bulk Square Off Confirmation Dialog ── */}
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
