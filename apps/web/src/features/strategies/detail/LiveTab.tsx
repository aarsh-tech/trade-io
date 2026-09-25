"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, ChevronDown, ChevronUp, Copy, Filter, Radio, ShoppingCart, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DetailCtx } from "./useStrategyDetail";

export function LiveTab({ ctx }: { ctx: DetailCtx }) {
  const { strategy, setLiveLogs, liveState, activeOrders, showLogs, setShowLogs, hidePnlLogs, setHidePnlLogs, activeTab, displayedLogs, logsRef, copyLogsToClipboard, is15Min } = ctx;
  return (
    <>
      {/* ─── TAB 1: LIVE ENGINE & TELEMETRY ─── */}
      {activeTab === "LIVE" && (
        <div className="space-y-6">
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

          {/* ── Live Streaming Console ── */}
          <Card className="border-border/60 bg-card shadow-sm overflow-hidden rounded-2xl">
            <CardHeader className="p-4 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Live Engine Terminal Console
                </CardTitle>
                {strategy.isActive && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={hidePnlLogs ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setHidePnlLogs((v) => !v)}
                  className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                  title={hidePnlLogs ? "Switch to show all logs" : "Hide repetitive P&L ticks to view trade signals and executions only"}
                >
                  <Filter className="h-3 w-3" />
                  <span className="hidden sm:inline">{hidePnlLogs ? "Events Only" : "All Logs"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLogsToClipboard}
                  className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                  <span className="hidden sm:inline">Copy Logs</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLiveLogs([]);
                    toast.success("Terminal logs cleared");
                  }}
                  className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-rose-500"
                  title="Clear live terminal logs"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogs((v) => !v)}
                  className="h-7 w-7 p-0"
                >
                  {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>

            {showLogs && (
              <CardContent className="p-0">
                <div
                  ref={logsRef}
                  className="h-72 overflow-y-auto bg-slate-950 p-4 font-mono text-xs text-emerald-400 space-y-1 select-text scrollbar-thin"
                >
                  {displayedLogs.length === 0 ? (
                    <p className="text-slate-500 italic py-4 text-sm">
                      {strategy.isActive
                        ? "Engine running. Awaiting real-time market ticks and crossover signals..."
                        : "Start the engine to view live execution logs."}
                    </p>
                  ) : (
                    displayedLogs.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          "leading-relaxed py-0.5 text-sm",
                          line.includes("📊 [LIVE P&L]") &&
                          "text-cyan-300 font-semibold bg-cyan-950/40 px-2 py-0.5 rounded border-l-2 border-cyan-400 my-0.5",
                          line.includes("⏰") &&
                          "text-amber-300 font-bold bg-amber-950/30 px-1.5 rounded border-l-2 border-amber-400",
                          line.includes("❌") && "text-rose-400",
                          line.includes("⚠") && "text-amber-400",
                          line.includes("🟢") && "text-emerald-300 font-bold",
                          line.includes("🔴") && "text-rose-300 font-bold",
                          line.includes("✅") && "text-emerald-400 font-medium",
                          line.includes("⚡") && "text-purple-300 font-medium",
                          line.includes("🎯") && "text-emerald-300 font-bold"
                        )}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

    </>
  );
}
