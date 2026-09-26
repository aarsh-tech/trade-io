"use client";

import { cn } from "@/lib/utils";
import { EMPTY, formatINR } from "@/lib/format";
import type { DetailCtx } from "./useStrategyDetail";
import { getRunStatus, isInPosition } from "./shared";

function firstNumber(state: any, keys: string[]): number | null {
  for (const k of keys) {
    const n = Number(state?.[k]);
    if (state?.[k] !== undefined && state?.[k] !== null && Number.isFinite(n)) return n;
  }
  return null;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 truncate text-xl font-semibold text-foreground sm:text-2xl", tone)}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** The four numbers that matter at a glance: today's P&L, trades, win rate, engine status. */
export function MetricCards({ ctx }: { ctx: DetailCtx }) {
  const { strategy, liveState, displayPnlRs } = ctx;
  const status = getRunStatus(strategy);
  const inPosition = isInPosition(liveState);

  const realized = firstNumber(liveState, ["dailyRealizedPnlRs"]);
  const hasPnl = realized !== null || inPosition;
  const todayPnl = (realized ?? 0) + (inPosition ? Number(displayPnlRs ?? 0) : 0);

  const trades = firstNumber(liveState, ["tradesToday", "tradesTaken", "tradeCount", "dailyTradeCount"]);
  const maxTrades = strategy.config.maxTradesPerDay;

  const perf = strategy.performance;
  const winRate = perf && perf.totalTrades > 0 ? perf.winRate : null;

  const statusText = status === "RUNNING" ? (inPosition ? "In position" : liveState?.isGoalAchieved ? "Target hit" : "Scanning") : status === "COMPLETED" ? "Completed" : "Stopped";
  const statusTone = status === "RUNNING" ? "text-profit" : "text-muted-foreground";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Today's P&L"
        value={hasPnl ? formatINR(todayPnl, { signed: true }) : EMPTY}
        sub={inPosition ? "Includes open position" : "Realised"}
        tone={hasPnl ? (todayPnl > 0 ? "text-profit" : todayPnl < 0 ? "text-loss" : undefined) : "text-muted-foreground"}
      />
      <Tile
        label="Trades today"
        value={trades !== null ? String(trades) : EMPTY}
        sub={maxTrades ? `Max ${maxTrades} per day` : undefined}
        tone={trades === null ? "text-muted-foreground" : undefined}
      />
      <Tile
        label="Win rate"
        value={winRate !== null ? `${winRate.toFixed(1)}%` : EMPTY}
        sub={perf && perf.totalTrades > 0 ? `${perf.totalTrades} trades, last 30 days` : "No closed trades yet"}
        tone={winRate === null ? "text-muted-foreground" : undefined}
      />
      <Tile label="Status" value={statusText} sub={strategy.isPaperTrade ? "Paper mode" : "Live mode"} tone={statusTone} />
    </div>
  );
}
