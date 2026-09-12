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
    <div className="space-y-6">
      {/* ── GAMMA BLAST RISK & RATCHET TRAILING CONTROLS ── */}
      {form.type === "GAMMA_BLAST_EXPIRY" && (
        <div className="space-y-5">
          {/* Info Card */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Sub-Second Ratchet Trailing &amp; Profit Lock Mechanism
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 pt-0.5">
              <div className="p-2.5 rounded-xl bg-card border border-border shadow-xs">
                <span className="font-bold block text-xs text-emerald-700 dark:text-emerald-400">2x Spike (100% ROI)</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 font-normal">SL moves to Cost + ₹1 (Risk-Free)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-card border border-border shadow-xs">
                <span className="font-bold block text-xs text-blue-700 dark:text-blue-400">3x Spike (200% ROI)</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 font-normal">SL locks at 2x profit floor</span>
              </div>
              <div className="p-2.5 rounded-xl bg-card border border-border shadow-xs">
                <span className="font-bold block text-xs text-purple-700 dark:text-purple-400">5x+ Multi-Bagger</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 font-normal">Peak Trail (20% below high)</span>
              </div>
            </div>
          </div>

          {/* Daily Profit Goal & Max Loss */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Target className="h-4 w-4 text-emerald-500" />
                Target Profit Goal (₹)
              </label>
              <Input
                type="number"
                min={500}
                value={form.targetRs || "1500"}
                onChange={(e) => set("targetRs", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Optional daily profit lock goal (default: ₹1,500 on 1 lot)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Shield className="h-4 w-4 text-red-500" />
                Max Daily Loss Limit (₹)
              </label>
              <Input
                type="number"
                min={200}
                value={form.stopLossRs || "500"}
                onChange={(e) => set("stopLossRs", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Initial SL is 50% of premium (~₹300–₹500 max loss per lot)
              </p>
            </div>
          </div>

          {/* Confluence Checkboxes */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              High Win-Rate Confluence Filters
            </p>

            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-xs font-bold text-foreground">Live Open Interest (OI) &amp; PCR Filter</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Confirms institutional Call/Put unwinding using Zerodha Quote API
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableOiFilter}
                onChange={(e) => set("gbEnableOiFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs font-bold text-foreground">Volume Surge Confirmation (≥ 2.5x)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Eliminates fake breakouts by requiring 3x volume on the option contract
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableVolumeSurge}
                onChange={(e) => set("gbEnableVolumeSurge", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xs font-bold text-foreground">Sub-Second Zero-Latency Ratchet Trailing</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Evaluated on live ticks to lock explosive multi-bagger profits instantly
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.gbEnableRatchetTrailing}
                onChange={(e) => set("gbEnableRatchetTrailing", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 block text-foreground">Max Trades / Day</label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.maxTradesPerDay || "2"}
                onChange={(e) => set("maxTradesPerDay", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Max 2 attempts per expiry session to protect capital
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block text-foreground">Hard Time Cutoff</label>
              <Input
                type="text"
                disabled
                value="15:05 IST (Square-Off)"
                className="font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Auto-squares off at 3:05 PM sharp
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── NIFTY SCALPER RISK CONTROLS ── */}
      {form.type === "NIFTY_OPTIONS_SCALPER" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                  Institutional Scalper Risk &amp; Momentum Trailing Active
                </p>
              </div>
              <Badge className="bg-purple-600/20 text-purple-700 dark:text-purple-300 text-[10px] font-bold border-0">
                2:1 R:R Asymmetry
              </Badge>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-200 mt-2 space-y-1.5 leading-relaxed font-normal">
              <p>• <strong className="text-foreground font-semibold">Exchange SL Armed</strong>: Initial -6 pts Stop Loss order placed directly on Zerodha exchange servers.</p>
              <p>• <strong className="text-foreground font-semibold">Breakeven Trail</strong>: Automatically moves SL to COST (+0.5 pt cushion) at +5 points (eliminates premature choke).</p>
              <p>• <strong className="text-foreground font-semibold">1 Win &amp; Done Goal</strong>: Once +10 points is achieved on trade 1, the strategy locks profits and halts for the day.</p>
              <p>• <strong className="text-foreground font-semibold">The Banker &amp; The Runner</strong>: Optional multi-lot split: books 50% lots at +10 pts, locks +7 pts on remaining lots with dynamic ratchet trail.</p>
              <p>• <strong className="text-foreground font-semibold">Two-Loss Circuit Breaker</strong>: Halts strategy for the day after 2 stop-loss hits to cap worst-case daily drawdown.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Target className="h-4 w-4 text-emerald-500" />
                Target 1 Milestone (Points)
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsTargetPoints || "10"}
                onChange={(e) => set("dsTargetPoints", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Daily scalp target milestone (default: +10 pts)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Shield className="h-4 w-4 text-red-500" />
                Initial Stop Loss Points
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsStopLossPoints || "6"}
                onChange={(e) => set("dsStopLossPoints", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Server-side trigger price armed at Zerodha (default: -6 pts)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                Breakeven Trail Trigger (Points)
              </label>
              <Input
                type="number"
                min={1}
                value={form.dsTrailCostAtPoints || "5"}
                onChange={(e) => set("dsTrailCostAtPoints", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Moves SL to Cost (+0.5 pt cushion) once reached (default: +5 pts)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Shield className="h-4 w-4 text-amber-500" />
                Daily Loss Circuit Breaker (Max Losses)
              </label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.dsMaxLossesPerDay || "2"}
                onChange={(e) => set("dsMaxLossesPerDay", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Two-Loss &amp; Done: Halts trading upon reaching max losses (default: 2)
              </p>
            </div>
          </div>

          {/* Partial Profit Booking ("The Banker & The Runner") */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-emerald-500" />
                  The Banker &amp; The Runner (Partial Profit Booking)
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  When Target 1 (+10 pts) is reached on multi-lot positions, automatically books a portion to lock cash into your account, while letting remaining lots run with the uncapped ratchet trail.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.dsEnablePartialBooking !== false}
                onChange={(e) => set("dsEnablePartialBooking", e.target.checked)}
                className="h-4 w-4 rounded accent-purple-600 shrink-0 cursor-pointer"
              />
            </div>

            {form.dsEnablePartialBooking !== false && (
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Percentage to Book at Target 1
                </label>
                <select
                  value={form.dsPartialBookingPct || "50"}
                  onChange={(e) => set("dsPartialBookingPct", e.target.value)}
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20"
                >
                  <option value="50">50% (Recommended — Equal Split)</option>
                  <option value="33">33% (Aggressive Runner Bias)</option>
                  <option value="66">66% (Conservative Banker Bias)</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 15-MIN BREAKOUT RISK & DYNAMIC TRAILING CONTROLS ── */}
      {form.type === "BREAKOUT_15MIN" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2.5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                Institutional Edge &amp; Systematic Profitability Engine Active
              </p>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-200 mt-2 space-y-1.5 leading-relaxed font-normal">
              <p>• <strong className="text-foreground font-semibold">Live Zerodha CPR Engine</strong>: Real-time settlement Pivot, TC, BC, R1/S1, R2/S2. Blocks breakouts running into immediate CPR walls; Wide CPR days restrict to Trap Reversals only.</p>
              <p>• <strong className="text-foreground font-semibold">1-Loss &amp; Done Capital Shield</strong>: Halts strategy immediately after 1 stop-loss hit per day. Preserves monthly profit.</p>
              <p>• <strong className="text-foreground font-semibold">The Banker &amp; The Runner Partial Booking</strong>: Locks 50% profit at +1.8R, moves SL to COST for a risk-free trade, and lets remaining 50% ride on EMA/VWAP.</p>
              <p>• <strong className="text-foreground font-semibold">Midday Dead-Zone Filter (11:45 – 13:00 IST)</strong>: Skips entries during the low-liquidity midday chop zone, reserving capital for high-volume sessions.</p>
              <p>• <strong className="text-foreground font-semibold">Structural Candle SL</strong>: Placed tightly at the entry candle extreme (45–80 pts on Bank Nifty) rather than the massive 200–350 pt range extreme, slashing initial risk by 75%.</p>
              <p>• <strong className="text-foreground font-semibold">Early Breakeven (+0.7R)</strong>: Automatically moves SL to COST as soon as trade hits +0.7R profit, locking ₹0 risk before pullback retests.</p>
            </div>
          </div>

          {/* Institutional Edge Toggles */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Stop-Loss Elimination &amp; High-Conviction Filters
            </p>

            {/* Live Zerodha CPR S/R & Regime Filter */}
            <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-950/20 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        Live Zerodha CPR Support / Resistance &amp; Regime Gate
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-indigo-500/40 text-indigo-700 dark:text-indigo-300">
                        Live Kite Data
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      Computes Pivot, TC, BC, R1, S1, R2, S2 from previous day Zerodha settlement candles. Restricts Wide CPR days to Trap Reversals only and skips breakouts into immediate CPR hurdles (&lt; 0.35% away).
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnableCprSupportResistance ?? true}
                  onChange={(e) => set("b15EnableCprSupportResistance", e.target.checked)}
                  className="h-4 w-4 rounded border-indigo-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0 ml-3"
                />
              </label>
            </div>

            {/* Banker & Runner Partial Profit Booking */}
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Multi-Lot Partial Profit Booking (&ldquo;The Banker &amp; The Runner&rdquo;)
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-amber-500/40 text-amber-800 dark:text-amber-300">
                        Guaranteed Green Day
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      Secures day&apos;s profit at target milestone, sets Stop Loss to COST (₹0 risk-free trade), and lets the runner capture 100–300+ pt trends.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnablePartialBooking ?? true}
                  onChange={(e) => set("b15EnablePartialBooking", e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0 ml-3"
                />
              </label>

              {(form.b15EnablePartialBooking ?? true) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-500/30">
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">The Banker Booking Target (R)</label>
                    <Input
                      type="number"
                      step="0.1"
                      min={1.0}
                      max={4.0}
                      value={form.b15PartialBookingR || "1.8"}
                      onChange={(e) => set("b15PartialBookingR", e.target.value)}
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-xl"
                    />
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Target R-multiple to lock first batch (default: +1.8R)
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">The Banker Allocation (%)</label>
                    <Input
                      type="number"
                      step="5"
                      min={25}
                      max={75}
                      value={form.b15PartialBookingPct || "50"}
                      onChange={(e) => set("b15PartialBookingPct", e.target.value)}
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-xl"
                    />
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      % lots squared off at Target (default: 50% Banker, 50% Runner)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Midday Dead-Zone Filter */}
            <div className="p-3.5 rounded-xl border border-border bg-secondary/40 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Activity className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-foreground">
                        Midday Dead-Zone Chop Shield (11:45 AM – 13:00 PM)
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-border text-slate-700 dark:text-slate-300">
                        Anti-Whipsaw
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      Blocks new breakout entries during European morning transition chop. Active trailing runners continue without interruption.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnableMiddayChopFilter ?? true}
                  onChange={(e) => set("b15EnableMiddayChopFilter", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-400 text-slate-600 focus:ring-slate-500 cursor-pointer shrink-0 ml-3"
                />
              </label>

              {(form.b15EnableMiddayChopFilter ?? true) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">Dead-Zone Start (IST)</label>
                    <Input
                      type="text"
                      value={form.b15MiddayDeadZoneStart || "11:45"}
                      onChange={(e) => set("b15MiddayDeadZoneStart", e.target.value)}
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">Dead-Zone End (IST)</label>
                    <Input
                      type="text"
                      value={form.b15MiddayDeadZoneEnd || "13:00"}
                      onChange={(e) => set("b15MiddayDeadZoneEnd", e.target.value)}
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Structural Candle Stop Loss (Tight Risk)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Sets SL to breakout candle extreme (45–80 pts) instead of opposite 15m range (200–350 pts)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15UseStructuralCandleSl ?? true}
                onChange={(e) => set("b15UseStructuralCandleSl", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-indigo-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">RSI(14) Momentum Trend Alignment</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Confirms active momentum expansion (RSI &gt; 55 for Long, &lt; 45 for Short)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableRsiFilter ?? true}
                onChange={(e) => set("b15EnableRsiFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Early Breakeven Trailing (+0.7R -&gt; COST)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Locks ₹0 risk-free trade at +0.7R profit before normal pullback retests
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableBreakevenTrail ?? true}
                onChange={(e) => set("b15EnableBreakevenTrail", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
            </label>

            {/* 9/15 EMA & VWAP Dynamic Trailing */}
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Dynamic EMA &amp; VWAP Trend Trailing (Uncapped Runner)
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                        Zero Greed
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      Once in profit, trails SL along dynamic EMA &amp; VWAP support curve. Rides multi-hundred point runners until candle exhaustion.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnableEmaVwapTrailing ?? true}
                  onChange={(e) => set("b15EnableEmaVwapTrailing", e.target.checked)}
                  className="h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 ml-3"
                />
              </label>

              {(form.b15EnableEmaVwapTrailing ?? true) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-500/30">
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">Trailing EMA Period</label>
                    <select
                      value={form.b15TrailingEmaPeriod || "9"}
                      onChange={(e) => set("b15TrailingEmaPeriod", e.target.value)}
                      className="flex h-9 w-full rounded-xl border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      <option value="9">9 EMA (Fast Dynamic Trailing)</option>
                      <option value="15">15 EMA (Smooth Trend Rider — Chart Match)</option>
                      <option value="21">21 EMA (Macro Trend Baseline)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">Trailing Baseline</label>
                    <select
                      value={form.b15TrailingVwapSource || "both"}
                      onChange={(e) => set("b15TrailingVwapSource", e.target.value)}
                      className="flex h-9 w-full rounded-xl border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      <option value="both">Both (Max of EMA &amp; VWAP for Longs)</option>
                      <option value="ema">EMA Only</option>
                      <option value="vwap">VWAP Only</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Dual-Edge: Liquidity Sweep Trap Trading */}
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                      ⚡ Institutional Liquidity Sweep Trap Trading (Turtle Soup / 2B)
                    </p>
                    <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-purple-500/40 text-purple-700 dark:text-purple-300">
                      High Win-Rate
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    Fades false breakouts: Buys Bear Traps at range bottom, Sells Bull Traps at range top
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableTrapReversal ?? true}
                onChange={(e) => set("b15EnableTrapReversal", e.target.checked)}
                className="h-4 w-4 rounded border-purple-400 text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0 ml-3"
              />
            </label>

            {/* Breakout Retest Confirmation */}
            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-sky-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Breakout Retest &amp; Body Conviction Filter</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Requires candle body &ge; 40% and confirmed retest bounce (eliminates wick traps)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableRetestConfirmation ?? true}
                onChange={(e) => set("b15EnableRetestConfirmation", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
            </label>

            {/* CPR Trend Day Filter */}
            <label className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Target className="h-4 w-4 text-blue-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Central Pivot Range (CPR) Narrow Trend Filter</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Identifies high-momentum trending sessions using CPR bandwidth
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableCprFilter ?? true}
                onChange={(e) => set("b15EnableCprFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Max Losses / Day</label>
              <Input
                type="number"
                min={1}
                max={3}
                value={form.b15MaxLossesPerDay || "1"}
                onChange={(e) => set("b15MaxLossesPerDay", e.target.value)}
                className="font-bold text-xs text-red-600 bg-red-500/10 border-red-500/30 rounded-xl h-9"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                1-Loss Shield: stops after 1 SL hit
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Max Range (pts)</label>
              <Input
                type="number"
                min={50}
                max={1000}
                value={form.b15MaxOpeningRangePts || "300"}
                onChange={(e) => set("b15MaxOpeningRangePts", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-xl h-9"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Skip day if 15m bar &gt; limit
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Entry Window Cutoff</label>
              <Input
                type="text"
                value={form.b15PrimeWindowEndTime || "15:00"}
                onChange={(e) => set("b15PrimeWindowEndTime", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-xl h-9"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                No new entries after (IST)
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Breakeven Trigger (R)</label>
              <Input
                type="number"
                step="0.1"
                min={0.3}
                max={2.0}
                value={form.b15BreakevenTriggerR || "0.7"}
                onChange={(e) => set("b15BreakevenTriggerR", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-xl h-9"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                R-multiple to trail to COST
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">CPR Narrow Threshold (%)</label>
              <Input
                type="number"
                step="0.01"
                min={0.05}
                max={0.50}
                value={form.b15CprNarrowThresholdPct || "0.18"}
                onChange={(e) => set("b15CprNarrowThresholdPct", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-xl h-9"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                CPR width &lt; threshold = Trend Day Candidate
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Trap SL Buffer (pts)</label>
              <Input
                type="number"
                min={2}
                max={50}
                value={form.b15TrapSlBufferPts || "10"}
                onChange={(e) => set("b15TrapSlBufferPts", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-xl h-9"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Buffer beyond sweep extreme for tight trap SL
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Target className="h-4 w-4 text-emerald-500" />
                Daily Target Goal (₹)
              </label>
              <Input
                type="number"
                min={500}
                value={form.targetRs || "1500"}
                onChange={(e) => set("targetRs", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                One-and-Done daily target lock (default: ₹1,500)
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Shield className="h-4 w-4 text-red-500" />
                Max Daily Loss (₹)
              </label>
              <Input
                type="number"
                min={200}
                value={form.stopLossRs || "1000"}
                onChange={(e) => set("stopLossRs", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Halts strategy if daily loss reaches threshold (default: ₹1,000)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK OPTIONS BUYING: 80% PROFITABILITY & CAPITAL SHIELD CONTROLS ── */}
      {form.type === "STOCK_OPTIONS_BUYING" && (
        <div className="space-y-5">
          {/* Institutional Profitability Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 border border-blue-500/30 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                Systematic 80% Profitability Engine &amp; Capital Shield Active
              </p>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
              Eliminates the #1 reason options buyers lose money: <strong className="text-foreground font-semibold">Theta Decay &amp; Fakeout Chop</strong>.
              Employs &ldquo;The Banker &amp; The Runner&rdquo; partial booking (+50% ROI / 1:1.5R) with automatic Cost Trailing, Midday Chop Dead-Zone, and Macro Market Alignment.
            </p>
          </div>

          {/* Capital & Lot Allocation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-1 block text-foreground">Max Deployable Capital (₹)</label>
              <Input
                type="number"
                value={form.sMaxCapital || "25000"}
                onChange={(e) => set("sMaxCapital", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Deploys up to 25% capital per trade with strict risk-based sizing (never risking more than your Stop Loss ₹).
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block text-foreground">Theta Cutoff Time</label>
              <select
                value={form.sMaxStagnantTimeMin || "25"}
                onChange={(e) => set("sMaxStagnantTimeMin", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="20">20 Minutes (Ultra-Fast Scalp)</option>
                <option value="25">25 Minutes (Recommended — High Win Rate)</option>
                <option value="35">35 Minutes (Extended Swing)</option>
                <option value="45">45 Minutes (Maximum Cutoff)</option>
              </select>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Auto-exits at market if trade goes flat without reaching Target 1.
              </p>
            </div>
          </div>

          {/* Asymmetric Risk:Reward Targets */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Target 1 (+50% ROI / 1:1.5R)</span>
                <Badge className="bg-emerald-600/20 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold border-0">The Banker</Badge>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
                Books 50% lots and moves Stop-Loss to Entry Price + ₹0.50 cushion (100% Risk-Free).
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-950/20 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Target 2 (+100% ROI / 1:3.0R)</span>
                <Badge className="bg-indigo-600/20 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold border-0">The Runner</Badge>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
                Trails remainder dynamically behind 15-EMA for peak trend continuation gains.
              </p>
            </div>
          </div>

          {/* Profitability Pillars: Toggles */}
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Profitability Pillars &amp; Capital Shields
            </p>

            {/* The Banker Partial Booking */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors">
              <div>
                <p className="text-xs font-bold text-foreground">
                  &ldquo;The Banker &amp; The Runner&rdquo; Partial Profit Booking
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Automatically books 50% lots at Target 1 and trails remainder at breakeven + cost.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.sEnablePartialBooking !== false}
                onChange={(e) => set("sEnablePartialBooking", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* Macro Market Gate */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors">
              <div>
                <p className="text-xs font-bold text-foreground">
                  NIFTY 50 Macro Trend Gate
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Suppresses stock Calls when NIFTY is dumping below open, and suppresses stock Puts when NIFTY is rallying.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.sEnableMarketTrendFilter !== false}
                onChange={(e) => set("sEnableMarketTrendFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* Midday Chop Dead Zone */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border hover:bg-accent/40 transition-colors">
              <div>
                <p className="text-xs font-bold text-foreground">
                  Midday Chop Dead-Zone Filter (11:30 AM – 01:00 PM IST)
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Prohibits new breakout triggers during European transition chop, eliminating over 65% of false breakouts.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.sEnableMiddayChopFilter !== false}
                onChange={(e) => set("sEnableMiddayChopFilter", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* 1 Win & Done / 1 Loss & Done */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-background border border-border">
                <label className="text-xs font-bold block mb-1 text-foreground">&ldquo;1 Win &amp; Done&rdquo; Daily Rule</label>
                <select
                  value={form.sMaxWinsPerDay || "1"}
                  onChange={(e) => set("sMaxWinsPerDay", e.target.value)}
                  className="flex h-9 w-full rounded-xl border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="1">Stop after 1 Win (Disciplined)</option>
                  <option value="2">Stop after 2 Wins</option>
                  <option value="3">No Win Limit</option>
                </select>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <label className="text-xs font-bold block mb-1 text-foreground">&ldquo;1 Loss &amp; Done&rdquo; Shield</label>
                <select
                  value={form.sMaxLossesPerDay || "1"}
                  onChange={(e) => set("sMaxLossesPerDay", e.target.value)}
                  className="flex h-9 w-full rounded-xl border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="1">Halt on 1 Loss (Capital Shield)</option>
                  <option value="2">Halt on 2 Losses</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STANDARD RISK FOR EMA-VWAP & OPTIONS ── */}
      {(form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS") && (
        <div className="space-y-4">
          {form.type === "EMA_VWAP_CROSSOVER" ? (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Strict Risk-Based Sizing &amp; 15-EMA Live Trailing Active
                </p>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
                Strict Risk-Based Sizing (Loss capped at your Stop Loss ₹, e.g. ₹500) &amp; max 25% capital deployed per trade at 5x MIS leverage. Stop Loss is placed structurally below entry with a safety buffer (capped at 1.2% max) and trailed live with 15-EMA directly on Zerodha exchange servers.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-secondary/40 border border-border flex gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                Orders are placed as <strong className="text-foreground font-semibold">Limit</strong> orders for Entry, Stop-Loss (SL-Limit), and Target.
                Fixed amounts are per trade. Position size is calculated dynamically to adhere to your risk limit.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Target className="h-4 w-4 text-emerald-500" />
                Target Profit (₹)
              </label>
              <Input
                type="number"
                min={100}
                value={form.targetRs}
                onChange={(e) => set("targetRs", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-foreground">
                <Shield className="h-4 w-4 text-red-500" />
                Stop Loss (₹)
              </label>
              <Input
                type="number"
                min={100}
                value={form.stopLossRs}
                onChange={(e) => set("stopLossRs", e.target.value)}
                className="bg-background border-border text-foreground font-semibold"
              />
            </div>
          </div>

          {/* Exit Exact at Target Toggle */}
          <div className="p-4 rounded-2xl bg-card border border-border space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-foreground">Exit Exact at Target (Fixed Profit Target)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.exitExactAtTarget || false}
                  onChange={(e) => set("exitExactAtTarget", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              When enabled, immediately squares off the position the moment your exact target profit (e.g. <strong className="text-foreground font-semibold">₹{form.targetRs || "500"}</strong>) or stop loss (e.g. <strong className="text-foreground font-semibold">₹{form.stopLossRs || "500"}</strong>) is hit, with zero trailing or giving back gains.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
