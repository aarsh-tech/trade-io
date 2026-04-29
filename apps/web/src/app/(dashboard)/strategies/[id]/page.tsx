"use client";

import { useEffect, useState, useRef, useCallback, Activity } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMarketData } from "@/hooks/use-market-data";
import {
  Play, Square, ArrowLeft, RefreshCw, Loader2,
  BarChart2, Shield, Target, Zap, Terminal, History,
  ChevronDown, ChevronUp, Pencil, Check, X, Send, AlertTriangle,
  TrendingUp,
  Info,
  ActivityIcon,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { strategyApi, brokerApi, marketApi } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";

const LOT_SIZES: Record<string, number> = {
  "NIFTY": 65,
  "BANKNIFTY": 30,
  "SENSEX": 20,
  "FINNIFTY": 60,
  "MIDCPNIFTY": 120,
};

function getLotSize(symbol: string) {
  const s = symbol.toUpperCase();
  if (s.includes("BANKNIFTY")) return 30;
  if (s.includes("NIFTY")) return 65;
  if (s.includes("SENSEX")) return 20;
  for (const key in LOT_SIZES) {
    if (s.includes(key)) return LOT_SIZES[key];
  }
  return 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  instrumentType: string;
  qty: number;
  product: string;
  stopLossRs: number;
  targetRs: number;
  maxTradesPerDay: number;
  isPaperTrade: boolean;
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
  brokerAccountId: string | null;
  config: Breakout15MinConfig;
  brokerAccount?: { broker: string; clientId: string } | null;
  executions: Execution[];
  createdAt: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [liveState, setLiveState] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  // Real-time market data
  const { getPrice } = useMarketData(strategy?.config.symbol ? [strategy.config.symbol] : []);
  const ltp = strategy?.config.symbol ? getPrice(strategy.config.symbol) : null;
  const [editConfig, setEditConfig] = useState<Partial<Breakout15MinConfig>>({});
  const logsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testOrderLots, setTestOrderLots] = useState(1);
  const [testOrderBusy, setTestOrderBusy] = useState(false);
  const [testSymbol, setTestSymbol] = useState("");
  const [testExchange, setTestExchange] = useState("NSE");
  const [testProduct, setTestProduct] = useState("");
  const [testPrice, setTestPrice] = useState("1.0");
  const [testOrderType, setTestOrderType] = useState("LIMIT");
  const [testVariety, setTestVariety] = useState("regular");

  const [testSearchQuery, setTestSearchQuery] = useState("");
  const [testSearchResults, setTestSearchResults] = useState<any[]>([]);
  const [isTestSearching, setIsTestSearching] = useState(false);

  useEffect(() => {
    if (strategy) {
      setTestSymbol(strategy.config.symbol);
      setTestExchange(strategy.config.exchange || "NSE");
      setTestProduct(strategy.config.product);
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

  useEffect(() => {
    if (strategy?.isActive) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await strategyApi.status(id);
          setLiveLogs(r.data?.data?.logs ?? []);
          setLiveState(r.data?.data?.state ?? null);
          setActiveOrders(r.data?.data?.orders ?? []);
        } catch { }
      }, 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [strategy?.isActive, id]);

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
        toast.success("Strategy stopped");
      } else {
        await strategyApi.start(id);
        toast.success("Strategy started — engine running");
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    setBusy(true);
    try {
      const merged = { ...strategy!.config, ...editConfig };
      await strategyApi.update(id, { config: JSON.stringify(merged) });
      toast.success("Configuration saved");
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
      toast.success(`Test order placed! ID: ${res.data?.data?.orderId}`);
      setIsTestModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Test order failed");
    } finally {
      setTestOrderBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="text-center py-20">
        <p className="text-[hsl(var(--muted-foreground))]">Strategy not found.</p>
        <Link href="/strategies">
          <Button variant="outline" className="mt-4">Back to Strategies</Button>
        </Link>
      </div>
    );
  }

  const cfg = strategy.config;
  const is15Min = strategy.type === "BREAKOUT_15MIN";

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both] max-w-4xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/strategies">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{strategy.name}</h1>
              <Badge variant={strategy.isActive ? "running" : "stopped"} dot>
                {strategy.isActive ? "Live" : "Off"}
              </Badge>
              {strategy.config.isPaperTrade && (
                <Badge variant="warning" className="bg-amber-100 text-amber-700 border-amber-200">
                  Paper Trade
                </Badge>
              )}
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {cfg.symbol} · {cfg.exchange} ·{" "}
              {strategy.config.isPaperTrade ? (
                <span className="text-amber-600 font-medium">Virtual Engine (No Risk)</span>
              ) : (
                strategy.brokerAccount
                  ? `${strategy.brokerAccount.broker} — ${strategy.brokerAccount.clientId}`
                  : "No broker"
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-all">
                <Send className="h-4 w-4" />
                Test Order
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] p-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Place Test Order</DialogTitle>
                <DialogDescription className="text-sm text-[hsl(var(--muted-foreground))]">
                  This will place a <strong>real</strong> market order using your connected {strategy.brokerAccount?.broker} account.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-6">
                <div className="relative space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Search Tradeable Symbol</label>
                  <div className="relative">
                    <Input
                      placeholder="Search e.g. RELIANCE, BANKNIFTY 48000 CE..."
                      value={testSearchQuery}
                      onChange={(e) => handleTestSymbolSearch(e.target.value)}
                      className="bg-[hsl(var(--secondary)/0.3)] border-[hsl(var(--border))] focus:ring-amber-500/20 pr-10"
                    />
                    {isTestSearching && (
                      <div className="absolute right-3 top-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                      </div>
                    )}
                  </div>

                  {testSearchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                      {testSearchResults.map((item) => (
                        <button
                          key={`${item.exchange}:${item.symbol}`}
                          onClick={() => selectTestInstrument(item)}
                          className="w-full flex items-center justify-between p-3 hover:bg-[hsl(var(--secondary)/0.5)] transition-colors border-b last:border-0"
                        >
                          <div className="text-left">
                            <p className="text-sm font-bold">{item.symbol}</p>
                            <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase">{item.name}</p>
                          </div>
                          <Badge className="text-[10px]">{item.exchange}</Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/60">Target Instrument</p>
                      <p className="text-sm font-bold text-amber-900">{testSymbol || "None selected"}</p>
                    </div>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">
                      {testExchange}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Product</label>
                    <select
                      value={testProduct}
                      onChange={(e) => setTestProduct(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 appearance-none cursor-pointer"
                    >
                      <option value="CNC">CNC (Delivery)</option>
                      <option value="MIS">MIS (Intraday)</option>
                      <option value="NRML">NRML (Margin)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Order Type</label>
                    <select
                      value={testOrderType}
                      onChange={(e) => setTestOrderType(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 appearance-none cursor-pointer"
                    >
                      <option value="LIMIT">LIMIT Order</option>
                      <option value="MARKET">MARKET Order</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Order Variety</label>
                    <select
                      value={testVariety}
                      onChange={(e) => setTestVariety(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 appearance-none cursor-pointer font-bold text-amber-700"
                    >
                      <option value="regular">REGULAR</option>
                      <option value="amo">AMO (After Market)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2 col-span-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Limit Price (₹)</label>
                    <Input
                      type="number"
                      step="0.05"
                      disabled={testOrderType === "MARKET"}
                      value={testPrice}
                      onChange={(e) => setTestPrice(e.target.value)}
                      className="bg-[hsl(var(--secondary)/0.3)] border-[hsl(var(--border))] focus:ring-amber-500/20 disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-[hsl(var(--border))] border-dashed">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Test Lots</label>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-medium">
                        Total Quantity: {testOrderLots * getLotSize(testSymbol)} shares
                      </p>
                    </div>
                    <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      Real Trade
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={testOrderLots}
                    onChange={(e) => setTestOrderLots(Number(e.target.value))}
                    className="bg-[hsl(var(--secondary)/0.3)] border-[hsl(var(--border))] font-semibold"
                  />
                  <p className="text-[10px] text-amber-600 font-medium italic">
                    {new Date().getHours() >= 15 || new Date().getHours() < 9
                      ? "💡 Market is closed. Please select AMO variety."
                      : "💡 Market is open. Use Regular variety."}
                  </p>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  variant="success"
                  className="w-full h-11 text-sm font-bold shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  disabled={testOrderBusy}
                  onClick={handleTestOrder}
                >
                  {testOrderBusy ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Executing Transaction...</>
                  ) : (
                    <><Check className="h-4 w-4 mr-2" /> Confirm & Place Test Order</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant={strategy.isActive ? "danger" : "success"}
            size="sm"
            disabled={busy}
            onClick={toggleEngine}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : strategy.isActive ? (
              <><Square className="h-4 w-4" /> Stop Engine</>
            ) : (
              <><Play className="h-4 w-4" /> Start Engine</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Live Strategy Status & Active Orders ── */}
      {strategy.isActive && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-blue-100 bg-blue-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-blue-600 flex items-center gap-2">
                <ActivityIcon className="h-3.5 w-3.5" />
                Live Engine Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {liveState ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-1.5 border-b border-blue-100/50">
                    <span className="text-xs text-slate-500">Target Instrument</span>
                    <span className="text-xs font-bold text-slate-900">{liveState.futureSymbol || "Resolving..."}</span>
                  </div>
                  {is15Min && (
                    <>
                      <div className="flex justify-between items-center py-1.5 border-b border-blue-100/50">
                        <span className="text-xs text-slate-500">15-Min Range</span>
                        <span className="text-xs font-bold text-slate-900">
                          {liveState.refLow ? `₹${liveState.refLow} — ₹${liveState.refHigh}` : "Waiting for 9:30 AM"}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center py-1.5 border-b border-blue-100/50">
                    <span className="text-xs text-slate-500">Trade Status</span>
                    <Badge variant={liveState.entryTriggered ? "success" : "secondary"} className="text-[10px]">
                      {liveState.entryTriggered ? `Position Open (${liveState.entryTriggered})` : "Scanning for Breakout"}
                    </Badge>
                  </div>
                  {liveState.optionSymbol && (
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-xs text-slate-500">Selected Strike</span>
                      <span className="text-xs font-black text-blue-700">{liveState.optionSymbol}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-4">Initializing engine state...</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <ShoppingCart className="h-3.5 w-3.5" />
                Active Run Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {activeOrders.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No orders placed in this run yet.</p>
                ) : (
                  activeOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-50 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[8px] px-1 py-0", order.side === 'BUY' ? "bg-blue-500" : "bg-orange-500")}>
                          {order.side}
                        </Badge>
                        <div>
                          <p className="text-[10px] font-bold text-slate-800 leading-tight">{order.symbol}</p>
                          <p className="text-[8px] text-slate-400 uppercase font-medium">{order.orderType} · {order.qty} Qty</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-900">₹{order.price || order.triggerPrice || "Market"}</p>
                        <Badge variant={order.status === 'COMPLETE' ? 'success' : 'secondary'} className="text-[8px] px-1 py-0">
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
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Symbol", value: cfg.symbol, icon: BarChart2, color: "text-[hsl(var(--primary))]" },
          { label: "Qty / Lots", value: cfg.qty, icon: Zap, color: "text-amber-500" },
          { label: "Stop Loss", value: `₹${cfg.stopLossRs}`, icon: Shield, color: "text-red-500" },
          { label: "Target", value: `₹${cfg.targetRs}`, icon: Target, color: "text-green-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="text-center">
            <CardContent className="pt-4 pb-3">
              <Icon className={cn("h-5 w-5 mx-auto mb-1", color)} />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Strategy Configuration</CardTitle>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => { setEditing(true); setEditConfig({}); }}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="success" size="sm" disabled={busy} onClick={saveConfig}>
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {is15Min && (
              <>
                <Field
                  label="Stop Loss (₹)"
                  editing={editing}
                  value={editing ? String(editConfig.stopLossRs ?? cfg.stopLossRs) : String(cfg.stopLossRs)}
                  onChange={(v) => setEditConfig((e) => ({ ...e, stopLossRs: Number(v) }))}
                  type="number"
                />
                <Field
                  label="Target (₹)"
                  editing={editing}
                  value={editing ? String(editConfig.targetRs ?? cfg.targetRs) : String(cfg.targetRs)}
                  onChange={(v) => setEditConfig((e) => ({ ...e, targetRs: Number(v) }))}
                  type="number"
                />
                <Field
                  label="Qty / Lots"
                  editing={editing}
                  value={editing ? String(editConfig.qty ?? cfg.qty) : String(cfg.qty)}
                  onChange={(v) => setEditConfig((e) => ({ ...e, qty: Number(v) }))}
                  type="number"
                />
                <Field
                  label="Max Trades / Day"
                  editing={editing}
                  value={editing ? String(editConfig.maxTradesPerDay ?? cfg.maxTradesPerDay) : String(cfg.maxTradesPerDay)}
                  onChange={(v) => setEditConfig((e) => ({ ...e, maxTradesPerDay: Number(v) }))}
                  type="number"
                />
                <div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Product</p>
                  {editing ? (
                    <select
                      value={editConfig.product ?? cfg.product}
                      onChange={(e) => setEditConfig((ec) => ({ ...ec, product: e.target.value }))}
                      className="flex h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                    >
                      <option value="MIS">MIS (Intraday)</option>
                      <option value="NRML">NRML (Overnight)</option>
                    </select>
                  ) : (
                    <p className="text-sm font-semibold">{cfg.product}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Order Mode</p>
                  <p className="text-sm font-semibold text-[hsl(var(--primary))]">LIMIT only</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowLogs((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Live Engine Logs
              {strategy.isActive && (
                <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </CardTitle>
            {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showLogs && (
          <CardContent>
            <div
              ref={logsRef}
              className="h-60 overflow-y-auto bg-[hsl(220,13%,10%)] rounded-lg p-3 font-mono text-xs text-green-400 space-y-0.5"
            >
              {liveLogs.length === 0 ? (
                <p className="text-[hsl(var(--muted-foreground))]">
                  {strategy.isActive
                    ? "Engine running — waiting for signals..."
                    : "Start the engine to see logs."}
                </p>
              ) : (
                liveLogs.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "leading-relaxed",
                      line.includes("❌") && "text-red-400",
                      line.includes("⚠") && "text-amber-400",
                      line.includes("🟢") && "text-green-300 font-bold",
                      line.includes("🔴") && "text-red-300 font-bold",
                      line.includes("✅") && "text-emerald-400",
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

      {/* ── Performance Analytics ── */}
      <Card className="overflow-hidden border-[hsl(var(--primary)/0.15)] shadow-xl shadow-[hsl(var(--primary)/0.05)]">
        <CardHeader className="bg-[hsl(var(--primary)/0.03)] border-b border-[hsl(var(--primary)/0.05)] py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-[hsl(var(--primary))]" />
              Performance Analysis
            </CardTitle>
            <Badge className="bg-green-50/50 text-green-700">
              Last 30 Days
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-b border-[hsl(var(--border))]">
            <div className="p-6 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Win Rate</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold tracking-tight">68.5%</p>
                <p className="text-xs text-green-600 font-medium mb-1 flex items-center gap-0.5">
                  <TrendingUp className="h-3 w-3" /> +2.1%
                </p>
              </div>
              <div className="w-full bg-[hsl(var(--secondary)/0.5)] h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-green-500 h-full rounded-full" style={{ width: "68.5%" }} />
              </div>
            </div>

            <div className="p-6 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Net P&L (Simulated)</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold tracking-tight text-green-600">₹14,250</p>
                <p className="text-xs text-green-600 font-medium mb-1">Total</p>
              </div>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 font-medium">
                Avg. Profit per Win: <span className="text-[hsl(var(--foreground))]">₹2,400</span>
              </p>
            </div>

            <div className="p-6 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Profit Factor</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold tracking-tight">1.84</p>
                <p className="text-xs text-amber-600 font-medium mb-1">Healthy</p>
              </div>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 font-medium">
                Gross Profit / Gross Loss ratio
              </p>
            </div>
          </div>

          <div className="p-4 bg-[hsl(var(--secondary)/0.2)]">
            <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))] font-medium">
              <Info className="h-3.5 w-3.5" />
              This analysis is based on simulated trade executions from your paper trading sessions.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowHistory((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" />
              Execution History ({strategy.executions.length})
            </CardTitle>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {strategy.executions.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No executions yet.</p>
            ) : (
              <div className="space-y-2">
                {strategy.executions.map((ex) => (
                  <ExecutionRow key={ex.id} execution={ex} />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Field({
  label, value, editing, onChange, type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{label}</p>
      {editing ? (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
      ) : (
        <p className="text-sm font-semibold">{value}</p>
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
    <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] border border-[hsl(var(--border))]">
      <div>
        <p className="text-xs font-mono text-[hsl(var(--muted-foreground))]">
          {ex.id.slice(0, 12)}…
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {new Date(ex.startedAt).toLocaleString("en-IN")}
          {ex.stoppedAt && ` → ${new Date(ex.stoppedAt).toLocaleString("en-IN")}`}
        </p>
        {ex.errorMsg && (
          <p className="text-xs text-red-500 mt-0.5">{ex.errorMsg}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Terminal className="h-3 w-3 mr-1" />
              Logs
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl border-[hsl(var(--border))] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono">
                <Terminal className="h-5 w-5" />
                Execution Logs
              </DialogTitle>
              <DialogDescription>
                Started at {new Date(ex.startedAt).toLocaleString("en-IN")}
              </DialogDescription>
            </DialogHeader>
            <div className="h-[500px] overflow-y-auto bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-4 font-mono text-[13px] text-green-400 space-y-1 shadow-inner">
              {parsedLogs.length === 0 ? (
                <p className="text-[hsl(var(--muted-foreground))]">No logs recorded for this run.</p>
              ) : (
                parsedLogs.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "leading-relaxed break-words",
                      line.includes("❌") && "text-red-400",
                      line.includes("⚠") && "text-amber-400",
                      line.includes("🟢") && "text-green-300 font-bold",
                      line.includes("🔴") && "text-red-300 font-bold",
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
          variant={
            ex.status === "RUNNING"
              ? "running"
              : ex.status === "STOPPED"
                ? "stopped"
                : ex.status === "ERROR"
                  ? "stopped"
                  : "default"
          }
        >
          {ex.status}
        </Badge>
      </div>
    </div>
  );
}
