"use client";

import React from "react";
import { pressable } from "@/lib/a11y";
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
      badgeClass: "bg-primary hover:bg-brand-hover text-primary-foreground font-semibold ",
      timing: "09:15 AM",
      tag: "180+ F&O Scanner",
      tagColor: "text-accent-foreground bg-brand-subtle border border-primary/30 font-semibold",
      desc: "Scans 180+ F&O stocks for 5%–10% momentum. Buys ITM options, books 50% at T1 (+50% ROI), trails SL to cost, and rides T2 (+100% ROI).",
      icon: Flame,
      iconColor: "text-accent-foreground bg-brand-subtle border border-primary/30",
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
      badgeClass: "bg-profit hover:bg-profit/90 text-on-profit font-semibold ",
      timing: "09:15 AM",
      tag: "5x MIS Leverage",
      tagColor: "text-profit bg-profit-subtle border border-profit/30 font-semibold",
      desc: "Scans 180+ F&O stocks for highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with dynamic ₹500 target & ₹500 SL.",
      icon: TrendingUp,
      iconColor: "text-profit bg-profit-subtle border border-profit/30",
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
      label: "Daily Index Scalper (SENSEX & NIFTY)",
      badge: "⚡ DAILY INDEX SCALPER",
      badgeClass: "bg-warn hover:bg-warn/90 text-on-warn font-semibold ",
      timing: "09:20 AM – 03:25 PM",
      tag: "NIFTY & SENSEX (ALL DAYS)",
      tagColor: "text-warn bg-warn-subtle border border-warn/30 font-semibold",
      desc: "Trades high-probability index breakouts every day (Mon–Fri). Selects high-delta ATM & ITM options with institutional VWAP, 15-EMA & volume confirmation.",
      icon: Zap,
      iconColor: "text-warn bg-warn-subtle border border-warn/30",
      features: [
        "NIFTY & SENSEX (All Days)",
        "High-Delta ATM & ITM (Zero Cheap OTM)",
        "Zero-Latency Ratchet Trailing",
        "15:29 Auto Square-Off Defense",
      ],
      isAutoStockPreset: false,
    },
    {
      type: "NIFTY_OPTIONS_SCALPER" as const,
      label: "Nifty Options Scalper (Dynamic Margin)",
      badge: "RAPID SCALPER",
      badgeClass: "bg-signal hover:bg-signal/90 text-on-signal font-semibold ",
      timing: "09:20 AM",
      tag: "Uncapped Trail",
      tagColor: "text-signal bg-signal-subtle border border-signal/30 font-semibold",
      desc: "Captures rapid Nifty impulses using 3 confluence triggers. Auto-sizes lots dynamically from live Zerodha margin and arms exchange SL.",
      icon: Target,
      iconColor: "text-signal bg-signal-subtle border border-signal/30",
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
      badgeClass: "bg-primary hover:bg-brand-hover text-primary-foreground font-semibold ",
      timing: "09:30 AM",
      tag: "Trap Reversal",
      tagColor: "text-accent-foreground bg-brand-subtle border border-primary/30 font-semibold",
      desc: "Trades 15-Min Opening Range Breakouts & Breakdowns with false-breakout trap reversal and server SL-L at Zerodha.",
      icon: BarChart2,
      iconColor: "text-accent-foreground bg-brand-subtle border border-primary/30",
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
      <div className="rounded-lg border-2 border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-brand-subtle text-accent-foreground border border-primary/30 shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <label htmlFor="strategy-name" className="text-xs sm:text-sm font-semibold text-foreground block">
                Strategy Identifier Name
              </label>
              <p className="text-xs text-foreground/75 font-medium mt-0.5">
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
              className="h-10 text-xs font-semibold bg-card border-2 border-border focus:border-primary rounded-lg text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* ─── Strategy Algorithm Cards Grid ─── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-foreground block">
            Select Strategy Algorithm
          </label>
          <span className="text-xs font-semibold text-foreground/75">
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
                  {...pressable(() => {
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
                      set("name", "Daily Index Scalper (SENSEX & NIFTY)");
                      set("symbol", "AUTO");
                      set("exchange", "NFO");
                      set("instrumentType", "OPTION");
                      set("product", "NRML");
                      set("lots", "1");
                      set("gbIndex", "AUTO");
                      set("gbStartTime", "09:20");
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
                  }, { role: "radio" })}
                  className={cn(
                    "relative overflow-hidden rounded-lg border-2 p-5 flex flex-col justify-between gap-3.5 transition-all duration-200 text-left cursor-pointer group bg-card ",
                    isSelected
                      ? "border-primary bg-brand-subtle/60 shadow-md ring-2 ring-primary/30"
                      : "border-border hover:border-primary hover:bg-muted/40"
                  )}
                >
                  {/* Top Ambient Bar when selected */}
                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary" />
                  )}

                  <div className="space-y-3">
                    {/* Top Badges Row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={cn(
                            "text-[10px] font-semibold px-2.5 py-0.5 tracking-wider uppercase border-0",
                            badgeClass
                          )}
                        >
                          {badge}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold border-border text-foreground bg-muted gap-1 py-0.5"
                        >
                          <Clock className="h-3 w-3 text-foreground/75" />
                          {timing}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[11px] font-semibold px-2.5 py-0.5 rounded-md",
                            tagColor
                          )}
                        >
                          {tag}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-foreground bg-brand-subtle px-2 py-0.5 rounded-full border border-primary">
                            <Check className="h-3 w-3 stroke-[3]" /> SELECTED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div className="flex items-start gap-3 mt-1">
                      <div
                        className={cn(
                          "p-2.5 rounded-lg shrink-0 transition-colors border",
                          iconColor
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm sm:text-base text-foreground leading-snug group-hover:text-accent-foreground transition-colors">
                          {label}
                        </p>
                        <p className="text-xs text-foreground leading-relaxed mt-1 font-medium line-clamp-3">
                          {desc}
                        </p>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs text-foreground font-semibold">
                      {features.map((feat, idx) => (
                        <span key={idx} className="flex items-center gap-1.5 truncate">
                          <CheckCircle2
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isSelected ? "text-accent-foreground" : "text-profit"
                            )}
                          />
                          <span className="truncate text-foreground font-semibold">{feat}</span>
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
