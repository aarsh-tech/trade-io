"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { swingApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ScanSearch,
  Loader2,
  Target,
  ChevronDown,
  ChevronUp,
  Share2,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCcw
} from "lucide-react";
import { OrderWindow, type BracketPreset } from "@/components/dashboard/OrderWindow";
import { useMarketData } from "@/hooks/use-market-data";

interface TradeSetup {
  symbol: string;
  exchange: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  currentPrice: number;
  suggestedQty?: number;
  product?: "MIS" | "NRML";
  isFnO?: boolean;
  lotSize?: number;
}
import { Card, CardContent } from "@/components/ui/card";
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
const PATTERN_META: Record<string, { label: string; color: string }> = {
  VCP: { label: "VCP Contraction", color: "text-signal" },
  ROCKET_BASE: { label: "Rocket Base", color: "text-warn" },
  TIGHT_AREA: { label: "Tight Area", color: "text-accent-foreground" },
  INTRADAY_MOMENTUM: { label: "Momentum Surge", color: "text-profit" },
  CUP_HANDLE: { label: "Cup & Handle", color: "text-profit" },
  DAILY_INSIDE: { label: "1D Inside", color: "text-loss" },
  WEEKLY_INSIDE: { label: "Weekly Inside", color: "text-accent-foreground" },
  MONTHLY_INSIDE: { label: "Monthly Inside", color: "text-signal" },
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
  livePrice,
  onQuickTrade,
}: {
  r: ScanResult;
  targetRs: number;
  livePrice?: number | null;
  onQuickTrade: (stock: TradeSetup) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pm = PATTERN_META[r.pattern] ?? {
    label: r.pattern,
    color: "text-foreground/75",
  };
  const direction = getDirection(r);
  const isLong = direction === "LONG";
  const isLive = typeof livePrice === "number" && livePrice > 0;
  const currentPrice = isLive ? livePrice : r.currentPrice;
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
Current Price: ₹${fmt(currentPrice)}

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
        "border-border/90 bg-card rounded overflow-hidden hover:border-foreground/20 transition-colors flex flex-col justify-between",
        r.confidence === "HIGH" && "border-l-2 border-l-profit"
      )}
    >
      <div className="p-3.5 sm:p-4 space-y-3">
        {/* ─── 1. Header: Symbol, Price & Direction ─── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{r.symbol}</h3>
            <span className="text-[10px] text-muted-foreground">{r.exchange}</span>
            {isFnO && <span className="text-[10px] text-muted-foreground">F&O ({lotSize})</span>}
          </div>
          <span className={cn("text-[11px] font-semibold", isLong ? "text-profit" : "text-loss")}>
            {isLong ? "LONG" : "SHORT"}
          </span>
        </div>

        {/* Sub-row: pattern, confidence, LTP */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
            <span className={pm.color}>{pm.label}</span>
            <span>·</span>
            <span className={r.confidence === "HIGH" ? "text-profit" : r.confidence === "MEDIUM" ? "text-warn" : "text-muted-foreground"}>
              {r.confidence} conf.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isLive ? "bg-profit animate-pulse" : "bg-muted-foreground/40")} title={isLive ? "Live tick" : "Last scan snapshot"} />
            <span className="font-mono font-semibold text-foreground">₹{fmt(currentPrice)}</span>
          </div>
        </div>

        {/* ─── 2. Levels row ─── */}
        <div className="grid grid-cols-4 gap-1 text-center border-y border-border py-2">
          <div>
            <p className="text-[9.5px] text-muted-foreground uppercase">Entry</p>
            <p className="text-xs font-semibold font-mono text-foreground">₹{fmt(r.entryPrice)}</p>
          </div>
          <div>
            <p className="text-[9.5px] text-muted-foreground uppercase">SL</p>
            <p className="text-xs font-semibold font-mono text-loss">₹{fmt(r.stopLoss)}</p>
          </div>
          <div>
            <p className="text-[9.5px] text-muted-foreground uppercase">T1</p>
            <p className="text-xs font-semibold font-mono text-profit">₹{fmt(r.target1)}</p>
          </div>
          <div>
            <p className="text-[9.5px] text-muted-foreground uppercase">T2</p>
            <p className="text-xs font-semibold font-mono text-profit">₹{fmt(r.target2)}</p>
          </div>
        </div>

        {/* ─── 3. Stats row: Risk, RR, Score, Volume ─── */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Risk <strong className="text-foreground">{r.riskPct.toFixed(1)}%</strong></span>
          <span>R:R <strong className="text-foreground">{r.riskReward}:1</strong></span>
          <div className="flex items-center gap-1.5">
            <span>Score</span>
            <ScoreBar score={r.score} />
          </div>
          <span
            className={cn(
              r.volumeSignal === "DRYING" ? "text-profit" : r.volumeSignal === "EXPANDING" ? "text-accent-foreground" : "text-muted-foreground"
            )}
          >
            {r.volumeSignal === "DRYING" ? "Vol: Drying" : r.volumeSignal === "EXPANDING" ? "Vol: High" : "Vol: Normal"}
          </span>
        </div>

        {/* ─── 4. Target Sizing Plan ─── */}
        <div className="flex items-center justify-between text-[11px] border-t border-border pt-2">
          <span className="text-muted-foreground">
            Qty <strong className="text-foreground font-mono">{qty}{isFnO ? ` (${lots}L)` : ""}</strong>
          </span>
          <span className="text-muted-foreground">
            Capital <strong className="text-foreground font-mono">{formatINR(Math.round(invest), { decimals: 0 })}</strong>
          </span>
          <span className="text-muted-foreground">
            Est. profit <strong className="text-profit font-mono">+{formatINR(Math.round(profit), { decimals: 0 })}</strong>
          </span>
        </div>

        {/* ─── 5. Actions: Quick Trade & Share ─── */}
        <div className="flex items-center gap-2 w-full min-w-0">
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
                currentPrice,
                suggestedQty: qty,
                product: isLong ? "NRML" : "MIS",
                isFnO,
                lotSize,
              })
            }
            className={cn(
              "flex-1 min-w-0 h-8 px-2.5 sm:px-4 text-xs font-medium rounded-sm gap-1.5 transition-colors overflow-hidden flex items-center justify-center",
              isLong ? "bg-profit hover:bg-profit/90 text-on-profit" : "bg-loss hover:bg-loss/90 text-on-loss"
            )}
          >
            <span className="truncate">{isLong ? "Buy" : "Short"} {r.symbol}</span>
            <span className="hidden sm:inline text-[10px] opacity-80 shrink-0">({isLong ? "Delivery" : "Intraday"})</span>
          </Button>

          <Button
            variant="outline"
            size="icon" aria-label="Copy trade setup"
            onClick={handleCopy}
            title="Copy trade setup"
            className="h-8 w-8 shrink-0 rounded-sm border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
          </Button>
        </div>

        {/* ─── 6. Expand Analysis Notes ─── */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground/75 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide technical analysis" : "View technical analysis"}
        </button>

        {expanded && (
          <div className="space-y-1.5 border-t border-border pt-2.5 text-xs text-foreground/75">
            {r.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
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
  const [tradeStock, setTradeStock] = useState<TradeSetup | null>(null);
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

  // Live LTP for whatever's on the currently displayed page (scan levels stay from the snapshot; only the LTP badge ticks live).
  const visibleSymbols = useMemo(() => filtered.map((r) => r.symbol), [filtered]);
  const { getPrice } = useMarketData(visibleSymbols);

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
      <OrderWindow
        isOpen={tradeStock !== null}
        onClose={() => setTradeStock(null)}
        symbol={tradeStock?.symbol ?? ""}
        exchange={tradeStock?.exchange ?? "NSE"}
        type={tradeStock?.direction === "SHORT" ? "SELL" : "BUY"}
        ltp={tradeStock?.currentPrice ?? 0}
        lotSize={tradeStock?.lotSize}
        targetRs={targetRs}
        bracket={tradeStock ? {
          entryPrice: tradeStock.entryPrice,
          stopLoss: tradeStock.stopLoss,
          target1: tradeStock.target1,
          target2: tradeStock.target2,
          product: tradeStock.product,
          isFnO: tradeStock.isFnO,
          suggestedQty: tradeStock.suggestedQty,
        } : undefined}
      />

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
        <div className="border border-border rounded p-3 flex items-center justify-between gap-3 text-accent-foreground">
          <div className="flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Market scan running in background</p>
              <p className="text-[11px] text-muted-foreground">Analyzing stocks on NSE. Setups will refresh automatically as results arrive.</p>
            </div>
          </div>
          <span className="hidden sm:inline text-[11px] text-muted-foreground shrink-0">Auto-sync active</span>
        </div>
      )}

      {/* ── 2. Stat Strip ── */}
      {scan && (
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border border border-border rounded bg-card overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Scanned Universe</p>
            <p className="text-xl font-semibold font-mono text-foreground mt-0.5">{scan.totalScanned}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Total Setups</p>
            <p className="text-xl font-semibold font-mono text-foreground mt-0.5">{scan.totalResults}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] text-muted-foreground">Displayed Batch</p>
            <p className="text-xl font-semibold font-mono text-foreground mt-0.5">{filtered.length}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] text-muted-foreground">High Confidence</p>
            <p className="text-xl font-semibold font-mono text-profit mt-0.5">{highConf}</p>
          </div>
        </div>
      )}

      {/* ── 3. Filters + Sort Toolbar ── */}
      <Card className="border-border/90 bg-card rounded">
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
              "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 transition-opacity",
              loading ? "opacity-50" : "opacity-100"
            )}
          >
            {filtered.map((r) => (
              <ResultCard
                key={`${r.symbol}-${r.pattern}-${getDirection(r)}`}
                r={r}
                targetRs={targetRs}
                livePrice={getPrice(r.symbol)}
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
        <Card className="border-border/80 bg-muted/40 rounded">
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
