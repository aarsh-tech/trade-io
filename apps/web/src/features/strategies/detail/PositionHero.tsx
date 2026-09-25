"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, Zap } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";

export function PositionHero({ ctx }: { ctx: DetailCtx }) {
  const { strategy, liveState, displayPnlRs, displayPnlPct, displayLtp, isSquareOffBusy, handleInstantSquareOff } = ctx;
  return (
    <>
      {/* ─── LIVE ACTIVE POSITION & RUNNING P&L HERO CARD ─── */}
      {strategy.isActive &&
        (liveState?.entryTriggered ||
          liveState?.stateType === "ACTIVE_POSITION" ||
          (liveState?.currentLtp && liveState?.entryPrice)) && (
          <Card className="border-2 border-emerald-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white shadow-2xl overflow-hidden relative rounded-2xl ring-1 ring-emerald-500/30">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
            <CardContent className="p-5 sm:p-6 relative z-10 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-black tracking-tight text-white">
                        {liveState.activeSymbol ||
                          liveState.optionSymbol ||
                          liveState.futureSymbol ||
                          strategy.config.symbol}
                      </h3>
                      <Badge
                        className={cn(
                          "text-[10px] font-black uppercase px-2.5 py-0.5",
                          liveState.entryTriggered === "LONG" || liveState.signalSide === "CALL"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        )}
                      >
                        {liveState.entryTriggered || liveState.signalSide || "ACTIVE POSITION"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300">
                        {liveState.qty || strategy.config.qty || 1}{" "}
                        {strategy.type.includes("OPTION") ? "Contracts" : "Shares"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {strategy.isPaperTrade
                          ? "📝 Paper Trade Engine"
                          : "⚡ Live Broker Real Execution"}
                      </span>
                      <span>•</span>
                      <span className="text-amber-400 font-medium">
                        ⏰ 03:15 PM IST Auto Square-Off Guaranteed
                      </span>
                    </p>
                  </div>
                </div>

                {/* Running P&L Display */}
                <div className="flex items-center gap-4 flex-wrap md:flex-nowrap justify-between md:justify-end">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Unrealized Live P&L
                    </p>
                    <div className="flex items-baseline gap-2 justify-start md:justify-end">
                      <span
                        className={cn(
                          "text-3xl sm:text-4xl font-black tracking-tight",
                          (displayPnlRs ?? 0) >= 0
                            ? "text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]"
                            : "text-rose-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.4)]"
                        )}
                      >
                        {(displayPnlRs ?? 0) >= 0 ? "+" : ""}₹
                        {Number(displayPnlRs ?? 0).toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          (displayPnlPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                        )}
                      >
                        ({(displayPnlPct ?? 0) >= 0 ? "+" : ""}
                        {Number(displayPnlPct ?? 0).toFixed(2)}%)
                      </span>
                    </div>
                    {(liveState.peakPnlRs ?? 0) > 0 && (
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        Peak High:{" "}
                        <span className="text-emerald-400 font-bold">
                          +₹{Number(liveState.peakPnlRs).toFixed(2)}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Instant Square Off Action Button */}
                  <Button
                    onClick={handleInstantSquareOff}
                    disabled={
                      isSquareOffBusy ||
                      (!liveState.entryTriggered && liveState.stateType !== "ACTIVE_POSITION")
                    }
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 h-11 rounded-xl shadow-lg shadow-rose-900/30 border border-rose-500/30 transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
                  >
                    {isSquareOffBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Zap className="h-4 w-4 mr-1.5 fill-current text-amber-300" />
                    )}
                    Instant Square Off
                  </Button>
                </div>
              </div>

              {/* 4-Box Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Entry Price</p>
                  <p className="text-base font-bold text-white mt-0.5">
                    ₹{Number(liveState.entryPrice ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                    <span>Current LTP</span>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </p>
                  <p className="text-base font-bold text-emerald-400 mt-0.5">
                    ₹{Number(displayLtp).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Target (1:1.5 RR)</p>
                  <p className="text-base font-bold text-emerald-300 mt-0.5">
                    ₹{Number(liveState.targetPrice ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400">
                    {liveState.isTrailingEma ? "Trailing SL (15-EMA)" : "Stop Loss"}
                  </p>
                  <p className="text-base font-bold text-rose-300 mt-0.5">
                    ₹{Number(liveState.stopLossPrice ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Trailing Status Banner */}
              {liveState.isTrailingEma && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <TrendingUp className="h-4 w-4" />
                    <span>Dynamic 15-EMA Line Trailing Active — Riding Open Trend</span>
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-200">
                    Trail Stop: ₹{Number(liveState.stopLossPrice ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

    </>
  );
}
