"use client";

import { useCallback, useEffect, useState } from "react";
import { swingApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ScanSearch, RefreshCw, Loader2, TrendingUp, TrendingDown,
  ShieldAlert, Target, ArrowUpRight, ChevronDown, ChevronUp,
  Zap, BarChart2, Volume2, Star,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PATTERN_META: Record<string, { label: string; color: string; bg: string }> = {
  VCP: { label: "VCP", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  ROCKET_BASE: { label: "Rocket Base", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  TIGHT_AREA: { label: "Tight Area", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  CUP_HANDLE: { label: "Cup & Handle", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: "text-emerald-600 bg-emerald-50 border-emerald-200",
  MEDIUM: "text-amber-600 bg-amber-50 border-amber-200",
  LOW: "text-slate-500 bg-slate-50 border-slate-200",
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", score >= 75 ? "bg-emerald-500" : score >= 55 ? "bg-amber-400" : "bg-slate-300")}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-7 text-right">{score}</span>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function ResultCard({ r, targetRs }: { r: ScanResult; targetRs: number }) {
  const [expanded, setExpanded] = useState(false);
  const pm = PATTERN_META[r.pattern] ?? { label: r.pattern, color: "text-slate-700", bg: "bg-slate-50 border-slate-200" };
  const risk = r.entryPrice - r.stopLoss;
  const qty = risk > 0 ? Math.ceil(targetRs / risk) : r.suggestedQty;
  const invest = qty * r.entryPrice;
  const profit = qty * (r.target1 - r.entryPrice);

  return (
    <div className={cn(
      "bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200",
      r.confidence === "HIGH" ? "border-emerald-200" : "border-slate-200",
    )}>
      {/* Top accent */}
      {r.confidence === "HIGH" && (
        <div className="h-0.5 rounded-t-2xl bg-gradient-to-r from-emerald-400 to-teal-400" />
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900">{r.symbol}</span>
              <span className="text-xs text-slate-400 font-medium">{r.exchange}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", pm.bg, pm.color)}>
                {pm.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-sm font-semibold text-slate-800">₹{fmt(r.currentPrice)}</span>
              <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full border", CONFIDENCE_COLOR[r.confidence])}>
                {r.confidence}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ScoreBar score={r.score} />
            <span className="text-[10px] text-slate-400">Rank #{r.rank}</span>
          </div>
        </div>

        {/* Entry / SL / Targets grid */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-2">
            <p className="text-[9px] text-blue-500 font-semibold uppercase tracking-wide">Entry</p>
            <p className="text-xs font-bold text-blue-700">₹{fmt(r.entryPrice)}</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-2">
            <p className="text-[9px] text-red-500 font-semibold uppercase tracking-wide">Stop Loss</p>
            <p className="text-xs font-bold text-red-600">₹{fmt(r.stopLoss)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2">
            <p className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wide">Target 1</p>
            <p className="text-xs font-bold text-emerald-700">₹{fmt(r.target1)}</p>
          </div>
          <div className="rounded-xl bg-teal-50 border border-teal-100 p-2">
            <p className="text-[9px] text-teal-600 font-semibold uppercase tracking-wide">Target 2</p>
            <p className="text-xs font-bold text-teal-700">₹{fmt(r.target2)}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-0.5">
              <ShieldAlert className="h-3 w-3 text-red-400" />
              Risk {r.riskPct.toFixed(1)}%
            </span>
            <span className="flex items-center gap-0.5">
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              RR {r.riskReward}:1
            </span>
            {r.contractions > 0 && (
              <span className="flex items-center gap-0.5">
                <Zap className="h-3 w-3 text-purple-400" />
                {r.contractions} VCPs
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Volume2 className="h-3 w-3" />
            <span className={cn(
              "font-medium",
              r.volumeSignal === "DRYING" ? "text-emerald-600" : r.volumeSignal === "EXPANDING" ? "text-blue-600" : "text-slate-500"
            )}>
              Vol {r.volumeSignal === "DRYING" ? "↓ Dry" : r.volumeSignal === "EXPANDING" ? "↑ High" : "Avg"}
            </span>
          </div>
        </div>

        {/* ₹500 calculator */}
        <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 p-3">
          <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide mb-1.5">
            For ₹{targetRs.toLocaleString()} profit at T1
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-slate-500">Qty</p>
              <p className="text-sm font-bold text-indigo-700">{qty} shares</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Capital</p>
              <p className="text-sm font-bold text-slate-700">₹{Math.round(invest).toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">Est. Profit</p>
              <p className="text-sm font-bold text-emerald-600">+₹{Math.round(profit).toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>

        {/* Expand notes */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide" : "Show"} analysis notes
        </button>
        {expanded && (
          <ul className="space-y-1 pl-1">
            {r.notes.map((n, i) => (
              <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-300 shrink-0" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SwingScannerPage() {
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "VCP" | "ROCKET_BASE" | "TIGHT_AREA">("ALL");
  const [sortBy, setSortBy] = useState<"score" | "riskPct" | "riskReward">("score");
  const [targetRs, setTargetRs] = useState(500);

  const loadLast = useCallback(async () => {
    try {
      const res = await swingApi.last();
      if (res.data?.data) setScan(res.data.data);
    } catch { /* no last scan yet */ }
    finally { setInitialLoad(false); }
  }, []);

  useEffect(() => { loadLast(); }, [loadLast]);

  async function runScan() {
    setLoading(true);
    toast.info("Scanning 130+ stocks… this takes ~2 minutes ☕");
    try {
      const res = await swingApi.run();
      setScan(res.data?.data ?? null);
      toast.success(`✅ Scan complete! ${res.data?.data?.results?.length ?? 0} setups found.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Scan failed — check broker session");
    } finally {
      setLoading(false);
    }
  }

  const filtered = (scan?.results ?? [])
    .filter(r => filter === "ALL" || r.pattern === filter)
    .sort((a, b) =>
      sortBy === "score" ? b.score - a.score :
        sortBy === "riskPct" ? a.riskPct - b.riskPct :
          b.riskReward - a.riskReward
    );

  const highConf = filtered.filter(r => r.confidence === "HIGH").length;

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanSearch className="h-6 w-6 text-indigo-600" />
            Swing Scanner
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            VCP · Rocket Base · Tight Area — 2-3 day setups with ₹500 target
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scan && (
            <p className="text-xs text-slate-400 hidden sm:block">
              Last scan: {new Date(scan.scannedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <button
            onClick={runScan}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm",
              loading
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:shadow-md"
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? "Scanning…" : "Run Scan"}
          </button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {scan && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Stocks Scanned", value: scan.totalScanned, icon: BarChart2, color: "text-indigo-600" },
            { label: "Setups Found", value: scan.results.length, icon: TrendingUp, color: "text-emerald-600" },
            { label: "High Confidence", value: highConf, icon: Star, color: "text-amber-500" },
            { label: "VCP Patterns", value: scan.results.filter(r => r.pattern === "VCP").length, icon: Zap, color: "text-purple-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-slate-50", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters + Sort ──────────────────────────────────────────────── */}
      {scan && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Pattern filter */}
          <div className="flex gap-2 flex-wrap">
            {(["ALL", "VCP", "ROCKET_BASE", "TIGHT_AREA"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
                  filter === f
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                )}
              >
                {f === "ALL" ? `All (${scan.results.length})` :
                  f === "VCP" ? `VCP (${scan.results.filter(r => r.pattern === "VCP").length})` :
                    f === "ROCKET_BASE" ? `Rocket (${scan.results.filter(r => r.pattern === "ROCKET_BASE").length})` :
                      `Tight (${scan.results.filter(r => r.pattern === "TIGHT_AREA").length})`}
              </button>
            ))}
          </div>
          {/* Right controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs text-slate-500">Target ₹</span>
              <input
                type="number" min={100} max={10000} step={100}
                value={targetRs}
                onChange={e => setTargetRs(Number(e.target.value))}
                className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1 text-center font-semibold focus:outline-none focus:border-indigo-400"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
            >
              <option value="score">Sort: Score</option>
              <option value="riskPct">Sort: Lowest Risk</option>
              <option value="riskReward">Sort: Best R:R</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Results grid ────────────────────────────────────────────────── */}
      {initialLoad ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        </div>
      ) : !scan ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
          <div className="h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center">
            <ScanSearch className="h-10 w-10 text-indigo-300" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">No scan results yet</p>
            <p className="text-sm mt-1">Click <strong>Run Scan</strong> to find today's best swing setups</p>
            <p className="text-xs mt-1 text-slate-400">Requires an active Zerodha session</p>
          </div>
          <button
            onClick={runScan}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-200 transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            Start Scanning
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No {filter === "ALL" ? "" : filter} setups found</p>
          <p className="text-sm mt-1">Try running a fresh scan or changing the filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(r => (
            <ResultCard key={r.symbol} r={r} targetRs={targetRs} />
          ))}
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      {scan && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 space-y-1.5">
          <p className="font-semibold text-slate-700 mb-2">📖 How to use these results</p>
          <p>• <strong>Entry</strong> — Buy when price trades above this level (breakout confirmation)</p>
          <p>• <strong>Stop Loss</strong> — Exit immediately if price falls below this level</p>
          <p>• <strong>Target 1</strong> — First exit (1:1 risk-reward). Target for ₹{targetRs.toLocaleString()} profit is calculated here</p>
          <p>• <strong>Target 2 / 3</strong> — Hold partial position for bigger gains (2:1 and 3:1 RR)</p>
          <p>• <strong>VCP</strong> — Volatility Contraction Pattern (Minervini). Multiple tightening swings → explosive breakout</p>
          <p>• <strong>Rocket Base</strong> — Tight 8-25 day base after a strong prior move</p>
          <p>• <strong>Tight Area</strong> — 15-day close consolidation with shrinking volume</p>
          <p className="text-amber-600 font-medium mt-2">⚠ Always verify with your own analysis. Past patterns do not guarantee future results.</p>
        </div>
      )}
    </div>
  );
}
