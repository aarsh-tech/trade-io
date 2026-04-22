"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play, Square, ArrowLeft, RefreshCw, Loader2,
  BarChart2, Shield, Target, Zap, Terminal, History,
  ChevronDown, ChevronUp, Pencil, Check, X, Send, AlertTriangle,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { strategyApi, brokerApi } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editConfig, setEditConfig] = useState<Partial<Breakout15MinConfig>>({});
  const logsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [stRes, statusRes] = await Promise.all([
        strategyApi.get(id),
        strategyApi.status(id),
      ]);
      setStrategy(stRes.data?.data ?? null);
      setLiveLogs(statusRes.data?.data?.logs ?? []);
    } catch {
      toast.error("Failed to load strategy");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll logs every 30s when strategy is active
  useEffect(() => {
    if (strategy?.isActive) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await strategyApi.status(id);
          setLiveLogs(r.data?.data?.logs ?? []);
        } catch { }
      }, 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [strategy?.isActive, id]);

  // Auto-scroll logs to bottom
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

  const [testOrderQty, setTestOrderQty] = useState(1);
  const [testOrderBusy, setTestOrderBusy] = useState(false);
  const [testSymbol, setTestSymbol] = useState("");
  const [testProduct, setTestProduct] = useState("");
  const [testPrice, setTestPrice] = useState("1.0");
  const [testOrderType, setTestOrderType] = useState("LIMIT");
  const [testVariety, setTestVariety] = useState("regular");

  useEffect(() => {
    if (strategy) {
      setTestSymbol(strategy.config.symbol);
      setTestProduct(strategy.config.product);
    }
  }, [strategy]);

  async function handleTestOrder() {
    if (!strategy?.brokerAccountId) {
      toast.error("No broker account connected");
      return;
    }
    setTestOrderBusy(true);
    try {
      const res = await brokerApi.placeOrder(strategy.brokerAccountId, {
        symbol: testSymbol || strategy.config.symbol,
        exchange: strategy.config.exchange,
        side: "BUY",
        orderType: testOrderType,
        product: testProduct || strategy.config.product,
        qty: testOrderQty,
        price: testOrderType === "LIMIT" ? Number(testPrice) : undefined,
        variety: testVariety,
      });

      toast.success(`Test order placed! ID: ${res.data?.data?.orderId}`);
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
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/strategies">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{strategy.name}</h1>
              <Badge variant={strategy.isActive ? "running" : "stopped"} dot>
                {strategy.isActive ? "Live" : "Off"}
              </Badge>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {cfg.symbol} · {cfg.exchange} ·{" "}
              {strategy.brokerAccount
                ? `${strategy.brokerAccount.broker} — ${strategy.brokerAccount.clientId}`
                : "No broker"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Dialog>
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
                {/* Warning Box */}
                <div className="flex gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-800">
                  <Info className="h-5 w-5 shrink-0 mt-0.5 opacity-80" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold leading-none">Trading Note</p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      Indices like <strong>NIFTY 50</strong> cannot be traded directly. For testing, please use a stock symbol (e.g., <strong>RELIANCE</strong>) or a specific Derivative.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Symbol</label>
                    <Input
                      value={testSymbol}
                      onChange={(e) => setTestSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g. RELIANCE"
                      className="bg-[hsl(var(--secondary)/0.3)] border-[hsl(var(--border))] focus:ring-amber-500/20"
                    />
                  </div>
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
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Test Quantity</label>
                    <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      Real Trade
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={testOrderQty}
                    onChange={(e) => setTestOrderQty(Number(e.target.value))}
                    className="bg-[hsl(var(--secondary)/0.3)] border-[hsl(var(--border))] font-semibold"
                  />
                  <p className="text-[10px] text-amber-600 font-medium">
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

      {/* ── Config Cards ── */}
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

      {/* ── Editable Config ── */}
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

      {/* ── Live Logs ── */}
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

      {/* ── Execution History ── */}
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
                  <div
                    key={ex.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] border border-[hsl(var(--border))]"
                  >
                    <div>
                      <p className="text-xs font-mono text-[hsl(var(--muted-foreground))]">
                        {ex.id.slice(0, 12)}…
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(ex.startedAt).toLocaleString("en-IN")}
                        {ex.stoppedAt &&
                          ` → ${new Date(ex.stoppedAt).toLocaleString("en-IN")}`}
                      </p>
                      {ex.errorMsg && (
                        <p className="text-xs text-red-500 mt-0.5">{ex.errorMsg}</p>
                      )}
                    </div>
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
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

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
