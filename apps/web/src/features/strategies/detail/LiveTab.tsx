"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, Radio, ShoppingCart } from "lucide-react";
import { EngineConsole } from "./EngineConsole";
import { EngineSnapshot } from "./EngineSnapshot";
import type { DetailCtx } from "./useStrategyDetail";

export function LiveTab({ ctx }: { ctx: DetailCtx }) {
  const { strategy, liveState, activeOrders, activeTab, is15Min } = ctx;
  return (
    <>
      {/* ─── TAB 1: LIVE ENGINE & TELEMETRY ─── */}
      {activeTab === "LIVE" && (
        <div className="space-y-6">
          <EngineSnapshot ctx={ctx} />

          {/* Live Engine Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-blue-500" />
                  Strategy Signal & Trend Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {liveState ? (
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Target Instrument</span>
                      <span className="font-bold text-foreground">
                        {liveState.futureSymbol || strategy.config.symbol || "Resolving..."}
                      </span>
                    </div>

                    {is15Min && (
                      <>
                        <div className="flex justify-between items-center py-1 border-b border-border/40">
                          <span className="text-muted-foreground">15-Min Range</span>
                          <span className="font-bold text-foreground">
                            {liveState.refLow
                              ? `₹${liveState.refLow} — ₹${liveState.refHigh}`
                              : "Scanning 9:15-9:30 AM Range"}
                          </span>
                        </div>
                        {liveState.dynamicAtr !== undefined && (
                          <div className="flex justify-between items-center py-1 border-b border-border/40">
                            <span className="text-muted-foreground">Dynamic ATR(14)</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              ₹{Number(liveState.dynamicAtr).toFixed(2)}
                            </span>
                          </div>
                        )}
                        {liveState.isDynamicTrailingActive && (
                          <div className="flex justify-between items-center py-1 border-b border-border/40">
                            <span className="text-muted-foreground">Trailing Mode</span>
                            <span className="font-bold text-purple-600 dark:text-purple-400">
                              🚀 Uncapped Momentum Trail Active
                            </span>
                          </div>
                        )}
                        {liveState.isProfitLockTrailed && !liveState.isDynamicTrailingActive && (
                          <div className="flex justify-between items-center py-1 border-b border-border/40">
                            <span className="text-muted-foreground">Trailing Mode</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              🔒 +1.5R Profit Locked (+0.75R)
                            </span>
                          </div>
                        )}
                        {liveState.isBreakevenTrailed && !liveState.isProfitLockTrailed && (
                          <div className="flex justify-between items-center py-1 border-b border-border/40">
                            <span className="text-muted-foreground">Trailing Mode</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              🛡 Cost SL Trailed (Risk-Free)
                            </span>
                          </div>
                        )}
                        {liveState.dailyRealizedPnlRs !== undefined && liveState.dailyRealizedPnlRs !== 0 && (
                          <div className="flex justify-between items-center py-1 border-b border-border/40">
                            <span className="text-muted-foreground">Realized Daily P&L</span>
                            <span className={cn("font-bold", liveState.dailyRealizedPnlRs >= 0 ? "text-emerald-600" : "text-rose-600")}>
                              {liveState.dailyRealizedPnlRs >= 0 ? "+" : ""}₹{Number(liveState.dailyRealizedPnlRs).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Setup Status</span>
                      <Badge
                        variant={
                          liveState.entryTriggered
                            ? "default"
                            : liveState.isGoalAchieved
                              ? "warning"
                              : "outline"
                        }
                        className="text-[10px] font-bold"
                      >
                        {liveState.entryTriggered
                          ? `Position Open (${liveState.entryTriggered})`
                          : liveState.isGoalAchieved
                            ? "🎯 Daily Target Win Locked"
                            : "Scanning for Signals"}
                      </Badge>
                    </div>

                    {liveState.optionSymbol && (
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted-foreground">Selected Strike</span>
                        <span className="font-black text-purple-600">{liveState.optionSymbol}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    <Radio className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
                    {strategy.isActive
                      ? "Engine active. Scanning market signals..."
                      : "Start engine to activate real-time telemetry."}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Run Orders */}
            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ShoppingCart className="h-3.5 w-3.5 text-amber-500" />
                  Active Execution Orders
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {activeOrders.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                      No orders placed in this run yet.
                    </div>
                  ) : (
                    activeOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              "text-[9px] px-1.5 py-0.2 font-bold",
                              order.side === "BUY"
                                ? "bg-blue-600 text-white"
                                : "bg-rose-600 text-white"
                            )}
                          >
                            {order.side}
                          </Badge>
                          <div>
                            <p className="text-xs font-bold text-foreground leading-tight">
                              {order.symbol}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase">
                              {order.orderType} • {order.qty} Qty
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-foreground">
                            ₹{order.price || order.triggerPrice || "Market"}
                          </p>
                          <Badge
                            variant={order.status === "COMPLETE" ? "default" : "secondary"}
                            className="text-[9px] px-1.5 py-0.2"
                          >
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <EngineConsole ctx={ctx} />
        </div>
      )}

    </>
  );
}
