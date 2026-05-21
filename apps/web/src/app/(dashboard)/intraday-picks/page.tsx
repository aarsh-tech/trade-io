"use client";

import { QuickTradePanel, type QuickTradeStock } from "@/components/dashboard/QuickTradePanel";
import { swingApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  ChevronDown, ChevronUp,
  Info,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  ShieldAlert,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ScanResult {
  rank: number; symbol: string; exchange: string;
  pattern: string; score: number; confidence: string;
  trendStrength: string; volumeSignal: string;
  currentPrice: number; pivotPrice: number; entryPrice: number;
  stopLoss: number; target1: number; target2: number; target3: number;
  riskReward: number; riskPct: number; contractions: number;
  suggestedQty: number; notes: string[];
  direction?: "LONG" | "SHORT";
}
interface ScanRun {
  id: string; scannedAt: string;
  totalScanned: number; results: ScanResult[];
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Infer direction: SHORT if entryPrice < currentPrice (breakdown setup) else LONG
function getDirection(r: ScanResult): "LONG" | "SHORT" {
  if (r.direction) return r.direction;
  // If target is BELOW entry → SHORT, else LONG
  return r.target1 > r.entryPrice ? "LONG" : "SHORT";
}

function PickCard({
  r, targetRs, onQuickTrade,
}: {
  r: ScanResult; targetRs: number;
  onQuickTrade: (stock: QuickTradeStock) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const direction = getDirection(r);
  const isLong = direction === "LONG";

  const profitPerShare = Math.abs(r.target1 - r.entryPrice);
  const qty = profitPerShare > 0 ? Math.ceil(targetRs / profitPerShare) : r.suggestedQty;
  const capital = qty * r.entryPrice;
  const stopLossAmount = qty * Math.abs(r.entryPrice - r.stopLoss);

  const handleShare = () => {
    const side = isLong ? "BUY (Long)" : "SELL (Short)";
    const text = `🚀 *Intraday Pick — ${side}*
Stock: *${r.symbol}* (${r.exchange})
Price: ₹${fmt(r.currentPrice)}

Entry: ₹${fmt(r.entryPrice)}
Stop Loss: ₹${fmt(r.stopLoss)} (${r.riskPct.toFixed(1)}% Risk)
Target 1: ₹${fmt(r.target1)}
Target 2: ₹${fmt(r.target2)}

Qty: ${qty} | Capital: ₹${Math.round(capital).toLocaleString("en-IN")}
_Powered by TradeIO Intelligence_`;
    navigator.clipboard.writeText(text);
    toast.success("Setup copied!");
  };

  const directionBg = isLong
    ? "bg-emerald-50 border-emerald-100 text-emerald-700"
    : "bg-red-50 border-red-100 text-red-700";

  return (
    <div className={cn(
      "relative group bg-white rounded-2xl border transition-all duration-300 hover:shadow-xl overflow-hidden",
      r.confidence === "HIGH" ? "border-emerald-200 shadow-sm" : "border-slate-100"
    )}>
      <div className={cn(
        "h-1.5 w-full",
        r.score >= 85 ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
          : r.score >= 75 ? "bg-gradient-to-r from-emerald-400 to-teal-400" : "bg-slate-200"
      )} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-slate-900">{r.symbol}</h3>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{r.exchange}</span>
              {/* Direction badge */}
              <span className={cn("flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border", directionBg)}>
                {isLong ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {isLong ? "LONG" : "SHORT"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">₹{fmt(r.currentPrice)}</span>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                r.confidence === "HIGH" ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                  : r.confidence === "MEDIUM" ? "text-amber-700 bg-amber-50 border-amber-100"
                    : "text-slate-500 bg-slate-50 border-slate-100"
              )}>
                <Star className="h-2.5 w-2.5 inline mr-0.5" />{r.confidence}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 mb-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Score</span>
              <button onClick={handleShare} className="p-1 rounded bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100" title="Copy">
                <Share2 className="h-3 w-3" />
              </button>
            </div>
            <div className={cn("text-3xl font-black italic",
              r.score >= 85 ? "text-indigo-600" : r.score >= 75 ? "text-emerald-500" : "text-slate-400"
            )}>{r.score}</div>
          </div>
        </div>

        {/* Levels */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cn("p-3 rounded-2xl border", isLong ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100")}>
            <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1", isLong ? "text-emerald-500" : "text-red-500")}>
              <Target className="h-3 w-3" />
              {isLong ? "Buy Above" : "Sell Below"}
            </div>
            <div className={cn("text-lg font-extrabold", isLong ? "text-emerald-700" : "text-red-700")}>₹{fmt(r.entryPrice)}</div>
          </div>
          <div className="p-3 bg-rose-50/50 rounded-2xl border border-rose-100">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">
              <ShieldAlert className="h-3 w-3" /> Stop Loss
            </div>
            <div className="text-lg font-extrabold text-rose-700">₹{fmt(r.stopLoss)}</div>
            <div className="text-[10px] text-rose-400">{r.riskPct.toFixed(1)}% Risk</div>
          </div>
        </div>

        {/* Targets */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { label: "T1 (3%)", price: r.target1, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
            { label: "T2 (5%)", price: r.target2, color: "text-teal-600 bg-teal-50 border-teal-100" },
            { label: "T3 (10%)", price: r.target3, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
          ].map((t) => (
            <div key={t.label} className={cn("flex-shrink-0 px-3 py-2 rounded-xl border flex flex-col items-center min-w-[90px]", t.color)}>
              <span className="text-[9px] font-bold uppercase">{t.label}</span>
              <span className="text-sm font-black">₹{fmt(t.price)}</span>
            </div>
          ))}
        </div>

        {/* Trade Summary */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Daily Goal Plan</span>
            </div>
            <span className="text-[10px] font-bold bg-indigo-500 px-2 py-0.5 rounded-full">₹{targetRs}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Qty</div>
              <div className="text-sm font-black">{qty}</div>
            </div>
            <div className="border-x border-slate-800">
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Capital</div>
              <div className="text-sm font-black">₹{Math.round(capital).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Risk</div>
              <div className="text-sm font-black text-rose-400">₹{Math.round(stopLossAmount).toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>

        {/* ⚡ ONE-CLICK TRADE BUTTON */}
        <button
          onClick={() => onQuickTrade({
            symbol: r.symbol,
            exchange: r.exchange,
            direction,
            entryPrice: r.entryPrice,
            stopLoss: r.stopLoss,
            target1: r.target1,
            target2: r.target2,
            currentPrice: r.currentPrice,
            suggestedQty: qty,
            product: "MIS",
          })}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg",
            isLong
              ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-100"
              : "bg-red-500 hover:bg-red-600 text-white shadow-red-100"
          )}
        >
          {isLong ? `⚡ Buy ${r.symbol} (MIS)` : `⚡ Short ${r.symbol} (MIS)`}
        </button>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-indigo-500 transition-colors uppercase tracking-widest"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? "Hide Details" : "View Analysis"}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1.5 border-t border-slate-50 pt-3 animate-in fade-in">
            {r.notes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                {note}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function IntradayPicksPage() {
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [targetRs, setTargetRs] = useState(500);
  const [dirFilter, setDirFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [tradeStock, setTradeStock] = useState<QuickTradeStock | null>(null);

  const loadLast = useCallback(async () => {
    try {
      const res = await swingApi.last({ pattern: "INTRADAY_MOMENTUM", pageSize: 100 });
      if (res.data?.data) setScan(res.data.data);
    } catch { /* ignore */ }
    finally { setInitialLoad(false); }
  }, []);

  useEffect(() => { loadLast(); }, [loadLast]);

  const handleScan = async () => {
    setLoading(true);
    toast.info("Analyzing market for breakout & breakdown candidates...");
    try {
      await swingApi.run();
      toast.success("✅ Scan initiated! Refreshing...");
      setTimeout(async () => {
        const res = await swingApi.last({ pattern: "INTRADAY_MOMENTUM", pageSize: 100 });
        if (res.data?.data) setScan(res.data.data);
        setLoading(false);
      }, 3000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Scan failed. Connect Zerodha first.");
      setLoading(false);
    }
  };

  const allResults = scan?.results ?? [];
  const longCount = allResults.filter(r => getDirection(r) === "LONG").length;
  const shortCount = allResults.filter(r => getDirection(r) === "SHORT").length;

  // Client-side: direction filter → symbol/pattern search
  const afterDir = dirFilter === "ALL" ? allResults
    : allResults.filter(r => getDirection(r) === dirFilter);
  const filtered = searchQuery.trim()
    ? afterDir.filter(r =>
        r.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.pattern.toLowerCase().replace(/_/g, " ").includes(searchQuery.toLowerCase())
      )
    : afterDir;

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12 animate-in fade-in duration-700">

      {/* QuickTrade Modal */}
      <QuickTradePanel stock={tradeStock} onClose={() => setTradeStock(null)} targetRs={targetRs} />

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 px-8 py-12 text-white shadow-2xl">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-widest">
              <Zap className="h-3 w-3 fill-current" /> Pro Market Scanner
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
              Intraday <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Momentum</span> Picks
            </h1>
            <p className="text-slate-400 text-lg font-medium">
              Long & Short setups. One click to place Entry + Stop-Loss + Target automatically.
            </p>
            {/* Direction filter + Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                {(["ALL", "LONG", "SHORT"] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDirFilter(d)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all",
                      dirFilter === d
                        ? d === "LONG" ? "bg-emerald-500 border-emerald-500 text-white"
                          : d === "SHORT" ? "bg-red-500 border-red-500 text-white"
                            : "bg-white border-white text-slate-900"
                        : "border-white/20 text-white/60 hover:border-white/40"
                    )}
                  >
                    {d === "LONG" ? <><TrendingUp className="h-3 w-3" /> Long ({longCount})</>
                      : d === "SHORT" ? <><TrendingDown className="h-3 w-3" /> Short ({shortCount})</>
                        : `All (${allResults.length})`}
                  </button>
                ))}
              </div>
              {/* Symbol / Pattern search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50 font-semibold w-44"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl w-full md:w-64">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Daily Goal</span>
                <Target className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-lg font-bold">₹</span>
                <input
                  type="number"
                  value={targetRs}
                  onChange={(e) => setTargetRs(Number(e.target.value))}
                  className="bg-transparent text-3xl font-black text-white focus:outline-none w-full"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Target Profit Per Trade</p>
            </div>
            <button
              onClick={handleScan}
              disabled={loading}
              className={cn(
                "w-full group relative flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all",
                loading ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-white text-slate-900 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.15)]"
              )}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5 transition-transform group-hover:rotate-180 duration-500" />}
              {loading ? "Analyzing..." : "Analyze Market"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {scan && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Scanned", value: scan.totalScanned, icon: BarChart2, color: "text-blue-500", bg: "bg-blue-50" },
            { label: "Total Setups", value: allResults.length, icon: Zap, color: "text-indigo-500", bg: "bg-indigo-50" },
            { label: "Long Setups", value: longCount, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50" },
            { label: "Short Setups", value: shortCount, icon: TrendingDown, color: "text-red-500", bg: "bg-red-50" },
          ].map((s) => (
            <div key={s.label} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl", s.bg, s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{s.label}</div>
                <div className="text-2xl font-black text-slate-900">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {initialLoad ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Loading Intelligence...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-dashed border-slate-200 py-24 text-center">
          <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-6">
            <Zap className="h-10 w-10 text-slate-200" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-2">No Active Picks Found</h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-8">Run a fresh scan to find today's momentum setups.</p>
          <button onClick={handleScan} disabled={loading}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Start New Scan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((pick) => (
            <PickCard
              key={`${pick.symbol}-${pick.pattern}`}
              r={pick}
              targetRs={targetRs}
              onQuickTrade={setTradeStock}
            />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 text-slate-500 text-xs leading-relaxed max-w-4xl mx-auto text-center space-y-3">
        <p className="font-bold text-slate-700 uppercase tracking-widest flex items-center justify-center gap-2">
          <Info className="h-4 w-4" /> How One-Click Trading Works
        </p>
        <p>
          Pressing <strong>⚡ Buy/Short</strong> places <strong>3 orders simultaneously</strong>:
          (1) <strong>Entry</strong> — SL-Market trigger at breakout/breakdown price.
          (2) <strong>Stop-Loss</strong> — SL-Market on the opposite side to exit if wrong.
          (3) <strong>Target 1</strong> — Limit order to book profit automatically.
          All orders are <strong>MIS (Intraday)</strong> and auto-square at 3:20 PM.
        </p>
        <p className="text-rose-500 font-bold uppercase tracking-widest pt-1">
          ⚠ Trading involves significant risk. Always verify levels before placing orders.
        </p>
      </div>
    </div>
  );
}
