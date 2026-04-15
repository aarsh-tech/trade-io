"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Zap, Activity, DollarSign,
  BarChart2, Target, ArrowUpRight, ArrowDownRight, Play
} from "lucide-react";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import Link from "next/link";

// ─── Mock Data (will be replaced by React Query hooks) ────────────────────────
const portfolioChartData = [
  { date: "Jan", value: 100000 },
  { date: "Feb", value: 108500 },
  { date: "Mar", value: 104200 },
  { date: "Apr", value: 118900 },
  { date: "May", value: 113400 },
  { date: "Jun", value: 125600 },
  { date: "Jul", value: 132100 },
  { date: "Aug", value: 128700 },
  { date: "Sep", value: 141200 },
  { date: "Oct", value: 138500 },
  { date: "Nov", value: 152300 },
  { date: "Dec", value: 165800 },
];

const activeStrategies = [
  {
    id: "1", name: "Nifty 15min Breakout", type: "BREAKOUT_15MIN",
    symbol: "NIFTY50", status: "RUNNING", todayPnl: 2450.50, totalPnl: 18200,
  },
  {
    id: "2", name: "Reliance EMA Cross", type: "EMA_CROSSOVER",
    symbol: "RELIANCE", status: "STOPPED", todayPnl: -650.00, totalPnl: 5400,
  },
  {
    id: "3", name: "Bank Nifty Breakout", type: "BREAKOUT_15MIN",
    symbol: "BANKNIFTY", status: "RUNNING", todayPnl: 1850.00, totalPnl: 9700,
  },
];

const recentOrders = [
  { symbol: "NIFTY50", side: "BUY",  qty: 50,  price: 22440, status: "COMPLETE", time: "09:16" },
  { symbol: "RELIANCE", side: "SELL", qty: 10,  price: 2888,  status: "COMPLETE", time: "09:31" },
  { symbol: "BANKNIFTY",side: "BUY",  qty: 25,  price: 47810, status: "OPEN",     time: "09:45" },
  { symbol: "TCS",      side: "BUY",  qty: 5,   price: 3740,  status: "CANCELLED",time: "10:02" },
];

const statCards = [
  {
    title: "Portfolio Value",
    value: formatCurrency(165800),
    change: +12.5,
    icon: DollarSign,
    color: "primary",
  },
  {
    title: "Today's P&L",
    value: formatCurrency(3650),
    change: +2.25,
    icon: TrendingUp,
    color: "green",
  },
  {
    title: "Active Strategies",
    value: "2",
    subtitle: "of 3 deployed",
    icon: Zap,
    color: "accent",
  },
  {
    title: "Win Rate",
    value: "68.4%",
    subtitle: "last 30 days",
    icon: Target,
    color: "gold",
  },
];

// ─── Components ────────────────────────────────────────────────────────────────

function StatCard({ title, value, change, subtitle, icon: Icon, color }: typeof statCards[0]) {
  const colorMap: Record<string, string> = {
    primary: "var(--primary)",
    green:   "var(--green)",
    accent:  "var(--accent)",
    gold:    "var(--gold)",
  };
  const c = colorMap[color];

  return (
    <Card className="relative overflow-hidden group hover:scale-[1.02] transition-transform duration-200">
      <div
        className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity"
        style={{ background: `radial-gradient(circle at top right, hsl(${c}), transparent 70%)` }}
      />
      <CardContent className="flex items-start justify-between pt-0">
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-1">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {change !== undefined && (
            <p className={cn("text-sm font-medium mt-1 flex items-center gap-1",
              change >= 0 ? "pnl-positive" : "pnl-negative"
            )}>
              {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {formatPercent(change)}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{subtitle}</p>
          )}
        </div>
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center"
          style={{ background: `hsl(${c} / 0.15)` }}
        >
          <Icon className="h-5 w-5" style={{ color: `hsl(${c})` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="glass rounded-lg p-3 text-sm">
        <p className="text-[hsl(var(--muted-foreground))] mb-1">{label}</p>
        <p className="font-semibold text-[hsl(var(--primary))]">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Friday, April 11 · Market Open
          </p>
        </div>
        <Link href="/strategies/new">
          <Button className="gap-2">
            <Zap className="h-4 w-4" />
            New Strategy
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} />
        ))}
      </div>

      {/* Portfolio chart + Active strategies */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Chart */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Portfolio Performance</CardTitle>
              <div className="flex gap-1">
                {["1W", "1M", "3M", "1Y"].map((p) => (
                  <button
                    key={p}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                      p === "1Y"
                        ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={portfolioChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217 92% 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217 92% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 15%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "hsl(215 20% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215 20% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="value"
                  stroke="hsl(217 92% 60%)" strokeWidth={2}
                  fill="url(#portfolioGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Strategy Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Active Strategies</CardTitle>
              <Link href="/strategies">
                <span className="text-xs text-[hsl(var(--primary))] hover:underline">View all</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeStrategies.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary)/0.5)] hover:bg-[hsl(var(--secondary))] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.symbol}</p>
                </div>
                <div className="flex flex-col items-end gap-1 ml-2">
                  <Badge
                    variant={s.status === "RUNNING" ? "running" : "stopped"}
                    dot
                    className="text-[10px] px-1.5 py-0"
                  >
                    {s.status === "RUNNING" ? "Live" : "Off"}
                  </Badge>
                  <span className={cn("text-xs font-semibold", s.todayPnl >= 0 ? "pnl-positive" : "pnl-negative")}>
                    {s.todayPnl >= 0 ? "+" : ""}
                    {formatCurrency(s.todayPnl)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Link href="/orders">
              <span className="text-xs text-[hsl(var(--primary))] hover:underline">View all</span>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {["Symbol", "Side", "Qty", "Price", "Status", "Time"].map((h) => (
                    <th key={h} className="pb-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {recentOrders.map((o, i) => (
                  <tr key={i} className="hover:bg-[hsl(var(--secondary)/0.3)] transition-colors">
                    <td className="py-3 font-semibold">{o.symbol}</td>
                    <td className={cn("py-3 font-bold text-xs", o.side === "BUY" ? "pnl-positive" : "pnl-negative")}>
                      {o.side}
                    </td>
                    <td className="py-3">{o.qty}</td>
                    <td className="py-3 font-mono">₹{o.price.toLocaleString("en-IN")}</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          o.status === "COMPLETE" ? "success" :
                          o.status === "OPEN"     ? "warning" : "stopped"
                        }
                        className="text-[10px]"
                      >
                        {o.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-[hsl(var(--muted-foreground))]">{o.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
