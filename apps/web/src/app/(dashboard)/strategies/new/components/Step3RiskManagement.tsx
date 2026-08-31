"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Target, Zap, TrendingUp, Info, Activity } from "lucide-react";
import { StrategyFormState } from "../types";

interface Step3Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
}

export function Step3RiskManagement({ form, set }: Step3Props) {
  return (
    <div className="space-y-5">
      {/* ── GAMMA BLAST RISK & RATCHET TRAILING CONTROLS ── */}
      {form.type === "GAMMA_BLAST_EXPIRY" && (
        <div className="space-y-5">
          {/* Info Card */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                Sub-Second Ratchet Trailing & Profit Lock Mechanism
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-amber-500/10">
                <span className="font-bold block text-emerald-600 dark:text-emerald-400">2x Spike (100% ROI)</span>
                <span className="text-[10px] text-slate-500">SL moves to Cost + ₹1 (Risk-Free)</span>
              </div>
              <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-amber-500/10">
                <span className="font-bold block text-blue-600 dark:text-blue-400">3x Spike (200% ROI)</span>
                <span className="text-[10px] text-slate-500">SL locks at 2x profit floor</span>
              </div>
              <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-amber-500/10">
                <span className="font-bold block text-purple-600 dark:text-purple-400">5x+ Multi-Bagger</span>
                <span className="text-[10px] text-slate-500">Peak Trail (20% below highest tick)</span>
              </div>
            </div>
          </div>

          {/* Daily Profit Goal & Max Loss */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-emerald-500" />
                Target Profit Goal (₹)
              </label>
              <Input
                type="number"
                min={500}
                value={form.targetRs || "1500"}
                onChange={(e) => set("targetRs", e.target.value)}
                className="border-emerald-200 focus:ring-emerald-300 font-semibold"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Optional daily profit lock goal (default: ₹1,500 on 1 lot)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Max Daily Loss Limit (₹)
              </label>
              <Input
                type="number"
                min={200}
                value={form.stopLossRs || "500"}
                onChange={(e) => set("stopLossRs", e.target.value)}
                className="border-red-200 focus:ring-red-300 font-semibold"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Initial SL is 50% of premium (~₹300–₹500 max loss per lot)
              </p>
            </div>
          </div>

          {/* Confluence Checkboxes */}
          <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.2)] space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              High Win-Rate Confluence Filters
            </p>

            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-xs font-bold">Live Open Interest (OI) & PCR Filter</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Confirms institutional Call/Put unwinding using Zerodha Quote API
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableOiFilter}
                onChange={(e) => set("gbEnableOiFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs font-bold">Volume Surge Confirmation (≥ 2.5x)</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Eliminates fake breakouts by requiring 3x volume on the option contract
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableVolumeSurge}
                onChange={(e) => set("gbEnableVolumeSurge", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xs font-bold">Sub-Second Zero-Latency Ratchet Trailing</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Evaluated on live ticks to lock explosive multi-bagger profits instantly
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableRatchetTrailing}
                onChange={(e) => set("gbEnableRatchetTrailing", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 block">Max Trades / Day</label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.maxTradesPerDay || "2"}
                onChange={(e) => set("maxTradesPerDay", e.target.value)}
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Max 2 attempts per expiry session to protect capital
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block">Hard Time Cutoff</label>
              <Input
                type="text"
                disabled
                value="15:25 IST (CAS Square-Off)"
                className="font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Auto-squares off at 3:25 PM sharp
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── NIFTY SCALPER RISK CONTROLS ── */}
      {form.type === "NIFTY_OPTIONS_SCALPER" && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 dark:bg-purple-950/20 dark:border-purple-900">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">⚡ Nifty 10-Point Scalper Risk & Target Controls</p>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1">Captures +10 option points per winning trade, automatically trails SL to COST at +5 points, and auto-halts for the day after 1 winning trade.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-emerald-500" />
                Target Option Points
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsTargetPoints || "10"}
                onChange={(e) => set("dsTargetPoints", e.target.value)}
                className="border-emerald-200 focus:ring-emerald-300 font-semibold"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Option target in points (default: +10 pts = ₹650 per lot)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Stop Loss Option Points
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsStopLossPoints || "7"}
                onChange={(e) => set("dsStopLossPoints", e.target.value)}
                className="border-red-200 focus:ring-red-300 font-semibold"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Initial Stop Loss in option points (default: -7 pts = ₹455 per lot)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STANDARD RISK FOR EMA-VWAP & BREAKOUT ── */}
      {(form.type === "BREAKOUT_15MIN" || form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS") && (
        <div className="space-y-4">
          <div className="flex gap-3 p-3 rounded-xl bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.15)]">
            <Info className="h-4 w-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" />
            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Orders are placed as <strong>Limit</strong> orders for Entry, Stop-Loss (SL-Limit), and Target.
              Fixed amounts are per trade. Position size is calculated dynamically to adhere to your risk limit.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-emerald-500" />
                Target Profit (₹)
              </label>
              <Input
                type="number"
                min={100}
                value={form.targetRs}
                onChange={(e) => set("targetRs", e.target.value)}
                className="border-emerald-200 focus:ring-emerald-300 font-semibold"
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Stop Loss (₹)
              </label>
              <Input
                type="number"
                min={100}
                value={form.stopLossRs}
                onChange={(e) => set("stopLossRs", e.target.value)}
                className="border-red-200 focus:ring-red-300 font-semibold"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
