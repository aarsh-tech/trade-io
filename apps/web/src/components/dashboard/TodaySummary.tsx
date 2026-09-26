"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, Bot, Gauge, IndianRupee, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useDayPnl } from "@/hooks/useDayPnl";
import { strategyApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { EMPTY, formatINR, pnlClass } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StrategyRow {
  id: string;
  name: string;
  isActive: boolean;
  isPaperTrade?: boolean;
}

function Tile({ icon, label, children, footer }: { icon: React.ReactNode; label: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="p-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1">{children}</div>
        {footer && <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

const Row = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="flex items-center justify-between gap-2">
    <span>{label}</span>
    <span className={cn("num font-medium text-foreground", className)}>{value}</span>
  </div>
);

interface TodaySummaryProps {
  /** Equity funds from the broker margins endpoint; undefined while loading or not connected. */
  marginAvailable?: number;
  marginsUsed?: number;
}

export function TodaySummary({ marginAvailable, marginsUsed }: TodaySummaryProps) {
  const { realised, unrealized, total, risk } = useDayPnl();

  const { data: strategies } = useQuery({
    queryKey: queryKeys.strategies.lists(),
    queryFn: async () => (await strategyApi.list()).data?.data as StrategyRow[],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const running = (strategies ?? []).filter((s) => s.isActive);

  const lossPct = risk?.lossUsagePct ?? 0;
  // Colour is never the only signal: the label states the level too.
  const level = lossPct >= 80 ? "Critical" : lossPct >= 50 ? "Elevated" : "Normal";
  const barTone = lossPct >= 80 ? "bg-loss" : lossPct >= 50 ? "bg-warn" : "bg-profit";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4" aria-label="Today's summary">
      <Tile
        icon={<IndianRupee className="h-3 w-3" aria-hidden />}
        label="Day P&L (net)"
        footer={
          <div className="space-y-0.5">
            <Row label="Realised" value={realised ? formatINR(realised.realizedPnl, { signed: true }) : EMPTY} className={realised ? pnlClass(realised.realizedPnl) : undefined} />
            <Row label="Unrealised" value={unrealized !== undefined ? formatINR(unrealized, { signed: true }) : EMPTY} className={unrealized !== undefined ? pnlClass(unrealized) : undefined} />
            <Row label="Charges paid" value={realised ? formatINR(realised.charges) : EMPTY} />
            <Row label="Algo / Manual" value={realised ? `${formatINR(realised.algoPnl, { signed: true })} / ${formatINR(realised.manualPnl, { signed: true })}` : EMPTY} />
          </div>
        }
      >
        <div className={cn("text-[22px] leading-7 font-semibold num tracking-tight", total === undefined ? "text-muted-foreground" : pnlClass(total))}>
          {total === undefined ? EMPTY : formatINR(total, { signed: true })}
        </div>
      </Tile>

      <Tile
        icon={<Gauge className="h-3 w-3" aria-hidden />}
        label="Daily loss limit"
        footer={
          risk ? (
            <div className="space-y-0.5">
              <Row label="Limit" value={formatINR(risk.maxDailyLoss, { decimals: 0 })} />
              <Row label="Kill switch" value={risk.killSwitchActive ? "ACTIVE" : "Off"} className={risk.killSwitchActive ? "text-loss" : undefined} />
            </div>
          ) : undefined
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] leading-7 font-semibold num tracking-tight text-foreground">{risk ? `${lossPct.toFixed(0)}%` : EMPTY}</span>
          {risk && <span className="text-[11px] font-semibold text-muted-foreground">{level}</span>}
          {risk?.killSwitchActive && <AlertOctagon className="h-4 w-4 text-loss" aria-label="Kill switch active" />}
        </div>
        <div
          className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(lossPct)}
          aria-label="Daily loss limit used"
        >
          <div className={cn("h-full rounded-full transition-all", barTone)} style={{ width: `${Math.min(100, lossPct)}%` }} />
        </div>
      </Tile>

      <Tile
        icon={<Wallet className="h-3 w-3" aria-hidden />}
        label="Equity funds"
        footer={<Row label="Used" value={marginsUsed !== undefined ? formatINR(marginsUsed) : EMPTY} />}
      >
        <div className="text-[22px] leading-7 font-semibold num tracking-tight text-foreground">
          {marginAvailable !== undefined ? formatINR(marginAvailable) : EMPTY}
        </div>
      </Tile>

      <Tile
        icon={<Bot className="h-3 w-3" aria-hidden />}
        label="Running strategies"
        footer={
          running.length > 0 ? (
            <ul className="space-y-0.5">
              {running.slice(0, 3).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/strategies/${s.id}`} className="truncate text-foreground hover:underline">
                    {s.name}
                  </Link>
                  <span className="shrink-0 text-[10px] font-semibold uppercase">{s.isPaperTrade ? "Paper" : "Live"}</span>
                </li>
              ))}
              {running.length > 3 && <li>+{running.length - 3} more</li>}
            </ul>
          ) : (
            <Link href="/strategies" className="hover:underline">
              No strategy running. Open strategies
            </Link>
          )
        }
      >
        <div className="text-[22px] leading-7 font-semibold num tracking-tight text-foreground">{strategies ? running.length : EMPTY}</div>
      </Tile>
    </div>
  );
}
