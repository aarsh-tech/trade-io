"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play, Square, Trash2, Plus, TrendingUp,
  Activity, BarChart2, Settings2
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

const mockStrategies = [
  {
    id: "1",
    name: "Nifty 15-Min Breakout",
    type: "BREAKOUT_15MIN",
    symbol: "NIFTY50",
    exchange: "NSE",
    status: "RUNNING",
    todayPnl: 2450.50,
    totalPnl: 18200,
    winRate: 72,
    totalTrades: 48,
    broker: "Zerodha",
    createdAt: "2024-01-10",
  },
  {
    id: "2",
    name: "Reliance EMA 9/15",
    type: "EMA_CROSSOVER",
    symbol: "RELIANCE",
    exchange: "NSE",
    status: "STOPPED",
    todayPnl: -650.00,
    totalPnl: 5400,
    winRate: 58,
    totalTrades: 32,
    broker: "Zerodha",
    createdAt: "2024-01-15",
  },
  {
    id: "3",
    name: "BankNifty Breakout",
    type: "BREAKOUT_15MIN",
    symbol: "BANKNIFTY",
    exchange: "NSE",
    status: "RUNNING",
    todayPnl: 1850.00,
    totalPnl: 9700,
    winRate: 65,
    totalTrades: 20,
    broker: "Angel One",
    createdAt: "2024-02-01",
  },
];

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState(mockStrategies);

  function toggleStrategy(id: string) {
    setStrategies((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const newStatus = s.status === "RUNNING" ? "STOPPED" : "RUNNING";
        toast.success(`Strategy ${newStatus === "RUNNING" ? "started" : "stopped"}`);
        return { ...s, status: newStatus };
      })
    );
  }

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Strategies</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {strategies.filter((s) => s.status === "RUNNING").length} active ·{" "}
            {strategies.length} total
          </p>
        </div>
        <Link href="/strategies/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Strategy
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {strategies.map((s) => (
          <StrategyCard key={s.id} strategy={s} onToggle={toggleStrategy} />
        ))}

        {/* Add new card */}
        <Link href="/strategies/new">
          <div className="h-full min-h-[200px] glass rounded-xl border-2 border-dashed border-[hsl(var(--border))] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.03)] transition-all group">
            <div className="h-12 w-12 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center group-hover:bg-[hsl(var(--primary)/0.1)] transition-colors">
              <Plus className="h-6 w-6 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
            </div>
            <p className="text-sm font-medium text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
              Add Strategy
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function StrategyCard({
  strategy: s,
  onToggle,
}: {
  strategy: typeof mockStrategies[0];
  onToggle: (id: string) => void;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 hover:scale-[1.01]",
        s.status === "RUNNING" && "border-[hsl(var(--green)/0.3)]"
      )}
    >
      {s.status === "RUNNING" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[hsl(var(--green))] to-[hsl(var(--primary))]" />
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{s.name}</CardTitle>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {s.symbol} · {s.exchange} · {s.broker}
            </p>
          </div>
          <Badge variant={s.status === "RUNNING" ? "running" : "stopped"} dot>
            {s.status === "RUNNING" ? "Live" : "Off"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Strategy type tag */}
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.2)]">
            {s.type === "BREAKOUT_15MIN" ? (
              <><BarChart2 className="h-3 w-3" /> 15-Min Breakout</>
            ) : (
              <><TrendingUp className="h-3 w-3" /> EMA Crossover</>
            )}
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-[hsl(var(--secondary)/0.5)]">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Today P&L</p>
            <p className={cn("text-sm font-bold", s.todayPnl >= 0 ? "pnl-positive" : "pnl-negative")}>
              {s.todayPnl >= 0 ? "+" : ""}
              {(s.todayPnl / 1000).toFixed(1)}K
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-[hsl(var(--secondary)/0.5)]">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Win Rate</p>
            <p className="text-sm font-bold">{s.winRate}%</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-[hsl(var(--secondary)/0.5)]">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Trades</p>
            <p className="text-sm font-bold">{s.totalTrades}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant={s.status === "RUNNING" ? "danger" : "success"}
            size="sm"
            className="flex-1"
            onClick={() => onToggle(s.id)}
          >
            {s.status === "RUNNING" ? (
              <><Square className="h-3.5 w-3.5" /> Stop</>
            ) : (
              <><Play className="h-3.5 w-3.5" /> Start</>
            )}
          </Button>
          <Link href={`/strategies/${s.id}`}>
            <Button variant="outline" size="icon-sm">
              <Activity className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button variant="outline" size="icon-sm">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
