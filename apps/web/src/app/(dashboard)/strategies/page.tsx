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
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

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
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <Bot className="w-5 h-5 text-primary absolute" />
        </div>
        <p className="text-xs font-medium text-muted-foreground animate-pulse">
          Loading algorithmic strategy engines...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-[fade-up_0.4s_ease_both]">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/10 border border-blue-600/20 text-blue-600 shadow-xs">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
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
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-1.5 text-xs h-9 bg-card border-border/80 hover:bg-accent/50"
            title="Refresh strategy statuses"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link href="/strategies/new">
            <Button
              size="sm"
              className="gap-2 text-xs h-9 font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 px-4"
            >
              <Plus className="h-4 w-4" />
              New Strategy
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── KPI Metrics Stat Ribbon ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Total Configured
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black">{stats.total}</span>
              <span className="text-[11px] text-muted-foreground">strategies</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Live Engines
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Radio className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{stats.active}</span>
              <span className="text-[11px] font-medium text-emerald-600/90 flex items-center gap-1">
                {stats.active > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                )}
                active now
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                09:15 AM Auto-Start
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                <AlarmClock className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600">{stats.scheduled}</span>
              <span className="text-[11px] text-muted-foreground">scheduled</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/60 shadow-xs relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Active Execution
              </span>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                <Activity className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-600">
                {stats.runningExecutions}
              </span>
              <span className="text-[11px] text-muted-foreground">executing orders</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── 1-Click Quick Deploy Presets (Compact Side-by-Side Grid) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Stock Options Buying (80% Win-Rate Architecture) */}
        <div className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-card to-indigo-950/15 p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-blue-500/50 transition-all">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-600 text-white font-extrabold px-2 py-0 text-[9px] tracking-wider uppercase shadow-2xs">
                  🔥 80% WIN-RATE
                </Badge>
                <Badge variant="outline" className="text-[9px] font-medium border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5 gap-1 py-0">
                  <Clock className="h-2.5 w-2.5" />
                  09:15 AM
                </Badge>
              </div>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                180+ F&amp;O Scanner
              </span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                Stock Option Auto-Hunter (Banker &amp; Runner)
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                Scans 180+ F&amp;O stocks for 5%–10% momentum. Buys ITM options, books 50% at T1 (+50% ROI), trails SL to cost, and rides T2 (+100% ROI).
              </p>
            </div>

            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground pt-0.5 flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-blue-500" />
                50% Lock @ T1
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-blue-500" />
                Breakeven Trail
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-blue-500" />
                NIFTY Macro Gate
              </span>
            </div>
          </div>

          <Button
            onClick={handleQuickDeployStockOptions}
            disabled={actionId === "quick-stock-options"}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-8.5 text-xs shadow-md shadow-blue-600/20 rounded-lg transition-all flex items-center justify-center gap-1.5 mt-1"
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
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-card to-blue-950/10 p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-emerald-500/50 transition-all">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2 py-0 text-[9px] tracking-wider uppercase shadow-2xs">
                  ⭐ RECOMMENDED PRESET
                </Badge>
                <Badge variant="outline" className="text-[9px] font-medium border-emerald-500/30 text-emerald-600 bg-emerald-500/5 gap-1 py-0">
                  <Clock className="h-2.5 w-2.5" />
                  09:15 AM
                </Badge>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                5x MIS Leverage
              </span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                Intraday Auto Stock Picker (₹500 Target)
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                Scans 180+ F&amp;O stocks for highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with dynamic ₹500 target &amp; ₹500 SL.
              </p>
            </div>

            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground pt-0.5 flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                5x MIS Leverage
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Trailing SL
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Auto 03:05 PM EOD
              </span>
            </div>
          </div>

          <Button
            onClick={handleQuickDeploy500}
            disabled={actionId === "quick-500"}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8.5 text-xs shadow-md shadow-emerald-600/20 rounded-lg transition-all flex items-center justify-center gap-1.5 mt-1"
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

      {/* ─── Search & Category Filter Bar ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/50 p-2 rounded-xl border border-border/60">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <Button
            variant={activeTab === "ALL" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("ALL")}
            className={cn(
              "text-xs h-8 px-3 rounded-lg font-semibold",
              activeTab === "ALL" && "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            All ({strategies.length})
          </Button>
          <Button
            variant={activeTab === "ACTIVE" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("ACTIVE")}
            className={cn(
              "text-xs h-8 px-3 rounded-lg font-semibold gap-1.5",
              activeTab === "ACTIVE" && "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live ({stats.active})
          </Button>
          <Button
            variant={activeTab === "SCHEDULED" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("SCHEDULED")}
            className={cn(
              "text-xs h-8 px-3 rounded-lg font-semibold gap-1.5",
              activeTab === "SCHEDULED" && "bg-amber-600 text-white hover:bg-amber-700"
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
              "text-xs h-8 px-3 rounded-lg font-semibold",
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
              "text-xs h-8 px-3 rounded-lg font-semibold",
              activeTab === "OPTIONS" && "bg-purple-600 text-white hover:bg-purple-700"
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
            className="pl-8 h-8 text-xs bg-background/80 border-border/70 rounded-lg focus-visible:ring-1"
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
            onToggle={toggleStrategy}
            onDelete={askDelete}
            onToggleAutoStart={toggleAutoStart}
          />
        ))}

        {/* Add Strategy Dashed Card */}
        <Link href="/strategies/new" className="h-full">
          <div className="h-full min-h-[260px] rounded-2xl border-2 border-dashed border-border/70 hover:border-blue-500/60 bg-card/30 hover:bg-blue-500/[0.03] transition-all flex flex-col items-center justify-center p-6 text-center group cursor-pointer">
            <div className="h-12 w-12 rounded-2xl bg-blue-600/10 border border-blue-600/20 text-blue-600 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xs mb-3">
              <Plus className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-foreground group-hover:text-blue-600 transition-colors">
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
        <div className="text-center py-12 bg-card/40 rounded-2xl border border-border/60">
          <SlidersHorizontal className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground">No matching strategies found</p>
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
        <div className="text-center py-20 bg-card/30 rounded-2xl border border-border/60">
          <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4 text-muted-foreground/60">
            <Bot className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-foreground">No Trading Strategies Configured</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Get started by launching our recommended 1-click ₹500/day preset above, or build a custom strategy from scratch.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button
              onClick={handleQuickDeploy500}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Quick Deploy ₹500 Preset
            </Button>
            <Link href="/strategies/new">
              <Button variant="outline" className="text-xs h-9">
                Build Custom Strategy
              </Button>
            </Link>
          </div>
        </div>
      )}

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
  const cfg: StrategyConfig =
    typeof s.config === "string" ? JSON.parse(s.config || "{}") : s.config || {};

  const is15Min = s.type === "BREAKOUT_15MIN";
  const isEmaVwap = s.type === "EMA_VWAP_CROSSOVER";
  const isNiftyScalper = s.type === "NIFTY_OPTIONS_SCALPER";
  const isStockOptions = s.type === "STOCK_OPTIONS_BUYING";
  const isGammaBlast = s.type === "GAMMA_BLAST_EXPIRY";
  const isDailyScalper = s.type === "DAILY_SCALPER";

  return (
    <Card
      className={cn(
        "relative rounded-2xl overflow-hidden transition-all duration-300 border bg-card hover:shadow-md flex flex-col justify-between",
        s.isActive
          ? "border-emerald-500/40 shadow-[0_4px_20px_rgba(16,185,129,0.08)] ring-1 ring-emerald-500/20"
          : "border-border/70 hover:border-border"
      )}
    >
      {/* Top Active Ambient Bar */}
      {s.isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500" />
      )}

      <CardHeader className="p-4 pb-3 space-y-2.5">
        {/* Top Badges Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Strategy Type Badge */}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border",
                isNiftyScalper && "bg-purple-500/10 text-purple-600 border-purple-500/20",
                isStockOptions && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                isGammaBlast && "bg-orange-500/10 text-orange-600 border-orange-500/20",
                is15Min && "bg-blue-500/10 text-blue-600 border-blue-500/20",
                isEmaVwap && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                isDailyScalper && "bg-cyan-500/10 text-cyan-600 border-cyan-500/20"
              )}
            >
              {isNiftyScalper && <Target className="h-3 w-3" />}
              {isStockOptions && <Flame className="h-3 w-3" />}
              {isGammaBlast && <Zap className="h-3 w-3" />}
              {is15Min && <BarChart2 className="h-3 w-3" />}
              {isEmaVwap && <TrendingUp className="h-3 w-3" />}
              {isDailyScalper && <Zap className="h-3 w-3" />}
              <span>
                {isNiftyScalper
                  ? "Nifty 10-Pt Scalper"
                  : isStockOptions
                    ? "Stock Options"
                    : isGammaBlast
                      ? "Gamma Blast (Expiry)"
                      : is15Min
                        ? "15-Min Breakout (Dynamic)"
                        : isEmaVwap
                          ? "15-EMA & VWAP"
                          : isDailyScalper
                            ? "Daily Scalper"
                            : s.type}
              </span>
            </span>

            {/* Product Tag */}
            {cfg.product && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary/80 text-muted-foreground border border-border/60">
                {cfg.product}
              </span>
            )}
          </div>

          {/* Live Status Pill */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-1 rounded-full border shadow-2xs",
              s.isActive
                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                : "bg-muted text-muted-foreground border-border/70"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                s.isActive ? "bg-emerald-500 animate-ping" : "bg-slate-400"
              )}
            />
            {s.isActive ? "LIVE" : "OFF"}
          </div>
        </div>

        {/* Strategy Title & Subtitle */}
        <div>
          <CardTitle className="text-base font-bold text-foreground leading-tight line-clamp-1">
            {s.name}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="font-semibold text-foreground/80">
              {cfg.symbol || "AUTO"}
            </span>
            <span>•</span>
            <span>{cfg.exchange || "NSE"}</span>
            <span>•</span>
            <span className="truncate max-w-[120px]">
              {s.brokerAccount?.broker ? `${s.brokerAccount.broker}` : "Zerodha"}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3.5">
        {/* ─── Risk & Sizing 3-Box Matrix ─── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-xl bg-secondary/40 border border-border/50 text-center flex flex-col justify-center">
            <span className="text-[10px] font-medium text-muted-foreground">Sizing</span>
            <span
              className="text-xs font-bold text-foreground truncate mt-0.5"
              title={
                isStockOptions
                  ? `Max Capital: ₹${Number(cfg.maxCapital || 25000).toLocaleString("en-IN")} • Auto Lots`
                  : undefined
              }
            >
              {isStockOptions
                ? (cfg.maxCapital ? `₹${Number(cfg.maxCapital).toLocaleString("en-IN")}` : "Auto Lots")
                : isGammaBlast
                  ? `${cfg.lots || 1} Lot${(cfg.lots || 1) > 1 ? "s" : ""}`
                  : isNiftyScalper
                    ? "Auto Margin"
                    : is15Min
                      ? "Risk-Based (5x)"
                      : isEmaVwap && cfg.symbol === "AUTO"
                        ? "Risk-Based (5x)"
                        : cfg.symbol === "AUTO"
                          ? "Auto (5x)"
                          : cfg.qty
                            ? `${cfg.qty} Qty`
                            : "Dynamic"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center flex flex-col justify-center">
            <span className="text-[10px] font-medium text-rose-500/80">Stop Loss</span>
            <span
              className="text-xs font-bold text-rose-600 mt-0.5 truncate"
              title={
                isStockOptions
                  ? "Mother candle low SL with breakeven trailing at Target 1"
                  : undefined
              }
            >
              {isStockOptions
                ? "Breakeven @ T1"
                : isGammaBlast
                  ? `${cfg.initialSlPct || 50}% Prem SL`
                  : isNiftyScalper
                    ? "-7 Pts (Server SL)"
                    : is15Min
                      ? "Candle SL (Trailed)"
                      : cfg.exitExactAtTarget
                        ? `Fixed ₹${cfg.stopLossRs ?? 500}`
                        : isEmaVwap
                          ? "Candle Low (Trailed)"
                          : cfg.stopLossRs
                            ? `₹${cfg.stopLossRs}`
                            : "Dynamic SL"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center flex flex-col justify-center">
            <span className="text-[10px] font-medium text-emerald-600/80">Target</span>
            <span
              className="text-xs font-bold text-emerald-600 mt-0.5 truncate"
              title={
                isStockOptions
                  ? `Target 1: 1:${cfg.target1RR || 1.5} RR (50% Banker Lock) • Target 2: 1:${cfg.target2RR || 3.0} RR (Runner Trail)`
                  : undefined
              }
            >
              {isStockOptions
                ? (cfg.target1RR && cfg.target2RR
                    ? `1:${cfg.target1RR} & 1:${cfg.target2RR} RR`
                    : "1:1.5 & 1:3 RR")
                : isGammaBlast
                  ? "2x–5x Ratchet"
                  : isNiftyScalper
                    ? `+${cfg.targetPoints ?? 10} Pts (Banker/Runner)`
                    : cfg.exitExactAtTarget
                      ? `Fixed ₹${cfg.targetRs ?? 500}`
                      : is15Min
                        ? "1:2 RR + Uncapped Trail"
                        : isEmaVwap
                          ? "15-EMA / VWAP"
                          : cfg.targetRs
                            ? `₹${cfg.targetRs}`
                            : "Dynamic RR"}
            </span>
          </div>
        </div>

        {/* ─── Status & Auto-Start Indicator ─── */}
        <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-secondary/30 border border-border/40">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <Activity className="h-3 w-3 text-muted-foreground/70" />
            <span>Last Status:</span>
            <span
              className={cn(
                "font-bold uppercase text-[10px] px-1.5 py-0.2 rounded",
                s.latestExecution?.status === "RUNNING" && "bg-emerald-500/10 text-emerald-600",
                s.latestExecution?.status === "STOPPED" && "bg-amber-500/10 text-amber-600",
                s.latestExecution?.status === "ERROR" && "bg-rose-500/10 text-rose-600",
                (!s.latestExecution || s.latestExecution?.status === "COMPLETED") &&
                "bg-slate-500/10 text-slate-600 dark:text-slate-400"
              )}
            >
              {s.latestExecution?.status ?? "READY"}
            </span>
          </div>

          {s.autoStart && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              <AlarmClock className="h-3 w-3" />
              09:15 AM
            </span>
          )}
        </div>

        {/* ─── Action Controls ─── */}
        <div className="flex items-center gap-1.5 pt-1">
          {/* Main Start / Stop Button */}
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onToggle(s)}
            className={cn(
              "flex-1 h-9 font-bold text-xs gap-1.5 rounded-xl transition-all shadow-xs",
              s.isActive
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : s.isActive ? (
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

          {/* Auto-Start Arm Button */}
          <Button
            variant="outline"
            size="icon"
            disabled={busy}
            onClick={() => onToggleAutoStart(s)}
            title={
              s.autoStart
                ? "Auto-Start Armed (Starts at 09:15 AM) — Click to disable"
                : "Auto-Start Disarmed — Click to arm for 09:15 AM"
            }
            className={cn(
              "h-9 w-9 rounded-xl transition-all border",
              s.autoStart
                ? "bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20"
                : "text-muted-foreground hover:text-amber-600 hover:border-amber-500/30"
            )}
          >
            <AlarmClock className="h-4 w-4" />
          </Button>

          {/* Execution Logs & Monitor */}
          <Link href={`/strategies/${s.id}`}>
            <Button
              variant="outline"
              size="icon"
              title="View Strategy Execution & Logs"
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-blue-600 hover:border-blue-500/30"
            >
              <Activity className="h-4 w-4" />
            </Button>
          </Link>

          {/* Settings / Edit */}
          <Link href={`/strategies/${s.id}/edit`}>
            <Button
              variant="outline"
              size="icon"
              title="Edit Strategy Parameters"
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:border-border"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </Link>

          {/* Delete */}
          <Button
            variant="outline"
            size="icon"
            disabled={busy}
            onClick={() => onDelete(s)}
            title="Delete Strategy"
            className="h-9 w-9 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/30"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
