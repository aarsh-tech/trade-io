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
      badgeClass: "bg-blue-600 hover:bg-blue-600 text-white font-extrabold shadow-xs",
      timing: "09:15 AM",
      tag: "180+ F&O Scanner",
      tagColor: "text-indigo-950 bg-indigo-100 border border-indigo-300 font-bold",
      desc: "Scans 180+ F&O stocks for 5%–10% momentum. Buys ITM options, books 50% at T1 (+50% ROI), trails SL to cost, and rides T2 (+100% ROI).",
      icon: Flame,
      iconColor: "text-blue-700 bg-blue-100 border border-blue-300",
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
      badgeClass: "bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold shadow-xs",
      timing: "09:15 AM",
      tag: "5x MIS Leverage",
      tagColor: "text-emerald-950 bg-emerald-100 border border-emerald-300 font-bold",
      desc: "Scans 180+ F&O stocks for highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with dynamic ₹500 target & ₹500 SL.",
      icon: TrendingUp,
      iconColor: "text-emerald-700 bg-emerald-100 border border-emerald-300",
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
      badgeClass: "bg-amber-600 hover:bg-amber-600 text-white font-extrabold shadow-xs",
      timing: "01:30 PM",
      tag: "NIFTY & SENSEX",
      tagColor: "text-amber-950 bg-amber-100 border border-amber-300 font-bold",
      desc: "Trades explosive 01:30 PM – 03:25 PM Gamma spikes on NIFTY (Tue) & SENSEX (Thu). Buys cheap ₹8–₹15 options with Live OI confirmation.",
      icon: Zap,
      iconColor: "text-amber-700 bg-amber-100 border border-amber-300",
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
      badgeClass: "bg-purple-600 hover:bg-purple-600 text-white font-extrabold shadow-xs",
      timing: "09:20 AM",
      tag: "Uncapped Trail",
      tagColor: "text-purple-950 bg-purple-100 border border-purple-300 font-bold",
      desc: "Captures rapid Nifty impulses using 3 confluence triggers. Auto-sizes lots dynamically from live Zerodha margin and arms exchange SL.",
      icon: Target,
      iconColor: "text-purple-700 bg-purple-100 border border-purple-300",
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
      badgeClass: "bg-sky-600 hover:bg-sky-600 text-white font-extrabold shadow-xs",
      timing: "09:30 AM",
      tag: "Trap Reversal",
      tagColor: "text-sky-950 bg-sky-100 border border-sky-300 font-bold",
      desc: "Trades 15-Min Opening Range Breakouts & Breakdowns with false-breakout trap reversal and server SL-L at Zerodha.",
      icon: BarChart2,
      iconColor: "text-sky-700 bg-sky-100 border border-sky-300",
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
      <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-800 border border-blue-300 shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <label htmlFor="strategy-name" className="text-xs sm:text-sm font-extrabold text-slate-950 block">
                Strategy Identifier Name
              </label>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
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
              className="h-10 text-xs font-bold bg-white border-2 border-slate-300 focus:border-blue-600 rounded-xl text-slate-950 placeholder:text-slate-400 shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* ─── Strategy Algorithm Cards Grid ─── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold uppercase tracking-wider text-slate-900 block">
            Select Strategy Algorithm
          </label>
          <span className="text-xs font-semibold text-slate-700">
            Click a preset card to configure parameters
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    "relative overflow-hidden rounded-2xl border-2 p-5 flex flex-col justify-between gap-3.5 transition-all duration-200 text-left cursor-pointer group bg-white shadow-xs",
                    isSelected
                      ? "border-blue-600 bg-blue-50/60 shadow-md ring-2 ring-blue-500/30"
                      : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/80"
                  )}
                >
                  {/* Top Ambient Bar when selected */}
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500" />
                  )}

                  <div className="space-y-3">
                    {/* Top Badges Row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={cn(
                            "text-[10px] font-extrabold px-2.5 py-0.5 tracking-wider uppercase border-0",
                            badgeClass
                          )}
                        >
                          {badge}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-bold border-slate-300 text-slate-800 bg-slate-100 gap-1 py-0.5"
                        >
                          <Clock className="h-3 w-3 text-slate-700" />
                          {timing}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[11px] font-extrabold px-2.5 py-0.5 rounded-md",
                            tagColor
                          )}
                        >
                          {tag}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-400">
                            <Check className="h-3 w-3 stroke-[3]" /> SELECTED
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
                        <p className="font-extrabold text-sm sm:text-base text-slate-950 leading-snug group-hover:text-blue-700 transition-colors">
                          {label}
                        </p>
                        <p className="text-xs text-slate-800 leading-relaxed mt-1 font-medium line-clamp-3">
                          {desc}
                        </p>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-2 text-xs text-slate-900 font-semibold">
                      {features.map((feat, idx) => (
                        <span key={idx} className="flex items-center gap-1.5 truncate">
                          <CheckCircle2
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isSelected ? "text-blue-700" : "text-emerald-700"
                            )}
                          />
                          <span className="truncate text-slate-900 font-semibold">{feat}</span>
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
