"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Target, Zap, TrendingUp, Info, Activity, Timer } from "lucide-react";
import { StrategyFormState } from "../types";
import { NumberField } from "../../_components/form-ui";

interface Step3Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
}

export function Step3RiskAdvanced({ form, set }: Step3Props) {
  return (
    <div className="space-y-6">

      {/* ── 15-MIN BREAKOUT RISK & DYNAMIC TRAILING CONTROLS ── */}
      {form.type === "BREAKOUT_15MIN" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-brand-subtle border-2 border-primary/30 space-y-2.5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent-foreground" />
              <p className="text-xs font-semibold text-accent-foreground font-semibold">
                Institutional Edge &amp; Systematic Profitability Engine Active
              </p>
            </div>
            <div className="text-xs text-foreground font-medium mt-2 space-y-1.5 leading-relaxed font-normal">
              <p>• <strong className="text-foreground font-semibold">Live Zerodha CPR Engine</strong>: Real-time settlement Pivot, TC, BC, R1/S1, R2/S2. Blocks breakouts running into immediate CPR walls; Wide CPR days restrict to Trap Reversals only.</p>
              <p>• <strong className="text-foreground font-semibold">1-Loss &amp; Done Capital Shield</strong>: Halts strategy immediately after 1 stop-loss hit per day. Preserves monthly profit.</p>
              <p>• <strong className="text-foreground font-semibold">The Banker &amp; The Runner Partial Booking</strong>: Locks 50% profit at +1.8R, moves SL to COST for a risk-free trade, and lets remaining 50% ride on EMA/VWAP.</p>
              <p>• <strong className="text-foreground font-semibold">Midday Dead-Zone Filter (11:45 – 13:00 IST)</strong>: Skips entries during the low-liquidity midday chop zone, reserving capital for high-volume sessions.</p>
              <p>• <strong className="text-foreground font-semibold">Structural Candle SL</strong>: Placed tightly at the entry candle extreme (45–80 pts on Bank Nifty) rather than the massive 200–350 pt range extreme, slashing initial risk by 75%.</p>
              <p>• <strong className="text-foreground font-semibold">Early Breakeven (+0.7R)</strong>: Automatically moves SL to COST as soon as trade hits +0.7R profit, locking ₹0 risk before pullback retests.</p>
            </div>
          </div>

          {/* Institutional Edge Toggles */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Stop-Loss Elimination &amp; High-Conviction Filters
            </p>

            {/* Live Zerodha CPR S/R & Regime Filter */}
            <div className="p-3.5 rounded-lg border-2 border-primary/30 bg-brand-subtle space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Target className="h-4 w-4 text-accent-foreground shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-accent-foreground font-semibold">
                        Live Zerodha CPR Support / Resistance &amp; Regime Gate
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-primary/40 text-accent-foreground">
                        Live Kite Data
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground font-medium mt-0.5 leading-relaxed">
                      Computes Pivot, TC, BC, R1, S1, R2, S2 from previous day Zerodha settlement candles. Restricts Wide CPR days to Trap Reversals only and skips breakouts into immediate CPR hurdles (&lt; 0.35% away).
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnableCprSupportResistance ?? true}
                  onChange={(e) => set("b15EnableCprSupportResistance", e.target.checked)}
                  className="h-4 w-4 rounded border-primary text-accent-foreground focus:ring-primary cursor-pointer shrink-0 ml-3"
                />
              </label>
            </div>

            {/* Banker & Runner Partial Profit Booking */}
            <div className="p-3.5 rounded-lg border-2 border-warn/30 bg-warn-subtle space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4 text-warn shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-warn font-semibold">
                        Multi-Lot Partial Profit Booking (&ldquo;The Banker &amp; The Runner&rdquo;)
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-warn/40 text-warn">
                        Guaranteed Green Day
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground font-medium mt-0.5 leading-relaxed">
                      Secures day&apos;s profit at target milestone, sets Stop Loss to COST (₹0 risk-free trade), and lets the runner capture 100–300+ pt trends.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnablePartialBooking ?? true}
                  onChange={(e) => set("b15EnablePartialBooking", e.target.checked)}
                  className="h-4 w-4 rounded border-warn text-warn focus:ring-warn cursor-pointer shrink-0 ml-3"
                />
              </label>

              {(form.b15EnablePartialBooking ?? true) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-warn/30">
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">The Banker Booking Target (R)</label>
                    <Input
                      type="number"
                      step="0.1"
                      min={1.0}
                      max={4.0}
                      value={form.b15PartialBookingR || "1.8"}
                      onChange={(e) => set("b15PartialBookingR", e.target.value)}
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-lg"
                    />
                    <p className="text-xs text-foreground/75 font-medium mt-1">
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
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-lg"
                    />
                    <p className="text-xs text-foreground/75 font-medium mt-1">
                      % lots squared off at Target (default: 50% Banker, 50% Runner)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Midday Dead-Zone Filter */}
            <div className="p-3.5 rounded-lg border border-border bg-secondary/40 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Activity className="h-4 w-4 text-foreground/75 shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground">
                        Midday Dead-Zone Chop Shield (11:45 AM – 13:00 PM)
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-border text-foreground/75">
                        Anti-Whipsaw
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground font-medium mt-0.5 leading-relaxed">
                      Blocks new breakout entries during European morning transition chop. Active trailing runners continue without interruption.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnableMiddayChopFilter ?? true}
                  onChange={(e) => set("b15EnableMiddayChopFilter", e.target.checked)}
                  className="h-4 w-4 rounded border-input text-foreground/75 focus:ring-border cursor-pointer shrink-0 ml-3"
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
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">Dead-Zone End (IST)</label>
                    <Input
                      type="text"
                      value={form.b15MiddayDeadZoneEnd || "13:00"}
                      onChange={(e) => set("b15MiddayDeadZoneEnd", e.target.value)}
                      className="font-semibold text-xs h-9 bg-background border-border text-foreground rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between p-3 rounded-lg bg-card border-2 border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-profit shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Structural Candle Stop Loss (Tight Risk)</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">
                    Sets SL to breakout candle extreme (45–80 pts) instead of opposite 15m range (200–350 pts)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15UseStructuralCandleSl ?? true}
                onChange={(e) => set("b15UseStructuralCandleSl", e.target.checked)}
                className="h-4 w-4 rounded border-border text-profit focus:ring-profit cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-card border-2 border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-accent-foreground shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">RSI(14) Momentum Trend Alignment</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">
                    Confirms active momentum expansion (RSI &gt; 55 for Long, &lt; 45 for Short)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableRsiFilter ?? true}
                onChange={(e) => set("b15EnableRsiFilter", e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent-foreground focus:ring-primary cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-card border-2 border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-warn shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Early Breakeven Trailing (+0.7R -&gt; COST)</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">
                    Locks ₹0 risk-free trade at +0.7R profit before normal pullback retests
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableBreakevenTrail ?? true}
                onChange={(e) => set("b15EnableBreakevenTrail", e.target.checked)}
                className="h-4 w-4 rounded border-border text-warn focus:ring-warn cursor-pointer"
              />
            </label>

            {/* 9/15 EMA & VWAP Dynamic Trailing */}
            <div className="p-3.5 rounded-lg border-2 border-profit/30 bg-profit-subtle space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="h-4 w-4 text-profit shrink-0" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-profit font-semibold">
                        Dynamic EMA &amp; VWAP Trend Trailing (Uncapped Runner)
                      </p>
                      <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-profit/40 text-profit">
                        Zero Greed
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground font-medium mt-0.5 leading-relaxed">
                      Once in profit, trails SL along dynamic EMA &amp; VWAP support curve. Rides multi-hundred point runners until candle exhaustion.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.b15EnableEmaVwapTrailing ?? true}
                  onChange={(e) => set("b15EnableEmaVwapTrailing", e.target.checked)}
                  className="h-4 w-4 rounded border-profit text-profit focus:ring-profit cursor-pointer shrink-0 ml-3"
                />
              </label>

              {(form.b15EnableEmaVwapTrailing ?? true) && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-profit/30">
                  <div>
                    <label className="text-xs font-semibold block mb-1 text-foreground">Trailing EMA Period</label>
                    <select
                      value={form.b15TrailingEmaPeriod || "9"}
                      onChange={(e) => set("b15TrailingEmaPeriod", e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-profit/30"
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
                      className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-profit/30"
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
            <label className="flex items-center justify-between p-3.5 rounded-lg bg-signal-subtle border-2 border-signal/30 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-signal shrink-0" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-signal font-semibold">
                      ⚡ Institutional Liquidity Sweep Trap Trading (Turtle Soup / 2B)
                    </p>
                    <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5 border-signal/40 text-signal">
                      High Win-Rate
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground font-medium mt-0.5 leading-relaxed">
                    Fades false breakouts: Buys Bear Traps at range bottom, Sells Bull Traps at range top
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableTrapReversal ?? true}
                onChange={(e) => set("b15EnableTrapReversal", e.target.checked)}
                className="h-4 w-4 rounded border-signal text-signal focus:ring-signal cursor-pointer shrink-0 ml-3"
              />
            </label>

            {/* Breakout Retest Confirmation */}
            <label className="flex items-center justify-between p-3 rounded-lg bg-card border-2 border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shield className="h-4 w-4 text-accent-foreground shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Breakout Retest &amp; Body Conviction Filter</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">
                    Requires candle body &ge; 40% and confirmed retest bounce (eliminates wick traps)
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableRetestConfirmation ?? true}
                onChange={(e) => set("b15EnableRetestConfirmation", e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent-foreground focus:ring-primary cursor-pointer"
              />
            </label>

            {/* CPR Trend Day Filter */}
            <label className="flex items-center justify-between p-3 rounded-lg bg-card border-2 border-border hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Target className="h-4 w-4 text-accent-foreground shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Central Pivot Range (CPR) Narrow Trend Filter</p>
                  <p className="text-xs text-foreground/75 font-medium mt-0.5">
                    Identifies high-momentum trending sessions using CPR bandwidth
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.b15EnableCprFilter ?? true}
                onChange={(e) => set("b15EnableCprFilter", e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent-foreground focus:ring-primary cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Max Range (pts)</label>
              <Input
                type="number"
                min={50}
                max={1000}
                value={form.b15MaxOpeningRangePts || "300"}
                onChange={(e) => set("b15MaxOpeningRangePts", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-lg h-9"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
                Skip day if 15m bar &gt; limit
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Entry Window Cutoff</label>
              <Input
                type="text"
                value={form.b15PrimeWindowEndTime || "15:00"}
                onChange={(e) => set("b15PrimeWindowEndTime", e.target.value)}
                className="font-semibold text-xs bg-background border-border text-foreground rounded-lg h-9"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
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
                className="font-semibold text-xs bg-background border-border text-foreground rounded-lg h-9"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
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
                className="font-semibold text-xs bg-background border-border text-foreground rounded-lg h-9"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
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
                className="font-semibold text-xs bg-background border-border text-foreground rounded-lg h-9"
              />
              <p className="text-xs text-foreground/75 font-medium mt-1">
                Buffer beyond sweep extreme for tight trap SL
              </p>
            </div>
          </div>

        </div>
      )}

      {/* ── STOCKS-IN-PLAY BREAKOUT: STOP, LIQUIDITY AND LEVERAGE ── */}
      {form.type === "STOCKS_IN_PLAY" && form.sipSetup === "FADE" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">How a trade is managed</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Entry is a market SHORT right after the 5-minute close that gave the signal.</li>
              <li>The stop-loss is placed on the exchange at once, the stop distance below above the fill.</li>
              <li>The target is watched by the strategy; when price reaches it the short is covered at market.</li>
              <li>Once the trade is in profit by the breakeven step, the exchange stop is moved to the entry price.</li>
              {form.sipProfitLock !== false && <li>Profit lock: at +1.5x the stop the exchange stop moves to lock +0.5x; at +2.5x it locks +1.5x.</li>}
              {Number(form.sipWickStopMaxPct || 0) > 0 && <li>Wider stop: when the day&apos;s high so far (long: low) is beyond the % stop but within {form.sipWickStopMaxPct}% of the price, the stop goes just past it and the quantity is cut to keep the same max loss.</li>}
              {(form.sipFadeReentries || "0") !== "0" && <li>Re-entry: after a stop-out, the same stock is entered again on a 5-minute close back below VWAP (long: above), until the 11:30 close, up to {form.sipFadeReentries} times a day.</li>}
              <li>Otherwise the position is squared off at 15:05.</li>
              <li>Backtest (Aug 2024 to Nov 2026, ₹500 risk, 1.2% stop, no target, held to 15:05): +₹91.2k, about 47% of trades win (average win ₹907, average loss ₹455), 22 of 27 months green, worst month −₹2.8k. Live fills have been about 0.1% worse than the backtest, worth about −₹16k over 2 years.</li>
            </ul>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              { label: "Recommended: ride to 15:05 + re-entry", stop: "1.2", tgt: "0", at: "0", lock: "0", pl: false, re: "2", text: "No target, no stop move, up to 2 re-entries. Backtest +₹105.9k / 2 years, worst month −₹3.3k, worst day −₹1.5k" },
              { label: "Target 3x + breakeven (≈63% wins)", stop: "1.2", tgt: "3", at: "1", lock: "0.2", pl: true, re: "0", text: "Backtest +₹51.1k / 2 years, worst month −₹1.8k" },
              { label: "Highest win rate (≈72% wins)", stop: "1.8", tgt: "3", at: "0.5", lock: "0.2", pl: true, re: "0", text: "Backtest +₹5.5k / 2 years: wins often but earns almost nothing" },
            ] as const).map((p) => {
              const active = form.sipStopPct === p.stop && form.sipTargetR === p.tgt && form.sipBreakevenAtR === p.at && (form.sipBreakevenLockR || "0") === p.lock && (form.sipProfitLock !== false) === p.pl && (form.sipFadeReentries || "0") === p.re;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { set("sipStopPct", p.stop); set("sipTargetR", p.tgt); set("sipBreakevenAtR", p.at); set("sipBreakevenLockR", p.lock); set("sipProfitLock", p.pl); set("sipFadeReentries", p.re); }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${active ? "border-primary bg-muted" : "border-border bg-card"}`}
                >
                  <span className="block font-semibold text-foreground">{p.label}</span>
                  <span className="block text-muted-foreground">{p.text}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              label="Stop distance"
              suffix="% of entry"
              decimal
              min={0.3}
              value={form.sipStopPct}
              onChange={(v) => set("sipStopPct", v)}
              hint="1.2% was backtested. 0.8% to 1.6% were also positive."
            />
            <NumberField
              label="Target"
              suffix="x stop"
              decimal
              min={0}
              value={form.sipTargetR}
              onChange={(v) => set("sipTargetR", v)}
              hint={`3 = ${((Number(form.sipStopPct) || 1.2) * 3).toFixed(1)}% below the entry. 2 and 1.5 hit more often and earned less. 0 = no target.`}
            />
            <NumberField
              label="Stop to entry at"
              suffix="x stop"
              decimal
              min={0}
              value={form.sipBreakevenAtR}
              onChange={(v) => set("sipBreakevenAtR", v)}
              hint="1 = once the trade is up by the stop distance. 0 = off. Backtest with 1.2% and no target: off +₹91.2k, at 1.2x locking 0.3x +₹77.7k (more small wins, less profit)."
            />
            <NumberField
              label="Profit locked at that step"
              suffix="x stop"
              decimal
              min={0}
              value={form.sipBreakevenLockR}
              onChange={(v) => set("sipBreakevenLockR", v)}
              hint="0.2 = a trade that reached the step and came back still closes in profit after charges (≈62% winning trades, same total profit as 0). 0 = the stop goes exactly to the entry."
            />
            <NumberField
              label="Stop past the day's high when within"
              suffix="% of price"
              decimal
              min={0}
              value={form.sipWickStopMaxPct}
              onChange={(v) => set("sipWickStopMaxPct", v)}
              hint="0 = off: the stop is always the % above. 3 = when the day's high so far (long: low) is further than the % stop but within 3% of the price, the stop goes just past that high and fewer shares are taken, so the max loss stays the same. Fewer stop-outs, but less profit in the backtest: 1.2% stop / no target over 2 years ₹91k at 0, ₹82k at 2, ₹73k at 2.5, ₹65k at 3."
            />
            <NumberField
              label="Re-entries after a stop-out"
              suffix="max 2"
              min={0}
              value={form.sipFadeReentries}
              onChange={(v) => set("sipFadeReentries", v)}
              hint="After the stop is hit, short the same stock again on a 5-minute close back below VWAP (long: above), until 11:30, with a fresh stop. 0 = off. Backtest with 1.2% / no target: +₹14k over 2 years at 2, worst day −₹1.5k (3 stops)."
            />
            <NumberField
              label="Skip if yesterday's low is closer than"
              suffix="x stop"
              decimal
              min={0}
              value={form.sipSkipNearPdlR}
              onChange={(v) => set("sipSkipNearPdlR", v)}
              hint="0 = off (the default). 2 = no short when yesterday's low is less than 2x the stop below the price (longs: yesterday's high above it); a later signal on another stock can still trade. Not re-checked with the corrected backtest: keep it at 0."
            />
            <NumberField
              label="Min avg daily value"
              prefix={"₹"}
              suffix="Cr"
              decimal
              min={0}
              value={form.sipMinAvgValueCr}
              onChange={(v) => set("sipMinAvgValueCr", v)}
              hint="Skips thinly traded stocks. Backtested at ₹10 Cr; ₹25 Cr earned less."
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted sm:col-span-2">
              <input
                type="checkbox"
                checked={form.sipProfitLock !== false}
                onChange={(e) => set("sipProfitLock", e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border"
              />
              <span>
                <span className="block text-xs font-semibold text-foreground">Profit lock (after breakeven)</span>
                <span className="block text-xs text-muted-foreground">At +1.5x the stop, the exchange stop moves to lock +0.5x; at +2.5x it locks +1.5x. Backtest with 1.2% / 3x / breakeven: it costs profit (+₹56.8k off, +₹51.1k on). Leave it off.</span>
              </span>
            </label>
            <NumberField
              label="Fallback leverage"
              suffix="x"
              decimal
              min={1}
              value={form.sipLeverage}
              onChange={(v) => set("sipLeverage", v)}
              hint="Sizing uses Zerodha's own intraday leverage for each stock, asked at 09:20. This is used only when Zerodha cannot say (up to 5x)."
            />
          </div>
        </div>
      )}

      {form.type === "STOCKS_IN_PLAY" && form.sipSetup === "OI" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">How a trade is managed</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Entry is a SELL LIMIT sent at 09:00, 5% under yesterday&apos;s close; the pre-open auction fills it at the 09:15 opening price.</li>
              <li>Shares are sized on yesterday&apos;s close so the stop loses at most your max loss; the stop and target are then set from the real fill.</li>
              <li>The exchange takes no stop orders before 09:15, so the stop-loss is placed on the exchange at 09:15.</li>
              <li>The target is watched by the strategy; when price reaches it the short is covered at market. Otherwise 15:05.</li>
              <li>Backtest (Sep 2024 to Sep 2026, ₹500 risk, 1% / 3x): +₹41k, about 4 in 10 trades win, worst drop ₹9.2k. October 2026 (after the test) lost ₹1.5k on 16 trades.</li>
            </ul>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Stop distance"
              suffix="% of entry"
              decimal
              min={0.3}
              value={form.sipStopPct}
              onChange={(v) => set("sipStopPct", v)}
              hint="1% was backtested."
            />
            <NumberField
              label="Target"
              suffix="x stop"
              decimal
              min={0}
              value={form.sipTargetR}
              onChange={(v) => set("sipTargetR", v)}
              hint="3x was backtested. 0 = no target (held to the stop or 15:05)."
            />
          </div>
        </div>
      )}

      {form.type === "STOCKS_IN_PLAY" && form.sipSetup === "ORB" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">How a trade is managed</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Entry is a market order the moment price breaks the first candle&apos;s low (or high, for longs).</li>
              <li>The stop-loss sits the distance below away from the fill and is placed on the exchange at once.</li>
              <li>There is no target. A position exits at its stop or at the 15:05 square-off.</li>
              <li>Expect about 2 losing trades for every winner; the winners are usually several times larger.</li>
            </ul>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              label="Stop distance"
              suffix="x daily ATR"
              decimal
              min={0.05}
              value={form.sipStopAtr}
              onChange={(v) => set("sipStopAtr", v)}
              hint="0.2 = a fifth of the stock's average daily range (14 days)."
            />
            <NumberField
              label="Min avg daily value"
              prefix={"₹"}
              suffix="Cr"
              decimal
              min={0}
              value={form.sipMinAvgValueCr}
              onChange={(v) => set("sipMinAvgValueCr", v)}
              hint="Skips thinly traded stocks, where fills slip more."
            />
            <NumberField
              label="Fallback leverage"
              suffix="x"
              decimal
              min={1}
              value={form.sipLeverage}
              onChange={(v) => set("sipLeverage", v)}
              hint="Sizing uses Zerodha's own intraday leverage for each stock, asked at 09:20. This is used only when Zerodha cannot say (up to 5x)."
            />
          </div>
        </div>
      )}

      {/* ── STANDARD RISK FOR EMA-VWAP & OPTIONS ── */}
      {(form.type === "EMA_VWAP_CROSSOVER" || form.type === "EMA_RSI_OPTIONS") && (
        <div className="space-y-4">
          {form.type === "EMA_VWAP_CROSSOVER" ? (
            <div className="p-4 rounded-lg bg-profit-subtle border-2 border-profit/30 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-profit shrink-0" />
                <p className="text-xs font-semibold text-profit">Recommended settings (the backtested set)</p>
              </div>
              <ul className="text-xs text-foreground font-medium leading-relaxed list-disc pl-4 space-y-1">
                <li>Entries: opening-drive, inside-candle, crossover and pullback setups on 5-minute candles from 09:20, with a volume spike against the stock&apos;s own last 10 sessions (Balanced). The stock must already be 1.5% past yesterday&apos;s close in the trade&apos;s direction. AUTO ranks stocks by their own move and volume (not against NIFTY) and checks the top 20; an opening-range setup may sit up to 6% from the 15-EMA, so gap-and-go leaders qualify.</li>
                <li>Stop: beyond the setup&apos;s swing, 0.85% to 1.2% from the entry. Shares = your max loss per trade ÷ the stop distance.</li>
                <li>Exit: Ride the 15-EMA, no fixed target, stagnation exit off. At +1.5R the stop moves to +0.5R and the exit switches to the 40-EMA; at +3R the stop moves to +2R. Everything is closed at 15:05.</li>
                <li>2-year backtest at ₹500 risk, 1 trade a day, after charges: +₹47.6k watching 1 setup (both years positive, 18 of 24 months green, worst drawdown ₹6.8k), +₹44.7k watching 3. Live results usually come in lower.</li>
              </ul>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                These are the defaults below (and &quot;Setups watched at once&quot; = 1 in step 2). You can change any of them; a setting you change runs as you set it, not as tested.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-secondary/40 border border-border flex gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-foreground font-medium leading-relaxed font-normal">
                Orders are placed as <strong className="text-foreground font-semibold">Limit</strong> orders for Entry, Stop-Loss (SL-Limit), and Target.
                Fixed amounts are per trade. Position size is calculated dynamically to adhere to your risk limit.
              </p>
            </div>
          )}

          {/* Volume confirmation (EMA-VWAP stocks) */}
          {form.type === "EMA_VWAP_CROSSOVER" && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-semibold text-foreground">Volume Confirmation</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.volumeFilter !== false}
                    onChange={(e) => set("volumeFilter", e.target.checked)}
                    className="sr-only peer"
                    aria-label="Require volume confirmation on every entry"
                  />
                  <div className="w-9 h-5 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-profit after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-input after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-profit"></div>
                </label>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                Every long and short entry needs a volume spike on its signal candle, compared with that stock&apos;s own volume at the same time of day over the last 10 sessions. Checked on every new 5-minute candle after 09:20, so a calm stock needs a smaller spike than a noisy one.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Volume strictness">
                {([
                  { value: "RELAXED", title: "Relaxed", body: "More trades. Volume clearly above normal." },
                  { value: "BALANCED", title: "Balanced", body: "Recommended. Volume well above the stock's normal." },
                  { value: "STRICT", title: "Strict", body: "Fewest trades. Only exceptional volume spikes." },
                ] as const).map((opt) => {
                  const selected = (form.volumeStrictness || "BALANCED") === opt.value && form.volumeFilter !== false;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={form.volumeFilter === false}
                      onClick={() => set("volumeStrictness", opt.value)}
                      className={`text-left p-3 rounded-lg border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selected ? "border-primary bg-secondary/40" : "border-border bg-background hover:border-primary/50"}`}
                    >
                      <p className="text-xs font-semibold text-foreground">{opt.title}</p>
                      <p className="text-[11px] text-foreground/75 font-medium leading-relaxed mt-1">{opt.body}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target mode (EMA-VWAP stocks): how profits are taken */}
          {form.type === "EMA_VWAP_CROSSOVER" && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-profit shrink-0" />
                <span className="text-sm font-semibold text-foreground">Profit Target Mode</span>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                Targets are sized from each stock&apos;s own daily volatility (ATR), not a fixed number. The stop-loss stays at the structural swing level in every mode.
                {form.exitExactAtTarget && " Turned off while the Fixed Rupee Target below is on."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Profit target mode">
                {([
                  { value: "FULL", title: "Full exit", body: "One target at 0.5x the stock's daily range, whole position exits there. No trailing. Highest win rate in backtests." },
                  { value: "PARTIAL", title: "Partial booking", body: "Book half at that target, the other half rides until a 5m candle closes across the 15-EMA. Runner stop moves to break-even." },
                  { value: "QUICK", title: "Quick wins", body: "Book half at a small 0.5R target (hit about half the time), the rest rides the 15-EMA candle-close exit." },
                  { value: "EMA", title: "Ride the 15-EMA", body: "No target and no half-booking. The whole position stays in until a 5m candle closes across the 15-EMA, the stop is hit, or 15:05. Best result in the 2-year backtest with the stagnation exit off." },
                ] as const).map((opt) => {
                  const selected = (form.targetMode || "FULL") === opt.value && !form.exitExactAtTarget;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!!form.exitExactAtTarget}
                      onClick={() => set("targetMode", opt.value)}
                      className={`text-left p-3 rounded-lg border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selected ? "border-profit bg-profit-subtle/50" : "border-border bg-background hover:border-profit/50"}`}
                    >
                      <p className="text-xs font-semibold text-foreground">{opt.title}</p>
                      <p className="text-[11px] text-foreground/75 font-medium leading-relaxed mt-1">{opt.body}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Profit lock (EMA-VWAP stocks, ride-the-15-EMA mode): steps the stop into profit */}
          {form.type === "EMA_VWAP_CROSSOVER" && form.targetMode === "EMA" && !form.exitExactAtTarget && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-profit shrink-0" />
                  <span className="text-sm font-semibold text-foreground">Profit Lock</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.profitLock !== false}
                    onChange={(e) => set("profitLock", e.target.checked)}
                    className="sr-only peer"
                    aria-label="Profit lock"
                  />
                  <div className="w-9 h-5 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-profit after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-input after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-profit"></div>
                </label>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                R is the entry&apos;s stop distance (your max loss). Once the trade is +1.5R the stop moves to +0.5R, and at +3R to +2R, so a big open profit can&apos;t turn into a small one. The 15-EMA candle-close exit still applies. In the 2-year backtest this made about 40% more than leaving the stop where it started, in both years.
              </p>
            </div>
          )}

          {/* Slow Trail (EMA-VWAP stocks, ride-the-15-EMA mode) */}
          {form.type === "EMA_VWAP_CROSSOVER" && form.targetMode === "EMA" && !form.exitExactAtTarget && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-profit shrink-0" />
                  <span className="text-sm font-semibold text-foreground">Slow Trail</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.slowTrail !== false}
                    onChange={(e) => set("slowTrail", e.target.checked)}
                    className="sr-only peer"
                    aria-label="Slow Trail"
                  />
                  <div className="w-9 h-5 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-profit after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-input after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-profit"></div>
                </label>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                Once the trade is +1.5R, it exits on a 5m candle close across the 40-EMA instead of the 15-EMA, so a big run isn&apos;t cut on its first dip. The stop and the profit lock still apply. In the 2-year backtest this made about 25% more, in both years, with the same win rate and drawdown.
              </p>
            </div>
          )}

          {/* Stagnation exit (EMA-VWAP stocks): time-stop for trades that go nowhere */}
          {form.type === "EMA_VWAP_CROSSOVER" && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">Stagnation Exit</span>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                Closes the trade if it is still within 0.25% of the entry price after this long. In the 2-year backtest a longer time (or off) did better: 35 min closed many trades near break-even before they moved.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Stagnation exit">
                {([
                  { value: "0", title: "Off" },
                  { value: "35", title: "35 min" },
                  { value: "60", title: "60 min" },
                  { value: "120", title: "120 min" },
                ] as const).map((opt) => {
                  const selected = (form.stagnationMinutes || "0") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => set("stagnationMinutes", opt.value)}
                      className={`p-2.5 rounded-lg border-2 text-xs font-semibold text-foreground transition-colors ${selected ? "border-primary bg-secondary/40" : "border-border bg-background hover:border-primary/50"}`}
                    >
                      {opt.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Min day move (EMA-VWAP stocks): skip entries in stocks that have barely moved from the previous close */}
          {form.type === "EMA_VWAP_CROSSOVER" && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">Min Day Move</span>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                Skips a setup unless the stock is already this far past yesterday&apos;s close in the trade&apos;s direction (a buy needs the price above the previous close by this much). Stocks that have barely moved lost money in the backtest. In the 2-year backtest 1.5% made about 23% more, in both years, with the same win rate and drawdown.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Min day move">
                {([
                  { value: "0", title: "Off" },
                  { value: "1", title: "1%" },
                  { value: "1.5", title: "1.5%" },
                  { value: "2", title: "2%" },
                ] as const).map((opt) => {
                  const selected = Number(form.minDayMovePct ?? "1.5") === Number(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => set("minDayMovePct", opt.value)}
                      className={`p-2.5 rounded-lg border-2 text-xs font-semibold text-foreground transition-colors ${selected ? "border-primary bg-secondary/40" : "border-border bg-background hover:border-primary/50"}`}
                    >
                      {opt.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Max stop distance (EMA-VWAP stocks): caps how far the structural stop may sit from the entry */}
          {form.type === "EMA_VWAP_CROSSOVER" && (
            <div className="p-4 rounded-lg bg-card border-2 border-border space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">Max Stop Distance</span>
              </div>
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                The stop sits beyond the day&apos;s swing low/high, but never further than this from the entry. A tighter stop buys more shares for the same max loss, so a normal move earns more. In the 2-year backtest 1.2% made about 3x what 2.2% made, with more trades stopped out; 1.5% made ₹21k against ₹35.5k for 1.2%.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Max stop distance">
                {([
                  { value: "1", title: "1.0%" },
                  { value: "1.2", title: "1.2%" },
                  { value: "1.5", title: "1.5%" },
                  { value: "2.2", title: "2.2% (old)" },
                ] as const).map((opt) => {
                  const selected = Number(form.maxStopPct || "1.2") === Number(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => set("maxStopPct", opt.value)}
                      className={`p-2.5 rounded-lg border-2 text-xs font-semibold text-foreground transition-colors ${selected ? "border-primary bg-secondary/40" : "border-border bg-background hover:border-primary/50"}`}
                    >
                      {opt.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Exit Exact at Target Toggle */}
          <div className="p-4 rounded-lg bg-card border-2 border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-profit shrink-0" />
                <span className="text-sm font-semibold text-foreground">Exit Exact at Target (Fixed Profit Target)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.exitExactAtTarget || false}
                  onChange={(e) => set("exitExactAtTarget", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-profit after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-input after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-profit"></div>
              </label>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed font-normal">
              When enabled, immediately squares off the position the moment your exact target profit (e.g. <strong className="text-foreground font-semibold">₹{form.targetRs || "500"}</strong>) or stop loss (e.g. <strong className="text-foreground font-semibold">₹{form.stopLossRs || "500"}</strong>) is hit, with zero trailing or giving back gains.
            </p>
            {form.type === "EMA_VWAP_CROSSOVER" && (
              <p className="text-xs text-foreground/75 font-medium leading-relaxed">
                Overrides the Profit Target Mode above; the stop never sits further than the setup&apos;s structural stop. In the 2-year backtest a fixed ₹500 target with ₹500 risk lost ₹9.8k (51% win) where riding the 15-EMA made +₹35.5k: capping the winners removes the big trend days that pay for the stops.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
