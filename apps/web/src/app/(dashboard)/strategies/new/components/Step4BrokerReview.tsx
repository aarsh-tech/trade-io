"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Target, Zap, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState, BrokerAccount, getLotSize } from "../types";

interface Step4Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
  brokers: BrokerAccount[];
}

export function Step4BrokerReview({ form, set, brokers }: Step4Props) {
  const lotSize = getLotSize(form.symbol);
  const totalQty = Number(form.lots || 1) * lotSize;

  return (
    <div className="space-y-6">
      {/* ── Trading Mode (Paper vs Live) ── */}
      <div>
        <label className="text-sm font-semibold mb-2 block">Execution Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set("isPaperTrade", true)}
            className={cn(
              "p-4 rounded-xl border-2 text-left transition-all",
              form.isPaperTrade
                ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 shadow-sm"
                : "border-[hsl(var(--border))] hover:border-emerald-400/50"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="font-bold text-sm text-[hsl(var(--foreground))]">Paper Trading (Simulation)</p>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Real-time tick testing without risking real capital. Orders execute virtually with zero slippage.
            </p>
          </button>

          <button
            type="button"
            onClick={() => set("isPaperTrade", false)}
            className={cn(
              "p-4 rounded-xl border-2 text-left transition-all",
              !form.isPaperTrade
                ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 shadow-sm"
                : "border-[hsl(var(--border))] hover:border-amber-400/50"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-amber-600" />
              <p className="font-bold text-sm text-[hsl(var(--foreground))]">Live Broker Execution</p>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Executes real orders on your connected Zerodha Kite account with live trigger Stop-Loss orders.
            </p>
          </button>
        </div>
      </div>

      {/* ── Broker Account Selector ── */}
      <div>
        <label className="text-sm font-semibold mb-2 block">Select Broker Account</label>
        {brokers.length === 0 ? (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>No broker accounts found. Please connect your Zerodha account from the Brokers page.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brokers.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => set("brokerAccountId", b.id)}
                className={cn(
                  "p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between",
                  form.brokerAccountId === b.id
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)] shadow-sm"
                    : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)]"
                )}
              >
                <div>
                  <p className="font-bold text-sm uppercase">{b.broker}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Client ID: {b.clientId || "Active"}</p>
                </div>
                <Badge variant={b.isActive ? "default" : "destructive"} className="text-[10px]">
                  {b.isActive ? "Connected" : "Inactive"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Strategy Summary Card ── */}
      <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Strategy Overview & Summary
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Strategy Name</span>
            <span className="font-bold">{form.name}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Type</span>
            <Badge variant="outline" className="text-[10px] font-semibold mt-0.5">
              {form.type}
            </Badge>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Underlying / Mode</span>
            <span className="font-bold">{form.symbol} ({form.product})</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Position Size</span>
            <span className="font-bold">{form.lots} Lot ({totalQty} Qty)</span>
          </div>
        </div>

        {form.type === "GAMMA_BLAST_EXPIRY" && (
          <div className="pt-2 border-t border-[hsl(var(--border))] grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
              <Zap className="h-3.5 w-3.5" />
              <span>Ratchet Trailing: Enabled</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
              <Clock className="h-3.5 w-3.5" />
              <span>Auto Exit: 03:25 PM IST</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
