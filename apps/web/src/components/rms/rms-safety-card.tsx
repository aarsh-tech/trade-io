"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  Power,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { riskApi } from "@/lib/api";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export interface RiskStatusData {
  userId: string;
  killSwitchActive: boolean;
  killSwitchTriggeredAt: string | null;
  maxDailyLoss: number;
  maxOrderValue: number;
  maxOrderQty: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalDailyPnl: number;
  lossUsagePct: number;
  isLossLimitBreached: boolean;
}

interface RmsSafetyCardProps {
  compact?: boolean;
  className?: string;
  onStatusChange?: (status: RiskStatusData) => void;
}

export function RmsSafetyCard({ compact = false, className, onStatusChange }: RmsSafetyCardProps) {
  const [status, setStatus] = useState<RiskStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    maxDailyLoss: 5000,
    maxOrderValue: 200000,
    maxOrderQty: 1800,
  });

  const loadStatus = useCallback(async () => {
    try {
      const res = await riskApi.getStatus();
      const data: RiskStatusData = res.data?.data;
      if (data) {
        setStatus(data);
        setSettingsForm({
          maxDailyLoss: data.maxDailyLoss || 5000,
          maxOrderValue: data.maxOrderValue || 200000,
          maxOrderQty: data.maxOrderQty || 1800,
        });
        onStatusChange?.(data);
      }
    } catch {
      // Quiet fail on network hiccups
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadStatus();
    // Auto refresh every 15 seconds
    const interval = setInterval(loadStatus, 15_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  async function handleTriggerKillSwitch() {
    setActionLoading(true);
    try {
      await riskApi.triggerKillSwitch("Manual one-click emergency shutdown from UI");
      toast.error("🛑 EMERGENCY KILL SWITCH ACTIVATED", {
        description: "All open algo positions squared off, pending orders cancelled, and strategies halted.",
      });
      await loadStatus();
    } catch (err: any) {
      toast.error("Failed to trigger Kill Switch: " + (err?.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResetKillSwitch() {
    setActionLoading(true);
    try {
      await riskApi.resetKillSwitch();
      toast.success("✅ Trading Safety Lock Released", {
        description: "Kill switch has been reset. Automated and manual trading re-enabled.",
      });
      await loadStatus();
    } catch (err: any) {
      toast.error("Failed to reset Kill Switch: " + (err?.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      await riskApi.updateSettings({
        maxDailyLoss: Number(settingsForm.maxDailyLoss),
        maxOrderValue: Number(settingsForm.maxOrderValue),
        maxOrderQty: Number(settingsForm.maxOrderQty),
      });
      toast.success("RMS Safety settings updated successfully");
      setShowSettingsModal(false);
      await loadStatus();
    } catch (err: any) {
      toast.error("Failed to update RMS settings: " + (err?.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckBrokerHealth() {
    try {
      const res = await riskApi.checkBrokerHealth();
      const accounts = res.data?.data || [];
      const hasExpired = accounts.some((a: any) => a.tokenHealth === "EXPIRED");
      if (hasExpired) {
        toast.warning("⚠️ Expired Broker Session Detected", {
          description: "One or more broker tokens require daily re-login before 9:15 AM IST.",
        });
      } else {
        toast.success("✅ Broker Sessions Healthy", {
          description: "All connected broker tokens are active and valid.",
        });
      }
    } catch {
      toast.error("Broker health check failed");
    }
  }

  if (loading && !status) {
    return (
      <Card className={cn("border border-slate-200/80 bg-white/70 backdrop-blur-xs shadow-xs animate-pulse", className)}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="h-5 w-48 bg-slate-200 rounded-md" />
          <div className="h-8 w-24 bg-slate-200 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  const isKillActive = status?.killSwitchActive || false;
  const totalPnl = status?.totalDailyPnl || 0;
  const maxLoss = status?.maxDailyLoss || 5000;
  const lossUsage = status?.lossUsagePct || 0;

  // Warning level
  const isDanger = lossUsage >= 80 || isKillActive;
  const isWarning = lossUsage >= 50 && lossUsage < 80;

  return (
    <>
      <Card
        className={cn(
          "transition-all duration-300 border shadow-xs overflow-hidden",
          isKillActive
            ? "border-rose-300 bg-rose-50/70 dark:bg-rose-950/20"
            : isDanger
            ? "border-amber-300 bg-amber-50/50"
            : "border-slate-200/80 bg-white/95 backdrop-blur-xs",
          className
        )}
      >
        <CardContent className="p-4 sm:p-5">
          {/* Top Row: Shield & Status Badge + Quick Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "p-2 rounded-xl flex items-center justify-center transition-colors",
                  isKillActive
                    ? "bg-rose-600 text-white animate-pulse"
                    : isDanger
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                )}
              >
                {isKillActive ? (
                  <AlertOctagon className="h-5 w-5" />
                ) : isDanger ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    Risk Management System (RMS)
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      isKillActive
                        ? "bg-rose-600 text-white border-rose-600 animate-pulse"
                        : isDanger
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-emerald-50 text-emerald-700 border-emerald-300"
                    )}
                  >
                    {isKillActive ? "Kill Switch Active" : "Protected"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isKillActive
                    ? "Trading is LOCKED. All automated strategy entries suspended."
                    : "Real-time daily loss protection & runaway execution circuit breaker."}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckBrokerHealth}
                className="h-8 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900 bg-white"
                title="Verify Broker Session Tokens"
              >
                <Activity className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden md:inline">Broker Health</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsModal(true)}
                className="h-8 text-xs gap-1.5 border-slate-200 text-slate-600 hover:text-slate-900 bg-white"
                title="Configure RMS Risk Parameters"
              >
                <Sliders className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden md:inline">Limits</span>
              </Button>

              {isKillActive ? (
                <Button
                  size="sm"
                  onClick={handleResetKillSwitch}
                  disabled={actionLoading}
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Kill Switch</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowKillConfirm(true)}
                  disabled={actionLoading}
                  className="h-8 text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs cursor-pointer"
                  title="Instantly square off all algo positions and cancel pending orders"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>Kill Switch</span>
                </Button>
              )}
            </div>
          </div>

          {/* Bottom Row: P&L Metrics & Loss Limit Progress */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3.5">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Today&apos;s Realized P&amp;L
              </span>
              <span
                className={cn(
                  "text-sm sm:text-base font-bold font-mono tracking-tight",
                  (status?.realizedPnl || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {(status?.realizedPnl || 0) >= 0 ? "+" : ""}₹
                {(status?.realizedPnl || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Unrealized M2M
              </span>
              <span
                className={cn(
                  "text-sm sm:text-base font-bold font-mono tracking-tight",
                  (status?.unrealizedPnl || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {(status?.unrealizedPnl || 0) >= 0 ? "+" : ""}₹
                {(status?.unrealizedPnl || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Net Total P&amp;L
              </span>
              <span
                className={cn(
                  "text-sm sm:text-base font-bold font-mono tracking-tight",
                  totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {totalPnl >= 0 ? "+" : ""}₹
                {totalPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                <span>Daily Loss Cap</span>
                <span className={cn("font-bold font-mono", isDanger ? "text-rose-600" : "text-slate-700")}>
                  {lossUsage}% used
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500 rounded-full",
                    isDanger ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, lossUsage))}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Max Allowed Loss: ₹{maxLoss.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Kill Switch Confirm Dialog */}
      <ConfirmDialog
        open={showKillConfirm}
        onOpenChange={setShowKillConfirm}
        onConfirm={handleTriggerKillSwitch}
        title="Trigger Emergency Kill Switch?"
        description="WARNING: This will immediately square off ALL active algo positions at market price, cancel all open/pending orders, and stop all running strategies. Automated trading will be locked for the rest of the day."
        confirmText="Yes, Execute Emergency Flatten"
        cancelText="Abort"
        variant="destructive"
      />

      {/* ─── Premium Institutional RMS Settings Modal ─── */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="max-w-xl w-full p-0 overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
          {/* Top Banner Header */}
          <div className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white p-6 pb-5 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/30 flex items-center justify-center shrink-0">
                  <div className="h-full w-full bg-slate-950/40 rounded-[10px] flex items-center justify-center">
                    <ShieldAlert className="h-6 w-6 text-blue-300" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg font-bold tracking-tight text-white m-0">
                      Risk Management Settings
                    </DialogTitle>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-[10px] font-semibold uppercase px-2 py-0.5">
                      Hardware Guard
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Hard execution guardrails enforced server-side before orders reach broker APIs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="p-6 pt-5 space-y-5">
            {/* Card 1: Daily Max Loss Circuit Breaker */}
            <div className="rounded-xl border border-rose-100 dark:border-rose-950/50 bg-rose-50/30 dark:bg-rose-950/10 p-4 transition-all hover:border-rose-200">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider block">
                      Daily Max Loss Threshold
                    </label>
                    <span className="text-[11px] text-slate-500 block">
                      Automatically fires Kill Switch and squares off all positions
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold border-rose-200 text-rose-700 bg-rose-50">
                  Auto-Flatten
                </Badge>
              </div>

              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sm font-bold text-slate-400">
                  ₹
                </span>
                <input
                  type="number"
                  min="500"
                  step="500"
                  value={settingsForm.maxDailyLoss || ""}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, maxDailyLoss: Number(e.target.value) }))
                  }
                  className="w-full pl-8 pr-28 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold font-mono text-base focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="5000"
                  required
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-mono font-semibold text-slate-400">
                  ₹ {new Intl.NumberFormat('en-IN').format(settingsForm.maxDailyLoss || 0)}
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-400 mr-1 uppercase">Presets:</span>
                {[2500, 5000, 10000, 25000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSettingsForm((prev) => ({ ...prev, maxDailyLoss: preset }))}
                    className={cn(
                      "text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer",
                      settingsForm.maxDailyLoss === preset
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs shadow-rose-500/30"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    )}
                  >
                    ₹{new Intl.NumberFormat('en-IN').format(preset)}
                  </button>
                ))}
              </div>
            </div>

            {/* Card 2: Max Single Order Value (Fat-Finger Guard) */}
            <div className="rounded-xl border border-amber-100 dark:border-amber-950/50 bg-amber-50/30 dark:bg-amber-950/10 p-4 transition-all hover:border-amber-200">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider block">
                      Max Single Order Value
                    </label>
                    <span className="text-[11px] text-slate-500 block">
                      Fat-finger guard: blocks orders exceeding this rupee amount
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold border-amber-200 text-amber-700 bg-amber-50">
                  Value Clamp
                </Badge>
              </div>

              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sm font-bold text-slate-400">
                  ₹
                </span>
                <input
                  type="number"
                  min="10000"
                  step="10000"
                  value={settingsForm.maxOrderValue || ""}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, maxOrderValue: Number(e.target.value) }))
                  }
                  className="w-full pl-8 pr-32 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold font-mono text-base focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="200000"
                  required
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-mono font-semibold text-slate-400">
                  ₹ {new Intl.NumberFormat('en-IN').format(settingsForm.maxOrderValue || 0)}
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-400 mr-1 uppercase">Presets:</span>
                {[50000, 100000, 200000, 500000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSettingsForm((prev) => ({ ...prev, maxOrderValue: preset }))}
                    className={cn(
                      "text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer",
                      settingsForm.maxOrderValue === preset
                        ? "bg-amber-600 text-white border-amber-600 shadow-xs shadow-amber-500/30"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    )}
                  >
                    ₹{new Intl.NumberFormat('en-IN').format(preset)}
                  </button>
                ))}
              </div>
            </div>

            {/* Card 3: Max Quantity / Exchange Freeze Clamp */}
            <div className="rounded-xl border border-blue-100 dark:border-blue-950/50 bg-blue-50/30 dark:bg-blue-950/10 p-4 transition-all hover:border-blue-200">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider block">
                      Max Quantity per Order
                    </label>
                    <span className="text-[11px] text-slate-500 block">
                      Enforces exchange freeze clamps to prevent broker order rejections
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold border-blue-200 text-blue-700 bg-blue-50">
                  Qty Ceiling
                </Badge>
              </div>

              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-xs font-bold text-slate-400">
                  QTY
                </span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={settingsForm.maxOrderQty || ""}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, maxOrderQty: Number(e.target.value) }))
                  }
                  className="w-full pl-12 pr-20 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold font-mono text-base focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="1800"
                  required
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-mono font-semibold text-slate-400">
                  Units
                </span>
              </div>

              {/* Quick Index Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-400 mr-1 uppercase">Index Freeze:</span>
                {[
                  { name: "NIFTY", qty: 1800 },
                  { name: "BANKNIFTY", qty: 900 },
                  { name: "SENSEX", qty: 500 },
                  { name: "FINNIFTY", qty: 1800 },
                ].map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setSettingsForm((prev) => ({ ...prev, maxOrderQty: item.qty }))}
                    className={cn(
                      "text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1",
                      settingsForm.maxOrderQty === item.qty
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-500/30"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    )}
                  >
                    <span>{item.name}</span>
                    <span className="opacity-70 text-[10px]">({item.qty})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Active Guard Info Strip */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>3s idempotency dedup and 4 orders/min runaway breaker are automatically active.</span>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSettingsModal(false)}
                disabled={actionLoading}
                className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="h-10 px-5 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25 transition-all flex items-center gap-2 cursor-pointer"
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Save &amp; Enforce Guardrails</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
