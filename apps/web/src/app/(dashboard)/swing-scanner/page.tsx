"use client";

import { useCallback, useEffect, useState } from "react";
import { swingApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ScanSearch,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Zap,
  BarChart2,
  Volume2,
  Star,
  Share2,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCcw
} from "lucide-react";
import { QuickTradePanel, type QuickTradeStock } from "@/components/dashboard/QuickTradePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScanResult {
  rank: number;
  symbol: string;
  exchange: string;
  pattern: string;
  score: number;
  confidence: string;
  trendStrength: string;
  volumeSignal: string;
  currentPrice: number;
  pivotPrice: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: number;
  riskPct: number;
  contractions: number;
  suggestedQty: number;
  notes: string[];
  direction?: "LONG" | "SHORT";
  isFnO?: boolean;
  lotSize?: number;
}

function getDirection(r: ScanResult): "LONG" | "SHORT" {
  if (r.direction) return r.direction;
  return r.target1 > r.entryPrice ? "LONG" : "SHORT";
}

interface ScanRun {
  id: string;
  scannedAt: string;
  totalScanned: number;
  totalResults: number;
  page: number;
  pageSize: number;
  totalPages: number;
  results: ScanResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PATTERN_META: Record<string, { label: string; color: string; bg: string }> = {
  VCP: { label: "VCP Contraction", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  ROCKET_BASE: { label: "Rocket Base", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  TIGHT_AREA: { label: "Tight Area", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  INTRADAY_MOMENTUM: { label: "Momentum Surge", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  CUP_HANDLE: { label: "Cup & Handle", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  DAILY_INSIDE: { label: "1D Inside", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  WEEKLY_INSIDE: { label: "Weekly Inside", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  MONTHLY_INSIDE: { label: "Monthly Inside", color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
};


const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: "text-emerald-700 bg-emerald-50 border-emerald-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-100 border-slate-200",
};

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            score >= 75 ? "bg-emerald-500" : score >= 55 ? "bg-amber-400" : "bg-slate-300"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-slate-700 w-6 text-right">{score}</span>
    </div>
  );
}

// ─── Result Card Component ────────────────────────────────────────────────────
function ResultCard({
  r,
  targetRs,
  onQuickTrade,
}: {
  r: ScanResult;
  targetRs: number;
  onQuickTrade: (stock: QuickTradeStock) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pm = PATTERN_META[r.pattern] ?? {
    label: r.pattern,
    color: "text-slate-700",
    bg: "bg-slate-50 border-slate-200",
  };
  const direction = getDirection(r);
  const isLong = direction === "LONG";
  const risk = Math.abs(r.entryPrice - r.stopLoss);

  const isFnO = r.isFnO ?? false;
  const lotSize = r.lotSize ?? 1;
  const rawQty = risk > 0 ? Math.ceil(targetRs / risk) : r.suggestedQty;
  const lots = isFnO ? Math.max(1, Math.round(rawQty / lotSize)) : 0;
  const qty = isFnO ? lots * lotSize : rawQty;

  const invest = qty * r.entryPrice;
  const profit = qty * Math.abs(r.target1 - r.entryPrice);

  const handleCopy = () => {
    const qtyText = isFnO ? `${qty} shares (${lots} Lot${lots > 1 ? "s" : ""})` : `${qty} shares`;
    const text = `🚀 *Swing Trade Setup*
Stock: *${r.symbol}* (${r.exchange})${isFnO ? " [F&O]" : ""}
Pattern: ${r.pattern.replace(/_/g, " ")}
Current Price: ₹${fmt(r.currentPrice)}

✅ *Levels:*
Entry: Above ₹${fmt(r.entryPrice)}
Stop Loss: ₹${fmt(r.stopLoss)} (Risk: ${r.riskPct.toFixed(1)}%)

🎯 *Targets:*
Target 1: ₹${fmt(r.target1)}
Target 2: ₹${fmt(r.target2)}
Target 3: ₹${fmt(r.target3)}

📊 *Plan (Goal ₹${targetRs.toLocaleString()}):*
Qty: ${qtyText}
Capital: ₹${Math.round(invest).toLocaleString("en-IN")}
Risk Reward: ${r.riskReward}:1

_Generated by TradeIO Momentum Scanner_`;

    navigator.clipboard.writeText(text);
    toast.success("Trade setup copied to clipboard!");
  };

  return (
    <Card
      className={cn(
        "border-slate-200/90 bg-white shadow-xs rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-md transition-all group flex flex-col justify-between",
        r.confidence === "HIGH" && "border-emerald-300 ring-1 ring-emerald-500/10"
      )}
    >
      <div className="p-4 sm:p-5 space-y-3.5">
        {/* ─── 1. Header: Symbol, Price & Direction ─── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {r.symbol}
              </h3>
              <Badge variant="outline" className="text-[10px] font-semibold py-0.5 px-1.5 text-slate-600 bg-slate-50">
                {r.exchange}
              </Badge>
              {isFnO && (
                <Badge className="text-[10px] font-bold py-0.5 px-1.5 bg-blue-50 text-blue-700 border border-blue-200/80">
                  F&O ({lotSize})
                </Badge>
              )}
            </div>

            {/* Direction Tag */}
            <Badge
              className={cn(
                "text-[10.5px] font-bold py-0.5 px-2 inline-flex items-center gap-1 rounded-md shadow-2xs",
                isLong
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
              )}
            >
              {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isLong ? "BUY LONG" : "SELL SHORT"}
            </Badge>
          </div>

          {/* Sub-row: Badges & Live Price */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="secondary"
                className={cn("text-[10.5px] font-semibold py-0.5 px-2 border", pm.bg, pm.color)}
              >
                {pm.label}
              </Badge>
              <Badge
                variant="secondary"
                className={cn("text-[10.5px] font-medium py-0.5 px-2", CONFIDENCE_COLOR[r.confidence])}
              >
                <Star className="h-3 w-3 inline mr-1 text-amber-500 fill-amber-500" />
                {r.confidence} Conf.
              </Badge>
            </div>

            {/* Current Price */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium">LTP:</span>
              <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/70">
                ₹{fmt(r.currentPrice)}
              </span>
            </div>
          </div>
        </div>

        {/* ─── 2. Levels Grid (2x2 with Full Numbers) ─── */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {/* Entry */}
          <div className="rounded-xl bg-blue-50/80 border border-blue-100/90 p-2.5">
            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Entry Level</p>
            <p className="text-sm font-bold font-mono text-blue-950 mt-0.5">₹{fmt(r.entryPrice)}</p>
          </div>

          {/* Stop Loss */}
          <div className="rounded-xl bg-rose-50/80 border border-rose-100/90 p-2.5">
            <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Stop Loss</p>
            <p className="text-sm font-bold font-mono text-rose-950 mt-0.5">₹{fmt(r.stopLoss)}</p>
          </div>

          {/* Target 1 */}
          <div className="rounded-xl bg-emerald-50/80 border border-emerald-100/90 p-2.5">
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Target 1</p>
            <p className="text-sm font-bold font-mono text-emerald-950 mt-0.5">₹{fmt(r.target1)}</p>
          </div>

          {/* Target 2 */}
          <div className="rounded-xl bg-teal-50/80 border border-teal-100/90 p-2.5">
            <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wider">Target 2</p>
            <p className="text-sm font-bold font-mono text-teal-950 mt-0.5">₹{fmt(r.target2)}</p>
          </div>
        </div>

        {/* ─── 3. Stats Row (Risk, RR, Contractions, Score, Volume) ─── */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
              <span>Risk: <strong>{r.riskPct.toFixed(1)}%</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              <span>R:R Ratio: <strong>{r.riskReward}:1</strong></span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-200/50">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-medium">Score:</span>
              <ScoreBar score={r.score} />
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <Volume2 className="h-3.5 w-3.5 text-slate-400" />
              <span
                className={cn(
                  "font-semibold",
                  r.volumeSignal === "DRYING"
                    ? "text-emerald-600"
                    : r.volumeSignal === "EXPANDING"
                    ? "text-blue-600"
                    : "text-slate-500"
                )}
              >
                {r.volumeSignal === "DRYING" ? "Vol: Drying" : r.volumeSignal === "EXPANDING" ? "Vol: High" : "Vol: Normal"}
              </span>
            </div>
          </div>
        </div>

        {/* ─── 4. Target Sizing Plan ─── */}
        <div className="rounded-xl bg-slate-50/70 border border-slate-200/80 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Target Profit Goal:</span>
            <span className="font-mono font-bold text-emerald-700">₹{targetRs.toLocaleString("en-IN")}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-200/60">
            <div>
              <p className="text-[9.5px] text-slate-500 font-semibold uppercase">Quantity</p>
              <p className="text-xs font-bold font-mono text-slate-900 mt-0.5">
                {qty} {isFnO ? `(${lots}L)` : "Qty"}
              </p>
            </div>
            <div className="border-x border-slate-200/70 px-1">
              <p className="text-[9.5px] text-slate-500 font-semibold uppercase">Capital</p>
              <p className="text-xs font-bold font-mono text-slate-900 mt-0.5">
                ₹{Math.round(invest).toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-[9.5px] text-slate-500 font-semibold uppercase">Est. Profit</p>
              <p className="text-xs font-bold font-mono text-emerald-600 mt-0.5">
                +₹{Math.round(profit).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        {/* ─── 5. Actions: Quick Trade & Share ─── */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={() =>
              onQuickTrade({
                symbol: r.symbol,
                exchange: r.exchange,
                direction,
                entryPrice: r.entryPrice,
                stopLoss: r.stopLoss,
                target1: r.target1,
                target2: r.target2,
                currentPrice: r.currentPrice,
                suggestedQty: qty,
                product: isLong ? "CNC" : "MIS",
                isFnO,
                lotSize,
              })
            }
            className={cn(
              "flex-1 h-9 text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs gap-1.5 transition-all",
              isLong ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
            )}
          >
            <Zap className="h-4 w-4" />
            {isLong ? `Buy ${r.symbol} (Delivery)` : `Short ${r.symbol} (Intraday)`}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title="Copy trade setup"
            className="h-9 w-9 rounded-xl border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 shrink-0"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

        {/* ─── 6. Expand Analysis Notes ─── */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-wider pt-1"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide Technical Analysis" : "View Technical Analysis"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            {r.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2 bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

const PAGE_SIZE = 30;

export default function SwingScannerPage() {
  const [allResults, setAllResults] = useState<ScanResult[]>([]);
  const [scanMeta, setScanMeta] = useState<Omit<ScanRun, "results"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "VCP" | "ROCKET_BASE" | "TIGHT_AREA" | "DAILY_INSIDE" | "WEEKLY_INSIDE" | "MONTHLY_INSIDE" | "INTRADAY_MOMENTUM">("ALL");

  const [sortBy, setSortBy] = useState<"score" | "riskPct" | "riskReward">("score");
  const [page, setPage] = useState(1);
  const [targetRs, setTargetRs] = useState(500);
  const [tradeStock, setTradeStock] = useState<QuickTradeStock | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadLast = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await swingApi.last({ pageSize: 1000 });
      if (res.data?.data) {
        const { results, ...meta } = res.data.data as ScanRun;
        setAllResults(results ?? []);
        setScanMeta(meta);
      } else {
        setAllResults([]);
        setScanMeta(null);
      }
    } catch {
      setAllResults([]);
      setScanMeta(null);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    loadLast();
  }, [loadLast]);

  useEffect(() => {
    setPage(1);
  }, [filter, sortBy, searchQuery]);

  async function runScan() {
    setLoading(true);
    toast.info("Scanning Nifty 500 stocks… this takes ~2 minutes");
    try {
      await swingApi.run();
      toast.success("Scan initiated! Refreshing in 3 seconds...");
      setTimeout(() => loadLast(true), 3000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Scan failed — check broker session");
      setLoading(false);
    }
  }

  const afterPattern =
    filter === "ALL" ? allResults : allResults.filter((r) => r.pattern === filter);

  const afterSort = [...afterPattern].sort((a, b) => {
    if (sortBy === "score") return b.score - a.score;
    if (sortBy === "riskPct") return a.riskPct - b.riskPct;
    return b.riskReward - a.riskReward;
  });

  const afterSearch = searchQuery.trim()
    ? afterSort.filter(
        (r) =>
          r.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.pattern.toLowerCase().replace(/_/g, " ").includes(searchQuery.toLowerCase())
      )
    : afterSort;

  const totalPages = Math.max(1, Math.ceil(afterSearch.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const filtered = afterSearch.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const highConf = afterSearch.filter((r) => r.confidence === "HIGH").length;

  const scan = scanMeta
    ? ({
        ...scanMeta,
        results: filtered,
        page: safePage,
        totalPages,
        totalResults: afterSearch.length,
      } as ScanRun)
    : null;

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both] pb-12 font-sans">
      <QuickTradePanel stock={tradeStock} onClose={() => setTradeStock(null)} targetRs={targetRs} />

      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ScanSearch className="h-6 w-6 text-blue-600" />
            Momentum Swing Scanner
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            VCP · Rocket Base · Multi-Timeframe Inside Candles — High probability swing setups
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {scan && (
            <p className="text-xs text-slate-400 font-mono hidden sm:block">
              Last: {new Date(scan.scannedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          <Button
            onClick={runScan}
            disabled={loading}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {loading ? "Scanning Universe..." : "Run Swing Scan"}
          </Button>
        </div>
      </div>

      {/* ── 2. Stat Summary Bar ── */}
      {scan && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {/* Universe */}
            <div className="flex items-center gap-3 p-1">
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Scanned Universe</p>
                <p className="text-lg sm:text-xl font-bold font-mono text-slate-900">{scan.totalScanned} Stocks</p>
              </div>
            </div>

            {/* Total Setups */}
            <div className="flex items-center gap-3 p-1 pt-3 sm:pt-1 sm:pl-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Setups</p>
                <p className="text-lg sm:text-xl font-bold font-mono text-slate-900">{scan.totalResults} Found</p>
              </div>
            </div>

            {/* Displayed */}
            <div className="flex items-center gap-3 p-1 pt-3 sm:pt-1 sm:pl-4">
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Displayed Batch</p>
                <p className="text-lg sm:text-xl font-bold font-mono text-slate-900">{filtered.length} Setups</p>
              </div>
            </div>

            {/* Prime Setups */}
            <div className="flex items-center gap-3 p-1 pt-3 sm:pt-1 sm:pl-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">High Confidence</p>
                <p className="text-lg sm:text-xl font-bold font-mono text-emerald-600">{highConf} Prime</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Filters + Sort Toolbar ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search + Pattern filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
              <div className="relative min-w-[180px] sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search symbol or pattern..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 pr-3 text-xs bg-white border-slate-200 text-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Pattern Pills */}
              <div className="flex gap-1 p-1 rounded-lg bg-slate-50 border border-slate-200/80 overflow-x-auto scrollbar-hide">
                {(["ALL", "VCP", "ROCKET_BASE", "TIGHT_AREA", "DAILY_INSIDE", "WEEKLY_INSIDE", "MONTHLY_INSIDE", "INTRADAY_MOMENTUM"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md transition-all shrink-0",
                        filter === f
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {f === "ALL"
                        ? `All`
                        : f === "VCP"
                        ? `VCP`
                        : f === "ROCKET_BASE"
                        ? `Rocket Base`
                        : f === "TIGHT_AREA"
                        ? `Tight Area`
                        : f === "DAILY_INSIDE"
                        ? `1D Inside`
                        : f === "WEEKLY_INSIDE"
                        ? `Weekly Inside`
                        : f === "MONTHLY_INSIDE"
                        ? `Monthly Inside`
                        : `Momentum`}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Right Controls: Target Rs & Sort Dropdown */}
            <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap w-full lg:w-auto">
              <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-slate-200 px-2.5 sm:px-3 py-1.5 bg-slate-50 text-xs">
                <Target className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="text-[10.5px] sm:text-[11px] font-semibold text-slate-500">Target:</span>
                <div className="flex items-center gap-0.5">
                  <span className="font-mono font-bold text-slate-900">₹</span>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={targetRs}
                    onChange={(e) => setTargetRs(Number(e.target.value))}
                    className="w-14 sm:w-16 bg-transparent font-mono font-bold text-slate-900 focus:outline-none text-xs"
                  />
                </div>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-9 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value="score">Sort: Score</option>
                <option value="riskPct">Sort: Lowest Risk</option>
                <option value="riskReward">Sort: Best R:R</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Results Grid ── */}
      {initialLoad ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Loading Swing Setups...
          </p>
        </div>
      ) : !scan || filtered.length === 0 ? (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-16 text-center space-y-3">
            <ScanSearch className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">
              {searchQuery ? "No matching setups found" : "No active swing setups"}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? "Try clearing your search query to see all available candidates."
                : "Run a fresh market scan or select another pattern filter."}
            </p>
            <Button
              onClick={runScan}
              disabled={loading}
              className="mt-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-1.5 shadow-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Start Swing Scan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div
            className={cn(
              "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 transition-opacity",
              loading ? "opacity-50" : "opacity-100"
            )}
          >
            {filtered.map((r) => (
              <ResultCard
                key={`${r.symbol}-${r.pattern}-${getDirection(r)}`}
                r={r}
                targetRs={targetRs}
                onQuickTrade={setTradeStock}
              />
            ))}
          </div>

          {/* ── 5. Pagination ── */}
          {scan.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium">
                Page {scan.page} of {scan.totalPages} ({scan.totalResults} Setups)
              </p>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="text-xs font-mono font-semibold px-2">
                  Page {scan.page} of {scan.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === scan.totalPages || loading}
                  onClick={() => setPage((p) => Math.min(scan.totalPages, p + 1))}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 6. Pattern Guide Legend ── */}
      {scan && (
        <Card className="border-slate-200/80 bg-slate-50/80 shadow-2xs rounded-xl">
          <CardContent className="p-5 text-xs text-slate-600 leading-relaxed space-y-1.5">
            <p className="font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Info className="h-4 w-4 text-blue-600" /> Swing Trading Setup Reference
            </p>
            <p>• <strong>Entry</strong> — Buy trigger when price trades above pivot level (breakout confirmation)</p>
            <p>• <strong>Stop Loss</strong> — Mandatory risk exit if momentum fails</p>
            <p>• <strong>Target 1 / 2</strong> — Primary profit booking zones based on multi-timeframe Fibonacci expansions</p>
            <p>• <strong>VCP (Volatility Contraction Pattern)</strong> — Tightening swing contractions before explosive expansion</p>
            <p>• <strong>Rocket Base</strong> — Tight base consolidation following strong preceding momentum</p>
            <p className="text-amber-700 font-medium pt-1">
              ⚠ Always adhere to disciplined risk management and position sizing rules.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
