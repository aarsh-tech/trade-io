"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EMPTY, formatINR, formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Loader2, Radio, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import type { DetailCtx } from "./useStrategyDetail";
import { isInPosition } from "./shared";

function positive(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-sunken px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("num truncate text-base font-semibold text-foreground", tone)}>{value}</p>
    </div>
  );
}

/** Where LTP sits between stop-loss and target, with the entry marked. */
function RangeBar({ sl, target, entry, ltp }: { sl: number; target: number; entry: number; ltp: number }) {
  const lo = Math.min(sl, target);
  const hi = Math.max(sl, target);
  const span = hi - lo || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));
  const slLeft = sl <= target;
  const entryPos = pos(entry);
  return (
    <div>
      <div className="relative h-4" role="img" aria-label="Price position between stop-loss and target">
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("absolute inset-y-0 bg-loss-subtle", slLeft ? "left-0" : "right-0")}
            style={{ width: slLeft ? `${entryPos}%` : `${100 - entryPos}%` }}
          />
          <div
            className={cn("absolute inset-y-0 bg-profit-subtle", slLeft ? "right-0" : "left-0")}
            style={{ width: slLeft ? `${100 - entryPos}%` : `${entryPos}%` }}
          />
          <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${entryPos}%` }} />
        </div>
        <span
          className="absolute top-0 h-4 w-1.5 -translate-x-1/2 rounded-full bg-primary ring-2 ring-card transition-[left] duration-500"
          style={{ left: `${pos(ltp)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-medium num">
        <span className={slLeft ? "text-loss" : "text-profit"}>{slLeft ? "SL" : "Target"} {formatPrice(slLeft ? sl : target)}</span>
        <span className={slLeft ? "text-profit" : "text-loss"}>{slLeft ? "Target" : "SL"} {formatPrice(slLeft ? target : sl)}</span>
      </div>
    </div>
  );
}

export function PositionHero({ ctx }: { ctx: DetailCtx }) {
  const { strategy, liveState, displayPnlRs, displayPnlPct, displayLtp, isSquareOffBusy, handleInstantSquareOff, isLong } = ctx;
  const [confirmSquareOff, setConfirmSquareOff] = useState(false);
  const inPosition = strategy.isActive && (isInPosition(liveState) || Boolean(liveState?.currentLtp && liveState?.entryPrice));

  if (!inPosition) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
        <Radio className={cn("mx-auto mb-2 h-6 w-6", strategy.isActive ? "text-primary animate-pulse" : "text-muted-foreground/60")} aria-hidden />
        <p className="text-sm font-semibold text-foreground">{strategy.isActive ? "Waiting for signal" : "Engine is stopped"}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {strategy.isActive
            ? "The engine is scanning the market. Your position will appear here the moment an entry triggers."
            : "Start the strategy to begin scanning for entries. Any open position will be shown here."}
        </p>
      </section>
    );
  }

  const entry = positive(liveState?.entryPrice);
  const sl = positive(liveState?.stopLossPrice);
  const target = positive(liveState?.targetPrice);
  const ltp = positive(displayLtp);
  const qty = liveState?.executedQty || liveState?.qty || strategy.config.qty || 1;
  const pnl = Number(displayPnlRs ?? 0);
  const side = String(liveState?.entryTriggered || liveState?.signalSide || (isLong ? "LONG" : "SHORT"));
  const sideIsLong = side === "LONG" || side === "CALL" || side === "BUY";
  const symbol = liveState?.optionSymbol || liveState?.activeSymbol || liveState?.futureSymbol || strategy.config.symbol;

  const toSl = ltp && sl ? Math.abs(ltp - sl) : null;
  const toTarget = ltp && target ? Math.abs(target - ltp) : null;

  return (
    <section className={cn("space-y-4 rounded-lg border bg-card p-4 sm:p-5", pnl >= 0 ? "border-profit/40" : "border-loss/40")} aria-label="Open position">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider", sideIsLong ? "bg-buy text-primary-foreground" : "bg-sell text-on-loss")}>{side}</span>
            <h2 className="truncate text-base font-semibold text-foreground">{symbol}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Qty <span className="num font-semibold text-foreground">{qty}</span> · auto square-off at 15:15 IST
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium text-muted-foreground">Unrealised P&L</p>
          <p className={cn("num text-2xl font-semibold sm:text-3xl", pnl >= 0 ? "text-profit" : "text-loss")}>{formatINR(pnl, { signed: true })}</p>
          <p className={cn("num text-xs font-medium", pnl >= 0 ? "text-profit" : "text-loss")}>{formatPct(Number(displayPnlPct ?? 0))}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Entry" value={entry ? formatINR(entry) : EMPTY} />
        <Cell label="LTP" value={ltp ? formatINR(ltp) : EMPTY} />
        <Cell label={liveState?.isTrailingEma ? "Trailing SL" : "Stop-loss"} value={sl ? formatINR(sl) : EMPTY} tone="text-loss" />
        <Cell label="Target" value={target ? formatINR(target) : EMPTY} tone="text-profit" />
      </div>

      {sl && target && entry && ltp ? (
        <div className="space-y-2">
          <RangeBar sl={sl} target={target} entry={entry} ltp={ltp} />
          <p className="text-xs text-muted-foreground">
            <span className="num font-semibold text-loss">{formatPrice(toSl)}</span> to stop-loss ·{" "}
            <span className="num font-semibold text-profit">{formatPrice(toTarget)}</span> to target
          </p>
        </div>
      ) : null}

      {liveState?.isTrailingEma && (
        <div className="flex items-center gap-2 rounded-md bg-profit-subtle px-3 py-2 text-xs font-medium text-profit">
          <TrendingUp className="h-4 w-4 shrink-0" aria-hidden /> EMA trailing stop is active and following the trend.
        </div>
      )}

      <Button variant="danger" size="lg" className="w-full sm:w-auto" disabled={isSquareOffBusy} onClick={() => setConfirmSquareOff(true)}>
        {isSquareOffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        Square off now
      </Button>

      <ConfirmDialog
        open={confirmSquareOff}
        onOpenChange={setConfirmSquareOff}
        onConfirm={handleInstantSquareOff}
        title="Square off this position?"
        description="The open position will be closed at market price immediately. The strategy keeps running."
        confirmText="Square off"
        variant="destructive"
      />
    </section>
  );
}
