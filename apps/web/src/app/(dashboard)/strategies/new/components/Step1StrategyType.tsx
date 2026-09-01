"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Zap, BarChart2, TrendingUp, Target, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState } from "../types";

interface Step1Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
}

export function Step1StrategyType({ form, set }: Step1Props) {
  const strategies = [
    {
      type: "GAMMA_BLAST_EXPIRY" as const,
      label: "Gamma Blast (CAS & Expiry Special)",
      desc: "Trades explosive 01:30 PM – 03:25 PM Gamma spikes on NIFTY (Tuesdays) & SENSEX (Thursdays). Buys cheap ₹8–₹15 / ₹12–₹25 options with Live OI Unwinding & Range Breakout confirmation, and rides spikes with zero-latency Ratchet Trailing.",
      icon: Zap,
      badge: "Expiry Special (1 Lot)",
      badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700",
      isAutoStockPreset: false,
    },
    {
      type: "EMA_VWAP_CROSSOVER" as const,
      label: "Intraday Auto Stock Picker (₹500/day Target)",
      desc: "Auto-scans top liquid NSE stocks at 9:15 AM, picks the best momentum stock using EMA + VWAP crossover with candle confirmation, & executes Zerodha MIS orders automatically with a ₹500 target & ₹500 SL (1:1 RR).",
      icon: TrendingUp,
      badge: "₹500/day Target",
      badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold",
      isAutoStockPreset: true,
    },
    {
      type: "NIFTY_OPTIONS_SCALPER" as const,
      label: "Nifty 10-Point Options Scalper",
      desc: "Captures 10 option points daily on Nifty CE/PE using 3 triggers (EMA-VWAP Crossover, VWAP Pullback Rejection, 15-Min ORB). Auto-trails SL to COST at +5 pts & stops after 1 win.",
      icon: Target,
      badge: "Nifty 10-Pts Daily",
      badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold",
      isAutoStockPreset: false,
    },
    {
      type: "STOCK_OPTIONS_BUYING" as const,
      label: "Stock Options Buying",
      desc: "Best for 20k-25k capital. Trades ATM stock options using 15-EMA & VWAP crossover on 5/15-min stock charts with dynamic SL & RR Target.",
      icon: Flame,
      badge: "F&O Stocks",
      badgeColor: "bg-blue-100 text-blue-700",
      isAutoStockPreset: false,
    },
    {
      type: "BREAKOUT_15MIN" as const,
      label: "15-Min Breakout (Single Instrument)",
      desc: "Enters after 5-min candle closes above/below the first 15-min range for a specific stock or index. Fixed SL & Target.",
      icon: BarChart2,
      badge: null,
      badgeColor: "",
      isAutoStockPreset: false,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-semibold mb-2 block">Strategy Name</label>
        <Input
          id="strategy-name"
          placeholder="e.g. Gamma Blast Nifty Expiry"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-semibold mb-2 block">Strategy Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strategies.map(({ type, label, desc, icon: Icon, badge, badgeColor, isAutoStockPreset }) => (
            <button
              key={label}
              id={`type-${label}`}
              type="button"
              onClick={() => {
                set("type", type);
                if (type === "GAMMA_BLAST_EXPIRY") {
                  set("name", "Gamma Blast (CAS Expiry Special)");
                  set("symbol", "AUTO");
                  set("exchange", "NFO");
                  set("instrumentType", "OPTION");
                  set("product", "NRML");
                  set("lots", "1");
                  set("gbIndex", "AUTO");
                  set("gbMinPremiumNifty", "8");
                  set("gbMaxPremiumNifty", "15");
                  set("gbMinPremiumSensex", "12");
                  set("gbMaxPremiumSensex", "25");
                  set("gbStartTime", "13:00");
                  set("gbEndTime", "15:05");
                  set("gbEnableOiFilter", true);
                  set("gbEnableVolumeSurge", true);
                  set("gbEnableRatchetTrailing", true);
                  set("gbInitialSlPct", "50");
                  set("stopLossRs", "500");
                  set("targetRs", "1500");
                  set("maxTradesPerDay", "2");
                } else if (isAutoStockPreset) {
                  set("name", "Intraday Auto Stock Picker (₹500/day Target)");
                  set("symbol", "AUTO");
                  set("exchange", "NSE");
                  set("instrumentType", "STOCK");
                  set("product", "MIS");
                  set("targetRs", "500");
                  set("stopLossRs", "500");
                  set("maxTradesPerDay", "2");
                } else if (type === "NIFTY_OPTIONS_SCALPER") {
                  set("name", "Nifty 10-Point Options Scalper");
                  set("symbol", "NIFTY 50");
                  set("exchange", "NSE");
                  set("instrumentType", "INDEX");
                  set("product", "MIS");
                  set("lots", "1");
                  set("dsTargetPoints", "10");
                  set("dsStopLossPoints", "7");
                  set("maxTradesPerDay", "3");
                } else if (type === "STOCK_OPTIONS_BUYING") {
                  set("name", "Stock Options Buying");
                  set("symbol", "AUTO");
                  set("exchange", "NSE");
                  set("instrumentType", "STOCK");
                } else {
                  set("symbol", "NIFTY 50");
                  set("exchange", "NSE");
                  set("instrumentType", "INDEX");
                }
              }}
              className={cn(
                "text-left p-4 rounded-xl border-2 transition-all flex flex-col justify-between",
                form.type === type
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] shadow-sm"
                  : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--secondary)/0.5)]"
              )}
            >
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                      form.type === type ? "bg-[hsl(var(--primary)/0.15)]" : "bg-[hsl(var(--secondary))]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        form.type === type ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-bold text-sm leading-tight">{label}</p>
                    {badge && (
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1 inline-block", badgeColor)}>
                        {badge}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed mt-2">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
