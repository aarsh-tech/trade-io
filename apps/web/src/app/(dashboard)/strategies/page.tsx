"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Square,
  Trash2,
  Plus,
  TrendingUp,
  Activity,
  BarChart2,
  Settings2,
  RefreshCw,
  Loader2,
  AlarmClock,
  Flame,
  Target,
  Zap,
  Sparkles,
  Search,
  Shield,
  CheckCircle2,
  Power,
  SlidersHorizontal,
  Bot,
  Radio,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RmsSafetyCard } from "@/components/rms/rms-safety-card";
import { EMPTY, formatINR } from "@/lib/format";
import { MenuItem, OverflowMenu, ModeBadge, StatusBadge, typeLabel, type RunStatus } from "@/features/strategies/detail/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrategyConfig {
  symbol?: string;
  exchange?: string;
  instrumentType?: "INDEX" | "STOCK" | "OPTION" | "FUTURE";
  qty?: number;
  product?: "MIS" | "NRML";
  stopLossRs?: number;
  targetRs?: number;
  maxTradesPerDay?: number;
  emaPeriod?: number;
  [key: string]: any;
}

interface Strategy {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  autoStart: boolean;
  isPaperTrade?: boolean;
  /** Present only if the list API returns it; otherwise the card shows a dash. */
  todayPnl?: number;
  brokerAccountId?: string | null;
  config: StrategyConfig | Record<string, any>;
  brokerAccount?: { broker: string; clientId: string } | null;
  latestExecution?: { id: string; status: string; startedAt: string } | null;
  createdAt: string;
}

type FilterTab = "ALL" | "ACTIVE" | "SCHEDULED" | "INTRADAY" | "OPTIONS";

// ─── Page Component ───────────────────────────────────────────────────────────

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Strategy | null>(null);
  const [pendingStop, setPendingStop] = useState<Strategy | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

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

  useEffect(() => {
    load();
  }, [load]);

  // 1-Click Quick Deploy Preset: Stock Options Buying (80% Win Rate Architecture)
  async function handleQuickDeployStockOptions() {
    setActionId("quick-stock-options");
    try {
      const brokerRes = await brokerApi.list();
      const accounts = brokerRes.data?.data ?? [];
      const activeBroker = accounts.find((a: any) => a.isActive) || accounts[0];

      if (!activeBroker) {
        toast.error("Please connect a Zerodha broker account first in Brokers page");
        return;
      }

      const res = await strategyApi.create({
        name: "Auto F&O Stock Options Hunter (80% Profitability)",
        type: "STOCK_OPTIONS_BUYING",
        brokerAccountId: activeBroker.id,
        isPaperTrade: false,
        config: JSON.stringify({
          symbol: "AUTO",
          exchange: "NSE",
          instrumentType: "STOCK",
          isAutoStockSelect: true,
          autoScanUniverse: "FNO_ALL",
          directionBias: "BOTH",
          setupType: "BOTH",
          timeframe: "15min",
          emaPeriod: 15,
          riskRewardRatio: 2,
          maxCapital: 25000,
          lots: 1,
          maxTradesPerDay: 1,
          product: "MIS",
          startAfterMin: 15,
          triggerOffset: 0.5,
          protectionBufferPct: 10,
          minRvol: 1.25,
          moneyness: "ITM",
          target1RR: 1.5,
          target2RR: 3.0,
          enableTrailingSl: true,
          trailingStepPct: 20,
          enableHtfFilter: true,
          enableMarketTrendFilter: true,
          enableMiddayChopFilter: true,
          middayDeadZoneStart: "11:30",
          middayDeadZoneEnd: "13:00",
          thetaCutoffMinutes: 25,
          maxBidAskSpreadPct: 1.2,
          oneWinAndDone: true,
          oneLossAndDone: true,
          enableDynamicSizing: true,
        }),
      });

      const newStrategyId = res.data?.data?.id || res.data?.id;
      if (newStrategyId) {
        await strategyApi.setAutoStart(newStrategyId, true);
        await strategyApi.start(newStrategyId);
      }

      toast.success("🚀 Stock Options Auto-Hunter Deployed!", {
        description: "Scanning 180+ F&O stocks & armed to auto-start at 09:15 AM tomorrow.",
      });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to deploy strategy");
    } finally {
      setActionId(null);
    }
  }

  // 1-Click Quick Deploy Preset: Intraday Equity (₹500/day Target)
  async function handleQuickDeploy500() {
    setActionId("quick-500");
    try {
      const brokerRes = await brokerApi.list();
      const accounts = brokerRes.data?.data ?? [];
      const activeBroker = accounts.find((a: any) => a.isActive) || accounts[0];

      if (!activeBroker) {
        toast.error("Please connect a Zerodha broker account first in Brokers page");
        return;
      }

      const res = await strategyApi.create({
        name: "Intraday Auto Stock Picker (₹500/day Target)",
        type: "EMA_VWAP_CROSSOVER",
        brokerAccountId: activeBroker.id,
        isPaperTrade: false,
        config: JSON.stringify({
          symbol: "AUTO",
          exchange: "NSE",
          instrumentType: "STOCK",
          product: "MIS",
          qty: 1,
          stopLossRs: 500,
          targetRs: 500,
          maxTradesPerDay: 1,
          emaPeriod: 15,
        }),
      });

      const newStrategyId = res.data?.data?.id || res.data?.id;
      if (newStrategyId) {
        await strategyApi.setAutoStart(newStrategyId, true);
        await strategyApi.start(newStrategyId);
      }

      toast.success("🚀 Intraday Auto-Stock Strategy Deployed!", {
        description: "Auto-picks the best stock & auto-starts at 09:15 AM tomorrow.",
      });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to deploy strategy");
    } finally {
      setActionId(null);
    }
  }

  // Toggle Strategy Execution
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

  // Delete Handlers
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

  // Toggle Auto-Start
  async function toggleAutoStart(s: Strategy) {
    setActionId(s.id + "_as");
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

  // Statistics calculation
  const stats = useMemo(() => {
    const total = strategies.length;
    const active = strategies.filter((s) => s.isActive).length;
    const scheduled = strategies.filter((s) => s.autoStart).length;
    const runningExecutions = strategies.filter(
      (s) => s.latestExecution?.status === "RUNNING"
    ).length;

    return { total, active, scheduled, runningExecutions };
  }, [strategies]);

  // Filtered strategies
  const filteredStrategies = useMemo(() => {
    return strategies.filter((s) => {
      // Tab filter
      if (activeTab === "ACTIVE" && !s.isActive) return false;
      if (activeTab === "SCHEDULED" && !s.autoStart) return false;
      if (
        activeTab === "OPTIONS" &&
        !s.type.includes("OPTIONS") &&
        s.type !== "NIFTY_OPTIONS_SCALPER" &&
        s.type !== "GAMMA_BLAST_EXPIRY"
      )
        return false;
      if (
        activeTab === "INTRADAY" &&
        (s.type.includes("OPTIONS") || s.type === "NIFTY_OPTIONS_SCALPER" || s.type === "GAMMA_BLAST_EXPIRY")
      )
        return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = s.name.toLowerCase().includes(q);
        const typeMatch = s.type.toLowerCase().includes(q);
        const brokerMatch = s.brokerAccount?.broker?.toLowerCase().includes(q);
        const cfg = typeof s.config === "string" ? JSON.parse(s.config || "{}") : s.config;
        const symMatch = cfg?.symbol?.toLowerCase().includes(q);
        return nameMatch || typeMatch || brokerMatch || symMatch;
      }

      return true;
    });
  }, [strategies, activeTab, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-4 pb-12" aria-busy="true" aria-label="Loading strategies">
        <div className="h-12 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-accent-foreground">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                Trading Strategies
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automated algorithmic execution, live indicators, and scheduled daily runners
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-end">
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="gap-1.5"
            title="Refresh strategy statuses"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link href="/strategies/new">
            <Button
              className="gap-2 font-semibold px-4"
            >
              <Plus className="h-4 w-4" />
              New strategy
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── RMS Safety Control Center & Kill Switch ─── */}
      <RmsSafetyCard />

      {/* ─── KPI Metrics Stat Ribbon ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="bg-card/70 border-border/60 relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Total Configured
              </span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-accent-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{stats.total}</span>
              <span className="text-[11px] text-muted-foreground">strategies</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Live Engines
              </span>
              <div className="p-1.5 rounded-lg bg-profit/10 text-profit">
                <Radio className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-profit">{stats.active}</span>
              <span className="text-[11px] font-medium text-profit/90 flex items-center gap-1">
                {stats.active > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-profit animate-ping inline-block" />
                )}
                active now
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                09:15 AM Auto-Start
              </span>
              <div className="p-1.5 rounded-lg bg-warn/10 text-warn">
                <AlarmClock className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-warn">{stats.scheduled}</span>
              <span className="text-[11px] text-muted-foreground">scheduled</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Active Execution
              </span>
              <div className="p-1.5 rounded-lg bg-signal/10 text-signal">
                <Activity className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-signal">
                {stats.runningExecutions}
              </span>
              <span className="text-[11px] text-muted-foreground">executing orders</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search & Category Filter Bar ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/50 p-2 rounded-lg border border-border/60">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <Button
            variant={activeTab === "ALL" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("ALL")}
            className={cn(
              "text-xs h-10 md:h-8 px-3 rounded-lg font-semibold",
              activeTab === "ALL" && "bg-primary text-primary-foreground hover:bg-brand-hover"
            )}
          >
            All ({strategies.length})
          </Button>
          <Button
            variant={activeTab === "ACTIVE" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("ACTIVE")}
            className={cn(
              "text-xs h-10 md:h-8 px-3 rounded-lg font-semibold gap-1.5",
              activeTab === "ACTIVE" && "bg-profit text-on-profit hover:bg-profit/90"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-profit/40" />
            Live ({stats.active})
          </Button>
          <Button
            variant={activeTab === "SCHEDULED" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("SCHEDULED")}
            className={cn(
              "text-xs h-10 md:h-8 px-3 rounded-lg font-semibold gap-1.5",
              activeTab === "SCHEDULED" && "bg-warn text-on-warn hover:bg-warn/90"
            )}
          >
            <AlarmClock className="h-3 w-3" />
            Scheduled ({stats.scheduled})
          </Button>
          <Button
            variant={activeTab === "INTRADAY" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("INTRADAY")}
            className={cn(
              "text-xs h-10 md:h-8 px-3 rounded-lg font-semibold",
              activeTab === "INTRADAY" && "bg-primary text-primary-foreground"
            )}
          >
            Intraday & Momentum
          </Button>
          <Button
            variant={activeTab === "OPTIONS" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("OPTIONS")}
            className={cn(
              "text-xs h-10 md:h-8 px-3 rounded-lg font-semibold",
              activeTab === "OPTIONS" && "bg-signal text-on-signal hover:bg-signal/90"
            )}
          >
            Options & Scalpers
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search strategy or symbol..."
            className="pl-8 h-10 md:h-8 text-xs bg-background/80 border-border/70 rounded-lg focus-visible:ring-1"
          />
        </div>
      </div>

      {/* ─── Strategy Cards Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredStrategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            busy={actionId === s.id || actionId === s.id + "_as"}
            onToggle={(st) => (st.isActive ? setPendingStop(st) : toggleStrategy(st))}
            onDelete={askDelete}
            onToggleAutoStart={toggleAutoStart}
          />
        ))}

        {/* Add Strategy Dashed Card */}
        <Link href="/strategies/new" className="h-full">
          <div className="h-full min-h-[260px] rounded-lg border-2 border-dashed border-border/70 hover:border-primary/60 bg-card/30 hover:bg-primary/[0.03] transition-all flex flex-col items-center justify-center p-6 text-center group cursor-pointer">
            <div className="h-12 w-12 rounded-lg bg-primary/10 border border-primary/20 text-accent-foreground flex items-center justify-center group-hover:scale-110 group-hover:bg-brand-hover group-hover:text-primary-foreground transition-all mb-3">
              <Plus className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground group-hover:text-accent-foreground transition-colors">
              Create New Strategy
            </h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              Set up custom indicators, risk rules, option scalpers or breakout engines.
            </p>
          </div>
        </Link>
      </div>

      {/* ─── Empty Search State ─── */}
      {filteredStrategies.length === 0 && strategies.length > 0 && (
        <div className="text-center py-12 bg-card/40 rounded-lg border border-border/60">
          <SlidersHorizontal className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm font-semibold text-foreground">No matching strategies found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try adjusting your search query or switching the category tab filter.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setActiveTab("ALL");
            }}
            className="mt-3 text-xs h-8"
          >
            Clear Filters
          </Button>
        </div>
      )}

      {/* ─── Global Empty State ─── */}
      {strategies.length === 0 && (
        <div className="text-center py-20 bg-card/30 rounded-lg border border-border/60">
          <div className="h-14 w-14 rounded-lg bg-muted/60 flex items-center justify-center mx-auto mb-4 text-muted-foreground/60">
            <Bot className="h-8 w-8" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No Trading Strategies Configured</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Get started by launching our recommended 1-click ₹500/day preset above, or build a custom strategy from scratch.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/strategies/new">
              <Button className="font-semibold">
                <Plus className="h-4 w-4" /> New strategy
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={handleQuickDeploy500}
              className="gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Quick deploy ₹500 preset
            </Button>
          </div>
        </div>
      )}

      {/* ─── 1-Click Quick Deploy Presets ─── */}
      <section aria-labelledby="presets-title" className="space-y-3">
      <h2 id="presets-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick deploy presets</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Stock Options Buying preset */}
        <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-card p-4 flex flex-col justify-between gap-3 hover:border-primary/50 transition-all">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-primary hover:bg-brand-hover text-primary-foreground font-semibold px-2 py-0 text-[9px] tracking-wider uppercase">
                  Options buying
                </Badge>
                <Badge variant="outline" className="text-[9px] font-medium border-primary/30 text-accent-foreground bg-primary/5 gap-1 py-0">
                  <Clock className="h-2.5 w-2.5" />
                  09:15 AM
                </Badge>
              </div>
              <span className="text-[10px] font-semibold text-accent-foreground bg-primary/10 px-2 py-0.5 rounded-md">
                180+ F&amp;O Scanner
              </span>
            </div>

            <div>
              <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent-foreground shrink-0" />
                Stock Option Auto-Hunter (Banker &amp; Runner)
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                Scans 180+ F&amp;O stocks for 5%–10% momentum. Buys ITM options, books 50% at T1 (+50% ROI), trails SL to cost, and rides T2 (+100% ROI).
              </p>
            </div>

            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground pt-0.5 flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-accent-foreground" />
                50% Lock @ T1
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-accent-foreground" />
                Breakeven Trail
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-accent-foreground" />
                NIFTY Macro Gate
              </span>
            </div>
          </div>

          <Button
            onClick={handleQuickDeployStockOptions}
            disabled={actionId === "quick-stock-options"}
            className="w-full bg-primary hover:bg-brand-hover text-primary-foreground font-semibold h-8.5 text-xs shadow-md rounded-lg transition-all flex items-center justify-center gap-1.5 mt-1"
          >
            {actionId === "quick-stock-options" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deploying Options...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 fill-white" />
                Deploy Options for Tomorrow
              </>
            )}
          </Button>
        </div>

        {/* Card 2: Intraday Auto Stock Picker (Equity 5x MIS) */}
        <div className="relative overflow-hidden rounded-lg border border-profit/30 bg-card p-4 flex flex-col justify-between gap-3 hover:border-profit/50 transition-all">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-profit hover:bg-profit/90 text-on-profit font-semibold px-2 py-0 text-[9px] tracking-wider uppercase">
                  Recommended preset
                </Badge>
                <Badge variant="outline" className="text-[9px] font-medium border-profit/30 text-profit bg-profit/5 gap-1 py-0">
                  <Clock className="h-2.5 w-2.5" />
                  09:15 AM
                </Badge>
              </div>
              <span className="text-[10px] font-semibold text-profit bg-profit/10 px-2 py-0.5 rounded-md">
                5x MIS Leverage
              </span>
            </div>

            <div>
              <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-warn shrink-0" />
                Intraday Auto Stock Picker (₹500 Target)
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                Scans 180+ F&amp;O stocks for highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with dynamic ₹500 target &amp; ₹500 SL.
              </p>
            </div>

            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground pt-0.5 flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-profit" />
                5x MIS Leverage
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-profit" />
                Trailing SL
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-profit" />
                Auto 03:05 PM EOD
              </span>
            </div>
          </div>

          <Button
            onClick={handleQuickDeploy500}
            disabled={actionId === "quick-500"}
            className="w-full bg-profit hover:bg-profit/90 text-on-profit font-semibold h-8.5 text-xs shadow-md rounded-lg transition-all flex items-center justify-center gap-1.5 mt-1"
          >
            {actionId === "quick-500" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deploying Strategy...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 fill-white" />
                Deploy Strategy for Tomorrow
              </>
            )}
          </Button>
        </div>
      </div>
      </section>

      {/* Stop Confirmation Modal */}
      <ConfirmDialog
        open={pendingStop !== null}
        onOpenChange={(o) => !o && setPendingStop(null)}
        onConfirm={() => pendingStop && toggleStrategy(pendingStop)}
        title={pendingStop ? `Stop "${pendingStop.name}"?` : "Stop strategy?"}
        description="Stopping the engine squares off any open position at market price and ends the current session."
        confirmText="Stop and square off"
        variant="destructive"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleDelete}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : "Delete Strategy?"}
        description="This will permanently delete the strategy and all its execution logs. This action cannot be undone."
        confirmText="Delete Strategy"
        variant="destructive"
      />
    </div>
  );
}

// ─── Strategy Card Component ──────────────────────────────────────────────────

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
  const router = useRouter();
  const cfg: StrategyConfig =
    typeof s.config === "string" ? JSON.parse(s.config || "{}") : s.config || {};

  const is15Min = s.type === "BREAKOUT_15MIN";
  const isEmaVwap = s.type === "EMA_VWAP_CROSSOVER";
  const isNiftyScalper = s.type === "NIFTY_OPTIONS_SCALPER";
  const isStockOptions = s.type === "STOCK_OPTIONS_BUYING";
  const isGammaBlast = s.type === "GAMMA_BLAST_EXPIRY";

  const status: RunStatus = s.isActive ? "RUNNING" : s.latestExecution?.status === "COMPLETED" ? "COMPLETED" : "STOPPED";
  const paper = Boolean(s.isPaperTrade ?? cfg.isPaperTrade);
  const pnl = typeof s.todayPnl === "number" ? s.todayPnl : null;

  const stopLossText = isStockOptions
    ? "Breakeven @ T1"
    : isGammaBlast
      ? `${cfg.initialSlPct || 50}% premium`
      : isNiftyScalper
        ? "-7 pts"
        : is15Min
          ? "Candle SL"
          : cfg.exitExactAtTarget
            ? `Fixed ₹${cfg.stopLossRs ?? 500}`
            : isEmaVwap
              ? "Candle low"
              : cfg.stopLossRs
                ? `₹${cfg.stopLossRs}`
                : "Dynamic";

  const targetText = isStockOptions
    ? cfg.target1RR && cfg.target2RR
      ? `1:${cfg.target1RR} / 1:${cfg.target2RR} RR`
      : "1:1.5 / 1:3 RR"
    : isGammaBlast
      ? "2x to 5x ratchet"
      : isNiftyScalper
        ? `+${cfg.targetPoints ?? 10} pts`
        : cfg.exitExactAtTarget
          ? `Fixed ₹${cfg.targetRs ?? 500}`
          : is15Min
            ? "1:2 RR + trail"
            : isEmaVwap
              ? "15-EMA / VWAP"
              : cfg.targetRs
                ? `₹${cfg.targetRs}`
                : "Dynamic";

  return (
    <Card
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-colors",
        s.isActive ? "border-profit/40" : "border-border hover:border-primary/40"
      )}
    >
      <CardHeader className="space-y-2 p-4 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge paper={paper} />
          <StatusBadge status={status} />
          {s.autoStart && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn-subtle px-2 py-0.5 text-[11px] font-semibold text-warn">
              <AlarmClock className="h-3 w-3" aria-hidden /> 09:15
            </span>
          )}
        </div>
        <Link href={`/strategies/${s.id}`} prefetch={false} className="block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <CardTitle className="truncate text-base font-semibold leading-tight text-foreground">{s.name}</CardTitle>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {typeLabel(s.type)} · <span className="font-semibold text-foreground">{cfg.symbol || "AUTO"}</span> · {cfg.exchange || "NSE"}
          </p>
        </Link>
      </CardHeader>

      <CardContent className="mt-auto space-y-3 p-4 pt-0">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="min-w-0 rounded-md bg-sunken px-2 py-2">
            <p className="text-[11px] text-muted-foreground">Today</p>
            <p className={cn("num truncate text-sm font-semibold", pnl === null ? "text-muted-foreground" : pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-foreground")}>
              {pnl === null ? EMPTY : formatINR(pnl, { signed: true })}
            </p>
          </div>
          <div className="min-w-0 rounded-md bg-sunken px-2 py-2">
            <p className="text-[11px] text-muted-foreground">Stop-loss</p>
            <p className="truncate text-sm font-semibold text-loss" title={stopLossText}>{stopLossText}</p>
          </div>
          <div className="min-w-0 rounded-md bg-sunken px-2 py-2">
            <p className="text-[11px] text-muted-foreground">Target</p>
            <p className="truncate text-sm font-semibold text-profit" title={targetText}>{targetText}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={s.isActive ? "danger" : "success"}
            disabled={busy}
            onClick={() => onToggle(s)}
            className="h-11 flex-1 md:h-10"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : s.isActive ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            {s.isActive ? "Stop" : "Start"}
          </Button>
          <Link href={`/strategies/${s.id}`} prefetch={false}>
            <Button variant="outline" className="h-11 md:h-10">
              Details <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
          <OverflowMenu label={`More actions for ${s.name}`}>
            {(close) => (
              <>
                <MenuItem icon={<Settings2 className="h-4 w-4" />} onClick={() => { close(); router.push(`/strategies/${s.id}/edit`); }}>
                  Edit strategy
                </MenuItem>
                <MenuItem icon={<AlarmClock className="h-4 w-4" />} disabled={busy} onClick={() => { close(); onToggleAutoStart(s); }}>
                  {s.autoStart ? "Disable 09:15 auto-start" : "Arm 09:15 auto-start"}
                </MenuItem>
                <div className="my-1 h-px bg-border" role="separator" />
                <MenuItem icon={<Trash2 className="h-4 w-4" />} danger disabled={busy} onClick={() => { close(); onDelete(s); }}>
                  Delete
                </MenuItem>
              </>
            )}
          </OverflowMenu>
        </div>
      </CardContent>
    </Card>
  );
}
