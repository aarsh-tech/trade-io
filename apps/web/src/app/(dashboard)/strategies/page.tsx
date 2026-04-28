"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, Plus, TrendingUp,
  Activity, BarChart2, Settings2, RefreshCw, Loader2, AlarmClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  instrumentType: "INDEX" | "STOCK";
  qty: number;
  product: "MIS" | "NRML";
  stopLossRs: number;
  targetRs: number;
  maxTradesPerDay: number;
}

interface Strategy {
  id: string;
  name: string;
  type: "BREAKOUT_15MIN" | "EMA_CROSSOVER" | "CUSTOM";
  isActive: boolean;
  autoStart: boolean;
  brokerAccountId?: string | null;
  config: Breakout15MinConfig | Record<string, unknown>;
  brokerAccount?: { broker: string; clientId: string } | null;
  latestExecution?: { id: string; status: string; startedAt: string } | null;
  createdAt: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Strategy | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await strategyApi.list();
      setStrategies(res.data?.data ?? []);
    } catch {
      toast.error("Failed to load strategies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleStrategy(s: Strategy) {
    setActionId(s.id);
    try {
      if (s.isActive) {
        await strategyApi.stop(s.id);
        toast.success(`"${s.name}" stopped`);
      } else {
        await strategyApi.start(s.id);
        toast.success(`"${s.name}" started — engine running`);
      }
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Action failed");
    } finally {
      setActionId(null);
    }
  }

  function askDelete(s: Strategy) {
    setPendingDelete(s);
    setShowConfirm(true);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const s = pendingDelete;
    setActionId(s.id);
    try {
      await strategyApi.delete(s.id);
      toast.success("Strategy deleted");
      await load();
    } catch {
      toast.error("Failed to delete strategy");
    } finally {
      setActionId(null);
      setPendingDelete(null);
    }
  }

  async function toggleAutoStart(s: Strategy) {
    setActionId(s.id + '_as');
    try {
      await strategyApi.setAutoStart(s.id, !s.autoStart);
      toast.success(
        !s.autoStart
          ? `✅ "${s.name}" will auto-start at 09:15 IST`
          : `"${s.name}" auto-start disabled`
      );
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update auto-start");
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Strategies</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {strategies.filter((s) => s.isActive).length} active ·{" "}
            {strategies.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/strategies/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Strategy
            </Button>
          </Link>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            busy={actionId === s.id}
            onToggle={toggleStrategy}
            onDelete={askDelete}
            onToggleAutoStart={toggleAutoStart}
          />
        ))}

        {/* Add new */}
        <Link href="/strategies/new">
          <div className="h-full min-h-[200px] glass rounded-xl border-2 border-dashed border-[hsl(var(--border))] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.03)] transition-all group">
            <div className="h-12 w-12 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center group-hover:bg-[hsl(var(--primary)/0.1)] transition-colors">
              <Plus className="h-6 w-6 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
              Add Strategy
            </p>
          </div>
        </Link>
      </div>

      {strategies.length === 0 && (
        <div className="text-center py-20 text-[hsl(var(--muted-foreground))]">
          <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">No strategies yet</p>
          <p className="text-sm mt-1">Create your first strategy to start automated trading.</p>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleDelete}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : "Delete Strategy?"}
        description="This will permanently delete the strategy and all its backtest history and execution logs. This action cannot be undone."
        confirmText="Delete Strategy"
        variant="destructive"
      />
    </div>
  );
}

// ─── Strategy Card ─────────────────────────────────────────────────────────────

function StrategyCard({
  strategy: s,
  busy,
  onToggle,
  onDelete,
  onToggleAutoStart,
}: {
  strategy: Strategy;
  busy: boolean;
  onToggle: (s: Strategy) => void;
  onDelete: (s: Strategy) => void;
  onToggleAutoStart: (s: Strategy) => void;
}) {
  const cfg = s.config as Breakout15MinConfig;
  const is15Min = s.type === "BREAKOUT_15MIN";

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 hover:scale-[1.01]",
        s.isActive && "border-[hsl(var(--green)/0.3)]"
      )}
    >
      {s.isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[hsl(var(--green))] to-[hsl(var(--primary))]" />
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{s.name}</CardTitle>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {cfg.symbol ?? "—"} · {cfg.exchange ?? "—"} ·{" "}
              {s.brokerAccount?.broker ?? "No broker"}
            </p>
          </div>
          <Badge variant={s.isActive ? "running" : "stopped"} dot>
            {s.isActive ? "Live" : "Off"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Strategy type chip */}
        <div className="flex gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.2)]">
            {is15Min ? (
              <><BarChart2 className="h-3 w-3" /> 15-Min Breakout</>
            ) : (
              <><TrendingUp className="h-3 w-3" /> EMA Crossover</>
            )}
          </span>
          {cfg.product && (
            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
              {cfg.product}
            </span>
          )}
        </div>

        {/* Risk config */}
        {is15Min && (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-[hsl(var(--secondary)/0.5)]">
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Qty</p>
              <p className="text-sm font-bold">{cfg.qty ?? "—"}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-[hsl(220,20%,96%)] dark:bg-red-950/30">
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">SL ₹</p>
              <p className="text-sm font-bold text-red-500">₹{cfg.stopLossRs ?? "—"}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-[hsl(142,20%,96%)] dark:bg-green-950/30">
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Target ₹</p>
              <p className="text-sm font-bold text-green-600">₹{cfg.targetRs ?? "—"}</p>
            </div>
          </div>
        )}

        {/* Latest execution badge */}
        {s.latestExecution && (
          <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <Activity className="h-3 w-3" />
            Last run:{" "}
            <span
              className={cn(
                "font-medium",
                s.latestExecution.status === "RUNNING" && "text-green-600",
                s.latestExecution.status === "STOPPED" && "text-amber-600",
                s.latestExecution.status === "ERROR" && "text-red-600",
              )}
            >
              {s.latestExecution.status}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant={s.isActive ? "danger" : "success"}
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => onToggle(s)}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : s.isActive ? (
              <><Square className="h-3.5 w-3.5" /> Stop</>
            ) : (
              <><Play className="h-3.5 w-3.5" /> Start</>
            )}
          </Button>

          {/* Auto-start toggle */}
          <Button
            variant="outline"
            size="icon-sm"
            title={s.autoStart ? "Auto-start ON — click to disable" : "Auto-start OFF — click to enable (starts at 09:15 IST)"}
            className={cn(
              "transition-colors",
              s.autoStart
                ? "text-emerald-600 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                : "text-slate-400 hover:text-emerald-600 hover:border-emerald-300"
            )}
            disabled={busy}
            onClick={() => onToggleAutoStart(s)}
          >
            <AlarmClock className="h-3.5 w-3.5" />
          </Button>

          <Link href={`/strategies/${s.id}`}>
            <Button variant="outline" size="icon-sm">
              <Activity className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link href={`/strategies/${s.id}/edit`}>
            <Button variant="outline" size="icon-sm">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon-sm"
            className="text-red-500 hover:bg-red-50 hover:border-red-300"
            disabled={busy}
            onClick={() => onDelete(s)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
