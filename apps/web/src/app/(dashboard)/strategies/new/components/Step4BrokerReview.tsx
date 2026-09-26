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
        <label className="text-xs sm:text-sm font-semibold mb-2 block text-foreground">Execution Mode</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => set("isPaperTrade", true)}
            className={cn(
              "p-4 rounded-lg border-2 text-left transition-all cursor-pointer bg-card",
              form.isPaperTrade
                ? "border-profit bg-profit-subtle shadow-md ring-2 ring-profit/20"
                : "border-border hover:border-profit hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 className="h-5 w-5 text-profit shrink-0" />
              <p className="font-semibold text-sm sm:text-base text-foreground">Paper Trading (Simulation)</p>
            </div>
            <p className="text-xs text-foreground leading-relaxed font-medium">
              Real-time tick testing without risking real capital. Orders execute virtually with zero slippage.
            </p>
          </button>

          <button
            type="button"
            onClick={() => set("isPaperTrade", false)}
            className={cn(
              "p-4 rounded-lg border-2 text-left transition-all cursor-pointer bg-card",
              !form.isPaperTrade
                ? "border-warn bg-warn-subtle shadow-md ring-2 ring-warn/20"
                : "border-border hover:border-warn hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-5 w-5 text-warn shrink-0" />
              <p className="font-semibold text-sm sm:text-base text-foreground">Live Broker Execution</p>
            </div>
            <p className="text-xs text-foreground leading-relaxed font-medium">
              Executes real orders on your connected Zerodha Kite account with live trigger Stop-Loss orders.
            </p>
          </button>
        </div>
      </div>

      {/* ── Broker Account Selector ── */}
      <div>
        <label className="text-xs sm:text-sm font-semibold mb-2 block text-foreground">Select Broker Account</label>
        {brokers.length === 0 ? (
          <div className="p-4 rounded-lg border-2 border-loss/30 bg-loss-subtle text-loss text-xs flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-loss" />
            <span className="font-semibold">No broker accounts found. Please connect your Zerodha account from the Brokers page.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brokers.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => set("brokerAccountId", b.id)}
                className={cn(
                  "p-4 rounded-lg border-2 text-left transition-all flex items-center justify-between cursor-pointer bg-card",
                  form.brokerAccountId === b.id
                    ? "border-primary bg-brand-subtle shadow-md ring-2 ring-primary/20"
                    : "border-border hover:border-primary hover:bg-muted/50"
                )}
              >
                <div>
                  <p className="font-semibold text-sm uppercase text-foreground">{b.broker}</p>
                  <p className="text-xs text-foreground/75 font-semibold mt-0.5">
                    Client ID: {b.clientId || "Active"}
                  </p>
                </div>
                <Badge variant={b.isActive ? "default" : "destructive"} className="text-[10px] font-semibold">
                  {b.isActive ? "Connected" : "Inactive"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Strategy Summary Card ── */}
      <div className="p-5 rounded-lg border-2 border-border bg-card space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Strategy Overview &amp; Summary
        </p>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-xs font-semibold text-foreground/75 block mb-0.5">Strategy Name</span>
            <span className="font-semibold text-sm sm:text-base text-foreground">{form.name}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-foreground/75 block mb-0.5">Type</span>
            <Badge variant="outline" className="text-[10px] font-semibold border-2 border-border text-foreground mt-0.5">
              {form.type}
            </Badge>
          </div>
          <div>
            <span className="text-xs font-semibold text-foreground/75 block mb-0.5">Underlying / Mode</span>
            <span className="font-semibold text-sm text-foreground">{form.symbol} ({form.product})</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-foreground/75 block mb-0.5">Position Size</span>
            <span className="font-semibold text-sm text-foreground">{form.lots} Lot ({totalQty} Qty)</span>
          </div>
        </div>

        {form.type === "GAMMA_BLAST_EXPIRY" && (
          <div className="pt-3 border-t-2 border-border grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-warn font-semibold">
              <Zap className="h-4 w-4 text-warn" />
              <span>Ratchet Trailing: Enabled</span>
            </div>
            <div className="flex items-center gap-1.5 text-accent-foreground font-semibold">
              <Clock className="h-4 w-4 text-accent-foreground" />
              <span>Auto Exit: 03:25 PM IST</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
