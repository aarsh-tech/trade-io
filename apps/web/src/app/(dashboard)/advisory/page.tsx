"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Flame,
  Zap,
  RefreshCw,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AdvisoryTradeSetup {
  category: "STOCK_CASH" | "NIFTY" | "SENSEX";
  assetName: string;
  symbol: string;
  exchange: "NSE" | "NFO" | "BFO";
  instrumentType: "EQUITY" | "CALL" | "PUT";
  contractSymbol: string;
  direction: "BULLISH" | "BEARISH";
  spotLtp: number;
  setupRationale: string;
  cmp: number;
  triggerPrice: number;
  triggerCondition: string;
  entryZone: string;
  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number;
  lotSize?: number;
  maxRiskPerLot?: number;
}

interface AdvisoryReport {
  timestamp: string;
  dateStr: string;
  stockSetup: AdvisoryTradeSetup;
  niftySetup: AdvisoryTradeSetup;
  sensexSetup: AdvisoryTradeSetup;
}

export default function DailyAdvisoryPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"stock" | "nifty" | "sensex" | "trailing">("stock");

  // Fetch Live Advisory Setups
  const { data: reportData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["advisory-report"],
    queryFn: async () => {
      const res = await marketApi.getAdvisoryReport();
      return res.data?.data as AdvisoryReport;
    },
    refetchInterval: 30000,
  });

  function handleCopyAlertText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Trade setup copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2500);
  }

  function getFormattedAlertText(setup?: AdvisoryTradeSetup, stage: "watch" | "trigger" = "watch"): string {
    if (!setup) return "";
    const dirEmoji = setup.direction === "BULLISH" ? "🟢" : "🔴";
    const isStockCash = setup.category === "STOCK_CASH";
    const dirVerb = setup.direction === "BULLISH" ? "Bullish above" : "Bearish below";

    const t1GainPct = isStockCash
      ? Math.abs(((setup.target1 - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.target1 - setup.cmp) / setup.cmp) * 100).toFixed(0);
    const t2GainPct = isStockCash
      ? Math.abs(((setup.target2 - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.target2 - setup.cmp) / setup.cmp) * 100).toFixed(0);
    const t3GainPct = setup.target3
      ? isStockCash
        ? Math.abs(((setup.target3 - setup.spotLtp) / setup.spotLtp) * 100).toFixed(1)
        : Math.abs(((setup.target3 - setup.cmp) / setup.cmp) * 100).toFixed(0)
      : null;
    const slPct = isStockCash
      ? Math.abs(((setup.spotLtp - setup.stopLoss) / setup.spotLtp) * 100).toFixed(1)
      : Math.abs(((setup.cmp - setup.stopLoss) / setup.cmp) * 100).toFixed(0);

    if (stage === "watch") {
      return `━━━━━━━━━━━━━━━━━━━━\n👀 TRADEIO PRE-ENTRY SETUP WATCH\n🎯 ${setup.assetName}\n━━━━━━━━━━━━━━━━━━━━\n\n${dirEmoji} ${setup.symbol} ${dirVerb} ${setup.triggerPrice}\n▸ Current Price: ₹${setup.spotLtp.toFixed(2)}\n▸ Setup: ${setup.setupRationale}\n\n💎 ADD TO WATCHLIST NOW:\n▸ ${isStockCash ? "Script" : "Contract"}: ${setup.contractSymbol}\n${!isStockCash ? `▸ Approx CMP: ₹${setup.cmp.toFixed(2)}\n` : ""}▸ ⚡ TRIGGER: ${setup.triggerCondition}\n\n🎯 INTRADAY TRADE PLAN:\n▸ Planned Entry: ${setup.entryZone}\n▸ Stop-Loss (SL): ₹${setup.stopLoss.toFixed(2)} (Strict -${slPct}% SL)\n▸ Targets: ₹${setup.target1.toFixed(2)} / ₹${setup.target2.toFixed(2)}${setup.target3 ? ` / ₹${setup.target3.toFixed(2)}` : ""}\n${setup.lotSize && setup.maxRiskPerLot ? `▸ Lot Size: ${setup.lotSize} Qty | Max Risk: ₹${setup.maxRiskPerLot.toFixed(2)}\n` : ""}\n⚠️ Keep on watchlist. Execute strictly upon confirmed trigger level crossing!\n━━━━━━━━━━━━━━━━━━━━\n⚡ TradeIO Institutional Pre-Market Intelligence`;
    }

    return `━━━━━━━━━━━━━━━━━━━━\n🚀 TRADEIO OFFICIAL TRADE TRIGGER\n🎯 ${setup.assetName}\n━━━━━━━━━━━━━━━━━━━━\n\n${dirEmoji} ${setup.symbol} ${dirVerb} ${setup.triggerPrice} CONFIRMED\n▸ Trigger Level Hit @ ₹${setup.triggerPrice.toFixed(2)} with strong volume confirmation!\n\n💎 EXECUTE NOW:\n▸ ${isStockCash ? "Action: BUY" : "Buy"}: ${setup.contractSymbol}\n▸ Entry Zone: ${setup.entryZone}\n▸ Stop-Loss (SL): ₹${setup.stopLoss.toFixed(2)} (-${slPct}% Strict SL)\n\n🎯 PROFIT TARGETS:\n${isStockCash ? `▸ Target 1: ₹${setup.target1.toFixed(2)} (+${t1GainPct}% • Book 50% & Trail SL to Cost)\n▸ Target 2: ₹${setup.target2.toFixed(2)} (+${t2GainPct}%)\n${setup.target3 ? `▸ Target 3: ₹${setup.target3.toFixed(2)} (+${t3GainPct}%)\n` : ""}` : `▸ Target 1: ₹${setup.target1.toFixed(2)} (+${t1GainPct}% Gain • Trail SL to Cost)\n▸ Target 2: ₹${setup.target2.toFixed(2)} (+${t2GainPct}% Runner)\n${setup.target3 ? `▸ Target 3: ₹${setup.target3.toFixed(2)} (+${t3GainPct}% Super Runner)\n` : ""}${setup.lotSize ? `▸ Lot Size: ${setup.lotSize} Qty | Risk: ₹${setup.maxRiskPerLot?.toFixed(2)}\n` : ""}`}\n━━━━━━━━━━━━━━━━━━━━\n💡 TradeIO Algorithmic Systems • Trade with disciplined Risk Management`;
  }

  const setups = [
    { key: "stock", label: "1️⃣ Stock Intraday (Cash EQ)", data: reportData?.stockSetup, badgeClass: "bg-purple-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" },
    { key: "nifty", label: "2️⃣ NIFTY 50 Option", data: reportData?.niftySetup, badgeClass: "bg-blue-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" },
    { key: "sensex", label: "3️⃣ BSE SENSEX Option", data: reportData?.sensexSetup, badgeClass: "bg-amber-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" },
  ];

  return (
    <div className="space-y-6 pb-12 animate-[fade-up_0.3s_ease_both]">
      {/* ── 1. Page Header ── */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 text-[11px] font-bold tracking-wide uppercase rounded-full shadow-xs">
                <Flame className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> DAILY 3-TRADE ADVISORY
              </span>

              <span className="inline-flex items-center gap-1.5 text-slate-300 border border-slate-700 bg-slate-800/50 px-3 py-1 text-[11px] font-semibold rounded-full shadow-xs">
                <Clock className="h-3.5 w-3.5 text-slate-400" /> Auto-Generated: 09:28 AM IST
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Daily 3-Trade Advisory (1 Stock + NIFTY + SENSEX)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Automated high-probability intraday setups for <strong className="text-white">1 Stock Cash Intraday (NSE EQ)</strong>, <strong className="text-white">1 NIFTY 50 Option</strong>, and <strong className="text-white">1 BSE SENSEX Option</strong>. Features 2-stage execution plan: Pre-breakout watch preparation followed by verified trigger confirmation.
            </p>
          </div>

          {/* Top Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-10 px-4 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs font-semibold rounded-xl gap-2 shadow-xs cursor-pointer"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-emerald-400")} />
              Refresh Setups
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. The 3 Trade Advisory Cards (Grid of 3) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" /> Today's 3 Live Setups
            </h2>
            <p className="text-xs text-slate-500">
              Live market data analysis (1 Stock Cash + 1 NIFTY Option + 1 SENSEX Option)
            </p>
          </div>

          <span className="text-xs font-semibold px-2.5 py-1 text-slate-700 bg-white border border-slate-200 rounded-lg shadow-xs">
            Updated: {reportData?.timestamp || "Live"}
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 rounded-2xl border-slate-200 bg-white shadow-xs animate-pulse space-y-4">
                <div className="h-6 w-3/4 bg-slate-100 rounded-lg" />
                <div className="h-20 bg-slate-50 rounded-xl" />
                <div className="h-10 bg-slate-100 rounded-lg" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {setups.map((item) => {
              const setup = item.data;
              if (!setup) return null;
              const isBull = setup.direction === "BULLISH";
              const isCash = setup.category === "STOCK_CASH";

              return (
                <Card
                  key={item.key}
                  className="rounded-2xl border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
                >
                  {/* Card Header with Badges */}
                  <div>
                    <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-[11px] font-bold uppercase tracking-wide inline-flex items-center gap-1", item.badgeClass)}>
                          {item.label}
                        </span>

                        <span
                          className={cn(
                            "text-[11px] font-extrabold px-2.5 py-1 rounded-lg uppercase inline-flex items-center gap-1 shadow-xs",
                            isBull
                              ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-700 border border-rose-500/30"
                          )}
                        >
                          {isBull ? <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" /> : <ArrowDownRight className="h-3.5 w-3.5 stroke-[2.5]" />}
                          {setup.direction}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                          {setup.contractSymbol}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium line-clamp-1 pt-0.5">
                          {setup.setupRationale}
                        </p>
                      </div>
                    </div>

                    {/* Trade Key Metrics Box */}
                    <div className="p-4 sm:p-5 space-y-3.5 text-xs">
                      {/* Spot CMP & Trigger Price */}
                      <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            {isCash ? "Current Price" : "Spot LTP"}
                          </span>
                          <p className="text-sm font-bold text-slate-800">₹{setup.spotLtp.toFixed(2)}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Trigger Level</span>
                          <p className={cn("text-sm font-bold", isBull ? "text-emerald-600" : "text-rose-600")}>
                            ₹{setup.triggerPrice.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Execution Details */}
                      <div className="space-y-2 font-mono text-[11px] sm:text-xs">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <span className="text-slate-500 font-sans">Buy Price Zone:</span>
                          <strong className="text-slate-900 font-bold">{setup.entryZone}</strong>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <span className="text-slate-500 font-sans">Strict Stop-Loss (SL):</span>
                          <strong className="text-rose-600 font-bold">₹{setup.stopLoss.toFixed(2)}</strong>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <span className="text-slate-500 font-sans">Target 1 (Trail SL):</span>
                          <strong className="text-emerald-600 font-bold">₹{setup.target1.toFixed(2)}</strong>
                        </div>
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <span className="text-slate-500 font-sans">Target 2:</span>
                          <strong className="text-emerald-600 font-bold">₹{setup.target2.toFixed(2)}</strong>
                        </div>
                        {setup.target3 && (
                          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                            <span className="text-slate-500 font-sans">Target 3 (Runner):</span>
                            <strong className="text-emerald-600 font-bold">₹{setup.target3.toFixed(2)}</strong>
                          </div>
                        )}
                        {!isCash && setup.lotSize && (
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-slate-500 font-sans">Lot Size:</span>
                            <span className="text-slate-700">{setup.lotSize} Qty</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons: Copy Plan Helpers */}
                  <div className="p-4 sm:p-5 pt-0 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyAlertText(`${item.key}-watch`, getFormattedAlertText(setup, "watch"))}
                        className="h-8.5 text-[11px] font-bold text-slate-700 rounded-xl gap-1.5 border-slate-200 hover:bg-slate-50"
                      >
                        {copiedKey === `${item.key}-watch` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        Copy Watch
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleCopyAlertText(`${item.key}-trigger`, getFormattedAlertText(setup, "trigger"))}
                        className="h-8.5 text-[11px] font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl gap-1.5 shadow-xs"
                      >
                        {copiedKey === `${item.key}-trigger` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        )}
                        Copy Trigger
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Trade Execution Protocols & Plan Preview ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              Institutional Trade Execution Protocols
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Discipline guidelines and complete clipboard-formatted trade plans for today
            </CardDescription>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setPreviewTab("stock")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                previewTab === "stock"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              1️⃣ Stock Cash Plan
            </button>
            <button
              onClick={() => setPreviewTab("nifty")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                previewTab === "nifty"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              2️⃣ NIFTY Option Plan
            </button>
            <button
              onClick={() => setPreviewTab("sensex")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                previewTab === "sensex"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              3️⃣ SENSEX Option Plan
            </button>
            <button
              onClick={() => setPreviewTab("trailing")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                previewTab === "trailing"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              🎯 Trailing Rules
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-2">
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-1.5">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-600" /> Rule 1: Watch Before Trigger
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Add the specified strike or cash stock to your terminal watchlist 3–5 minutes before the trigger price is breached. Never place orders before the breakout candle closes.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-1.5">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Rule 2: Trail SL to Cost
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                When Target 1 (+28% on options, +0.85% on stock) is hit, book 50% quantities and trail your Stop-Loss immediately to your purchase price. The trade is now 100% risk-free.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-1.5">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-amber-600" /> Rule 3: 3:05 PM Mandatory Exit
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                Never hold intraday positions overnight. If targets or stop-loss are not reached by 3:05 PM IST, the terminal automatically squares off all positions at market price.
              </p>
            </div>
          </div>

          {/* Selected Plan Details Box */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-2 border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-sans font-bold">
                Formatted Setup Preview ({previewTab.toUpperCase()})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const targetSetup =
                    previewTab === "stock"
                      ? reportData?.stockSetup
                      : previewTab === "nifty"
                      ? reportData?.niftySetup
                      : reportData?.sensexSetup;
                  if (targetSetup) {
                    handleCopyAlertText(`preview-${previewTab}`, getFormattedAlertText(targetSetup, "trigger"));
                  } else {
                    toast.info("Setup data loading, please wait...");
                  }
                }}
                className="h-7 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg gap-1.5"
              >
                {copiedKey === `preview-${previewTab}` ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-slate-400" />
                )}
                Copy Full Plan
              </Button>
            </div>

            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto pt-1">
              {(() => {
                if (previewTab === "trailing") {
                  return `━━━━━━━━━━━━━━━━━━━━\n🎯 TRADEIO TARGET 1 HIT PROTOCOL\n🔥 Action Required: Trail Stop-Loss to Entry Cost\n━━━━━━━━━━━━━━━━━━━━\n▸ Target 1 Hit (+28% to +30% profit secured)\n▸ Action: Book 50% partial profit\n▸ Stop-Loss: Move to entry price (Break-even)\n▸ Risk Status: 100% Risk-Free Runner\n▸ Target 2: Hold remainder for 1:3+ Risk:Reward\n━━━━━━━━━━━━━━━━━━━━`;
                }
                const targetSetup =
                  previewTab === "stock"
                    ? reportData?.stockSetup
                    : previewTab === "nifty"
                    ? reportData?.niftySetup
                    : reportData?.sensexSetup;
                return getFormattedAlertText(targetSetup, "trigger") || "Loading setup metrics from live market...";
              })()}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

