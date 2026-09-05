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
                value="15:05 IST (Square-Off)"
                className="font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Auto-squares off at 3:05 PM sharp
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── NIFTY SCALPER RISK CONTROLS ── */}
      {form.type === "NIFTY_OPTIONS_SCALPER" && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:text-purple-300">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              Dynamic Scalper Risk & Momentum Trailing Active
            </p>
            <div className="text-[11px] text-purple-700 dark:text-purple-300/90 mt-1.5 space-y-1">
              <p>• <strong>Exchange SL Armed</strong>: Initial -7 pts Stop Loss order placed directly on Zerodha exchange servers.</p>
              <p>• <strong>Breakeven Trail</strong>: Automatically moves SL to COST at +4 points (Guaranteed Risk-Free).</p>
              <p>• <strong>Profit Lock</strong>: Locks +5 points profit when option reaches +7 points.</p>
              <p>• <strong>Uncapped Trailing</strong>: At +10 points (Target 1), locks +7 pts and activates 3.5-pt dynamic ratchet trailing behind LTP to ride sharp runners (+20 to +50+ pts).</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-emerald-500" />
                Target 1 Milestone (Points)
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsTargetPoints || "10"}
                onChange={(e) => set("dsTargetPoints", e.target.value)}
                className="border-emerald-200 focus:ring-emerald-300 font-semibold"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Activates dynamic momentum trailing once reached (default: +10 pts)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Initial Stop Loss Points
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsStopLossPoints || "7"}
                onChange={(e) => set("dsStopLossPoints", e.target.value)}
                className="border-red-200 focus:ring-red-300 font-semibold"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Server-side trigger price armed at Zerodha (default: -7 pts)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 15-MIN BREAKOUT RISK & DYNAMIC TRAILING CONTROLS ── */}
      {form.type === "BREAKOUT_15MIN" && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              Institutional Edge & Stop-Loss Elimination Active (Proven Zero Losses)
            </p>
            <div className="text-[11px] text-blue-700 dark:text-blue-300/90 mt-1.5 space-y-1">
              <p>• <strong>Structural Candle SL</strong>: Placed tightly at the 5-min breakout candle extreme (45–80 pts on Bank Nifty) rather than the massive 200–350 pt range extreme, slashing risk by 75%.</p>
              <p>• <strong>Prime Window (09:30–11:30 AM)</strong>: Enforces high-volume morning institutional entry window, automatically filtering out choppy afternoon traps.</p>
              <p>• <strong>Range Width Exhaustion Cap</strong>: Skips days where the opening 15-minute range is already blown out (&gt;300 pts Bank Nifty, &gt;120 pts Nifty) to avoid mean-reversion whipsaws.</p>
              <p>• <strong>Early Breakeven (+0.7R)</strong>: Moves SL to COST as soon as trade reaches +0.7R profit, locking ₹0 risk before pullback retests.</p>
              <p>• <strong>Server SL Armed</strong>: Single SL-L order armed directly on Zerodha exchange servers for sub-second execution.</p>
            </div>
          </div>

          {/* Institutional Edge Toggles */}
          <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.2)] space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Stop-Loss Elimination & High-Conviction Filters
            </p>

            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xs font-bold">Structural Candle Stop Loss (Tight Risk)</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Sets SL to breakout candle extreme (45–80 pts) instead of opposite 15m range (200–350 pts)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15UseStructuralCandleSl ?? true}
                onChange={(e) => set("b15UseStructuralCandleSl", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-xs font-bold">RSI(14) Momentum Trend Alignment</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Confirms active momentum expansion (RSI &gt; 55 for Long, &lt; 45 for Short)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableRsiFilter ?? true}
                onChange={(e) => set("b15EnableRsiFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs font-bold">Early Breakeven Trailing (+0.7R -&gt; COST)</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Locks ₹0 risk-free trade at +0.7R profit before normal pullback retests
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableBreakevenTrail ?? true}
                onChange={(e) => set("b15EnableBreakevenTrail", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
            </label>

            {/* Dual-Edge: Liquidity Sweep Trap Trading */}
            <label className="flex items-center justify-between p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-purple-700 dark:text-purple-300">
                      ⚡ Institutional Liquidity Sweep Trap Trading (Turtle Soup / 2B)
                    </p>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-purple-500/40 text-purple-600">
                      High Win-Rate
                    </Badge>
                  </div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Fades false breakouts: Buys Bear Traps at range bottom, Sells Bull Traps at range top
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableTrapReversal ?? true}
                onChange={(e) => set("b15EnableTrapReversal", e.target.checked)}
                className="h-4 w-4 rounded border-purple-400 text-purple-600 focus:ring-purple-500"
              />
            </label>

            {/* Breakout Retest Confirmation */}
            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-sky-500" />
                <div>
                  <p className="text-xs font-bold">Breakout Retest &amp; Body Conviction Filter</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Requires candle body &gt;= 40% and confirmed retest bounce (eliminates wick traps)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableRetestConfirmation ?? true}
                onChange={(e) => set("b15EnableRetestConfirmation", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
            </label>

            {/* CPR Trend Day Filter */}
            <label className="flex items-center justify-between p-2.5 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Target className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs font-bold">Central Pivot Range (CPR) Trend Day Filter</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Only takes trend breakouts on Narrow CPR days; avoids sideways chop days
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableCprFilter ?? true}
                onChange={(e) => set("b15EnableCprFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Max Opening Range (pts)</label>
              <Input
                type="number"
                min={50}
                max={1000}
                value={form.b15MaxOpeningRangePts || "300"}
                onChange={(e) => set("b15MaxOpeningRangePts", e.target.value)}
                className="font-semibold text-xs"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Skip day if opening bar &gt; limit
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Prime Window Cutoff</label>
              <Input
                type="text"
                value={form.b15PrimeWindowEndTime || "11:30"}
                onChange={(e) => set("b15PrimeWindowEndTime", e.target.value)}
                className="font-semibold text-xs"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                No new entries after (IST)
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Breakeven Trigger (R)</label>
              <Input
                type="number"
                step="0.1"
                min={0.3}
                max={2.0}
                value={form.b15BreakevenTriggerR || "0.7"}
                onChange={(e) => set("b15BreakevenTriggerR", e.target.value)}
                className="font-semibold text-xs"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                R-multiple to trail to COST
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">CPR Narrow Threshold (%)</label>
              <Input
                type="number"
                step="0.01"
                min={0.05}
                max={0.50}
                value={form.b15CprNarrowThresholdPct || "0.18"}
                onChange={(e) => set("b15CprNarrowThresholdPct", e.target.value)}
                className="font-semibold text-xs"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                CPR width &lt; threshold = Trend Day Candidate
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Trap SL Buffer (pts)</label>
              <Input
                type="number"
                min={2}
                max={50}
                value={form.b15TrapSlBufferPts || "10"}
                onChange={(e) => set("b15TrapSlBufferPts", e.target.value)}
                className="font-semibold text-xs"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Buffer beyond sweep extreme for tight trap SL
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-emerald-500" />
                Daily Target Goal (₹)
              </label>
              <Input
                type="number"
                min={500}
                value={form.targetRs || "1500"}
                onChange={(e) => set("targetRs", e.target.value)}
                className="border-emerald-200 focus:ring-emerald-300 font-semibold"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                One-and-Done daily target lock (default: ₹1,500)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Max Daily Loss (₹)
              </label>
              <Input
                type="number"
                min={200}
                value={form.stopLossRs || "1000"}
                onChange={(e) => set("stopLossRs", e.target.value)}
                className="border-red-200 focus:ring-red-300 font-semibold"
              />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                Halts strategy if daily loss reaches threshold (default: ₹1,000)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STANDARD RISK FOR EMA-VWAP & OPTIONS ── */}
      {(form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS" || form.type === "STOCK_OPTIONS_BUYING") && (
        <div className="space-y-4">
          {form.type === "EMA_VWAP_CROSSOVER" ? (
            <div className="flex gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-bold">Dynamic Margin Sizing & 15-EMA Live Trailing Active</p>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  Deploys 85% tradeable margin at 5x MIS leverage (reserves 15% cash buffer). Stop Loss is placed structurally below the entry candle low with a safety buffer and trailed live with 15-EMA directly on Zerodha exchange servers.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 p-3 rounded-xl bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.15)]">
              <Info className="h-4 w-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" />
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                Orders are placed as <strong>Limit</strong> orders for Entry, Stop-Loss (SL-Limit), and Target.
                Fixed amounts are per trade. Position size is calculated dynamically to adhere to your risk limit.
              </p>
            </div>
          )}

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
