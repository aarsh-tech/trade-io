"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Play, Clock, TrendingUp, Percent, ChevronsDown } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

const equityCurve = [
  { date: "Oct 01", value: 100000 },
  { date: "Oct 05", value: 102300 },
  { date: "Oct 10", value: 99800 },
  { date: "Oct 15", value: 105600 },
  { date: "Oct 20", value: 108200 },
  { date: "Oct 25", value: 103900 },
  { date: "Nov 01", value: 112400 },
  { date: "Nov 10", value: 118700 },
  { date: "Nov 20", value: 115200 },
  { date: "Dec 01", value: 124500 },
  { date: "Dec 15", value: 128900 },
  { date: "Jan 01", value: 135600 },
];

const monthlyPnl = [
  { month: "Oct", pnl: 5600 },
  { month: "Nov", pnl: -3100 },
  { month: "Dec", pnl: 12200 },
  { month: "Jan", pnl: 21000 },
];

const results = {
  netPnl: 35600,
  netPnlPercent: 35.6,
  winRate: 68.2,
  totalTrades: 44,
  winningTrades: 30,
  losingTrades: 14,
  maxDrawdown: 5.4,
  sharpeRatio: 1.82,
};

export default function BacktestPage() {
  const [form, setForm] = useState({
    strategyId: "1",
    symbol: "NIFTY50",
    exchange: "NSE",
    fromDate: "2023-10-01",
    toDate: "2024-01-01",
    capital: "100000",
  });
  const [hasResult, setHasResult] = useState(true);
  const [loading, setLoading] = useState(false);

  async function runBacktest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setHasResult(false);
    await new Promise((r) => setTimeout(r, 2000));
    setLoading(false);
    setHasResult(true);
  }

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div>
        <h1 className="text-2xl font-bold">Backtesting</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
          Simulate your strategies against historical market data
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Config form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-[hsl(var(--accent))]" />
              Configure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={runBacktest} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Strategy</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                  value={form.strategyId}
                  onChange={(e) => setForm({ ...form, strategyId: e.target.value })}
                >
                  <option value="1">Nifty 15-Min Breakout</option>
                  <option value="2">Reliance EMA 9/15</option>
                  <option value="3">BankNifty Breakout</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Symbol</label>
                <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">From Date</label>
                <Input
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                  className="[color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">To Date</label>
                <Input
                  type="date"
                  value={form.toDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                  className="[color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Capital (₹)</label>
                <Input
                  type="number"
                  value={form.capital}
                  onChange={(e) => setForm({ ...form, capital: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                <Play className="h-4 w-4" />
                {loading ? "Running..." : "Run Backtest"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="xl:col-span-2 space-y-4">
          {hasResult && (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Net P&L",      value: formatCurrency(results.netPnl), sub: formatPercent(results.netPnlPercent), positive: results.netPnl >= 0, icon: TrendingUp },
                  { label: "Win Rate",     value: `${results.winRate}%`, sub: `${results.winningTrades}W / ${results.losingTrades}L`, positive: true, icon: Percent },
                  { label: "Max Drawdown", value: `${results.maxDrawdown}%`, sub: "peak to trough", positive: false, icon: ChevronsDown },
                  { label: "Sharpe Ratio", value: results.sharpeRatio.toFixed(2), sub: "risk-adjusted", positive: results.sharpeRatio > 1, icon: Clock },
                ].map(({ label, value, sub, positive, icon: Icon }) => (
                  <Card key={label} className="p-4 hover:scale-[1.02] transition-transform">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                      <Icon className={cn("h-3.5 w-3.5", positive ? "text-[hsl(var(--green))]" : "text-[hsl(var(--red))]")} />
                    </div>
                    <p className={cn("text-xl font-bold", positive ? "pnl-positive" : "pnl-negative")}>{value}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{sub}</p>
                  </Card>
                ))}
              </div>

              {/* Equity curve */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Equity Curve</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={equityCurve}>
                      <defs>
                        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 15%)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "hsl(215 20% 55%)", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(215 20% 55%)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), "Portfolio"]} contentStyle={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(222 47% 15%)", borderRadius: "8px" }} />
                      <Area type="monotone" dataKey="value" stroke="hsl(142 71% 45%)" strokeWidth={2} fill="url(#eq)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Monthly P&L */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Monthly P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={monthlyPnl}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 47% 15%)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "hsl(215 20% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "hsl(215 20% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), "P&L"]} contentStyle={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(222 47% 15%)", borderRadius: "8px" }} />
                      <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                        {monthlyPnl.map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? "hsl(142 71% 45%)" : "hsl(0 72% 51%)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
          {!hasResult && !loading && (
            <div className="h-80 glass rounded-xl flex items-center justify-center">
              <p className="text-[hsl(var(--muted-foreground))]">Configure and run a backtest to see results</p>
            </div>
          )}
          {loading && (
            <div className="h-80 glass rounded-xl flex flex-col items-center justify-center gap-4">
              <div className="h-10 w-10 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Simulating strategy on historical data...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
