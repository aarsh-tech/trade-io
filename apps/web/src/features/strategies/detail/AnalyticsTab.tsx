"use client";

import { Badge } from "@/components/ui/badge";
import { EMPTY, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarChart2, Info } from "lucide-react";
import type { DetailCtx } from "./useStrategyDetail";
import { EmptyState, SectionCard } from "./shared";

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="space-y-1.5 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-baseline justify-between gap-2">{children}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function AnalyticsTab({ ctx }: { ctx: DetailCtx }) {
  const { strategy, activeTab } = ctx;
  if (activeTab !== "ANALYTICS") return null;

  const perf = strategy.performance;
  const totalTrades = perf?.totalTrades ?? 0;

  return (
    <SectionCard
      title="Performance"
      icon={<BarChart2 className="h-3.5 w-3.5" aria-hidden />}
      action={<Badge variant="outline">Last 30 days</Badge>}
    >
      {!perf || totalTrades === 0 ? (
        <EmptyState
          icon={<BarChart2 className="h-8 w-8" aria-hidden />}
          title="No completed trades yet"
          hint="Win rate, P&L and profit factor appear here once this strategy has closed a trade."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            <Stat label="Win rate" sub={`${totalTrades} completed trade${totalTrades === 1 ? "" : "s"}`}>
              <span className="num text-3xl font-semibold text-foreground">{perf.winRate.toFixed(1)}%</span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted sm:w-32" role="img" aria-label={`Win rate ${perf.winRate.toFixed(1)} percent`}>
                <div className="h-full rounded-full bg-profit transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, perf.winRate))}%` }} />
              </div>
            </Stat>
            <Stat label="Net realised P&L" sub={<>Average win {formatINR(perf.avgProfitPerWin)}</>}>
              <span className={cn("num text-3xl font-semibold", perf.netPnl > 0 ? "text-profit" : perf.netPnl < 0 ? "text-loss" : "text-foreground")}>
                {formatINR(perf.netPnl, { signed: true })}
              </span>
            </Stat>
            <Stat label="Profit factor" sub="Gross profit divided by gross loss">
              <span className="num text-3xl font-semibold text-foreground">{perf.profitFactor === 99.9 ? "∞" : Number.isFinite(perf.profitFactor) ? perf.profitFactor.toFixed(2) : EMPTY}</span>
              <Badge variant={perf.profitFactor >= 1.5 ? "success" : "outline"}>
                {perf.profitFactor >= 2 ? "Excellent" : perf.profitFactor >= 1.2 ? "Healthy" : "Moderate"}
              </Badge>
            </Stat>
          </div>
          <p className="flex items-start gap-2 border-t border-border bg-sunken px-4 py-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {strategy.isPaperTrade ? "Simulated executions recorded in paper mode." : "Executions recorded through your connected broker account."}
          </p>
        </>
      )}
    </SectionCard>
  );
}
