"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { swingApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Search,
  Share2,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
  Sparkles,
  RefreshCcw
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";

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
  livePrice,
  onQuickTrade,
}: {
  r: ScanResult;
  targetRs: number;
  livePrice?: number | null;
  onQuickTrade: (stock: TradeSetup) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const direction = getDirection(r);
  const isLong = direction === "LONG";
  const isLive = typeof livePrice === "number" && livePrice > 0;
  const currentPrice = isLive ? livePrice : r.currentPrice;

  const profitPerShare = Math.abs(r.target1 - r.entryPrice);
  const qty = profitPerShare > 0 ? Math.ceil(targetRs / profitPerShare) : r.suggestedQty;
  const capital = qty * r.entryPrice;
  const stopLossAmount = qty * Math.abs(r.entryPrice - r.stopLoss);

  const handleShare = () => {
    const side = isLong ? "BUY (Long)" : "SELL (Short)";
    const text = `🚀 *Intraday Pick — ${side}*
Stock: *${r.symbol}* (${r.exchange})
Price: ₹${fmt(currentPrice)}

Entry: ₹${fmt(r.entryPrice)}
Stop Loss: ₹${fmt(r.stopLoss)} (${r.riskPct.toFixed(1)}% Risk)
Target 1: ₹${fmt(r.target1)}
Target 2: ₹${fmt(r.target2)}

Qty: ${qty} | Capital: ₹${Math.round(capital).toLocaleString("en-IN")}
_Powered by Tradeio.site Intelligence_`;
    navigator.clipboard.writeText(text);
    toast.success("Setup copied to clipboard!");
  };

  return (
    <Card
      className={cn(
        "border-border/90 bg-card rounded overflow-hidden hover:border-foreground/20 transition-colors flex flex-col justify-between",
        r.confidence === "HIGH" && "border-l-2 border-l-profit"
      )}
    >
      <div className="p-3.5 sm:p-4 space-y-3">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{r.symbol}</h3>
            <span className="text-[10px] text-muted-foreground">{r.exchange}</span>
            <span className={cn("text-[11px] font-semibold", isLong ? "text-profit" : "text-loss")}>
              {isLong ? "LONG" : "SHORT"}
            </span>
          </div>
          <button
            onClick={handleShare}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground/75 transition-colors shrink-0"
            title="Copy trade setup"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Sub-row: LTP, confidence, score */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isLive ? "bg-profit animate-pulse" : "bg-muted-foreground/40")} title={isLive ? "Live tick" : "Last scan snapshot"} />
            <span className="font-mono font-semibold text-foreground">₹{fmt(currentPrice)}</span>
          </div>
          <span className={cn(r.confidence === "HIGH" ? "text-profit" : r.confidence === "MEDIUM" ? "text-warn" : "text-muted-foreground")}>
            {r.confidence} conf. · Score {r.score}
          </span>
        </div>

        {/* Levels row */}
        <div className="grid grid-cols-4 gap-1 text-center border-y border-border py-2">
          <div>
            <p className="text-[9.5px] text-muted-foreground uppercase">{isLong ? "Buy Above" : "Sell Below"}</p>
            <p className={cn("text-xs font-semibold font-mono", isLong ? "text-profit" : "text-loss")}>₹{fmt(r.entryPrice)}</p>
          </div>
          <div>
            <p className="text-[9.5px] text-muted-foreground uppercase">SL ({r.riskPct.toFixed(1)}%)</p>
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

        {/* Goal plan */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">
            Qty <strong className="text-foreground font-mono">{qty}</strong>
          </span>
          <span className="text-muted-foreground">
            Capital <strong className="text-foreground font-mono">{formatINR(Math.round(capital), { decimals: 0 })}</strong>
          </span>
          <span className="text-muted-foreground">
            Max risk <strong className="text-loss font-mono">{formatINR(Math.round(stopLossAmount), { decimals: 0 })}</strong>
          </span>
        </div>

        {/* One-Click Trade Button */}
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
              product: "MIS",
            })
          }
          className={cn(
            "w-full min-w-0 h-8 px-3 text-xs font-medium rounded-sm gap-1.5 flex items-center justify-center overflow-hidden",
            isLong
              ? "bg-profit hover:bg-profit/90 text-on-profit"
              : "bg-loss hover:bg-loss/90 text-on-loss"
          )}
        >
          <span className="truncate">{isLong ? "Buy" : "Short"} {r.symbol}</span>
          <span className="hidden sm:inline text-[10px] opacity-80 shrink-0">(MIS)</span>
        </Button>

        {/* Expand Notes */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground/75 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Hide details" : "View analysis notes"}
        </button>

        {expanded && (
          <div className="space-y-1.5 border-t border-border pt-2.5 text-xs text-foreground/75">
            {r.notes.map((note, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <div className="mt-1 h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
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
  const [tradeStock, setTradeStock] = useState<TradeSetup | null>(null);

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

  // Live LTP for the currently displayed picks (scan levels stay from the snapshot; only the LTP badge ticks live).
  const visibleSymbols = useMemo(() => filtered.map((r) => r.symbol), [filtered]);
  const { getPrice } = useMarketData(visibleSymbols);

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
            <Sparkles className="h-6 w-6 text-accent-foreground" />
            Smart Intraday Momentum Picks
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI-identified breakout & breakdown setups with automated SL, Target, and risk estimation
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <Button
            onClick={handleScan}
            disabled={loading}
            className="h-9 px-4 bg-primary hover:bg-brand-hover text-primary-foreground font-semibold text-xs gap-1.5"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {loading ? "Scanning Market..." : "Run Market Scan"}
          </Button>
        </div>
      </div>

      {/* ── 2. Stat Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border border border-border rounded bg-card overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Scanned Universe</p>
          <p className="text-xl font-semibold font-mono text-foreground mt-0.5">{scan?.totalScanned || 0}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Total Setups</p>
          <p className="text-xl font-semibold font-mono text-foreground mt-0.5">{allResults.length}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Long Breakouts</p>
          <p className="text-xl font-semibold font-mono text-profit mt-0.5">{longCount}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Short Breakdowns</p>
          <p className="text-xl font-semibold font-mono text-loss mt-0.5">{shortCount}</p>
        </div>
      </div>

      {/* ── 3. Controls & Filter Bar ── */}
      <Card className="border-border/90 bg-card rounded">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Direction Filter Pills */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/80">
              {(["ALL", "LONG", "SHORT"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirFilter(d)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5",
                    dirFilter === d
                      ? "bg-card text-foreground  font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d === "LONG" ? (
                    <>
                      <TrendingUp className="h-3 w-3 text-profit" /> Long ({longCount})
                    </>
                  ) : d === "SHORT" ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-loss" /> Short ({shortCount})
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
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 bg-muted/50 text-xs">
                <Target className="h-3.5 w-3.5 text-accent-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground">Target Profit:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-foreground">₹</span>
                  <input
                    type="number"
                    value={targetRs}
                    onChange={(e) => setTargetRs(Number(e.target.value))}
                    className="w-16 bg-transparent font-mono font-semibold text-foreground focus:outline-none text-xs"
                  />
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 pr-3 text-xs bg-card border-border text-foreground focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Candidate Picks Grid ── */}
      {initialLoad ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-accent-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Loading Intraday Setups...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-16 text-center space-y-3">
            <Zap className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <h3 className="text-base font-semibold text-foreground">No Active Intraday Picks Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Run a fresh market scan or adjust your filters to identify high probability breakout candidates.
            </p>
            <Button
              onClick={handleScan}
              disabled={loading}
              className="mt-2 h-9 px-4 bg-primary hover:bg-brand-hover text-primary-foreground text-xs font-semibold gap-1.5"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Start New Scan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((pick) => (
            <PickCard
              key={`${pick.symbol}-${pick.pattern}-${getDirection(pick)}`}
              r={pick}
              targetRs={targetRs}
              livePrice={getPrice(pick.symbol)}
              onQuickTrade={setTradeStock}
            />
          ))}
        </div>
      )}

      {/* ── 5. Information & Safety Panel ── */}
      <Card className="border-border/80 bg-muted/40 rounded">
        <CardContent className="p-5 text-xs text-foreground/75 leading-relaxed space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground uppercase tracking-wider">
            <Info className="h-4 w-4 text-accent-foreground" /> Automated Risk & Execution Model
          </div>
          <p>
            Clicking <strong>⚡ Buy/Short</strong> triggers a pre-calculated bracket/intraday order structure with entry trigger, protective stop-loss, and multi-tier Fibonacci profit targets. All orders use <strong>MIS product type</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
