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
          <Card className="p-0 border-profit/40 bg-card overflow-hidden relative">
            <CardContent className="p-5 sm:p-6 relative z-10 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-60" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-profit" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">
                        {liveState.activeSymbol ||
                          liveState.optionSymbol ||
                          liveState.futureSymbol ||
                          strategy.config.symbol}
                      </h3>
                      <Badge
                        className={cn(
                          "text-[10px] font-semibold uppercase px-2 py-0.5",
                          liveState.entryTriggered === "LONG" || liveState.signalSide === "CALL"
                            ? "bg-profit/10 text-profit border border-profit/25"
                            : "bg-loss/10 text-loss border border-loss/25"
                        )}
                      >
                        {liveState.entryTriggered || liveState.signalSide || "ACTIVE POSITION"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {liveState.qty || strategy.config.qty || 1}{" "}
                        {strategy.type.includes("OPTION") ? "Contracts" : "Shares"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {strategy.isPaperTrade
                          ? "📝 Paper Trade Engine"
                          : "⚡ Live Broker Real Execution"}
                      </span>
                      <span>•</span>
                      <span className="text-warn font-medium">
                        ⏰ 03:15 PM IST Auto Square-Off Guaranteed
                      </span>
                    </p>
                  </div>
                </div>

                {/* Running P&L Display */}
                <div className="flex items-center gap-4 flex-wrap md:flex-nowrap justify-between md:justify-end">
                  <div className="text-left md:text-right">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Unrealized Live P&L
                    </p>
                    <div className="flex items-baseline gap-2 justify-start md:justify-end">
                      <span
                        className={cn(
                          "text-2xl sm:text-3xl font-semibold tracking-tight num",
                          (displayPnlRs ?? 0) >= 0
                            ? "text-profit"
                            : "text-loss"
                        )}
                      >
                        {(displayPnlRs ?? 0) >= 0 ? "+" : ""}₹
                        {Number(displayPnlRs ?? 0).toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-medium num",
                          (displayPnlPct ?? 0) >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        ({(displayPnlPct ?? 0) >= 0 ? "+" : ""}
                        {Number(displayPnlPct ?? 0).toFixed(2)}%)
                      </span>
                    </div>
                    {(liveState.peakPnlRs ?? 0) > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Peak High:{" "}
                        <span className="text-profit font-medium num">
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
                    variant="danger"
                    className="font-semibold text-xs px-4 h-10 whitespace-nowrap"
                  >
                    {isSquareOffBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Zap className="h-4 w-4 mr-1.5" />
                    )}
                    Instant Square Off
                  </Button>
                </div>
              </div>

              {/* 4-Box Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-muted/60 border border-border">
                  <p className="text-[11px] font-medium text-muted-foreground">Entry Price</p>
                  <p className="text-base font-semibold num text-foreground mt-0.5">
                    ₹{Number(liveState.entryPrice ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/60 border border-border">
                  <p className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                    <span>Current LTP</span>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-profit animate-pulse" />
                  </p>
                  <p className="text-base font-semibold num text-foreground mt-0.5">
                    ₹{Number(displayLtp).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/60 border border-border">
                  <p className="text-[11px] font-medium text-muted-foreground">Target (1:1.5 RR)</p>
                  <p className="text-base font-semibold num text-profit mt-0.5">
                    ₹{Number(liveState.targetPrice ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/60 border border-border">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {liveState.isTrailingEma ? "Trailing SL (15-EMA)" : "Stop Loss"}
                  </p>
                  <p className="text-base font-semibold num text-loss mt-0.5">
                    ₹{Number(liveState.stopLossPrice ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Trailing Status Banner */}
              {liveState.isTrailingEma && (
                <div className="p-2.5 rounded-lg bg-profit/10 border border-profit/25 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-profit">
                    <TrendingUp className="h-4 w-4" />
                    <span>Dynamic 15-EMA Line Trailing Active — Riding Open Trend</span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-profit">
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
