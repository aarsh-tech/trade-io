"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BarChart2, Info } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";

export function AnalyticsTab({ ctx }: { ctx: DetailCtx }) {
  const { strategy, activeTab } = ctx;
  return (
    <>
      {/* ─── TAB 3: PERFORMANCE & TRADE ANALYTICS ─── */}
      {activeTab === "ANALYTICS" && (
        <Card className="border-border/60 bg-card rounded-2xl shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm font-bold">Performance & Trade Metrics</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
              Last 30 Days Running
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            {(() => {
              const perf = strategy.performance;
              const winRate = perf?.winRate ?? 0;
              const netPnl = perf?.netPnl ?? 0;
              const pf = perf?.profitFactor ?? 0;
              const avgProfitPerWin = perf?.avgProfitPerWin ?? 0;
              const totalTrades = perf?.totalTrades ?? 0;

              return (
                <div className="divide-y divide-border/60">
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60">
                    <div className="p-6 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Win Rate
                      </span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-black">{winRate.toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground">
                          {totalTrades} completed trade{totalTrades === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="w-full bg-secondary h-2 rounded-full mt-3 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-6 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Net Realized P&L
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-3xl font-black",
                            netPnl > 0
                              ? "text-emerald-600"
                              : netPnl < 0
                                ? "text-rose-600"
                                : "text-foreground"
                          )}
                        >
                          {netPnl < 0 ? "-" : ""}₹
                          {Math.abs(netPnl).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Avg. Win: ₹
                        {avgProfitPerWin.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div className="p-6 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Profit Factor
                      </span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-black">
                          {pf === 99.9 ? "∞" : pf.toFixed(2)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold",
                            pf >= 1.5
                              ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                              : "text-muted-foreground"
                          )}
                        >
                          {pf >= 2.0 ? "Excellent" : pf >= 1.2 ? "Healthy" : "Moderate"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Gross Profit / Gross Loss ratio</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 text-blue-500 shrink-0" />
                    <span>
                      {strategy.isPaperTrade
                        ? "Simulated executions recorded in virtual testing mode."
                        : "Verified live executions recorded via connected Zerodha Kite account."}
                    </span>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

    </>
  );
}
