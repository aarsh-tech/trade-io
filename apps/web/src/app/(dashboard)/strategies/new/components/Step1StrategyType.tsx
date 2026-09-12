"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  BarChart2,
  TrendingUp,
  Target,
  Flame,
  Clock,
  Check,
  CheckCircle2,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState } from "../types";

interface Step1Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
}

export function Step1StrategyType({ form, set }: Step1Props) {
  const strategies = [
    {
      type: "STOCK_OPTIONS_BUYING" as const,
      label: "Stock Option Auto-Hunter (Banker & Runner)",
      badge: "🔥 80% WIN-RATE",
      badgeClass: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-600 text-white font-extrabold shadow-2xs",
      timing: "09:15 AM",
      tag: "180+ F&O Scanner",
      tagColor: "text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60",
      desc: "Scans 180+ F&O stocks for 5%–10% momentum. Buys ITM options, books 50% at T1 (+50% ROI), trails SL to cost, and rides T2 (+100% ROI).",
      icon: Flame,
      iconColor: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
      features: [
        "180+ F&O Auto Stock Picker",
        "50% Cash Lock @ T1 (+50% ROI)",
        "Risk-Free Breakeven Trail",
        "NIFTY 50 Macro Trend Gate",
      ],
      isAutoStockPreset: false,
    },
    {
      type: "EMA_VWAP_CROSSOVER" as const,
      label: "Intraday Auto Stock Picker (₹500 Target)",
      badge: "⭐ RECOMMENDED PRESET",
      badgeClass: "bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold shadow-2xs",
      timing: "09:15 AM",
      tag: "5x MIS Leverage",
      tagColor: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60",
      desc: "Scans 180+ F&O stocks for highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with dynamic ₹500 target & ₹500 SL.",
      icon: TrendingUp,
      iconColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      features: [
        "Auto 09:15 AM Stock Picker",
        "Strict Risk Sizing (Max 25% Capital)",
        "Structural SL below Candle Low",
        "15-EMA Live Trailing on Zerodha",
      ],
      isAutoStockPreset: true,
    },
    {
      type: "GAMMA_BLAST_EXPIRY" as const,
      label: "Gamma Blast (CAS & Expiry Special)",
      badge: "⚡ 01:30 PM EXPIRY HUNTER",
      badgeClass: "bg-amber-600 hover:bg-amber-600 text-white font-extrabold shadow-2xs",
      timing: "01:30 PM",
      tag: "NIFTY & SENSEX",
      tagColor: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60",
      desc: "Trades explosive 01:30 PM – 03:25 PM Gamma spikes on NIFTY (Tue) & SENSEX (Thu). Buys cheap ₹8–₹15 options with Live OI confirmation.",
      icon: Zap,
      iconColor: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
      features: [
        "NIFTY (Tue) & SENSEX (Thu)",
        "Cheap ₹8–₹15 Strike Hunter",
        "Zero-Latency Ratchet Trailing",
        "15:05 Sharp Auto Square-Off",
      ],
      isAutoStockPreset: false,
    },
    {
      type: "NIFTY_OPTIONS_SCALPER" as const,
      label: "Nifty Options Scalper (Dynamic Margin)",
      badge: "RAPID SCALPER",
      badgeClass: "bg-purple-600 hover:bg-purple-600 text-white font-extrabold shadow-2xs",
      timing: "09:20 AM",
      tag: "Uncapped Trail",
      tagColor: "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60",
      desc: "Captures rapid Nifty impulses using 3 confluence triggers. Auto-sizes lots dynamically from live Zerodha margin and arms exchange SL.",
      icon: Target,
      iconColor: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
      features: [
        "Dynamic Margin Lots",
        "Exchange Server SL Armed",
        "Breakeven Trail at +5 pts",
        "Two-Loss Circuit Breaker",
      ],
      isAutoStockPreset: false,
    },
    {
      type: "BREAKOUT_15MIN" as const,
      label: "15-Min Breakout (Dynamic Margin + Server SL)",
      badge: "OPENING RANGE",
      badgeClass: "bg-cyan-600 hover:bg-cyan-600 text-white font-extrabold shadow-2xs",
      timing: "09:30 AM",
      tag: "Trap Reversal",
      tagColor: "text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200/60 dark:border-cyan-800/60",
      desc: "Trades 15-Min Opening Range Breakouts & Breakdowns with false-breakout trap reversal and server SL-L at Zerodha.",
      icon: BarChart2,
      iconColor: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      features: [
        "False Breakout Trap Reversal",
        "Server SL-L Placed on Kite",
        "Early Breakeven at +0.7R",
        "1-Loss & Done Shield",
      ],
      isAutoStockPreset: false,
    },
  ];

  return (
    <div className="space-y-5">
      {/* ─── Strategy Identifier Name Card ─── */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <label htmlFor="strategy-name" className="text-xs sm:text-sm font-bold text-foreground block">
                Strategy Identifier Name
              </label>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Customize your strategy name or use the auto-generated algorithm title
              </p>
            </div>
          </div>
          <div className="sm:w-80">
            <Input
              id="strategy-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Stock Options Hunter"
              className="h-10 text-xs font-semibold bg-background border-border focus:border-blue-500 rounded-xl text-foreground placeholder:text-muted-foreground/60 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* ─── Strategy Algorithm Cards Grid ─── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            Select Strategy Algorithm
          </label>
          <span className="text-[11px] text-muted-foreground">
            Click a preset card to configure parameters
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {strategies.map(
            ({
              type,
              label,
              desc,
              icon: Icon,
              iconColor,
              badge,
              badgeClass,
              timing,
              tag,
              tagColor,
              isAutoStockPreset,
              features,
            }) => {
              const isSelected = form.type === type;
              return (
                <div
                  key={label}
                  id={`type-${label}`}
                  onClick={() => {
                    set("type", type);
                    if (type === "STOCK_OPTIONS_BUYING") {
                      set("name", "Auto F&O Stock Options Hunter (80% Profitability)");
                      set("symbol", "AUTO");
                      set("exchange", "NSE");
                      set("instrumentType", "STOCK");
                      set("sIsAutoStockSelect", true);
                      set("sDirectionBias", "BOTH");
                      set("sSetupType", "BOTH");
                      set("sMoneyness", "ITM");
                      set("sTimeframe", "15min");
                      set("sEmaPeriod", "15");
                      set("sTarget1RR", "1.5");
                      set("sTarget2RR", "3.0");
                      set("sEnableTrailingSl", true);
                      set("sEnableMarketTrendFilter", true);
                      set("sEnableMiddayChopFilter", true);
                      set("sEnablePartialBooking", true);
                      set("sPartialBookingPct", "50");
                      set("sMaxCapital", "25000");
                      set("lots", "1");
                      set("maxTradesPerDay", "1");
                    } else if (type === "GAMMA_BLAST_EXPIRY") {
                      set("name", "Gamma Blast (CAS Expiry Special)");
                      set("symbol", "AUTO");
                      set("exchange", "NFO");
                      set("instrumentType", "OPTION");
                      set("product", "NRML");
                      set("lots", "1");
                      set("gbIndex", "AUTO");
                      set("gbStartTime", "13:00");
                      set("gbEndTime", "15:25");
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
                    } else if (type === "BREAKOUT_15MIN") {
                      set("name", "15-Min Breakout (Dynamic Margin + Server SL)");
                      set("symbol", "NIFTY 50");
                      set("exchange", "NSE");
                      set("instrumentType", "INDEX");
                      set("product", "MIS");
                      set("lots", "1");
                      set("targetRs", "1500");
                      set("stopLossRs", "1000");
                      set("maxTradesPerDay", "2");
                    } else {
                      set("symbol", "NIFTY 50");
                      set("exchange", "NSE");
                      set("instrumentType", "INDEX");
                    }
                  }}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border p-4.5 flex flex-col justify-between gap-3.5 transition-all duration-300 text-left cursor-pointer group bg-card",
                    isSelected
                      ? "border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-sm ring-1 ring-blue-500/30"
                      : "border-border hover:border-blue-400/50 hover:bg-accent/40 shadow-xs"
                  )}
                >
                  {/* Top Ambient Bar when selected - matching Algo UI */}
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />
                  )}

                  <div className="space-y-2.5">
                    {/* Top Badges Row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          className={cn(
                            "text-[9px] font-extrabold px-2 py-0.5 tracking-wider uppercase",
                            badgeClass
                          )}
                        >
                          {badge}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-semibold border-border text-slate-600 dark:text-slate-400 bg-background/80 gap-1 py-0.5"
                        >
                          <Clock className="h-2.5 w-2.5 text-slate-500" />
                          {timing}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-md",
                            tagColor
                          )}
                        >
                          {tag}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full border border-blue-500/30">
                            <Check className="h-2.5 w-2.5 stroke-[3]" /> SELECTED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div className="flex items-start gap-3 mt-1">
                      <div
                        className={cn(
                          "p-2.5 rounded-xl shrink-0 transition-colors border",
                          iconColor
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-sm text-foreground leading-snug group-hover:text-blue-600 transition-colors">
                          {label}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1 line-clamp-3 font-normal">
                          {desc}
                        </p>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="pt-2.5 border-t border-border/60 grid grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-200 font-medium">
                      {features.map((feat, idx) => (
                        <span key={idx} className="flex items-center gap-1.5 truncate">
                          <CheckCircle2
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isSelected ? "text-blue-600" : "text-emerald-600 dark:text-emerald-400"
                            )}
                          />
                          <span className="truncate">{feat}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
