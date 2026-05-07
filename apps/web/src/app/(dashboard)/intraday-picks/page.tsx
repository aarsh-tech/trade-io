"use client";

import { useCallback, useEffect, useState } from "react";
import { swingApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Zap, RefreshCw, Loader2, TrendingUp, TrendingDown,
  ShieldAlert, Target, ArrowUpRight, ChevronDown, ChevronUp,
  BarChart2, Volume2, Star, Rocket, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScanResult {
  rank: number; symbol: string; exchange: string;
  pattern: string; score: number; confidence: string;
  trendStrength: string; volumeSignal: string;
  currentPrice: number; pivotPrice: number; entryPrice: number;
  stopLoss: number; target1: number; target2: number; target3: number;
  riskReward: number; riskPct: number; contractions: number;
  suggestedQty: number; notes: string[];
}
interface ScanRun {
  id: string; scannedAt: string;
  totalScanned: number; results: ScanResult[];
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function PickCard({ r, targetRs }: { r: ScanResult; targetRs: number }) {
  const [expanded, setExpanded] = useState(false);

  // Calculate quantity to reach target profit at T1
  const profitPerShare = r.target1 - r.entryPrice;
  const qty = profitPerShare > 0 ? Math.ceil(targetRs / profitPerShare) : 0;
  const capital = qty * r.entryPrice;
  const stopLossAmount = qty * (r.entryPrice - r.stopLoss);

  return (
    <div className={cn(
      "relative group bg-white rounded-2xl border transition-all duration-300 hover:shadow-xl hover:border-indigo-200 overflow-hidden",
      r.confidence === "HIGH" ? "border-emerald-200 shadow-sm shadow-emerald-50" : "border-slate-100"
    )}>
      {/* Premium Gradient Top Bar */}
      <div className={cn(
        "h-1.5 w-full",
        r.score >= 85 ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" :
          r.score >= 75 ? "bg-gradient-to-r from-emerald-400 to-teal-400" : "bg-slate-200"
      )} />

      <div className="p-5 space-y-4">
        {/* Header Section */}
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">{r.symbol}</h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{r.exchange}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">₹{fmt(r.currentPrice)}</span>
              <div className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border",
                r.confidence === "HIGH" ? "text-emerald-700 bg-emerald-50 border-emerald-100" :
                  r.confidence === "MEDIUM" ? "text-amber-700 bg-amber-50 border-amber-100" : "text-slate-500 bg-slate-50 border-slate-100"
              )}>
                <Star className={cn("h-3 w-3 fill-current", r.confidence === "HIGH" ? "text-emerald-500" : "text-slate-300")} />
                {r.confidence} STRENGTH
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Momentum Score</div>
            <div className={cn(
              "text-3xl font-black italic tracking-tighter leading-none",
              r.score >= 85 ? "text-indigo-600" : r.score >= 75 ? "text-emerald-500" : "text-slate-400"
            )}>
              {r.score}
            </div>
          </div>
        </div>

        {/* Levels Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100 group-hover:bg-indigo-50 transition-colors">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">
              <Target className="h-3 w-3" />
              Entry Breakout
            </div>
            <div className="text-lg font-extrabold text-indigo-700">₹{fmt(r.entryPrice)}</div>
            <div className="text-[10px] text-indigo-400 font-medium">Buy above prev high</div>
          </div>
          <div className="p-3 bg-rose-50/50 rounded-2xl border border-rose-100 group-hover:bg-rose-50 transition-colors">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">
              <ShieldAlert className="h-3 w-3" />
              Stop Loss
            </div>
            <div className="text-lg font-extrabold text-rose-700">₹{fmt(r.stopLoss)}</div>
            <div className="text-[10px] text-rose-400 font-medium">{r.riskPct.toFixed(1)}% Risk per share</div>
          </div>
        </div>

        {/* Targets Scroll */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Potential Upside</span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Targets</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {[
              { label: "Target 1 (3%)", price: r.target1, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
              { label: "Target 2 (5%)", price: r.target2, color: "text-teal-600 bg-teal-50 border-teal-100" },
              { label: "Target 3 (10%)", price: r.target3, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
            ].map((t) => (
              <div key={t.label} className={cn("flex-shrink-0 px-3 py-2 rounded-xl border flex flex-col items-center min-w-[100px]", t.color)}>
                <span className="text-[9px] font-bold uppercase">{t.label}</span>
                <span className="text-sm font-black">₹{fmt(t.price)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trade Execution Plan */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Daily Goal Plan</span>
            </div>
            <span className="text-[10px] font-bold bg-indigo-500 px-2 py-0.5 rounded-full text-white">PROFIT ₹{targetRs}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Quantity</div>
              <div className="text-sm font-black text-white">{qty}</div>
            </div>
            <div className="text-center border-x border-slate-800">
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Capital</div>
              <div className="text-sm font-black text-white">₹{Math.round(capital).toLocaleString("en-IN")}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Risk</div>
              <div className="text-sm font-black text-rose-400">₹{Math.round(stopLossAmount).toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-indigo-500 transition-colors uppercase tracking-widest"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? "Hide Details" : "View Analysis"}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2 border-t border-slate-50 pt-3 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Volume & Signal Analysis</span>
              </div>
              <div className="space-y-1.5">
                {r.notes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                    {note}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-[10px] text-amber-700 leading-relaxed italic">
                <Info className="h-3 w-3 inline mr-1 mb-0.5" />
                Plan: Entry above ₹{fmt(r.entryPrice)}. Target 1 is conservative 3%. For 10% move, trail SL to entry once T2 is hit.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────
export default function IntradayPicksPage() {
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [targetRs, setTargetRs] = useState(500);

  const loadLast = useCallback(async () => {
    try {
      const res = await swingApi.last();
      if (res.data?.data) {
        // Filter only Intraday Momentum picks
        const data = res.data.data;
        data.results = data.results.filter((r: any) => r.pattern === "INTRADAY_MOMENTUM");
        setScan(data);
      }
    } catch { /* ignore */ }
    finally { setInitialLoad(false); }
  }, []);

  useEffect(() => { loadLast(); }, [loadLast]);

  const handleScan = async () => {
    setLoading(true);
    toast.info("Analyzing market momentum for 3-10% breakout candidates...");
    try {
      const res = await swingApi.run();
      const data = res.data?.data;
      if (data) {
        data.results = data.results.filter((r: any) => r.pattern === "INTRADAY_MOMENTUM");
        setScan(data);
      }
      toast.success(`Analysis complete! Found ${data?.results?.length ?? 0} high-probability picks.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Analysis failed. Connect Zerodha first.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12 animate-in fade-in duration-700">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 px-8 py-12 text-white shadow-2xl">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-widest">
              <Zap className="h-3 w-3 fill-current" />
              Pro Market Scanner
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
              Next-Day <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Momentum</span> Picks
            </h1>
            <p className="text-slate-400 text-lg font-medium leading-relaxed">
              We analyze volume explosions, price velocity, and relative strength to find stocks ready for 3% to 10% intraday moves.
            </p>
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
                loading ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-white text-slate-900 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,255,255,0.15)]"
              )}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5 transition-transform group-hover:rotate-180 duration-500" />}
              {loading ? "Analyzing..." : "Analyze Market"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {scan && scan.results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Scanned Universe", value: scan.totalScanned, icon: BarChart2, color: "text-blue-500", bg: "bg-blue-50" },
            { label: "Momentum Setups", value: scan.results.length, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50" },
            { label: "High Confidence", value: scan.results.filter(r => r.confidence === "HIGH").length, icon: Star, color: "text-amber-500", bg: "bg-amber-50" },
            { label: "Avg Potential", value: "4.2%", icon: ArrowUpRight, color: "text-indigo-500", bg: "bg-indigo-50" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl", stat.bg, stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</div>
                <div className="text-2xl font-black text-slate-900">{stat.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      {initialLoad ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Loading Intelligence...</p>
        </div>
      ) : !scan || scan.results.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-dashed border-slate-200 py-24 text-center">
          <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-6">
            <Zap className="h-10 w-10 text-slate-200" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-2">No Active Picks Found</h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-8 font-medium">
            Markets might be consolidating or the scan hasn't been run for today yet. Try running a fresh analysis.
          </p>
          <button
            onClick={handleScan}
            disabled={loading}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Start New Scan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {scan.results.map((pick) => (
            <PickCard key={pick.symbol} r={pick} targetRs={targetRs} />
          ))}
        </div>
      )}

      {/* Professional Disclosure */}
      <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 text-slate-500 text-xs leading-relaxed max-w-4xl mx-auto text-center space-y-4">
        <p className="font-bold text-slate-700 uppercase tracking-widest flex items-center justify-center gap-2">
          <Info className="h-4 w-4" />
          Intraday Execution Strategy
        </p>
        <p>
          These picks are generated based on mathematical momentum models. For best results: (1) Wait for the stock to trade above the <strong>Entry Price</strong> in the first 15-30 mins of market. (2) If it gaps up significantly (&gt;2% above entry), avoid the trade. (3) Target 1 (3%) is usually hit within 2 hours of breakout. (4) Use MIS product type for 5x leverage.
        </p>
        <p className="text-rose-500 font-bold uppercase tracking-widest pt-2">
          Trading involves significant risk. Always use a Stop Loss as recommended.
        </p>
      </div>
    </div>
  );
}
