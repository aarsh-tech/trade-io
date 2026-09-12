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
        <label className="text-xs sm:text-sm font-extrabold mb-2 block text-slate-950">Execution Mode</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => set("isPaperTrade", true)}
            className={cn(
              "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer bg-white",
              form.isPaperTrade
                ? "border-emerald-600 bg-emerald-50 shadow-md ring-2 ring-emerald-500/20"
                : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
              <p className="font-extrabold text-sm sm:text-base text-slate-950">Paper Trading (Simulation)</p>
            </div>
            <p className="text-xs text-slate-800 leading-relaxed font-medium">
              Real-time tick testing without risking real capital. Orders execute virtually with zero slippage.
            </p>
          </button>

          <button
            type="button"
            onClick={() => set("isPaperTrade", false)}
            className={cn(
              "p-4 rounded-2xl border-2 text-left transition-all cursor-pointer bg-white",
              !form.isPaperTrade
                ? "border-amber-600 bg-amber-50 shadow-md ring-2 ring-amber-500/20"
                : "border-slate-200 hover:border-amber-400 hover:bg-slate-50"
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-5 w-5 text-amber-700 shrink-0" />
              <p className="font-extrabold text-sm sm:text-base text-slate-950">Live Broker Execution</p>
            </div>
            <p className="text-xs text-slate-800 leading-relaxed font-medium">
              Executes real orders on your connected Zerodha Kite account with live trigger Stop-Loss orders.
            </p>
          </button>
        </div>
      </div>

      {/* ── Broker Account Selector ── */}
      <div>
        <label className="text-xs sm:text-sm font-extrabold mb-2 block text-slate-950">Select Broker Account</label>
        {brokers.length === 0 ? (
          <div className="p-4 rounded-2xl border-2 border-red-300 bg-red-50 text-red-900 text-xs flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="font-bold">No broker accounts found. Please connect your Zerodha account from the Brokers page.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brokers.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => set("brokerAccountId", b.id)}
                className={cn(
                  "p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between cursor-pointer bg-white",
                  form.brokerAccountId === b.id
                    ? "border-blue-600 bg-blue-50 shadow-md ring-2 ring-blue-500/20"
                    : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                )}
              >
                <div>
                  <p className="font-extrabold text-sm uppercase text-slate-950">{b.broker}</p>
                  <p className="text-xs text-slate-700 font-bold mt-0.5">
                    Client ID: {b.clientId || "Active"}
                  </p>
                </div>
                <Badge variant={b.isActive ? "default" : "destructive"} className="text-[10px] font-black">
                  {b.isActive ? "Connected" : "Inactive"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Strategy Summary Card ── */}
      <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white shadow-xs space-y-4">
        <p className="text-xs font-black uppercase tracking-wider text-slate-900">
          Strategy Overview &amp; Summary
        </p>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-xs font-bold text-slate-600 block mb-0.5">Strategy Name</span>
            <span className="font-black text-sm sm:text-base text-slate-950">{form.name}</span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-600 block mb-0.5">Type</span>
            <Badge variant="outline" className="text-[10px] font-black border-2 border-slate-300 text-slate-900 mt-0.5">
              {form.type}
            </Badge>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-600 block mb-0.5">Underlying / Mode</span>
            <span className="font-black text-sm text-slate-950">{form.symbol} ({form.product})</span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-600 block mb-0.5">Position Size</span>
            <span className="font-black text-sm text-slate-950">{form.lots} Lot ({totalQty} Qty)</span>
          </div>
        </div>

        {form.type === "GAMMA_BLAST_EXPIRY" && (
          <div className="pt-3 border-t-2 border-slate-200 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-950 font-bold">
              <Zap className="h-4 w-4 text-amber-600" />
              <span>Ratchet Trailing: Enabled</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-950 font-bold">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span>Auto Exit: 03:25 PM IST</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
