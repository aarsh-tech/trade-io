"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BarChart2, Shield, Target, Zap } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";

export function MetricCards({ ctx }: { ctx: DetailCtx }) {
  const { cfg, is15Min, isEmaVwap, isNiftyScalper, isStockOptions, isGammaBlast } = ctx;
  return (
    <>
      {/* ─── Top 4 Metric Overview Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Instrument
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                <BarChart2 className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-foreground">
                {isStockOptions && (cfg.symbol === "AUTO" || cfg.isAutoStockSelect)
                  ? "AUTO (180+ F&O)"
                  : isGammaBlast
                    ? (cfg.symbol === "AUTO" ? "AUTO (Smart Expiry)" : cfg.symbol || "AUTO")
                    : cfg.symbol || "AUTO"}
              </span>
              <span className="text-[11px] text-muted-foreground">({cfg.exchange || (cfg.symbol === "SENSEX" ? "BFO" : "NSE")})</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Position Sizing
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                <Zap className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-foreground truncate">
                {isNiftyScalper
                  ? "Auto Margin"
                  : isGammaBlast
                    ? `${cfg.lots || 1} Lot${(cfg.lots || 1) > 1 ? "s" : ""}`
                    : isStockOptions && (cfg.symbol === "AUTO" || cfg.isAutoStockSelect)
                      ? "Auto NFO Lots"
                      : is15Min
                        ? "Risk-Based (5x)"
                        : isEmaVwap && cfg.symbol === "AUTO"
                          ? "Risk-Based (5x)"
                          : cfg.symbol === "AUTO"
                            ? "Auto (5x MIS)"
                            : cfg.qty
                              ? `${cfg.qty} Qty`
                              : "Dynamic"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isNiftyScalper
                  ? "Auto Lots"
                  : isGammaBlast
                    ? `${(cfg.lots || 1) * (cfg.symbol === "SENSEX" ? 20 : 65)} Qty`
                    : isStockOptions
                      ? "Real Lot Size"
                      : is15Min
                        ? "MIS 5x / Lots"
                        : isEmaVwap
                          ? "MIS 5x"
                          : "Sizing"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-500/80 uppercase tracking-wider">
                Stop Loss
              </span>
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600">
                <Shield className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-rose-600">
                {cfg.exitExactAtTarget
                  ? (isGammaBlast && cfg.stopLossPoints ? `-${cfg.stopLossPoints} Pts (₹${cfg.stopLossRs ?? 500})` : `Fixed ₹${cfg.stopLossRs ?? "500"}`)
                  : isGammaBlast
                    ? (cfg.stopLossPoints ? `-${cfg.stopLossPoints} Pts (₹${cfg.stopLossRs ?? 500})` : `₹${cfg.stopLossRs ?? 500} (${cfg.initialSlPct || 50}%)`)
                    : isNiftyScalper
                      ? "-7 Points"
                      : isStockOptions
                        ? "Mother Low / Trail"
                        : is15Min
                          ? "Candle SL"
                          : isEmaVwap
                            ? "Candle Low"
                            : `₹${cfg.stopLossRs ?? cfg.dailyMaxLossRs ?? "500"}`}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {cfg.exitExactAtTarget
                  ? (cfg.enableHybridTrailing !== false ? "Break-Even + Hybrid Trail" : "Exact Loss Cut")
                  : isGammaBlast
                    ? "Zero-Decay Ratchet"
                    : isNiftyScalper
                      ? "Server SL + Trail"
                      : isStockOptions
                        ? "Breakeven @ T1"
                        : is15Min
                          ? "Server SL Armed"
                          : isEmaVwap
                            ? "15-EMA Trailed"
                            : "Risk Cap"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-600/80 uppercase tracking-wider">
                Daily Target
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Target className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-emerald-600">
                {cfg.exitExactAtTarget
                  ? (isGammaBlast && cfg.targetPoints ? `+${cfg.targetPoints} Pts (₹${cfg.targetRs ?? 1000})` : `Fixed ₹${cfg.targetRs ?? "500"}`)
                  : isGammaBlast
                    ? (cfg.targetPoints ? `+${cfg.targetPoints} Pts (₹${cfg.targetRs ?? 1000})` : `₹${cfg.targetRs ?? 1500}`)
                    : isNiftyScalper
                      ? "+10 Pts + Trail"
                      : isStockOptions
                        ? "1:1.5 & 1:3 RR"
                        : is15Min
                          ? "1:2 RR + Trail"
                          : isEmaVwap
                            ? "15-EMA / VWAP"
                            : `₹${cfg.targetRs ?? cfg.dailyTargetRs ?? "500"}`}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {cfg.exitExactAtTarget
                  ? (cfg.enableHybridTrailing !== false ? "Fixed Tgt + Hybrid Trail" : "Exact Target Exit")
                  : isGammaBlast
                    ? "2.0x Partial & Runner"
                    : isNiftyScalper
                      ? "Uncapped Momentum"
                      : isStockOptions
                        ? "Banker & Runner"
                        : is15Min
                          ? "Uncapped Momentum"
                          : isEmaVwap
                            ? "Trend Exhaustion"
                            : "Target"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

    </>
  );
}
