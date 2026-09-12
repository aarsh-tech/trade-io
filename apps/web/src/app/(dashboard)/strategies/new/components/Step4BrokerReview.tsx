"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState, BrokerAccount, getLotSize } from "../types";

interface Step4Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
  brokers: BrokerAccount[];
}

export function Step4BrokerReview({ form, set, brokers }: Step4Props) {
  const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
  const totalQty = Number(form.lots || 1) * lotSize;

  return (
    <div className="space-y-6">
      {/* ── Trading Mode (Paper vs Live) ── */}
      <div>
        <label className="text-sm font-semibold mb-2 block text-foreground">Execution Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set("isPaperTrade", true)}
            className={cn(
              "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer",
              form.isPaperTrade
                ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/20 shadow-xs ring-1 ring-emerald-500/30"
                : "border-border bg-card hover:bg-accent/40"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="font-bold text-sm text-foreground">Paper Trading (Simulation)</p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              Real-time tick testing without risking real capital. Orders execute virtually with zero slippage.
            </p>
          </button>

          <button
            type="button"
            onClick={() => set("isPaperTrade", false)}
            className={cn(
              "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer",
              !form.isPaperTrade
                ? "border-amber-600 bg-amber-50/70 dark:bg-amber-950/20 shadow-xs ring-1 ring-amber-500/30"
                : "border-border bg-card hover:bg-accent/40"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="font-bold text-sm text-foreground">Live Broker Execution</p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              Executes real orders on your connected Zerodha Kite account with live trigger Stop-Loss orders.
            </p>
          </button>
        </div>
      </div>

      {/* ── Broker Account Selector ── */}
      <div>
        <label className="text-sm font-semibold mb-2 block text-foreground">Select Broker Account</label>
        {brokers.length === 0 ? (
          <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-xs flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="font-medium">No broker accounts found. Please connect your Zerodha account from the Brokers page.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brokers.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => set("brokerAccountId", b.id)}
                className={cn(
                  "p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between cursor-pointer",
                  form.brokerAccountId === b.id
                    ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-accent/40"
                )}
              >
                <div>
                  <p className="font-bold text-sm uppercase text-foreground">{b.broker}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                    Client ID: {b.clientId || "Active"}
                  </p>
                </div>
                <Badge variant={b.isActive ? "default" : "destructive"} className="text-[10px] font-bold">
                  {b.isActive ? "Connected" : "Inactive"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Strategy Summary Card ── */}
      <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Strategy Overview &amp; Summary
        </p>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5">Strategy Name</span>
            <span className="font-bold text-sm text-foreground">{form.name}</span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5">Type</span>
            <Badge variant="outline" className="text-[10px] font-bold border-border mt-0.5">
              {form.type}
            </Badge>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5">Underlying / Mode</span>
            <span className="font-bold text-sm text-foreground">{form.symbol} ({form.product})</span>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5">Position Size</span>
            <span className="font-bold text-sm text-foreground">{form.lots} Lot ({totalQty} Qty)</span>
          </div>
        </div>

        {form.type === "GAMMA_BLAST_EXPIRY" && (
          <div className="pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-semibold">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>Ratchet Trailing: Enabled</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-semibold">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span>Auto Exit: 03:25 PM IST</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
