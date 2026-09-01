"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { whatsappApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WhatsAppAlertsModal } from "@/components/dashboard/WhatsAppAlertsModal";
import {
  Flame,
  Send,
  Zap,
  RefreshCw,
  Copy,
  Check,
  Smartphone,
  CheckCircle2,
  Clock,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Settings2,
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
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  // 1. Fetch Status
  const { data: statusData } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: async () => {
      const res = await whatsappApi.getStatus();
      return res.data?.data;
    },
    refetchInterval: 15000,
  });

  // 2. Fetch Live Advisory Setups
  const { data: reportData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["advisory-report"],
    queryFn: async () => {
      const res = await whatsappApi.getAdvisoryReport();
      return res.data?.data as AdvisoryReport;
    },
    refetchInterval: 30000,
  });

  const isConnected = statusData?.isConnected ?? false;

  // 3. Trigger Morning 3-Watchlist Broadcast
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await whatsappApi.triggerAdvisoryNow();
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data.message || "3-Trade Morning Watchlist setups dispatched to WhatsApp!");
      } else {
        toast.error(data?.message || "Broadcast Notice: Check WhatsApp connection & recipients");
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to broadcast advisory");
    },
  });

  // 4. Send Sample Test Advisory
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await whatsappApi.testAdvisory();
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data.message || "Sample Pre-Entry Watch & Trigger Advisory alerts sent to your WhatsApp!");
      } else {
        toast.error(data?.message || "Failed to send test alerts");
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to send test advisory");
    },
  });

  // 5. Send Specific Single Setup Alert (Watch or Trigger)
  const sendSingleMutation = useMutation({
    mutationFn: async ({ message, key }: { message: string; key: string }) => {
      setSendingKey(key);
      const res = await whatsappApi.sendMessage({ message });
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data.message || "Trade alert dispatched to WhatsApp!");
      } else {
        toast.error(data?.message || "Failed to send alert");
      }
      setSendingKey(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to send alert");
      setSendingKey(null);
    },
  });

  function handleCopyAlertText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Formatted alert message copied to clipboard!");
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
      return `━━━━━━━━━━━━━━━━━━━━\n👀 *TRADEIO PRE-ENTRY SETUP WATCH*\n🎯 *${setup.assetName}*\n━━━━━━━━━━━━━━━━━━━━\n\n${dirEmoji} *${setup.symbol} ${dirVerb} ${setup.triggerPrice}*\n▸ Current Price: *₹${setup.spotLtp.toFixed(2)}*\n▸ Setup: *${setup.setupRationale}*\n\n💎 *ADD TO WATCHLIST NOW:*\n▸ ${isStockCash ? "Script" : "Contract"}: *${setup.contractSymbol}*\n${!isStockCash ? `▸ Approx CMP: *₹${setup.cmp.toFixed(2)}*\n` : ""}▸ ⚡ *TRIGGER:* ${setup.triggerCondition}\n\n🎯 *INTRADAY TRADE PLAN:*\n▸ Planned Entry: *${setup.entryZone}*\n▸ Stop-Loss (SL): *₹${setup.stopLoss.toFixed(2)}* (Strict -${slPct}% SL)\n▸ Targets: *₹${setup.target1.toFixed(2)} / ₹${setup.target2.toFixed(2)}${setup.target3 ? ` / ₹${setup.target3.toFixed(2)}` : "" }*\n${setup.lotSize && setup.maxRiskPerLot ? `▸ Lot Size: *${setup.lotSize} Qty* | Max Risk: *₹${setup.maxRiskPerLot.toFixed(2)}*\n` : ""}\n⚠️ _Keep on watchlist. Execute strictly upon confirmed trigger level crossing!_\n━━━━━━━━━━━━━━━━━━━━\n⚡ _TradeIO Institutional Pre-Market Intelligence_`;
    }

    return `━━━━━━━━━━━━━━━━━━━━\n🚀 *TRADEIO OFFICIAL TRADE TRIGGER*\n🎯 *${setup.assetName}*\n━━━━━━━━━━━━━━━━━━━━\n\n${dirEmoji} *${setup.symbol} ${dirVerb} ${setup.triggerPrice} CONFIRMED*\n▸ Trigger Level Hit @ *₹${setup.triggerPrice.toFixed(2)}* with strong volume confirmation!\n\n💎 *EXECUTE NOW:*\n▸ ${isStockCash ? "Action: BUY" : "Buy"}: *${setup.contractSymbol}*\n▸ Entry Zone: *${setup.entryZone}*\n▸ Stop-Loss (SL): *₹${setup.stopLoss.toFixed(2)}* (-${slPct}% Strict SL)\n\n🎯 *PROFIT TARGETS:*\n${isStockCash ? `▸ Target 1: *₹${setup.target1.toFixed(2)}* (+${t1GainPct}% • Book 50% & Trail SL to Cost)\n▸ Target 2: *₹${setup.target2.toFixed(2)}* (+${t2GainPct}%)\n${setup.target3 ? `▸ Target 3: *₹${setup.target3.toFixed(2)}* (+${t3GainPct}%)\n` : ""}` : `▸ Target 1: *₹${setup.target1.toFixed(2)}* (+${t1GainPct}% Gain • Trail SL to Cost)\n▸ Target 2: *₹${setup.target2.toFixed(2)}* (+${t2GainPct}% Runner)\n${setup.target3 ? `▸ Target 3: *₹${setup.target3.toFixed(2)}* (+${t3GainPct}% Super Runner)\n` : ""}${setup.lotSize ? `▸ Lot Size: *${setup.lotSize} Qty* | Risk: *₹${setup.maxRiskPerLot?.toFixed(2)}*\n` : ""}`}\n━━━━━━━━━━━━━━━━━━━━\n💡 _TradeIO Algorithmic Systems • Trade with disciplined Risk Management_`;
  }

  const setups = [
    { key: "stock", label: "1️⃣ Stock Intraday (Cash EQ)", data: reportData?.stockSetup, badgeClass: "bg-purple-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" },
    { key: "nifty", label: "2️⃣ NIFTY 50 Option", data: reportData?.niftySetup, badgeClass: "bg-blue-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" },
    { key: "sensex", label: "3️⃣ BSE SENSEX Option", data: reportData?.sensexSetup, badgeClass: "bg-amber-600 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs" },
  ];

  return (
    <div className="space-y-6 pb-12 animate-[fade-up_0.3s_ease_both]">
      {/* ── 1. Page Header & Live Status Banner ── */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 text-[11px] font-bold tracking-wide uppercase rounded-full shadow-xs">
                <Flame className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> DAILY 3-TRADE ADVISORY
              </span>

              <button
                onClick={() => setShowWhatsAppModal(true)}
                title="Click to manage WhatsApp Connection & Recipients"
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 uppercase rounded-full shadow-xs cursor-pointer hover:scale-105 transition-transform",
                  isConnected
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 animate-pulse"
                )}
              >
                <Smartphone className="h-3.5 w-3.5" />
                {isConnected ? "WhatsApp Active (Manage)" : "WhatsApp Disconnected (Connect QR)"}
              </button>

              <span className="inline-flex items-center gap-1.5 text-slate-300 border border-slate-700 bg-slate-800/50 px-3 py-1 text-[11px] font-semibold rounded-full shadow-xs">
                <Clock className="h-3.5 w-3.5 text-slate-400" /> Auto-Schedule: 09:28 AM IST
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Daily 3-Trade Advisory (1 Stock + NIFTY + SENSEX)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Automated high-probability intraday setups for <strong className="text-white">1 Stock Cash Intraday (NSE EQ)</strong>, <strong className="text-white">1 NIFTY 50 Option</strong>, and <strong className="text-white">1 BSE SENSEX Option</strong>. Features advance watchlist alert (3–5 mins before breakout) followed by confirmed execution trigger.
            </p>
          </div>

          {/* Top Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWhatsAppModal(true)}
              className="h-10 px-4 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-700/60 text-xs font-bold rounded-xl gap-2 shadow-xs"
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
              WhatsApp Setup & Recipients
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-10 px-3.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs font-semibold rounded-xl gap-2 shadow-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-emerald-400")} />
              Refresh Setups
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={!isConnected || testMutation.isPending}
              className="h-10 px-4 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 text-xs font-semibold rounded-xl gap-2 shadow-xs"
            >
              {testMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-blue-400" />}
              Send Sample Alerts
            </Button>

            <Button
              size="sm"
              onClick={() => broadcastMutation.mutate()}
              disabled={!isConnected || broadcastMutation.isPending}
              className="h-10 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950/40 gap-2 border border-emerald-400/20"
            >
              {broadcastMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 fill-white" />
              )}
              Broadcast Live 3 Setups
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

                  {/* Card Action Buttons: Individual Direct WhatsApp Dispatch */}
                  <div className="p-4 sm:p-5 pt-0 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        disabled={!isConnected || sendingKey === `${item.key}-watch`}
                        onClick={() =>
                          sendSingleMutation.mutate({
                            message: getFormattedAlertText(setup, "watch"),
                            key: `${item.key}-watch`,
                          })
                        }
                        className="h-8.5 text-[11px] font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl gap-1.5 shadow-xs"
                      >
                        {sendingKey === `${item.key}-watch` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                        )}
                        Send Watch Setup
                      </Button>

                      <Button
                        size="sm"
                        disabled={!isConnected || sendingKey === `${item.key}-trigger`}
                        onClick={() =>
                          sendSingleMutation.mutate({
                            message: getFormattedAlertText(setup, "trigger"),
                            key: `${item.key}-trigger`,
                          })
                        }
                        className="h-8.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-xs"
                      >
                        {sendingKey === `${item.key}-trigger` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 fill-white" />
                        )}
                        Broadcast Trigger
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyAlertText(item.key, getFormattedAlertText(setup, "trigger"))}
                      className="w-full h-8 text-[11px] font-medium text-slate-600 rounded-xl gap-1.5 border-slate-200 hover:bg-slate-50"
                    >
                      {copiedKey === item.key ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      Copy Trigger Message
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Interactive Mobile WhatsApp Preview Simulation ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              Interactive WhatsApp Advisory Alert Simulation
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              See how your subscribers and WhatsApp groups receive the 2-stage pre-entry and trigger alerts
            </CardDescription>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setPreviewTab("stock")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                previewTab === "stock"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              1️⃣ Stock Cash Preview
            </button>
            <button
              onClick={() => setPreviewTab("nifty")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                previewTab === "nifty"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              2️⃣ NIFTY Option Preview
            </button>
            <button
              onClick={() => setPreviewTab("sensex")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                previewTab === "sensex"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              3️⃣ SENSEX Option Preview
            </button>
            <button
              onClick={() => setPreviewTab("trailing")}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                previewTab === "trailing"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              🎯 Target 1 Trailing (+29%)
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-8 bg-[#0b141a] flex justify-center">
          {/* Option A: Stock Cash Intraday */}
          {previewTab === "stock" && (() => {
            const stock = reportData?.stockSetup || {
              symbol: "TATAMOTORS",
              spotLtp: 985.4,
              triggerPrice: 992.0,
              stopLoss: 985.0,
              target1: 1008.0,
              target2: 1025.0,
              target3: 1050.0,
              contractSymbol: "TATAMOTORS (NSE Cash EQ)",
              direction: "BULLISH",
              setupRationale: "15-min Range Compression near Day High (+1.25%)",
              entryZone: "₹990.00 – ₹992.00",
            };
            const isBull = stock.direction === "BULLISH";
            const dirEmoji = isBull ? "🟢" : "🔴";
            const dirVerb = isBull ? "Bullish above" : "Bearish below";

            return (
              <div className="max-w-md w-full space-y-3 font-sans text-xs sm:text-[13px] leading-relaxed">
                {/* Stage 1 Bubble */}
                <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl border border-[#025144] space-y-2">
                  <div className="border-b border-[#025144] pb-2 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                    ━━━━━━━━━━━━━━━━━━━━{"\n"}
                    👀 <strong className="text-white">TRADEIO PRE-ENTRY SETUP WATCH</strong>{"\n"}
                    🎯 <strong>1️⃣ STOCK INTRADAY (NSE CASH)</strong>{"\n"}
                    ━━━━━━━━━━━━━━━━━━━━
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-300">{dirEmoji} {stock.symbol} {dirVerb} {stock.triggerPrice.toFixed(2)}</p>
                    <p className="text-slate-300">▸ Current Price: <strong>₹{stock.spotLtp.toFixed(2)}</strong></p>
                    <p className="text-slate-300">▸ Setup: {stock.setupRationale}</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 space-y-1">
                    <p className="font-bold text-yellow-300">💎 ADD TO WATCHLIST NOW:</p>
                    <p>▸ Script: <strong className="text-white">{stock.contractSymbol}</strong></p>
                    <p className="text-emerald-200">▸ ⚡ <strong>TRIGGER:</strong> Buy when price crosses above ₹{stock.triggerPrice.toFixed(2)}</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 text-[11px] text-slate-300 space-y-0.5">
                    <p>▸ Planned Entry: <strong>{stock.entryZone}</strong></p>
                    <p>▸ Stop-Loss (SL): <strong>₹{stock.stopLoss.toFixed(2)}</strong> (Strict Intraday SL)</p>
                    <p>▸ Targets: <strong>₹{stock.target1.toFixed(2)} / ₹{stock.target2.toFixed(2)} / ₹{stock.target3?.toFixed(2)}</strong></p>
                    <p className="text-yellow-200/90 pt-1">⚠️ <em>Keep on watchlist. Buy only on confirmed breakout above {stock.triggerPrice.toFixed(0)}!</em></p>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                    <span>09:22 AM</span>
                    <span className="text-[#53bdeb]">✓✓</span>
                  </div>
                </div>

                {/* Stage 2 Bubble */}
                <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl border border-[#025144] space-y-2">
                  <div className="border-b border-[#025144] pb-2 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                    ━━━━━━━━━━━━━━━━━━━━{"\n"}
                    🚀 <strong className="text-white">TRADEIO OFFICIAL TRADE TRIGGER</strong>{"\n"}
                    🎯 <strong>1️⃣ STOCK INTRADAY (NSE CASH)</strong>{"\n"}
                    ━━━━━━━━━━━━━━━━━━━━
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-300">{dirEmoji} {stock.symbol} {dirVerb} {stock.triggerPrice.toFixed(2)} CONFIRMED</p>
                    <p className="text-slate-300">▸ Level Hit @ <strong>₹{stock.triggerPrice.toFixed(2)}</strong> with strong volume confirmation!</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 space-y-1">
                    <p className="font-bold text-emerald-300">💎 EXECUTE NOW:</p>
                    <p>▸ Action: BUY <strong className="text-white">{stock.contractSymbol}</strong></p>
                    <p>▸ Entry Zone: <strong>{stock.entryZone}</strong></p>
                    <p>▸ Stop-Loss (SL): <strong>₹{stock.stopLoss.toFixed(2)}</strong></p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 text-[11px] text-slate-300 space-y-0.5">
                    <p>▸ Target 1: <strong className="text-emerald-400">₹{stock.target1.toFixed(2)}</strong> (Book 50% & Trail SL to Cost)</p>
                    <p>▸ Target 2: <strong className="text-emerald-400">₹{stock.target2.toFixed(2)}</strong></p>
                    <p>▸ Target 3: <strong className="text-emerald-400">₹{stock.target3?.toFixed(2)}</strong></p>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                    <span>09:31 AM</span>
                    <span className="text-[#53bdeb]">✓✓</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Option B: NIFTY 50 Option */}
          {previewTab === "nifty" && (() => {
            const nifty = reportData?.niftySetup || {
              contractSymbol: "NIFTY 24100 PE",
              spotLtp: 24125.0,
              triggerPrice: 24100.0,
              cmp: 90.0,
              stopLoss: 74.0,
              target1: 116.0,
              target2: 145.0,
              target3: 180.0,
              lotSize: 65,
              maxRiskPerLot: 1040,
              direction: "BEARISH",
              setupRationale: "Breakdown below 15-min Opening Range & VWAP",
              entryZone: "₹90.00 – ₹94.00",
            };
            const isBull = nifty.direction === "BULLISH";
            const dirEmoji = isBull ? "🟢" : "🔴";
            const dirVerb = isBull ? "Bullish above" : "Bearish below";

            return (
              <div className="max-w-md w-full space-y-3 font-sans text-xs sm:text-[13px] leading-relaxed">
                {/* Stage 1 Bubble */}
                <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl border border-[#025144] space-y-2">
                  <div className="border-b border-[#025144] pb-2 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                    ━━━━━━━━━━━━━━━━━━━━{"\n"}
                    👀 <strong className="text-white">TRADEIO PRE-ENTRY SETUP WATCH</strong>{"\n"}
                    🎯 <strong>2️⃣ NIFTY 50 INDEX OPTION</strong>{"\n"}
                    ━━━━━━━━━━━━━━━━━━━━
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-rose-300">{dirEmoji} NIFTY {dirVerb} {nifty.triggerPrice.toFixed(0)}</p>
                    <p className="text-slate-300">▸ Current Spot: <strong>₹{nifty.spotLtp.toFixed(2)}</strong></p>
                    <p className="text-slate-300">▸ Setup: {nifty.setupRationale}</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 space-y-1">
                    <p className="font-bold text-yellow-300">💎 ADD TO WATCHLIST NOW:</p>
                    <p>▸ Contract: <strong className="text-white">{nifty.contractSymbol}</strong></p>
                    <p>▸ Approx CMP: <strong>₹{nifty.cmp.toFixed(2)}</strong></p>
                    <p className="text-emerald-200">▸ ⚡ <strong>TRIGGER:</strong> Buy when Spot breaks below ₹{nifty.triggerPrice.toFixed(0)}</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 text-[11px] text-slate-300 space-y-0.5">
                    <p>▸ Stop-Loss (SL): <strong>₹{nifty.stopLoss.toFixed(2)}</strong> (Strict 18% SL)</p>
                    <p>▸ Targets: <strong>₹{nifty.target1.toFixed(2)} (+29%) / ₹{nifty.target2.toFixed(2)} (+61%) / ₹{nifty.target3?.toFixed(2)} (2X)</strong></p>
                    <p>▸ Lot Size: <strong>{nifty.lotSize} Qty</strong> | Max Risk: <strong>₹{nifty.maxRiskPerLot?.toFixed(0)}</strong></p>
                    <p className="text-yellow-200/90 pt-1">⚠️ <em>Keep strike on watchlist. Wait for official trigger confirmation before entering!</em></p>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                    <span>09:28 AM</span>
                    <span className="text-[#53bdeb]">✓✓</span>
                  </div>
                </div>

                {/* Stage 2 Bubble */}
                <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl border border-[#025144] space-y-2">
                  <div className="border-b border-[#025144] pb-2 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                    ━━━━━━━━━━━━━━━━━━━━{"\n"}
                    🚀 <strong className="text-white">TRADEIO OFFICIAL TRADE TRIGGER</strong>{"\n"}
                    🎯 <strong>2️⃣ NIFTY 50 INDEX OPTION</strong>{"\n"}
                    ━━━━━━━━━━━━━━━━━━━━
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-rose-300">{dirEmoji} NIFTY {dirVerb} {nifty.triggerPrice.toFixed(0)} CONFIRMED</p>
                    <p className="text-slate-300">▸ Spot Level Hit @ <strong>₹{nifty.triggerPrice.toFixed(2)}</strong> with strong volume confirmation!</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 space-y-1">
                    <p className="font-bold text-emerald-300">💎 EXECUTE NOW:</p>
                    <p>▸ Buy: <strong className="text-white">{nifty.contractSymbol}</strong></p>
                    <p>▸ Entry Zone: <strong>{nifty.entryZone}</strong></p>
                    <p>▸ Stop-Loss (SL): <strong>₹{nifty.stopLoss.toFixed(2)}</strong> (Strict 18% SL)</p>
                  </div>
                  <div className="border-t border-[#025144] pt-2 text-[11px] text-slate-300 space-y-0.5">
                    <p>▸ Target 1: <strong className="text-emerald-400">₹{nifty.target1.toFixed(2)}</strong> (+29% Gain • Trail SL to Cost)</p>
                    <p>▸ Target 2: <strong className="text-emerald-400">₹{nifty.target2.toFixed(2)}</strong> (+61% Runner)</p>
                    <p>▸ Target 3: <strong className="text-emerald-400">₹{nifty.target3?.toFixed(2)}</strong> (+100% Doubler)</p>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                    <span>09:33 AM</span>
                    <span className="text-[#53bdeb]">✓✓</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Option C: BSE SENSEX Option */}
          {previewTab === "sensex" && (() => {
            const sensex = reportData?.sensexSetup || {
              contractSymbol: "SENSEX 80500 CE",
              spotLtp: 80450.0,
              triggerPrice: 80500.0,
              cmp: 140.0,
              stopLoss: 115.0,
              target1: 180.0,
              target2: 220.0,
              target3: 280.0,
              lotSize: 20,
              maxRiskPerLot: 500,
              direction: "BULLISH",
              setupRationale: "15-min Range Compression near Day High",
              entryZone: "₹140.00 – ₹146.00",
            };
            const isBull = sensex.direction === "BULLISH";
            const dirEmoji = isBull ? "🟢" : "🔴";
            const dirVerb = isBull ? "Bullish breakout above" : "Bearish breakdown below";

            return (
              <div className="max-w-md w-full bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl border border-[#025144] space-y-2 text-xs sm:text-[13px] leading-relaxed">
                <div className="border-b border-[#025144] pb-2 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                  ━━━━━━━━━━━━━━━━━━━━{"\n"}
                  🚀 <strong className="text-white">TRADEIO OFFICIAL TRADE TRIGGER</strong>{"\n"}
                  🎯 <strong>3️⃣ BSE SENSEX INDEX OPTION</strong>{"\n"}
                  ━━━━━━━━━━━━━━━━━━━━
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-emerald-300">{dirEmoji} SENSEX {dirVerb} {sensex.triggerPrice.toFixed(0)} CONFIRMED</p>
                  <p className="text-slate-300">▸ Spot Level Hit @ <strong>₹{sensex.triggerPrice.toFixed(2)}</strong> with strong buying expansion!</p>
                </div>
                <div className="border-t border-[#025144] pt-2 space-y-1">
                  <p className="font-bold text-yellow-300">💎 EXECUTE NOW:</p>
                  <p>▸ Buy: <strong className="text-white">{sensex.contractSymbol}</strong> (BFO)</p>
                  <p>▸ Entry Zone: <strong>{sensex.entryZone}</strong></p>
                  <p>▸ Stop-Loss (SL): <strong>₹{sensex.stopLoss.toFixed(2)}</strong> (Lot Size: {sensex.lotSize})</p>
                </div>
                <div className="border-t border-[#025144] pt-2 text-[11px] text-slate-300 space-y-0.5">
                  <p>▸ Target 1: <strong className="text-emerald-400">₹{sensex.target1.toFixed(2)}</strong> (+29% Gain • Trail SL to Cost)</p>
                  <p>▸ Target 2: <strong className="text-emerald-400">₹{sensex.target2.toFixed(2)}</strong> (+57% Runner)</p>
                  <p>▸ Target 3: <strong className="text-emerald-400">₹{sensex.target3?.toFixed(2)}</strong> (+100% Doubler)</p>
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                  <span>09:45 AM</span>
                  <span className="text-[#53bdeb]">✓✓</span>
                </div>
              </div>
            );
          })()}

          {/* Option D: Trailing Follow-up */}
          {previewTab === "trailing" && (() => {
            const nifty = reportData?.niftySetup || {
              contractSymbol: "NIFTY 24100 PE",
              entryZone: "₹90.00 – ₹94.00",
              target1: 116.0,
              target2: 145.0,
              cmp: 90.0,
            };

            return (
              <div className="max-w-md w-full bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-xs p-3.5 sm:p-4 shadow-xl border border-[#025144] space-y-2 text-xs sm:text-[13px] leading-relaxed">
                <div className="border-b border-[#025144] pb-2 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">
                  ━━━━━━━━━━━━━━━━━━━━{"\n"}
                  🎯 <strong className="text-white">TRADEIO TARGET 1 HIT! (+29% GAIN)</strong>{"\n"}
                  🔥 <strong>{nifty.contractSymbol} reached ₹{nifty.target1.toFixed(2)}</strong>{"\n"}
                  ━━━━━━━━━━━━━━━━━━━━
                </div>
                <div className="space-y-1">
                  <p className="text-slate-300">▸ Initial Entry: <strong>{nifty.entryZone}</strong></p>
                  <p className="text-emerald-300 font-bold">▸ 🛡️ ACTION REQUIRED: Trail Stop-Loss to COST (₹{nifty.cmp.toFixed(2)})</p>
                  <p className="text-yellow-200 font-bold">▸ 🔒 TRADE IS NOW 100% RISK-FREE!</p>
                  <p className="text-slate-300">▸ Next Target: <strong>₹{nifty.target2.toFixed(2)} (+61% Runner)</strong></p>
                </div>
                <div className="border-t border-[#025144] pt-2 text-[10px] text-emerald-200/80">
                  🏁 TradeIO Algo Advisory Alerts
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/60 pt-1">
                  <span>09:48 AM</span>
                  <span className="text-[#53bdeb]">✓✓</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── WhatsApp Modal for Quick Setup & Recipient Management ── */}
      <WhatsAppAlertsModal
        open={showWhatsAppModal}
        onOpenChange={setShowWhatsAppModal}
      />
    </div>
  );
}
