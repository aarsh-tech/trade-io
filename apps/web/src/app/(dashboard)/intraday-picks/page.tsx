"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { QuickTradePanel, type QuickTradeStock } from "@/components/dashboard/QuickTradePanel";
import { swingApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
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
  Sparkles,
  ArrowUpRight,
  RefreshCcw
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
}

interface ScanRun {
  id: string;
  scannedAt: string;
  totalScanned: number;
  results: ScanResult[];
}

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDirection(r: ScanResult): "LONG" | "SHORT" {
  if (r.direction) return r.direction;
  return r.target1 > r.entryPrice ? "LONG" : "SHORT";
}

function PickCard({
  r,
  targetRs,
  onQuickTrade,
}: {
  r: ScanResult;
  targetRs: number;
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
    toast.success("Setup copied to clipboard!");
  };

  return (
    <Card
      className={cn(
        "border-slate-200/90 bg-white shadow-xs rounded-xl overflow-hidden hover:border-slate-300 hover:shadow-md transition-all group flex flex-col justify-between",
        r.confidence === "HIGH" && "border-emerald-300"
      )}
    >
      <div className="p-5 space-y-4">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {r.symbol}
              </h3>
              <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1 text-slate-500">
                {r.exchange}
              </Badge>
              <Badge
                variant={isLong ? "success" : "destructive"}
                className={cn(
                  "text-[10px] font-bold py-0 px-1.5 inline-flex items-center gap-0.5",
                  isLong
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-rose-50 text-rose-600 border-rose-200"
                )}
              >
                {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {isLong ? "LONG" : "SHORT"}
              </Badge>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                LTP: ₹{fmt(r.currentPrice)}
              </span>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] font-medium",
                  r.confidence === "HIGH"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    : r.confidence === "MEDIUM"
                    ? "bg-amber-50 text-amber-700 border border-amber-100"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                <Star className="h-2.5 w-2.5 inline mr-1 text-amber-500 fill-amber-500" />
                {r.confidence}
              </Badge>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 mb-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Score</span>
              <button
                onClick={handleShare}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                title="Copy trade setup"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              className={cn(
                "text-2xl font-bold font-mono",
                r.score >= 85 ? "text-blue-600" : r.score >= 75 ? "text-emerald-600" : "text-slate-500"
              )}
            >
              {r.score}
            </div>
          </div>
        </div>

        {/* Level Boxes Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div
            className={cn(
              "p-2.5 rounded-lg border",
              isLong ? "bg-emerald-50/50 border-emerald-100" : "bg-rose-50/50 border-rose-100"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-0.5",
                isLong ? "text-emerald-600" : "text-rose-600"
              )}
            >
              <Target className="h-3 w-3" />
              {isLong ? "Buy Above" : "Sell Below"}
            </div>
            <div className={cn("text-base font-bold font-mono", isLong ? "text-emerald-700" : "text-rose-700")}>
              ₹{fmt(r.entryPrice)}
            </div>
          </div>

          <div className="p-2.5 bg-rose-50/50 rounded-lg border border-rose-100">
            <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-0.5">
              <ShieldAlert className="h-3 w-3" /> Stop Loss
            </div>
            <div className="text-base font-bold font-mono text-rose-700">₹{fmt(r.stopLoss)}</div>
            <div className="text-[10px] text-rose-500 font-medium">{r.riskPct.toFixed(1)}% Risk</div>
          </div>
        </div>

        {/* Targets Strip */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {[
            { label: "T1 (Fib 0.382)", price: r.target1, color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
            { label: "T2 (Fib 0.618)", price: r.target2, color: "text-teal-700 bg-teal-50 border-teal-100" },
            { label: "T3 (Fib 1.0)", price: r.target3, color: "text-blue-700 bg-blue-50 border-blue-100" },
          ].map((t) => (
            <div key={t.label} className={cn("flex-shrink-0 px-2.5 py-1.5 rounded-lg border flex flex-col items-center min-w-[85px]", t.color)}>
              <span className="text-[9px] font-semibold uppercase">{t.label}</span>
              <span className="text-xs font-bold font-mono">₹{fmt(t.price)}</span>
            </div>
          ))}
        </div>

        {/* Goal Calculator Panel */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Rocket className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Goal Plan</span>
            </div>
            <span className="text-[10px] font-bold font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
              Target: ₹{targetRs}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase">Qty</div>
              <div className="text-xs font-bold font-mono text-slate-800">{qty}</div>
            </div>
            <div className="border-x border-slate-200">
              <div className="text-[9px] text-slate-400 font-bold uppercase">Capital</div>
              <div className="text-xs font-bold font-mono text-slate-800">
                ₹{Math.round(capital).toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-400 font-bold uppercase">Max Risk</div>
              <div className="text-xs font-bold font-mono text-rose-600">
                ₹{Math.round(stopLossAmount).toLocaleString("en-IN")}
              </div>
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
              product: "MIS",
            })
          }
          className={cn(
            "w-full h-9 text-xs font-bold uppercase tracking-wider rounded-lg shadow-2xs gap-1.5",
            isLong
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-rose-600 hover:bg-rose-700 text-white"
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          {isLong ? `Buy ${r.symbol} (MIS)` : `Short ${r.symbol} (MIS)`}
        </Button>

        {/* Expand Notes */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-wider pt-1"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide Details" : "View Analysis Notes"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            {r.notes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

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
    } catch {
      /* ignore */
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    loadLast();
  }, [loadLast]);

  const handleScan = async () => {
    setLoading(true);
    toast.info("Scanning market for breakout & breakdown candidates...");
    try {
      await swingApi.run();
      toast.success("Scan completed! Refreshing results...");
      setTimeout(async () => {
        const res = await swingApi.last({ pattern: "INTRADAY_MOMENTUM", pageSize: 100 });
        if (res.data?.data) setScan(res.data.data);
        setLoading(false);
      }, 3000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Scan failed. Please check broker connection.");
      setLoading(false);
    }
  };

  const allResults = scan?.results ?? [];
  const longCount = allResults.filter((r) => getDirection(r) === "LONG").length;
  const shortCount = allResults.filter((r) => getDirection(r) === "SHORT").length;

  const filtered = useMemo(() => {
    const afterDir =
      dirFilter === "ALL"
        ? allResults
        : allResults.filter((r) => getDirection(r) === dirFilter);

    return searchQuery.trim()
      ? afterDir.filter(
          (r) =>
            r.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.pattern.toLowerCase().replace(/_/g, " ").includes(searchQuery.toLowerCase())
        )
      : afterDir;
  }, [allResults, dirFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both] pb-12 font-sans">
      <QuickTradePanel stock={tradeStock} onClose={() => setTradeStock(null)} targetRs={targetRs} />

      {/* ── 1. Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-600" />
            Smart Intraday Momentum Picks
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            AI-identified breakout & breakdown setups with automated SL, Target, and risk estimation
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <Button
            onClick={handleScan}
            disabled={loading}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {loading ? "Scanning Market..." : "Run Market Scan"}
          </Button>
        </div>
      </div>

      {/* ── 2. Stat Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Scanned Universe</span>
              <BarChart2 className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-2xl font-bold font-mono text-slate-900">
              {scan?.totalScanned || 0} Stocks
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total symbols screened</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Total Setups</span>
              <Zap className="h-4 w-4 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-2xl font-bold font-mono text-slate-900">
              {allResults.length} Candidates
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Passed momentum threshold</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Long Breakouts</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-2xl font-bold font-mono text-emerald-600">
              {longCount} Setups
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Bullish momentum buy setups</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Short Breakdowns</span>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-2xl font-bold font-mono text-rose-600">
              {shortCount} Setups
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Bearish momentum sell setups</p>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Controls & Filter Bar ── */}
      <Card className="border-slate-200/90 bg-white shadow-xs rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Direction Filter Pills */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-50 border border-slate-200/80">
              {(["ALL", "LONG", "SHORT"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirFilter(d)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5",
                    dirFilter === d
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {d === "LONG" ? (
                    <>
                      <TrendingUp className="h-3 w-3 text-emerald-600" /> Long ({longCount})
                    </>
                  ) : d === "SHORT" ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-rose-600" /> Short ({shortCount})
                    </>
                  ) : (
                    `All Setups (${allResults.length})`
                  )}
                </button>
              ))}
            </div>

            {/* Target Profit Selector & Search */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Daily Target Pill */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 bg-slate-50 text-xs">
                <Target className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-[11px] font-semibold text-slate-500">Target Profit:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-bold text-slate-900">₹</span>
                  <input
                    type="number"
                    value={targetRs}
                    onChange={(e) => setTargetRs(Number(e.target.value))}
                    className="w-16 bg-transparent font-mono font-bold text-slate-900 focus:outline-none text-xs"
                  />
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 pr-3 text-xs bg-white border-slate-200 text-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Candidate Picks Grid ── */}
      {initialLoad ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Loading Intraday Setups...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-16 text-center space-y-3">
            <Zap className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">No Active Intraday Picks Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Run a fresh market scan or adjust your filters to identify high probability breakout candidates.
            </p>
            <Button
              onClick={handleScan}
              disabled={loading}
              className="mt-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold gap-1.5 shadow-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Start New Scan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((pick) => (
            <PickCard
              key={`${pick.symbol}-${pick.pattern}-${getDirection(pick)}`}
              r={pick}
              targetRs={targetRs}
              onQuickTrade={setTradeStock}
            />
          ))}
        </div>
      )}

      {/* ── 5. Information & Safety Panel ── */}
      <Card className="border-slate-200/80 bg-slate-50/80 shadow-2xs rounded-xl">
        <CardContent className="p-5 text-xs text-slate-600 leading-relaxed space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider">
            <Info className="h-4 w-4 text-blue-600" /> Automated Risk & Execution Model
          </div>
          <p>
            Clicking <strong>⚡ Buy/Short</strong> triggers a pre-calculated bracket/intraday order structure with entry trigger, protective stop-loss, and multi-tier Fibonacci profit targets. All orders use <strong>MIS product type</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
