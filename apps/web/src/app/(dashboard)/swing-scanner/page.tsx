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
import { formatINR } from "@/lib/format";

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
  VCP: { label: "VCP Contraction", color: "text-signal", bg: "bg-signal-subtle border-signal/30" },
  ROCKET_BASE: { label: "Rocket Base", color: "text-warn", bg: "bg-warn-subtle border-warn/30" },
  TIGHT_AREA: { label: "Tight Area", color: "text-accent-foreground", bg: "bg-brand-subtle border-primary/30" },
  INTRADAY_MOMENTUM: { label: "Momentum Surge", color: "text-profit", bg: "bg-profit-subtle border-profit/30" },
  CUP_HANDLE: { label: "Cup & Handle", color: "text-profit", bg: "bg-profit-subtle border-profit/30" },
  DAILY_INSIDE: { label: "1D Inside", color: "text-loss", bg: "bg-loss-subtle border-loss/30" },
  WEEKLY_INSIDE: { label: "Weekly Inside", color: "text-accent-foreground", bg: "bg-brand-subtle border-primary/30" },
  MONTHLY_INSIDE: { label: "Monthly Inside", color: "text-signal", bg: "bg-signal-subtle border-signal/30" },
};


const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: "text-profit bg-profit-subtle border-profit/30",
  MEDIUM: "text-warn bg-warn-subtle border-warn/30",
  LOW: "text-foreground/75 bg-muted border-border",
};

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            score >= 75 ? "bg-profit" : score >= 55 ? "bg-warn/40" : "bg-muted-foreground/50"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold text-foreground/75 w-6 text-right">{score}</span>
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
    color: "text-foreground/75",
    bg: "bg-muted/50 border-border",
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

_Generated by Tradeio.site Momentum Scanner_`;

    navigator.clipboard.writeText(text);
    toast.success("Trade setup copied to clipboard!");
  };

  return (
    <Card
      className={cn(
        "border-border/90 bg-card  rounded-lg overflow-hidden hover:border-border hover:shadow-md transition-all group flex flex-col justify-between",
        r.confidence === "HIGH" && "border-profit/30 ring-1 ring-profit/10"
      )}
    >
      <div className="p-4 sm:p-5 space-y-3.5">
        {/* ─── 1. Header: Symbol, Price & Direction ─── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground group-hover:text-accent-foreground transition-colors">
                {r.symbol}
              </h3>
              <Badge variant="outline" className="text-[10px] font-semibold py-0.5 px-1.5 text-foreground/75 bg-muted/50">
                {r.exchange}
              </Badge>
              {isFnO && (
                <Badge className="text-[10px] font-semibold py-0.5 px-1.5 bg-brand-subtle text-accent-foreground border border-primary/80">
                  F&O ({lotSize})
                </Badge>
              )}
            </div>

            {/* Direction Tag */}
            <Badge
              className={cn(
                "text-[10.5px] font-semibold py-0.5 px-2 inline-flex items-center gap-1 rounded-md ",
                isLong
                  ? "bg-profit text-on-profit"
                  : "bg-loss text-on-loss"
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
                <Star className="h-3 w-3 inline mr-1 text-warn fill-warn" />
                {r.confidence} Conf.
              </Badge>
            </div>

            {/* Current Price */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground font-medium">LTP:</span>
              <span className="font-mono text-sm font-semibold text-foreground bg-muted px-2 py-0.5 rounded-md border border-border/70">
                ₹{fmt(r.currentPrice)}
              </span>
            </div>
          </div>
        </div>

        {/* ─── 2. Levels Grid (2x2 with Full Numbers) ─── */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {/* Entry */}
          <div className="rounded-lg bg-brand-subtle/80 border border-primary/90 p-2.5">
            <p className="text-[10px] text-accent-foreground font-semibold uppercase tracking-wider">Entry Level</p>
            <p className="text-sm font-semibold font-mono text-accent-foreground mt-0.5">₹{fmt(r.entryPrice)}</p>
          </div>

          {/* Stop Loss */}
          <div className="rounded-lg bg-loss-subtle/80 border border-loss/90 p-2.5">
            <p className="text-[10px] text-loss font-semibold uppercase tracking-wider">Stop Loss</p>
            <p className="text-sm font-semibold font-mono text-loss mt-0.5">₹{fmt(r.stopLoss)}</p>
          </div>

          {/* Target 1 */}
          <div className="rounded-lg bg-profit-subtle/80 border border-profit/90 p-2.5">
            <p className="text-[10px] text-profit font-semibold uppercase tracking-wider">Target 1</p>
            <p className="text-sm font-semibold font-mono text-profit mt-0.5">₹{fmt(r.target1)}</p>
          </div>

          {/* Target 2 */}
          <div className="rounded-lg bg-brand-subtle/80 border border-primary/90 p-2.5">
            <p className="text-[10px] text-accent-foreground font-semibold uppercase tracking-wider">Target 2</p>
            <p className="text-sm font-semibold font-mono text-accent-foreground mt-0.5">₹{fmt(r.target2)}</p>
          </div>
        </div>

        {/* ─── 3. Stats Row (Risk, RR, Contractions, Score, Volume) ─── */}
        <div className="rounded-lg bg-muted/50 border border-border p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-foreground/75 font-medium">
              <ShieldAlert className="h-3.5 w-3.5 text-loss" />
              <span>Risk: <strong>{r.riskPct.toFixed(1)}%</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground/75 font-medium">
              <ArrowUpRight className="h-3.5 w-3.5 text-profit" />
              <span>R:R Ratio: <strong>{r.riskReward}:1</strong></span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-medium">Score:</span>
              <ScoreBar score={r.score} />
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span
                className={cn(
                  "font-semibold",
                  r.volumeSignal === "DRYING"
                    ? "text-profit"
                    : r.volumeSignal === "EXPANDING"
                    ? "text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                {r.volumeSignal === "DRYING" ? "Vol: Drying" : r.volumeSignal === "EXPANDING" ? "Vol: High" : "Vol: Normal"}
              </span>
            </div>
          </div>
        </div>

        {/* ─── 4. Target Sizing Plan ─── */}
        <div className="rounded-lg bg-muted/35 border border-border/80 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground/75">Target Profit Goal:</span>
            <span className="font-mono font-semibold text-profit">{formatINR(targetRs)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-border/60">
            <div>
              <p className="text-[9.5px] text-muted-foreground font-semibold uppercase">Quantity</p>
              <p className="text-xs font-semibold font-mono text-foreground mt-0.5">
                {qty} {isFnO ? `(${lots}L)` : "Qty"}
              </p>
            </div>
            <div className="border-x border-border/70 px-1">
              <p className="text-[9.5px] text-muted-foreground font-semibold uppercase">Capital</p>
              <p className="text-xs font-semibold font-mono text-foreground mt-0.5">
                {formatINR(Math.round(invest), { decimals: 0 })}
              </p>
            </div>
            <div>
              <p className="text-[9.5px] text-muted-foreground font-semibold uppercase">Est. Profit</p>
              <p className="text-xs font-semibold font-mono text-profit mt-0.5">
                +{formatINR(Math.round(profit), { decimals: 0 })}
              </p>
            </div>
          </div>
        </div>

        {/* ─── 5. Actions: Quick Trade & Share ─── */}
        <div className="flex items-center gap-2 pt-1 w-full min-w-0">
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
                product: isLong ? "NRML" : "MIS",
                isFnO,
                lotSize,
              })
            }
            className={cn(
              "flex-1 min-w-0 h-9 px-2.5 sm:px-4 text-xs font-semibold uppercase tracking-wider rounded-lg  gap-1.5 transition-all overflow-hidden flex items-center justify-center",
              isLong ? "bg-profit hover:bg-profit/90 text-on-profit" : "bg-loss hover:bg-loss/90 text-on-loss"
            )}
          >
            <Zap className="h-4 w-4 shrink-0" />
            <span className="truncate">{isLong ? "Buy" : "Short"} {r.symbol}</span>
            <span className="hidden sm:inline text-[10px] opacity-80 shrink-0">({isLong ? "Delivery" : "Intraday"})</span>
          </Button>

          <Button
            variant="outline"
            size="icon" aria-label="Copy trade setup"
            onClick={handleCopy}
            title="Copy trade setup"
            className="h-9 w-9 shrink-0 rounded-lg border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Share2 className="h-4 w-4 shrink-0" />
          </Button>
        </div>

        {/* ─── 6. Expand Analysis Notes ─── */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground/75 transition-colors uppercase tracking-wider pt-1"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide Technical Analysis" : "View Technical Analysis"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 border-t border-border pt-2.5 text-xs text-foreground/75">
            {r.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2 bg-muted/35 p-2 rounded-lg border border-border">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
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
  const [isScanning, setIsScanning] = useState(false);

  const loadLast = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await swingApi.last({ pageSize: 1000 });
      if (res.data?.data) {
        const { results, isScanning: serverScanning, ...meta } = res.data.data as any;
        setAllResults(results ?? []);
        setScanMeta(meta);
        if (typeof serverScanning === "boolean") {
          setIsScanning(serverScanning);
        }
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

  // Auto-poll while background scan is running
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      loadLast(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [isScanning, loadLast]);

  useEffect(() => {
    setPage(1);
  }, [filter, sortBy, searchQuery]);

  async function runScan() {
    setIsScanning(true);
    toast.info("Swing scan initiated! Analyzing Nifty universe in background…");
    try {
      const res = await swingApi.run();
      toast.success(res.data?.data?.message || res.data?.message || "Scan started! Setups will auto-update.");
      setTimeout(() => loadLast(true), 2500);
    } catch (err: any) {
      setIsScanning(false);
      const msg = err?.response?.data?.message || err?.message || "Failed to start market scan. Please try again.";
      toast.error(msg);
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
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ScanSearch className="h-6 w-6 text-accent-foreground" />
            Momentum Swing Scanner
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            VCP · Rocket Base · Multi-Timeframe Inside Candles — High probability swing setups
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {scan && (
            <p className="text-xs text-muted-foreground font-mono hidden sm:block">
              Last: {new Date(scan.scannedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          <Button
            onClick={runScan}
            disabled={loading || isScanning}
            className="h-9 px-4 bg-primary hover:bg-brand-hover text-primary-foreground font-semibold text-xs gap-1.5"
          >
            {loading || isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {loading || isScanning ? "Scanning Universe..." : "Run Swing Scan"}
          </Button>
        </div>
      </div>

      {/* ── Active Background Scan Banner ── */}
      {isScanning && (
        <div className="bg-brand-subtle/80 border border-primary/80 rounded-lg p-3.5 sm:p-4 flex items-center justify-between gap-3 text-accent-foreground">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold">Market Scan Running in Background</p>
              <p className="text-[11px] text-accent-foreground">Analyzing stocks on NSE. Setups and charts will refresh automatically as results arrive.</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex text-[11px] font-mono bg-brand-subtle text-accent-foreground px-2.5 py-1 rounded-full font-semibold shrink-0">
            Auto-sync Active
          </span>
        </div>
      )}

      {/* ── 2. Stat Summary Bar ── */}
      {scan && (
        <div className="bg-card border border-border/90 rounded-lg p-4 sm:p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {/* Universe */}
            <div className="flex items-center gap-3 p-1">
              <div className="h-10 w-10 rounded-lg bg-brand-subtle text-accent-foreground flex items-center justify-center shrink-0">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Scanned Universe</p>
                <p className="text-lg sm:text-xl font-semibold font-mono text-foreground">{scan.totalScanned} Stocks</p>
              </div>
            </div>

            {/* Total Setups */}
            <div className="flex items-center gap-3 p-1 pt-3 sm:pt-1 sm:pl-4">
              <div className="h-10 w-10 rounded-lg bg-profit-subtle text-profit flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Setups</p>
                <p className="text-lg sm:text-xl font-semibold font-mono text-foreground">{scan.totalResults} Found</p>
              </div>
            </div>

            {/* Displayed */}
            <div className="flex items-center gap-3 p-1 pt-3 sm:pt-1 sm:pl-4">
              <div className="h-10 w-10 rounded-lg bg-warn-subtle text-warn flex items-center justify-center shrink-0">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Displayed Batch</p>
                <p className="text-lg sm:text-xl font-semibold font-mono text-foreground">{filtered.length} Setups</p>
              </div>
            </div>

            {/* Prime Setups */}
            <div className="flex items-center gap-3 p-1 pt-3 sm:pt-1 sm:pl-4">
              <div className="h-10 w-10 rounded-lg bg-profit-subtle text-profit flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">High Confidence</p>
                <p className="text-lg sm:text-xl font-semibold font-mono text-profit">{highConf} Prime</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Filters + Sort Toolbar ── */}
      <Card className="border-border/90 bg-card rounded-lg">
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search + Pattern filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
              <div className="relative min-w-[180px] sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search symbol or pattern..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 pr-3 text-xs bg-card border-border text-foreground focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Pattern Pills */}
              <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border/80 overflow-x-auto scrollbar-hide">
                {(["ALL", "VCP", "ROCKET_BASE", "TIGHT_AREA", "DAILY_INSIDE", "WEEKLY_INSIDE", "MONTHLY_INSIDE", "INTRADAY_MOMENTUM"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md transition-all shrink-0",
                        filter === f
                          ? "bg-card text-foreground  font-semibold"
                          : "text-muted-foreground hover:text-foreground"
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
              <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border px-2.5 sm:px-3 py-1.5 bg-muted/50 text-xs">
                <Target className="h-3.5 w-3.5 text-accent-foreground shrink-0" />
                <span className="text-[10.5px] sm:text-[11px] font-semibold text-muted-foreground">Target:</span>
                <div className="flex items-center gap-0.5">
                  <span className="font-mono font-semibold text-foreground">₹</span>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={targetRs}
                    onChange={(e) => setTargetRs(Number(e.target.value))}
                    className="w-14 sm:w-16 bg-transparent font-mono font-semibold text-foreground focus:outline-none text-xs"
                  />
                </div>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-9 px-2.5 rounded-lg bg-card border border-border text-xs font-medium text-foreground/75 focus:outline-none focus:ring-1 focus:ring-primary"
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
          <Loader2 className="h-8 w-8 animate-spin text-accent-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Loading Swing Setups...
          </p>
        </div>
      ) : !scan || filtered.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-16 text-center space-y-3">
            <ScanSearch className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <h3 className="text-base font-semibold text-foreground">
              {searchQuery ? "No matching setups found" : "No active swing setups"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? "Try clearing your search query to see all available candidates."
                : "Run a fresh market scan or select another pattern filter."}
            </p>
            <Button
              onClick={runScan}
              disabled={loading || isScanning}
              className="mt-2 h-9 px-4 bg-primary hover:bg-brand-hover text-primary-foreground text-xs font-semibold gap-1.5"
            >
              {loading || isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {loading || isScanning ? "Scanning Universe..." : "Start Swing Scan"}
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
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground font-medium">
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
        <Card className="border-border/80 bg-muted/40 rounded-lg">
          <CardContent className="p-5 text-xs text-foreground/75 leading-relaxed space-y-1.5">
            <p className="font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Info className="h-4 w-4 text-accent-foreground" /> Swing Trading Setup Reference
            </p>
            <p>• <strong>Entry</strong> — Buy trigger when price trades above pivot level (breakout confirmation)</p>
            <p>• <strong>Stop Loss</strong> — Mandatory risk exit if momentum fails</p>
            <p>• <strong>Target 1 / 2</strong> — Primary profit booking zones based on multi-timeframe Fibonacci expansions</p>
            <p>• <strong>VCP (Volatility Contraction Pattern)</strong> — Tightening swing contractions before explosive expansion</p>
            <p>• <strong>Rocket Base</strong> — Tight base consolidation following strong preceding momentum</p>
            <p className="text-warn font-medium pt-1">
              ⚠ Always adhere to disciplined risk management and position sizing rules.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
