"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Play, Clock, TrendingUp, Percent, ChevronsDown, History } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { backtestApi, strategyApi } from "@/lib/api";
import { toast } from "sonner";

export default function BacktestPage() {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [form, setForm] = useState({
    strategyId: "",
    symbol: "NIFTY50",
    exchange: "NSE",
    fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    capital: "100000",
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStrategies();
    loadHistory();
  }, []);

  async function loadStrategies() {
    try {
      const { data } = await strategyApi.list();
      setStrategies(data.data);
      if (data.data.length > 0) {
        const s = data.data[0];
        const config = s.config;
        setForm(f => ({ 
          ...f, 
          strategyId: s.id,
          symbol: config.symbol,
          exchange: config.exchange
        }));
      }
    } catch (err) {
      toast.error("Failed to load strategies");
    }
  }

  async function loadHistory() {
    try {
      const { data } = await backtestApi.history();
      setHistory(data);
    } catch (err) {
      console.error("Failed to load history", err);
    }
  }

  async function runBacktest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.strategyId) return toast.error("Please select a strategy");
    
    setLoading(true);
    try {
      const { data } = await backtestApi.run({
        ...form,
        capital: Number(form.capital),
        fromDate: new Date(form.fromDate).toISOString(),
        toDate: new Date(form.toDate).toISOString(),
      });
      
      toast.success("Backtest started! Checking results...");
      
      let attempts = 0;
      const checkStatus = async () => {
        const { data: historyData } = await backtestApi.history();
        const latest = historyData.find((h: any) => h.id === data.id);
        if (latest?.status === 'DONE') {
          setResult(JSON.parse(latest.result));
          setLoading(false);
          setHistory(historyData);
          toast.success("Backtest completed!");
        } else if (latest?.status === 'FAILED') {
          setLoading(false);
          toast.error("Backtest failed");
        } else if (attempts < 15) {
          attempts++;
          setTimeout(checkStatus, 3000);
        } else {
          setLoading(false);
          toast.info("Backtest is taking longer than expected. Check history later.");
        }
      };
      
      setTimeout(checkStatus, 3000);
    } catch (err: any) {
      setLoading(false);
      toast.error(err.response?.data?.message || "Failed to run backtest");
    }
  }

  // Derived data for charts
  const equityCurve = result ? result.trades.reduce((acc: any[], t: any) => {
    const lastValue = acc.length > 0 ? acc[acc.length - 1].value : result.initialCapital;
    acc.push({ date: t.date, value: lastValue + t.pnl });
    return acc;
  }, [{ date: "Start", value: result.initialCapital }]) : [];

  const monthlyPnlMap = result ? result.trades.reduce((acc: any, t: any) => {
    const month = new Date(t.date).toLocaleString('default', { month: 'short' });
    acc[month] = (acc[month] || 0) + t.pnl;
    return acc;
  }, {}) : {};

  const monthlyPnl = Object.entries(monthlyPnlMap).map(([month, pnl]) => ({ month, pnl: pnl as number }));

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backtesting</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Simulate your strategies against historical market data
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-6">
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
                    onChange={(e) => {
                      const id = e.target.value;
                      const s = strategies.find(strat => strat.id === id);
                      if (s) {
                        const config = s.config;
                        setForm(f => ({ 
                          ...f, 
                          strategyId: id,
                          symbol: config.symbol,
                          exchange: config.exchange
                        }));
                      }
                    }}
                  >
                    <option value="" disabled>Select a strategy</option>
                    {strategies.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Symbol</label>
                    <Input value={form.symbol} readOnly className="bg-[hsl(var(--secondary)/0.3)] cursor-not-allowed opacity-80" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Exchange</label>
                    <Input value={form.exchange} readOnly className="bg-[hsl(var(--secondary)/0.3)] cursor-not-allowed opacity-80" />
                  </div>
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Running...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Run Backtest
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                Recent Backtests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-[hsl(var(--border))]">
                {history.slice(0, 5).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => h.result && setResult(JSON.parse(h.result))}
                    className="w-full px-4 py-3 text-left hover:bg-[hsl(var(--accent)/0.05)] transition-colors flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{h.symbol}</span>
                      <Badge variant={h.status === 'DONE' ? 'success' : h.status === 'FAILED' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                        {h.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                      <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                      {h.status === 'DONE' && (
                        <span className={cn(JSON.parse(h.result).netPnl >= 0 ? "text-[hsl(var(--green))]" : "text-[hsl(var(--red)) ]")}>
                          {formatCurrency(JSON.parse(h.result).netPnl)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {history.length === 0 && (
                  <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                    No history found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="xl:col-span-2 space-y-6">
          {result ? (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Net P&L",      value: formatCurrency(result.netPnl), sub: formatPercent(result.netPnlPercent), positive: result.netPnl >= 0, icon: TrendingUp },
                  { label: "Win Rate",     value: `${result.winRate.toFixed(1)}%`, sub: `${result.totalTrades} Trades`, positive: result.winRate >= 50, icon: Percent },
                  { label: "Max Drawdown", value: "---", sub: "coming soon", positive: false, icon: ChevronsDown },
                  { label: "Sharpe Ratio", value: "---", sub: "coming soon", positive: true, icon: Clock },
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

              {/* Charts */}
              <div className="grid grid-cols-1 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Equity Curve</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
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
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Monthly P&L</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
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
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[400px] glass rounded-xl flex flex-col items-center justify-center gap-4 text-center p-6">
              {loading ? (
                <>
                  <div className="h-12 w-12 border-4 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-lg font-medium">Running Simulation</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Processing historical data for {form.symbol}...</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-16 w-16 bg-[hsl(var(--accent)/0.1)] rounded-full flex items-center justify-center mb-2">
                    <FlaskConical className="h-8 w-8 text-[hsl(var(--accent))]" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">No Result to Display</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs mx-auto">
                      Configure your backtest settings on the left and click "Run Backtest" to see performance metrics.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
