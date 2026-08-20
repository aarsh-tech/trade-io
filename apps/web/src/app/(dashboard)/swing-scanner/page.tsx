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
  VCP: { label: "VCP", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  ROCKET_BASE: { label: "Rocket Base", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  TIGHT_AREA: { label: "Tight Area", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
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
        "border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 hover:shadow-md transition-all group flex flex-col justify-between",
        r.confidence === "HIGH" && "border-emerald-300"
      )}
    >
      <div className="p-5 space-y-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {r.symbol}
              </h3>
              <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1 text-slate-500">
                {r.exchange}
              </Badge>
              <Badge
                variant="secondary"
                className={cn("text-[10px] font-semibold py-0 px-1.5 border", pm.bg, pm.color)}
              >
                {pm.label}
              </Badge>
              {isFnO && (
                <Badge className="text-[9.5px] font-bold py-0 px-1 bg-blue-50 text-blue-700 border-blue-200">
                  F&O ({lotSize})
                </Badge>
              )}
              <Badge
                variant={isLong ? "success" : "destructive"}
                className={cn(
                  "text-[9.5px] font-bold py-0 px-1.5 inline-flex items-center gap-0.5",
                  isLong
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-rose-50 text-rose-600 border-rose-200"
                )}
              >
                {isLong ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {isLong ? "LONG" : "SHORT"}
              </Badge>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                ₹{fmt(r.currentPrice)}
              </span>
              <Badge
                variant="secondary"
                className={cn("text-[10px] font-medium py-0 px-1.5", CONFIDENCE_COLOR[r.confidence])}
              >
                <Star className="h-2.5 w-2.5 inline mr-1 text-amber-500 fill-amber-500" />
                {r.confidence}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <ScoreBar score={r.score} />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400">Rank #{r.rank}</span>
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                title="Copy trade setup"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Levels Grid */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-2">
            <p className="text-[9px] text-blue-600 font-bold uppercase">Entry</p>
            <p className="text-xs font-bold font-mono text-blue-800">₹{fmt(r.entryPrice)}</p>
          </div>
          <div className="rounded-lg bg-rose-50/70 border border-rose-100 p-2">
            <p className="text-[9px] text-rose-600 font-bold uppercase">Stop Loss</p>
            <p className="text-xs font-bold font-mono text-rose-700">₹{fmt(r.stopLoss)}</p>
          </div>
          <div className="rounded-lg bg-emerald-50/70 border border-emerald-100 p-2">
            <p className="text-[9px] text-emerald-600 font-bold uppercase">Target 1</p>
            <p className="text-xs font-bold font-mono text-emerald-700">₹{fmt(r.target1)}</p>
          </div>
          <div className="rounded-lg bg-teal-50/70 border border-teal-100 p-2">
            <p className="text-[9px] text-teal-600 font-bold uppercase">Target 2</p>
            <p className="text-xs font-bold font-mono text-teal-700">₹{fmt(r.target2)}</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
              Risk {r.riskPct.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              RR {r.riskReward}:1
            </span>
            {r.contractions > 0 && (
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-purple-500" />
                {r.contractions} VCPs
              </span>
            )}
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
              Vol {r.volumeSignal === "DRYING" ? "↓ Dry" : r.volumeSignal === "EXPANDING" ? "↑ High" : "Avg"}
            </span>
          </div>
        </div>

        {/* Target Calculator Box */}
        <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">
              For ₹{targetRs.toLocaleString()} profit at T1
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase">Qty</p>
              <p className="text-xs font-bold font-mono text-slate-800">
                {qty} {isFnO && <span className="text-[9.5px] text-blue-600 font-normal">({lots}L)</span>}
              </p>
            </div>
            <div className="border-x border-slate-200">
              <p className="text-[9px] text-slate-400 font-bold uppercase">Capital</p>
              <p className="text-xs font-bold font-mono text-slate-800">
                ₹{Math.round(invest).toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase">Est. Profit</p>
              <p className="text-xs font-bold font-mono text-emerald-600">
                +₹{Math.round(profit).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        {/* ⚡ One-Click Trade Button */}
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
            "w-full h-8 text-xs font-bold uppercase tracking-wider rounded-lg shadow-2xs gap-1.5",
            isLong ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          {isLong ? `Buy ${r.symbol} (CNC)` : `Short ${r.symbol} (MIS)`}
        </Button>

        {/* Expand Notes */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-wider pt-0.5"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide Notes" : "Analysis Notes"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
            {r.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-1.5">
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
  const [filter, setFilter] = useState<"ALL" | "VCP" | "ROCKET_BASE" | "DAILY_INSIDE" | "WEEKLY_INSIDE" | "MONTHLY_INSIDE">("ALL");
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

      {/* ── 2. Stat Cards ── */}
      {scan && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Scanned Universe</span>
                <BarChart2 className="h-4 w-4 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-bold font-mono text-slate-900">
                {scan.totalScanned} Stocks
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Nifty 500 universe</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Total Setups</span>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-bold font-mono text-slate-900">
                {scan.totalResults} Setups
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Identified patterns</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Page Candidates</span>
                <Star className="h-4 w-4 text-amber-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-bold font-mono text-slate-900">
                {filtered.length} Displayed
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Active filtered batch</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>High Confidence</span>
                <ShieldAlert className="h-4 w-4 text-emerald-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-bold font-mono text-emerald-600">
                {highConf} Prime Setups
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Highest probability</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 3. Filters + Sort Toolbar ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search + Pattern filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
              <div className="relative min-w-[200px]">
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
                {(["ALL", "VCP", "ROCKET_BASE", "DAILY_INSIDE", "WEEKLY_INSIDE", "MONTHLY_INSIDE"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-md transition-all shrink-0",
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
                        ? `Rocket`
                        : f === "DAILY_INSIDE"
                        ? `1D Inside`
                        : f === "WEEKLY_INSIDE"
                        ? `Weekly`
                        : `Monthly`}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Right Controls: Target Rs & Sort Dropdown */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 bg-slate-50 text-xs">
                <Target className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-[11px] font-semibold text-slate-500">Target Profit:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-bold text-slate-900">₹</span>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={targetRs}
                    onChange={(e) => setTargetRs(Number(e.target.value))}
                    className="w-16 bg-transparent font-mono font-bold text-slate-900 focus:outline-none text-xs"
                  />
                </div>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-9 px-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                <option value="score">Sort: Highest Score</option>
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
