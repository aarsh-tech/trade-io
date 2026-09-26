"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Pencil, X, Settings2 } from "lucide-react";
import Link from "next/link";
import type { DetailCtx } from "./useStrategyDetail";
import { Field } from "./parts";

export function ConfigTab({ ctx }: { ctx: DetailCtx }) {
  const { id, busy, editing, setEditing, activeTab, editConfig, setEditConfig, saveConfig, cfg, is15Min, isEmaVwap, isNiftyScalper, isStockOptions, isGammaBlast } = ctx;
  return (
    <>
      {/* ─── TAB 2: STRATEGY CONFIGURATION & RISK RULES ─── */}
      {activeTab === "CONFIG" && (
        <Card className="border-border/60 bg-card rounded-lg">
          <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Strategy Parameters & Execution Rules</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adjust sizing, stop-loss limits, target thresholds, and indicator parameters.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/strategies/${id}/edit`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 font-semibold"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Full Strategy Settings
                </Button>
              </Link>
              {!editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(true);
                    setEditConfig({});
                  }}
                  className="gap-1.5 text-xs h-8"
                >
                  <Pencil className="h-3.5 w-3.5" /> Quick Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={saveConfig}
                    className="gap-1.5 text-xs h-8 bg-profit hover:bg-profit/90 text-on-profit"
                  >
                    <Check className="h-3.5 w-3.5" /> Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                    className="text-xs h-8"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              <Field
                label="Target Symbol"
                editing={editing}
                value={editing ? String(editConfig.symbol ?? cfg.symbol ?? "AUTO") : (cfg.symbol || "AUTO (Smart Stock Picker)")}
                onChange={(v) => setEditConfig((e) => ({ ...e, symbol: v.toUpperCase() }))}
              />
              <Field
                label="Exchange"
                editing={editing}
                value={editing ? String(editConfig.exchange ?? cfg.exchange ?? "NSE") : (cfg.exchange || "NSE")}
                onChange={(v) => setEditConfig((e) => ({ ...e, exchange: v.toUpperCase() }))}
              />
              <Field
                label="Lots / Sizing"
                editing={editing}
                value={editing ? String(editConfig.lots ?? cfg.lots ?? 1) : String(cfg.lots ?? 1)}
                onChange={(v) => setEditConfig((e) => ({ ...e, lots: Number(v) }))}
                type="number"
              />
              <Field
                label="Execution Product"
                editing={editing}
                value={editing ? String(editConfig.product ?? cfg.product ?? "MIS") : String(cfg.product ?? "MIS")}
                onChange={(v) => setEditConfig((e) => ({ ...e, product: v }))}
              />

              <Field
                label="Daily Stop Loss (₹)"
                editing={editing}
                value={editing ? String(editConfig.stopLossRs ?? cfg.stopLossRs ?? 500) : `₹${cfg.stopLossRs ?? 500}`}
                onChange={(v) => setEditConfig((e) => ({ ...e, stopLossRs: Number(v) }))}
                type="number"
              />
              <Field
                label="Daily Target (₹)"
                editing={editing}
                value={editing ? String(editConfig.targetRs ?? cfg.targetRs ?? 500) : `₹${cfg.targetRs ?? 500}`}
                onChange={(v) => setEditConfig((e) => ({ ...e, targetRs: Number(v) }))}
                type="number"
              />
              <Field
                label="Max Trades / Day"
                editing={editing}
                value={editing ? String(editConfig.maxTradesPerDay ?? cfg.maxTradesPerDay ?? 1) : String(cfg.maxTradesPerDay ?? 1)}
                onChange={(v) => setEditConfig((e) => ({ ...e, maxTradesPerDay: Number(v) }))}
                type="number"
              />
              {!isGammaBlast && !isNiftyScalper && (
                <Field
                  label="Min Stock Price (₹)"
                  editing={editing}
                  value={editing ? String(editConfig.minStockPrice ?? cfg.minStockPrice ?? 300) : `₹${cfg.minStockPrice ?? 300}`}
                  onChange={(v) => setEditConfig((e) => ({ ...e, minStockPrice: Number(v) }))}
                  type="number"
                />
              )}

              {isGammaBlast && (
                <>
                  <Field
                    label="Trading Window Mode"
                    editing={false}
                    value={cfg.tradingMode === "AFTERNOON_ONLY" ? "Afternoon Only (13:00–15:25 IST)" : "Full Day Scalper (09:20–15:25 IST)"}
                  />
                  <Field
                    label="Execution Hours"
                    editing={editing}
                    value={editing ? String(editConfig.startTime ?? cfg.startTime ?? "09:20") : `${cfg.startTime ?? "09:20"} – ${cfg.endTime ?? "15:25"} IST`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, startTime: v }))}
                  />
                  <Field
                    label="Initial Stop Loss %"
                    editing={editing}
                    value={editing ? String(editConfig.initialSlPct ?? cfg.initialSlPct ?? 50) : `${cfg.initialSlPct ?? 50}% Option SL`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, initialSlPct: Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="Max Conviction Lots"
                    editing={editing}
                    value={editing ? String(editConfig.maxConvictionLots ?? cfg.maxConvictionLots ?? 3) : `${cfg.maxConvictionLots ?? 3} Lots`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, maxConvictionLots: Number(v) }))}
                    type="number"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Morning ORB Trigger (09:20–11:30)</p>
                    <p className="text-sm font-semibold text-profit">
                      {cfg.enableOrbMorningTrigger !== false ? "Active (High/Low Breakout + VWAP)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Midday Channel Breakout (11:30–13:30)</p>
                    <p className="text-sm font-semibold text-warn">
                      {cfg.enableMiddayBreakout !== false ? "Active (25-30m Compression Expansion)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Live OI Unwinding Confirmation</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableOiFilter !== false ? "Active (Confirms Writer Panic)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Ratchet Zero-Decay Trailing</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableRatchetTrailing !== false ? "Active (1.5x, 2.0x, 3.0x Milestone Locks)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">2.0x Partial Profit Booking</p>
                    <p className="text-sm font-semibold text-signal">
                      {cfg.enablePartialProfitBooking !== false ? "Active (50% booked @ 2x, runner trailed)" : "Disabled"}
                    </p>
                  </div>
                </>
              )}

              {isNiftyScalper && (
                <>
                  <Field
                    label="Target 1 Milestone (Pts)"
                    editing={editing}
                    value={editing ? String(editConfig.targetPoints ?? cfg.targetPoints ?? 10) : `+${cfg.targetPoints ?? 10} pts`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, targetPoints: Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="Stop Loss Points"
                    editing={editing}
                    value={editing ? String(editConfig.stopLossPoints ?? cfg.stopLossPoints ?? 7) : `-${cfg.stopLossPoints ?? 7} pts`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, stopLossPoints: Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="Breakeven Trail (Pts)"
                    editing={editing}
                    value={editing ? String(editConfig.trailCostAtPoints ?? cfg.trailCostAtPoints ?? 6) : `+${cfg.trailCostAtPoints ?? 6} pts`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, trailCostAtPoints: Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="Daily Loss Limit (Circuit Breaker)"
                    editing={editing}
                    value={editing ? String(editConfig.maxLossesPerDay ?? cfg.maxLossesPerDay ?? 2) : `${cfg.maxLossesPerDay ?? 2} losses`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, maxLossesPerDay: Number(v) }))}
                    type="number"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">The Banker &amp; The Runner</p>
                    <p className="text-sm font-semibold text-profit">
                      {cfg.enablePartialBooking !== false ? `Active (${cfg.partialBookingPct ?? 50}% booked at T1, runner trailed)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Midday Dead-Zone Shield</p>
                    <p className="text-sm font-semibold text-warn">
                      {cfg.enableMiddayChopFilter !== false ? "Active (11:45 - 13:00 European Lull Paused)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Volume Surge / RVOL</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableVolumeSurge !== false ? `Active (RVOL >= ${cfg.minRvol ?? 1.15}x)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Day VWAP Trend Bias</p>
                    <p className="text-sm font-semibold text-signal">
                      {cfg.enableTrendBiasFilter !== false ? "Active (CE above VWAP, PE below VWAP)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Scalping Timeframe</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.timeframe || "5minute"} Candles
                    </p>
                  </div>
                </>
              )}

              {isEmaVwap && (
                <Field
                  label="EMA Period"
                  editing={editing}
                  value={editing ? String(editConfig.emaPeriod ?? cfg.emaPeriod ?? 15) : String(cfg.emaPeriod ?? 15)}
                  onChange={(v) => setEditConfig((e) => ({ ...e, emaPeriod: Number(v) }))}
                  type="number"
                />
              )}

              {isStockOptions && (
                <>
                  <Field
                    label="Directional Bias"
                    editing={editing}
                    value={editing ? String(editConfig.directionBias ?? cfg.directionBias ?? "BOTH") : String(cfg.directionBias ?? "BOTH")}
                    onChange={(v) => setEditConfig((e) => ({ ...e, directionBias: v }))}
                  />
                  <Field
                    label="Trigger Setup Mode"
                    editing={editing}
                    value={editing ? String(editConfig.setupType ?? cfg.setupType ?? "BOTH") : String(cfg.setupType ?? "BOTH")}
                    onChange={(v) => setEditConfig((e) => ({ ...e, setupType: v }))}
                  />
                  <Field
                    label="Option Moneyness"
                    editing={editing}
                    value={editing ? String(editConfig.moneyness ?? cfg.moneyness ?? "ITM") : String(cfg.moneyness ?? "ITM")}
                    onChange={(v) => setEditConfig((e) => ({ ...e, moneyness: v }))}
                  />
                  <Field
                    label="EMA Period"
                    editing={editing}
                    value={editing ? String(editConfig.emaPeriod ?? cfg.emaPeriod ?? 15) : String(cfg.emaPeriod ?? 15)}
                    onChange={(v) => setEditConfig((e) => ({ ...e, emaPeriod: Number(v) }))}
                    type="number"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">The Banker &amp; The Runner</p>
                    <p className="text-sm font-semibold text-profit">
                      {cfg.enablePartialBooking !== false ? `Active (${cfg.partialBookingPct ?? 50}% booked @ T1 -> COST)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">NIFTY 50 Macro Trend Gate</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableMarketTrendFilter !== false ? "Active (Aligned with NIFTY VWAP)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Midday Dead-Zone Shield</p>
                    <p className="text-sm font-semibold text-warn">
                      {cfg.enableMiddayChopFilter !== false ? `Active (${cfg.middayDeadZoneStart ?? "11:30"} - ${cfg.middayDeadZoneEnd ?? "13:00"} IST)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Volume Surge / RVOL</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      Active (RVOL &ge; {cfg.minRvol ?? 1.25}x)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Theta Stagnancy Cutoff</p>
                    <p className="text-sm font-semibold text-signal">
                      {cfg.maxStagnantTimeMin ?? 25} Minutes
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">1-Loss &amp; Done Capital Shield</p>
                    <p className="text-sm font-semibold text-loss">
                      Max {cfg.maxLossesPerDay ?? 1} SL / Day
                    </p>
                  </div>
                </>
              )}

              {is15Min && (
                <>
                  <Field
                    label="Risk:Reward Ratio"
                    editing={editing}
                    value={editing ? String(editConfig.riskRewardRatio ?? cfg.riskRewardRatio ?? 2.0) : `1:${Number(cfg.riskRewardRatio ?? 2.0).toFixed(1)}`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, riskRewardRatio: Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="Max Opening Range Cap"
                    editing={editing}
                    value={editing ? String(editConfig.maxOpeningRangePts ?? cfg.maxOpeningRangePts ?? 300) : `${cfg.maxOpeningRangePts ?? 300} pts`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, maxOpeningRangePts: Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="Entry Window Cutoff"
                    editing={editing}
                    value={editing ? String(editConfig.primeWindowEndTime ?? cfg.primeWindowEndTime ?? "15:00") : `${cfg.primeWindowEndTime ?? "15:00"} IST`}
                    onChange={(v) => setEditConfig((e) => ({ ...e, primeWindowEndTime: v }))}
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Structural Candle SL</p>
                    <p className="text-sm font-semibold text-profit">
                      {cfg.useStructuralCandleSl !== false ? "Active (Tight 45–80 pt Risk)" : "Wide 15m Range Extreme"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Early Breakeven Lock</p>
                    <p className="text-sm font-semibold text-warn">
                      +{cfg.breakevenTriggerR ?? 0.7}R -&gt; COST (Risk-Free)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">RSI(14) Momentum Filter</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableRsiFilter !== false ? "Active (>55 Long, <45 Short)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Liquidity Sweep Trap Trading</p>
                    <p className="text-sm font-semibold text-signal">
                      {cfg.enableTrapReversal !== false ? "Active (Turtle Soup / 2B Reversal)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Breakout Retest Confirmation</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableRetestConfirmation !== false ? "Active (Body >= 40% & Retest)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">CPR Trend Day Filter</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableCprFilter !== false ? `Active (Narrow CPR < ${cfg.cprNarrowThresholdPct ?? 0.18}%)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Live Zerodha CPR S/R &amp; Regime</p>
                    <p className="text-sm font-semibold text-accent-foreground">
                      {cfg.enableCprSupportResistance !== false ? "Active (Pivot/TC/BC/R1/S1 + Regime Gate)" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Banker &amp; Runner Partial Booking</p>
                    <p className="text-sm font-semibold text-warn">
                      {cfg.enablePartialBooking !== false ? `Active (${cfg.partialBookingPct ?? 50}% @ +${cfg.partialBookingR ?? 1.8}R -> COST)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Midday Dead-Zone Chop Filter</p>
                    <p className="text-sm font-semibold text-foreground/75">
                      {cfg.enableMiddayChopFilter !== false ? `Active (${cfg.middayDeadZoneStart ?? "11:45"} - ${cfg.middayDeadZoneEnd ?? "13:00"} IST)` : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">1-Loss &amp; Done Capital Shield</p>
                    <p className="text-sm font-semibold text-loss">
                      Max {cfg.maxLossesPerDay ?? 1} SL / Day
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

    </>
  );
}
