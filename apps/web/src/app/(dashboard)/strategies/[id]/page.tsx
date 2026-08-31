"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMarketData } from "@/hooks/use-market-data";
import { brokerApi, getSocketBaseUrl, marketApi, strategyApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlarmClock,
  ArrowLeft,
  BarChart2,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  History,
  Info,
  Loader2,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Square,
  Target,
  Terminal,
  TrendingUp,
  X,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";

const LOT_SIZES: Record<string, number> = {
  NIFTY: 65,
  BANKNIFTY: 30,
  SENSEX: 20,
  FINNIFTY: 60,
  MIDCPNIFTY: 120,
};

function getLotSize(symbol: string) {
  const s = (symbol || "").toUpperCase();
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  for (const key in LOT_SIZES) {
    if (s.includes(key)) return LOT_SIZES[key];
  }
  return 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrategyConfig {
  symbol?: string;
  exchange?: string;
  instrumentType?: string;
  qty?: number;
  lots?: number;
  product?: string;
  stopLossRs?: number;
  targetRs?: number;
  maxTradesPerDay?: number;
  isPaperTrade?: boolean;
  emaPeriod?: number;
  riskRewardRatio?: number;
  moneyness?: string;
  enableDynamicAtr?: boolean;
  enableFakeoutReversal?: boolean;
  enableBreakevenTrail?: boolean;
  maxCapital?: number;
  target1RR?: number;
  target2RR?: number;
  minRvol?: number;
  triggerOffset?: number;
  enableHtfFilter?: boolean;
  enableTrailingSl?: boolean;
  dailyTargetRs?: number;
  dailyMaxLossRs?: number;
  [key: string]: any;
}

interface Execution {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  logs: string;
  errorMsg?: string;
}

interface Strategy {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isPaperTrade: boolean;
  autoStart?: boolean;
  brokerAccountId: string | null;
  config: StrategyConfig;
  brokerAccount?: { broker: string; clientId: string } | null;
  executions: Execution[];
  createdAt: string;
  performance?: {
    totalTrades: number;
    winRate: number;
    netPnl: number;
    profitFactor: number;
    avgProfitPerWin: number;
  };
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [liveState, setLiveState] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"LIVE" | "CONFIG" | "ANALYTICS" | "HISTORY">("LIVE");

  // Real-time market data subscription
  const symbolsToSubscribe = Array.from(
    new Set(
      [
        strategy?.config?.symbol,
        liveState?.activeSymbol,
        liveState?.optionSymbol,
        liveState?.futureSymbol,
      ].filter(Boolean) as string[]
    )
  );

  const { getPrice } = useMarketData(symbolsToSubscribe);
  const tradedSymbol =
    liveState?.optionSymbol ||
    liveState?.activeSymbol ||
    liveState?.futureSymbol ||
    strategy?.config?.symbol;
  const directLtp = tradedSymbol ? getPrice(tradedSymbol) : null;
  const ltp = directLtp || (strategy?.config?.symbol ? getPrice(strategy.config.symbol) : null);

  // Live P&L zero-latency calculations
  const currentLtp = directLtp || liveState?.currentLtp || liveState?.entryPrice || 0;
  const entryPrice = liveState?.entryPrice || 0;
  const qty = liveState?.executedQty || liveState?.qty || strategy?.config?.qty || 1;
  const isLong =
    liveState?.entryTriggered === "LONG" ||
    liveState?.signalSide === "CALL" ||
    !!liveState?.optionSymbol;

  let calculatedPnlRs = liveState?.pnlRs ?? 0;
  let calculatedPnlPct = liveState?.pnlPct ?? 0;
  if (
    entryPrice > 0 &&
    currentLtp > 0 &&
    (liveState?.entryTriggered || liveState?.stateType === "ACTIVE_POSITION")
  ) {
    const pnlPoints = isLong ? currentLtp - entryPrice : entryPrice - currentLtp;
    calculatedPnlRs = pnlPoints * qty;
    calculatedPnlPct = (pnlPoints / entryPrice) * 100;
  }
  const displayPnlRs =
    liveState?.pnlRs !== undefined && !directLtp
      ? liveState.pnlRs
      : (currentLtp > 0 && entryPrice > 0 ? calculatedPnlRs : liveState?.pnlRs ?? 0);
  const displayPnlPct =
    liveState?.pnlPct !== undefined && !directLtp
      ? liveState.pnlPct
      : (currentLtp > 0 && entryPrice > 0 ? calculatedPnlPct : liveState?.pnlPct ?? 0);
  const displayLtp = currentLtp || liveState?.currentLtp || liveState?.entryPrice || 0;

  const [editConfig, setEditConfig] = useState<Record<string, any>>({});
  const logsRef = useRef<HTMLDivElement>(null);

  // Test Order Modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testOrderLots, setTestOrderLots] = useState(1);
  const [testOrderBusy, setTestOrderBusy] = useState(false);
  const [isSquareOffBusy, setIsSquareOffBusy] = useState(false);
  const [testSymbol, setTestSymbol] = useState("");
  const [testExchange, setTestExchange] = useState("NSE");
  const [testProduct, setTestProduct] = useState("MIS");
  const [testPrice, setTestPrice] = useState("1.0");
  const [testOrderType, setTestOrderType] = useState("LIMIT");
  const [testVariety, setTestVariety] = useState("regular");

  const [testSearchQuery, setTestSearchQuery] = useState("");
  const [testSearchResults, setTestSearchResults] = useState<any[]>([]);
  const [isTestSearching, setIsTestSearching] = useState(false);
  const [testSelectedPrice, setTestSelectedPrice] = useState<number | null>(null);

  // Live tick subscription for test instrument
  const symbolsToSubscribeTest =
    testSymbol && testExchange ? [`${testExchange}:${testSymbol}`] : [];
  const { prices: liveTestPrices } = useMarketData(symbolsToSubscribeTest);
  const currentLiveTestPrice =
    (testSymbol && testExchange && liveTestPrices[`${testExchange}:${testSymbol}`]) ||
    testSelectedPrice;

  useEffect(() => {
    if (strategy) {
      setTestSymbol(strategy.config.symbol || "AUTO");
      setTestExchange(strategy.config.exchange || "NSE");
      setTestProduct(strategy.config.product || "MIS");
    }
  }, [strategy]);

  const load = useCallback(async () => {
    try {
      const [stRes, statusRes] = await Promise.all([
        strategyApi.get(id),
        strategyApi.status(id),
      ]);
      setStrategy(stRes.data?.data ?? null);
      setLiveLogs(statusRes.data?.data?.logs ?? []);
      setLiveState(statusRes.data?.data?.state ?? null);
      setActiveOrders(statusRes.data?.data?.orders ?? []);
    } catch {
      toast.error("Failed to load strategy");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Periodic status poll fallback (every 3s) while strategy is actively running
  useEffect(() => {
    if (!strategy?.isActive) return;
    const interval = setInterval(async () => {
      try {
        const statusRes = await strategyApi.status(id);
        if (statusRes.data?.data) {
          if (statusRes.data.data.logs) setLiveLogs(statusRes.data.data.logs);
          if (statusRes.data.data.state !== undefined) setLiveState(statusRes.data.data.state);
          if (statusRes.data.data.orders) setActiveOrders(statusRes.data.data.orders);
        }
      } catch { }
    }, 3000);
    return () => clearInterval(interval);
  }, [id, strategy?.isActive]);

  // Real-time WebSockets for zero-latency strategy updates
  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket = io(`${getSocketBaseUrl()}/strategy`, {
      transports: ["websocket"],
      auth: { token },
    });

    socket.on("connect", () => {
      socket.emit("subscribe", { strategyId: id });
    });

    socket.on(
      "strategy-event",
      (payload: { logs?: string[]; state?: any; orders?: any[] }) => {
        if (payload.logs) setLiveLogs(payload.logs);
        if (payload.state !== undefined) setLiveState(payload.state);
        if (payload.orders) setActiveOrders(payload.orders);
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [id]);

  useEffect(() => {
    if (logsRef.current && showLogs) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [liveLogs, showLogs]);

  async function toggleEngine() {
    if (!strategy) return;
    setBusy(true);
    try {
      if (strategy.isActive) {
        await strategyApi.stop(id);
        toast.success(`"${strategy.name}" stopped`);
      } else {
        await strategyApi.start(id);
        toast.success(`"${strategy.name}" started — engine running`);
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoStart() {
    if (!strategy) return;
    setBusy(true);
    try {
      await strategyApi.setAutoStart(strategy.id, !strategy.autoStart);
      toast.success(
        !strategy.autoStart
          ? `✅ "${strategy.name}" will auto-start at 09:15 AM`
          : `"${strategy.name}" auto-start disabled`
      );
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update auto-start");
    } finally {
      setBusy(false);
    }
  }

  async function handleInstantSquareOff() {
    if (!strategy) return;
    setIsSquareOffBusy(true);
    try {
      const res = await strategyApi.squareOff(id);
      if (res.data?.success) {
        toast.success(res.data?.data?.message || "Position squared off successfully!");
      } else {
        toast.error(res.data?.message || "Failed to square off position");
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Square off request failed");
    } finally {
      setIsSquareOffBusy(false);
    }
  }

  async function saveConfig() {
    setBusy(true);
    try {
      const merged = { ...strategy!.config, ...editConfig };
      await strategyApi.update(id, { config: JSON.stringify(merged) });
      toast.success("Configuration updated successfully!");
      setEditing(false);
      await load();
    } catch {
      toast.error("Failed to save config");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestSymbolSearch(q: string) {
    setTestSearchQuery(q);
  }

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (testSearchQuery.length < 2) {
        setTestSearchResults([]);
        return;
      }
      setIsTestSearching(true);
      try {
        const res = await marketApi.search(testSearchQuery, strategy?.brokerAccountId);
        setTestSearchResults(res.data?.data ?? []);
      } catch {
        setTestSearchResults([]);
      } finally {
        setIsTestSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [testSearchQuery, strategy?.brokerAccountId]);

  function selectTestInstrument(item: any) {
    setTestSymbol(item.symbol);
    setTestExchange(item.exchange);
    const itemPrice = item.ltp || item.ltpNSE || item.price || null;
    setTestSelectedPrice(itemPrice);
    if (itemPrice) {
      setTestPrice(itemPrice.toString());
    }
    setTestSearchQuery("");
    setTestSearchResults([]);
  }

  async function handleTestOrder() {
    if (!strategy?.brokerAccountId) {
      toast.error("No broker account connected");
      return;
    }
    setTestOrderBusy(true);
    try {
      const lotSize = getLotSize(testSymbol);
      const qty = testOrderLots * lotSize;
      const res = await brokerApi.placeOrder(strategy.brokerAccountId, {
        symbol: testSymbol,
        exchange: testExchange,
        side: "BUY",
        orderType: testOrderType,
        product: testProduct || strategy.config.product,
        qty: qty,
        price: testOrderType === "LIMIT" ? Number(testPrice) : undefined,
        variety: testVariety,
      });
      toast.success("Test order submitted successfully!");
      setIsTestModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Test order failed");
    } finally {
      setTestOrderBusy(false);
    }
  }

  function copyLogsToClipboard() {
    if (liveLogs.length === 0) return;
    navigator.clipboard.writeText(liveLogs.join("\n"));
    toast.success("Console logs copied to clipboard");
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <Bot className="w-5 h-5 text-primary absolute" />
        </div>
        <p className="text-xs font-medium text-muted-foreground animate-pulse">
          Connecting to strategy runtime & live telemetry...
        </p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="text-center py-20 bg-card/30 rounded-2xl border border-border/60 max-w-lg mx-auto mt-10 p-8">
        <Bot className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <h2 className="text-lg font-bold">Strategy Not Found</h2>
        <p className="text-xs text-muted-foreground mt-1">
          This strategy may have been deleted or moved.
        </p>
        <Link href="/strategies">
          <Button variant="outline" size="sm" className="mt-4 gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Strategies
          </Button>
        </Link>
      </div>
    );
  }

  const cfg = strategy.config;
  const is15Min = strategy.type === "BREAKOUT_15MIN";
  const isEmaVwap = strategy.type === "EMA_VWAP_CROSSOVER";
  const isNiftyScalper = strategy.type === "NIFTY_OPTIONS_SCALPER";
  const isStockOptions = strategy.type === "STOCK_OPTIONS_BUYING";
  const isDailyScalper = strategy.type === "DAILY_SCALPER";

  return (
    <div className="space-y-6 pb-16 animate-[fade-up_0.4s_ease_both]">
      {/* ─── Breadcrumb & Top Command Header ─── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/strategies">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl bg-card border-border/80 hover:bg-accent shrink-0 shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold tracking-tight truncate max-w-[320px] sm:max-w-md">
                {strategy.name}
              </h1>

              {/* Status Pill */}
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border shadow-2xs",
                  strategy.isActive
                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border/70"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    strategy.isActive ? "bg-emerald-500 animate-ping" : "bg-slate-400"
                  )}
                />
                {strategy.isActive ? "LIVE RUNNING" : "PAUSED"}
              </div>

              {strategy.isPaperTrade && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-bold"
                >
                  Paper Trade
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground/80">
                {cfg.symbol || "AUTO"}
              </span>
              <span>•</span>
              <span>{cfg.exchange || "NSE"}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                {strategy.brokerAccount
                  ? `${strategy.brokerAccount.broker} (${strategy.brokerAccount.clientId})`
                  : "Virtual Paper Broker"}
              </span>
            </p>
          </div>
        </div>

        {/* Top Control Actions */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={busy}
            className="h-9 px-3 text-xs gap-1.5 bg-card border-border/80 hover:bg-accent/60 shadow-xs"
            title="Refresh Status & Telemetry"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Auto-Start Arm Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={toggleAutoStart}
            title={
              strategy.autoStart
                ? "Auto-Start Armed (Starts at 09:15 AM) — Click to disable"
                : "Auto-Start Disarmed — Click to arm for 09:15 AM"
            }
            className={cn(
              "h-9 px-3 text-xs gap-1.5 rounded-xl transition-all border font-semibold shadow-xs",
              strategy.autoStart
                ? "bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20"
                : "text-muted-foreground hover:text-amber-600 hover:border-amber-500/30 bg-card"
            )}
          >
            <AlarmClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {strategy.autoStart ? "09:15 AM Armed" : "Auto-Start"}
            </span>
          </Button>

          {/* Test Order Trigger */}
          <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 shadow-xs font-semibold rounded-xl"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Test Order</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[480px] p-5 sm:p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Send className="h-5 w-5 text-amber-500" />
                  Place Broker Test Order
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Execute an instant order test using your connected{" "}
                  <strong>{strategy.brokerAccount?.broker || "Broker"}</strong> account.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Search Instrument
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="e.g. RELIANCE, BANKNIFTY 48000 CE..."
                      value={testSearchQuery}
                      onChange={(e) => handleTestSymbolSearch(e.target.value)}
                      className="bg-secondary/40 border-border/80 pr-10 text-xs h-9"
                    />
                    {isTestSearching && (
                      <div className="absolute right-3 top-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                      </div>
                    )}
                  </div>

                  {testSearchResults.length > 0 && (
                    <div className="mt-1 bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-border/60 z-50">
                      {testSearchResults.map((item) => {
                        const itemPrice = item.ltp || item.ltpNSE || item.price;
                        return (
                          <button
                            key={`${item.exchange}:${item.symbol}`}
                            onClick={() => selectTestInstrument(item)}
                            className="w-full flex items-center justify-between p-2.5 hover:bg-accent transition-colors text-left group text-xs"
                          >
                            <div>
                              <p className="font-bold text-foreground group-hover:text-amber-500">
                                {item.symbol}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase truncate max-w-[180px]">
                                {item.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {itemPrice && (
                                <span className="font-bold text-emerald-500">
                                  ₹{Number(itemPrice).toFixed(2)}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[9px]">
                                {item.exchange}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected Instrument Pill */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                        Selected Symbol
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-sm font-extrabold text-foreground">
                          {testSymbol || "AUTO"}
                        </p>
                        {currentLiveTestPrice && (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            LTP ₹{Number(currentLiveTestPrice).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className="bg-amber-500 text-white font-bold text-[10px]">
                      {testExchange}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Product
                    </label>
                    <select
                      value={testProduct}
                      onChange={(e) => setTestProduct(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-secondary/30 px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="MIS">MIS (Intraday 5x)</option>
                      <option value="CNC">CNC (Delivery)</option>
                      <option value="NRML">NRML (Margin)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Order Type
                    </label>
                    <select
                      value={testOrderType}
                      onChange={(e) => setTestOrderType(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-secondary/30 px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="LIMIT">LIMIT Order</option>
                      <option value="MARKET">MARKET Order</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Variety
                    </label>
                    <select
                      value={testVariety}
                      onChange={(e) => setTestVariety(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-secondary/30 px-3 py-1 text-xs font-bold text-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="regular">REGULAR (Live Market)</option>
                      <option value="amo">AMO (After Market)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Limit Price (₹)
                    </label>
                    <Input
                      type="number"
                      step="0.05"
                      disabled={testOrderType === "MARKET"}
                      value={testPrice}
                      onChange={(e) => setTestPrice(e.target.value)}
                      className="h-9 text-xs bg-secondary/30"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-border/70">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Lots / Multiplier
                    </label>
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Total: {testOrderLots * getLotSize(testSymbol)} shares
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={testOrderLots}
                    onChange={(e) => setTestOrderLots(Number(e.target.value))}
                    className="h-9 text-xs font-bold bg-secondary/30"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  className="w-full h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                  disabled={testOrderBusy}
                  onClick={handleTestOrder}
                >
                  {testOrderBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Placing Test Order...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1.5" /> Confirm & Submit Order
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Primary Start / Stop Button */}
          <Button
            size="sm"
            disabled={busy}
            onClick={toggleEngine}
            className={cn(
              "h-9 px-4 text-xs font-bold gap-2 rounded-xl transition-all shadow-md",
              strategy.isActive
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25"
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : strategy.isActive ? (
              <>
                <Square className="h-3.5 w-3.5 fill-white" />
                Stop Engine
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-white" />
                Start Engine
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Top 4 Metric Overview Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Instrument
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                <BarChart2 className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-foreground">
                {cfg.symbol || "AUTO"}
              </span>
              <span className="text-[11px] text-muted-foreground">({cfg.exchange || "NSE"})</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Position Sizing
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                <Zap className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-foreground truncate">
                {cfg.symbol === "AUTO" ? "Auto (5x MIS)" : cfg.qty ? `${cfg.qty} Qty` : "Dynamic"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-500/80 uppercase tracking-wider">
                Stop Loss
              </span>
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600">
                <Shield className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-rose-600">
                ₹{cfg.stopLossRs ?? cfg.dailyMaxLossRs ?? "500"}
              </span>
              <span className="text-[10px] text-muted-foreground">Risk Cap</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-600/80 uppercase tracking-wider">
                Daily Target
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Target className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-emerald-600">
                ₹{cfg.targetRs ?? cfg.dailyTargetRs ?? "500"}
              </span>
              <span className="text-[10px] text-muted-foreground">1:1 Target</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── LIVE ACTIVE POSITION & RUNNING P&L HERO CARD ─── */}
      {strategy.isActive &&
        (liveState?.entryTriggered ||
          liveState?.stateType === "ACTIVE_POSITION" ||
          (liveState?.currentLtp && liveState?.entryPrice)) && (
          <Card className="border-2 border-emerald-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white shadow-2xl overflow-hidden relative rounded-2xl ring-1 ring-emerald-500/30">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
            <CardContent className="p-5 sm:p-6 relative z-10 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-black tracking-tight text-white">
                        {liveState.activeSymbol ||
                          liveState.optionSymbol ||
                          liveState.futureSymbol ||
                          strategy.config.symbol}
                      </h3>
                      <Badge
                        className={cn(
                          "text-[10px] font-black uppercase px-2.5 py-0.5",
                          liveState.entryTriggered === "LONG" || liveState.signalSide === "CALL"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        )}
                      >
                        {liveState.entryTriggered || liveState.signalSide || "ACTIVE POSITION"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300">
                        {liveState.qty || strategy.config.qty || 1}{" "}
                        {strategy.type.includes("OPTION") ? "Contracts" : "Shares"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {strategy.isPaperTrade
                          ? "📝 Paper Trade Engine"
                          : "⚡ Live Broker Real Execution"}
                      </span>
                      <span>•</span>
                      <span className="text-amber-400 font-medium">
                        ⏰ 03:15 PM IST Auto Square-Off Guaranteed
                      </span>
                    </p>
                  </div>
                </div>

                {/* Running P&L Display */}
                <div className="flex items-center gap-4 flex-wrap md:flex-nowrap justify-between md:justify-end">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Unrealized Live P&L
                    </p>
                    <div className="flex items-baseline gap-2 justify-start md:justify-end">
                      <span
                        className={cn(
                          "text-3xl sm:text-4xl font-black tracking-tight",
                          (displayPnlRs ?? 0) >= 0
                            ? "text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]"
                            : "text-rose-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.4)]"
                        )}
                      >
                        {(displayPnlRs ?? 0) >= 0 ? "+" : ""}₹
                        {Number(displayPnlRs ?? 0).toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          (displayPnlPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                        )}
                      >
                        ({(displayPnlPct ?? 0) >= 0 ? "+" : ""}
                        {Number(displayPnlPct ?? 0).toFixed(2)}%)
                      </span>
                    </div>
                    {(liveState.peakPnlRs ?? 0) > 0 && (
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        Peak High:{" "}
                        <span className="text-emerald-400 font-bold">
                          +₹{Number(liveState.peakPnlRs).toFixed(2)}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Instant Square Off Action Button */}
                  <Button
                    onClick={handleInstantSquareOff}
                    disabled={
                      isSquareOffBusy ||
                      (!liveState.entryTriggered && liveState.stateType !== "ACTIVE_POSITION")
                    }
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 h-11 rounded-xl shadow-lg shadow-rose-900/30 border border-rose-500/30 transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
                  >
                    {isSquareOffBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Zap className="h-4 w-4 mr-1.5 fill-current text-amber-300" />
                    )}
                    Instant Square Off
                  </Button>
                </div>
              </div>

              {/* 4-Box Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Entry Price</p>
                  <p className="text-base font-bold text-white mt-0.5">
                    ₹{Number(liveState.entryPrice ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                    <span>Current LTP</span>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </p>
                  <p className="text-base font-bold text-emerald-400 mt-0.5">
                    ₹{Number(displayLtp).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Target (1:1.5 RR)</p>
                  <p className="text-base font-bold text-emerald-300 mt-0.5">
                    ₹{Number(liveState.targetPrice ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold text-slate-400">
                    {liveState.isTrailingEma ? "Trailing SL (15-EMA)" : "Stop Loss"}
                  </p>
                  <p className="text-base font-bold text-rose-300 mt-0.5">
                    ₹{Number(liveState.stopLossPrice ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Trailing Status Banner */}
              {liveState.isTrailingEma && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <TrendingUp className="h-4 w-4" />
                    <span>Dynamic 15-EMA Line Trailing Active — Riding Open Trend</span>
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-200">
                    Trail Stop: ₹{Number(liveState.stopLossPrice ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* ─── Navigation Tabs Bar ─── */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2 overflow-x-auto scrollbar-none">
        <Button
          variant={activeTab === "LIVE" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("LIVE")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "LIVE" && "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          Live Engine & Telemetry
        </Button>
        <Button
          variant={activeTab === "CONFIG" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("CONFIG")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "CONFIG" && "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Parameters & Risk Rules
        </Button>
        <Button
          variant={activeTab === "ANALYTICS" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("ANALYTICS")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "ANALYTICS" && "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <BarChart2 className="h-3.5 w-3.5" />
          Performance Analytics
        </Button>
        <Button
          variant={activeTab === "HISTORY" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("HISTORY")}
          className={cn(
            "text-xs h-8 px-3.5 rounded-lg font-semibold gap-1.5",
            activeTab === "HISTORY" && "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <History className="h-3.5 w-3.5" />
          Execution History ({strategy.executions?.length ?? 0})
        </Button>
      </div>

      {/* ─── TAB 1: LIVE ENGINE & TELEMETRY ─── */}
      {activeTab === "LIVE" && (
        <div className="space-y-6">
          {/* Live Engine Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-blue-500" />
                  Strategy Signal & Trend Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {liveState ? (
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Target Instrument</span>
                      <span className="font-bold text-foreground">
                        {liveState.futureSymbol || strategy.config.symbol || "Resolving..."}
                      </span>
                    </div>

                    {is15Min && (
                      <>
                        <div className="flex justify-between items-center py-1 border-b border-border/40">
                          <span className="text-muted-foreground">15-Min Range</span>
                          <span className="font-bold text-foreground">
                            {liveState.refLow
                              ? `₹${liveState.refLow} — ₹${liveState.refHigh}`
                              : "Scanning 9:15-9:30 AM Range"}
                          </span>
                        </div>
                        {liveState.dynamicAtr !== undefined && (
                          <div className="flex justify-between items-center py-1 border-b border-border/40">
                            <span className="text-muted-foreground">Dynamic ATR(14)</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              ₹{Number(liveState.dynamicAtr).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Setup Status</span>
                      <Badge
                        variant={
                          liveState.entryTriggered
                            ? "default"
                            : liveState.isGoalAchieved
                              ? "warning"
                              : "outline"
                        }
                        className="text-[10px] font-bold"
                      >
                        {liveState.entryTriggered
                          ? `Position Open (${liveState.entryTriggered})`
                          : liveState.isGoalAchieved
                            ? "🎯 Daily Target Win Locked"
                            : "Scanning for Signals"}
                      </Badge>
                    </div>

                    {liveState.optionSymbol && (
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted-foreground">Selected Strike</span>
                        <span className="font-black text-purple-600">{liveState.optionSymbol}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    <Radio className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
                    {strategy.isActive
                      ? "Engine active. Scanning market signals..."
                      : "Start engine to activate real-time telemetry."}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Run Orders */}
            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ShoppingCart className="h-3.5 w-3.5 text-amber-500" />
                  Active Execution Orders
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {activeOrders.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                      No orders placed in this run yet.
                    </div>
                  ) : (
                    activeOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              "text-[9px] px-1.5 py-0.2 font-bold",
                              order.side === "BUY"
                                ? "bg-blue-600 text-white"
                                : "bg-rose-600 text-white"
                            )}
                          >
                            {order.side}
                          </Badge>
                          <div>
                            <p className="text-xs font-bold text-foreground leading-tight">
                              {order.symbol}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase">
                              {order.orderType} • {order.qty} Qty
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-foreground">
                            ₹{order.price || order.triggerPrice || "Market"}
                          </p>
                          <Badge
                            variant={order.status === "COMPLETE" ? "default" : "secondary"}
                            className="text-[9px] px-1.5 py-0.2"
                          >
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Live Streaming Console ── */}
          <Card className="border-border/60 bg-card shadow-sm overflow-hidden rounded-2xl">
            <CardHeader className="p-4 bg-muted/30 border-b border-border/60 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Live Engine Terminal Console
                </CardTitle>
                {strategy.isActive && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLogsToClipboard}
                  className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                  <span className="hidden sm:inline">Copy Logs</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogs((v) => !v)}
                  className="h-7 w-7 p-0"
                >
                  {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>

            {showLogs && (
              <CardContent className="p-0">
                <div
                  ref={logsRef}
                  className="h-72 overflow-y-auto bg-slate-950 p-4 font-mono text-xs text-emerald-400 space-y-1 select-text scrollbar-thin"
                >
                  {liveLogs.length === 0 ? (
                    <p className="text-slate-500 italic py-4">
                      {strategy.isActive
                        ? "Engine running. Awaiting real-time market ticks and crossover signals..."
                        : "Start the engine to view live execution logs."}
                    </p>
                  ) : (
                    liveLogs.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          "leading-relaxed py-0.5",
                          line.includes("📊 [LIVE P&L]") &&
                          "text-cyan-300 font-semibold bg-cyan-950/40 px-2 py-0.5 rounded border-l-2 border-cyan-400 my-0.5",
                          line.includes("⏰") &&
                          "text-amber-300 font-bold bg-amber-950/30 px-1.5 rounded border-l-2 border-amber-400",
                          line.includes("❌") && "text-rose-400",
                          line.includes("⚠") && "text-amber-400",
                          line.includes("🟢") && "text-emerald-300 font-bold",
                          line.includes("🔴") && "text-rose-300 font-bold",
                          line.includes("✅") && "text-emerald-400 font-medium",
                          line.includes("⚡") && "text-purple-300 font-medium",
                          line.includes("🎯") && "text-emerald-300 font-bold"
                        )}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ─── TAB 2: STRATEGY CONFIGURATION & RISK RULES ─── */}
      {activeTab === "CONFIG" && (
        <Card className="border-border/60 bg-card rounded-2xl shadow-sm">
          <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold">Strategy Parameters & Execution Rules</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adjust sizing, stop-loss limits, target thresholds, and indicator parameters.
              </p>
            </div>

            {!editing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(true);
                  setEditConfig({});
                }}
                className="gap-1.5 text-xs h-8"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Configuration
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={saveConfig}
                  className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="h-3.5 w-3.5" /> Save Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  className="text-xs h-8"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              <Field
                label="Target Symbol"
                editing={false}
                value={cfg.symbol || "AUTO (Smart Stock Picker)"}
              />
              <Field
                label="Exchange"
                editing={false}
                value={cfg.exchange || "NSE"}
              />
              <Field
                label="Execution Product"
                editing={editing}
                value={editing ? String(editConfig.product ?? cfg.product ?? "MIS") : String(cfg.product ?? "MIS")}
                onChange={(v) => setEditConfig((e) => ({ ...e, product: v }))}
              />

              <Field
                label="Daily Stop Loss (₹)"
                editing={editing}
                value={editing ? String(editConfig.stopLossRs ?? cfg.stopLossRs ?? 500) : `₹${cfg.stopLossRs ?? 500}`}
                onChange={(v) => setEditConfig((e) => ({ ...e, stopLossRs: Number(v) }))}
                type="number"
              />
              <Field
                label="Daily Target (₹)"
                editing={editing}
                value={editing ? String(editConfig.targetRs ?? cfg.targetRs ?? 500) : `₹${cfg.targetRs ?? 500}`}
                onChange={(v) => setEditConfig((e) => ({ ...e, targetRs: Number(v) }))}
                type="number"
              />
              <Field
                label="Max Trades / Day"
                editing={editing}
                value={editing ? String(editConfig.maxTradesPerDay ?? cfg.maxTradesPerDay ?? 1) : String(cfg.maxTradesPerDay ?? 1)}
                onChange={(v) => setEditConfig((e) => ({ ...e, maxTradesPerDay: Number(v) }))}
                type="number"
              />

              {isEmaVwap && (
                <Field
                  label="EMA Period"
                  editing={editing}
                  value={editing ? String(editConfig.emaPeriod ?? cfg.emaPeriod ?? 15) : String(cfg.emaPeriod ?? 15)}
                  onChange={(v) => setEditConfig((e) => ({ ...e, emaPeriod: Number(v) }))}
                  type="number"
                />
              )}

              {is15Min && (
                <>
                  <Field
                    label="Risk:Reward Ratio"
                    editing={editing}
                    value={editing ? String(editConfig.riskRewardRatio ?? cfg.riskRewardRatio ?? 2.0) : `1:${Number(cfg.riskRewardRatio ?? 2.0).toFixed(1)}`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, riskRewardRatio: Number(v) }))}
                    type="number"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Dynamic ATR Trailing</p>
                    <p className="text-sm font-bold text-blue-600">Active Scaling (±15% Buffer)</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 3: PERFORMANCE & TRADE ANALYTICS ─── */}
      {activeTab === "ANALYTICS" && (
        <Card className="border-border/60 bg-card rounded-2xl shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm font-bold">Performance & Trade Metrics</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
              Last 30 Days Running
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            {(() => {
              const perf = strategy.performance;
              const winRate = perf?.winRate ?? 0;
              const netPnl = perf?.netPnl ?? 0;
              const pf = perf?.profitFactor ?? 0;
              const avgProfitPerWin = perf?.avgProfitPerWin ?? 0;
              const totalTrades = perf?.totalTrades ?? 0;

              return (
                <div className="divide-y divide-border/60">
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60">
                    <div className="p-6 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Win Rate
                      </span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-black">{winRate.toFixed(1)}%</span>
                        <span className="text-xs text-muted-foreground">
                          {totalTrades} completed trade{totalTrades === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="w-full bg-secondary h-2 rounded-full mt-3 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-6 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Net Realized P&L
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-3xl font-black",
                            netPnl > 0
                              ? "text-emerald-600"
                              : netPnl < 0
                                ? "text-rose-600"
                                : "text-foreground"
                          )}
                        >
                          {netPnl < 0 ? "-" : ""}₹
                          {Math.abs(netPnl).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Avg. Win: ₹
                        {avgProfitPerWin.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div className="p-6 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Profit Factor
                      </span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-black">
                          {pf === 99.9 ? "∞" : pf.toFixed(2)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold",
                            pf >= 1.5
                              ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                              : "text-muted-foreground"
                          )}
                        >
                          {pf >= 2.0 ? "Excellent" : pf >= 1.2 ? "Healthy" : "Moderate"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Gross Profit / Gross Loss ratio</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/20 flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 text-blue-500 shrink-0" />
                    <span>
                      {strategy.isPaperTrade
                        ? "Simulated executions recorded in virtual testing mode."
                        : "Verified live executions recorded via connected Zerodha Kite account."}
                    </span>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 4: EXECUTION HISTORY ─── */}
      {activeTab === "HISTORY" && (
        <Card className="border-border/60 bg-card rounded-2xl shadow-sm">
          <CardHeader className="p-5 border-b border-border/60">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-blue-500" />
              Past Execution Sessions ({strategy.executions?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {strategy.executions?.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                No execution sessions recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {strategy.executions.map((ex) => (
                  <ExecutionRow key={ex.id} execution={ex} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  editing,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      {editing && onChange ? (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-xs bg-secondary/30"
        />
      ) : (
        <p className="text-sm font-bold text-foreground">{value}</p>
      )}
    </div>
  );
}

function ExecutionRow({ execution: ex }: { execution: Execution }) {
  const [open, setOpen] = useState(false);
  let parsedLogs: string[] = [];
  try {
    parsedLogs = JSON.parse(ex.logs || "[]");
  } catch {
    parsedLogs = [];
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/70 shadow-2xs hover:border-border transition-colors">
      <div>
        <p className="text-xs font-mono font-bold text-foreground">
          {ex.id.slice(0, 12)}…
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {new Date(ex.startedAt).toLocaleString("en-IN")}
          {ex.stoppedAt && ` → ${new Date(ex.stoppedAt).toLocaleString("en-IN")}`}
        </p>
        {ex.errorMsg && <p className="text-xs text-rose-500 mt-0.5 font-medium">{ex.errorMsg}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Terminal className="h-3 w-3" />
              View Logs
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl p-6 rounded-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-mono">
                <Terminal className="h-4 w-4 text-emerald-500" />
                Session Execution Logs
              </DialogTitle>
              <DialogDescription className="text-xs">
                Started: {new Date(ex.startedAt).toLocaleString("en-IN")}
              </DialogDescription>
            </DialogHeader>
            <div className="h-[450px] overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-emerald-400 space-y-1 select-text scrollbar-thin">
              {parsedLogs.length === 0 ? (
                <p className="text-slate-500 italic">No logs recorded for this session.</p>
              ) : (
                parsedLogs.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "leading-relaxed break-words",
                      line.includes("❌") && "text-rose-400",
                      line.includes("⚠") && "text-amber-400",
                      line.includes("🟢") && "text-emerald-300 font-bold",
                      line.includes("🔴") && "text-rose-300 font-bold",
                      line.includes("✅") && "text-emerald-400"
                    )}
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Badge
          className={cn(
            "text-[10px] font-bold uppercase",
            ex.status === "RUNNING"
              ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
              : ex.status === "STOPPED"
                ? "bg-amber-500/15 text-amber-600 border border-amber-500/30"
                : ex.status === "ERROR"
                  ? "bg-rose-500/15 text-rose-600 border border-rose-500/30"
                  : "bg-muted text-muted-foreground border-border"
          )}
        >
          {ex.status}
        </Badge>
      </div>
    </div>
  );
}
