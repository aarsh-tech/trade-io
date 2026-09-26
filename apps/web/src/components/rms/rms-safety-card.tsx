"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { formatINR } from "@/lib/format";

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
      <Card className={cn("border border-border/80 bg-card  animate-pulse", className)}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="h-5 w-48 bg-border rounded-md" />
          <div className="h-8 w-24 bg-border rounded-md" />
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
          "transition-all duration-300 border  overflow-hidden",
          isKillActive
            ? "border-loss/30 bg-loss-subtle/70 "
            : isDanger
            ? "border-warn/30 bg-warn-subtle/50"
            : "border-border/80 bg-card/95 backdrop-blur-xs",
          className
        )}
      >
        <CardContent className="p-4 sm:p-5">
          {/* Top Row: Shield & Status Badge + Quick Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "p-2 rounded-lg flex items-center justify-center transition-colors",
                  isKillActive
                    ? "bg-loss text-on-loss animate-pulse"
                    : isDanger
                    ? "bg-warn-subtle text-warn"
                    : "bg-profit-subtle text-profit"
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
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Risk Management System (RMS)
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      isKillActive
                        ? "bg-loss text-on-loss border-loss animate-pulse"
                        : isDanger
                        ? "bg-warn-subtle text-warn border-warn/30"
                        : "bg-profit-subtle text-profit border-profit/30"
                    )}
                  >
                    {isKillActive ? "Kill Switch Active" : "Protected"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
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
                className="h-8 text-xs gap-1.5 border-border text-foreground/75 hover:text-foreground bg-card"
                title="Verify Broker Session Tokens"
              >
                <Activity className="h-3.5 w-3.5 text-accent-foreground" />
                <span className="hidden md:inline">Broker Health</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettingsModal(true)}
                className="h-8 text-xs gap-1.5 border-border text-foreground/75 hover:text-foreground bg-card"
                title="Configure RMS Risk Parameters"
              >
                <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden md:inline">Limits</span>
              </Button>

              {isKillActive ? (
                <Button
                  size="sm"
                  onClick={handleResetKillSwitch}
                  disabled={actionLoading}
                  className="h-8 text-xs gap-1.5 bg-profit hover:bg-profit/90 text-on-profit font-semibold cursor-pointer"
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
                  className="h-8 text-xs gap-1.5 bg-loss hover:bg-loss/90 text-on-loss font-semibold cursor-pointer"
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
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Today&apos;s Realized P&amp;L
              </span>
              <span
                className={cn(
                  "text-sm sm:text-base font-semibold font-mono tracking-tight",
                  (status?.realizedPnl || 0) >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {(status?.realizedPnl || 0) >= 0 ? "+" : ""}₹
                {(status?.realizedPnl || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Unrealized M2M
              </span>
              <span
                className={cn(
                  "text-sm sm:text-base font-semibold font-mono tracking-tight",
                  (status?.unrealizedPnl || 0) >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {(status?.unrealizedPnl || 0) >= 0 ? "+" : ""}₹
                {(status?.unrealizedPnl || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Net Total P&amp;L
              </span>
              <span
                className={cn(
                  "text-sm sm:text-base font-semibold font-mono tracking-tight",
                  totalPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {totalPnl >= 0 ? "+" : ""}₹
                {totalPnl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Daily Loss Cap</span>
                <span className={cn("font-semibold font-mono", isDanger ? "text-loss" : "text-foreground/75")}>
                  {lossUsage}% used
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500 rounded-full",
                    isDanger ? "bg-loss" : isWarning ? "bg-warn" : "bg-profit"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, lossUsage))}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Max Allowed Loss: {formatINR(maxLoss)}
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
        <DialogContent className="max-w-xl w-full p-0 overflow-hidden rounded-lg border border-border/90 bg-card shadow-2xl">
          {/* Top Banner Header */}
          <div className="relative bg-muted/50 border-b border-border p-6 pb-5">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg font-semibold tracking-tight text-foreground m-0">
                      Risk Management Settings
                    </DialogTitle>
                    <Badge className="text-[10px] font-semibold uppercase px-2 py-0.5">
                      Hardware Guard
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    Hard execution guardrails enforced server-side before orders reach broker APIs.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="p-6 pt-5 space-y-5">
            {/* Card 1: Daily Max Loss Circuit Breaker */}
            <div className="rounded-lg border border-loss/30 bg-loss-subtle/30 p-4 transition-all hover:border-loss/30">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-loss/10 text-loss">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                      Daily Max Loss Threshold
                    </label>
                    <span className="text-[11px] text-muted-foreground block">
                      Automatically fires Kill Switch and squares off all positions
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-semibold border-loss/30 text-loss bg-loss-subtle">
                  Auto-Flatten
                </Badge>
              </div>

              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sm font-semibold text-muted-foreground">
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
                  className="w-full pl-8 pr-28 py-2.5 rounded-lg border border-border bg-card text-foreground font-semibold font-mono text-base focus:ring-2 focus:ring-loss/20 focus:border-loss outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="5000"
                  required
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-mono font-semibold text-muted-foreground">
                  ₹ {new Intl.NumberFormat('en-IN').format(settingsForm.maxDailyLoss || 0)}
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[10px] font-semibold text-muted-foreground mr-1 uppercase">Presets:</span>
                {[2500, 5000, 10000, 25000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSettingsForm((prev) => ({ ...prev, maxDailyLoss: preset }))}
                    className={cn(
                      "text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer",
                      settingsForm.maxDailyLoss === preset
                        ? "bg-loss text-on-loss border-loss  "
                        : "bg-card border-border text-foreground/75 hover:border-border"
                    )}
                  >
                    ₹{new Intl.NumberFormat('en-IN').format(preset)}
                  </button>
                ))}
              </div>
            </div>

            {/* Card 2: Max Single Order Value (Fat-Finger Guard) */}
            <div className="rounded-lg border border-warn/30 bg-warn-subtle/30 p-4 transition-all hover:border-warn/30">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-warn/10 text-warn">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                      Max Single Order Value
                    </label>
                    <span className="text-[11px] text-muted-foreground block">
                      Fat-finger guard: blocks orders exceeding this rupee amount
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-semibold border-warn/30 text-warn bg-warn-subtle">
                  Value Clamp
                </Badge>
              </div>

              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sm font-semibold text-muted-foreground">
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
                  className="w-full pl-8 pr-32 py-2.5 rounded-lg border border-border bg-card text-foreground font-semibold font-mono text-base focus:ring-2 focus:ring-warn/20 focus:border-warn outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="200000"
                  required
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-mono font-semibold text-muted-foreground">
                  ₹ {new Intl.NumberFormat('en-IN').format(settingsForm.maxOrderValue || 0)}
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[10px] font-semibold text-muted-foreground mr-1 uppercase">Presets:</span>
                {[50000, 100000, 200000, 500000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSettingsForm((prev) => ({ ...prev, maxOrderValue: preset }))}
                    className={cn(
                      "text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer",
                      settingsForm.maxOrderValue === preset
                        ? "bg-warn text-on-warn border-warn  "
                        : "bg-card border-border text-foreground/75 hover:border-border"
                    )}
                  >
                    ₹{new Intl.NumberFormat('en-IN').format(preset)}
                  </button>
                ))}
              </div>
            </div>

            {/* Card 3: Max Quantity / Exchange Freeze Clamp */}
            <div className="rounded-lg border border-primary/30 bg-brand-subtle/30 p-4 transition-all hover:border-primary/30">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-accent-foreground">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                      Max Quantity per Order
                    </label>
                    <span className="text-[11px] text-muted-foreground block">
                      Enforces exchange freeze clamps to prevent broker order rejections
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-semibold border-primary/30 text-accent-foreground bg-brand-subtle">
                  Qty Ceiling
                </Badge>
              </div>

              <div className="relative mt-2">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-xs font-semibold text-muted-foreground">
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
                  className="w-full pl-12 pr-20 py-2.5 rounded-lg border border-border bg-card text-foreground font-semibold font-mono text-base focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="1800"
                  required
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-mono font-semibold text-muted-foreground">
                  Units
                </span>
              </div>

              {/* Quick Index Presets */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="text-[10px] font-semibold text-muted-foreground mr-1 uppercase">Index Freeze:</span>
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
                        ? "bg-primary text-primary-foreground border-primary  "
                        : "bg-card border-border text-foreground/75 hover:border-border"
                    )}
                  >
                    <span>{item.name}</span>
                    <span className="opacity-70 text-[10px]">({item.qty})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Active Guard Info Strip */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-profit shrink-0" />
              <span>3s idempotency dedup and 4 orders/min runaway breaker are automatically active.</span>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSettingsModal(false)}
                disabled={actionLoading}
                className="h-10 px-4 text-xs font-semibold rounded-lg border-border hover:bg-muted transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="h-10 px-5 text-xs font-semibold rounded-lg bg-primary hover:bg-brand-hover text-primary-foreground shadow-md transition-all flex items-center gap-2 cursor-pointer"
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
