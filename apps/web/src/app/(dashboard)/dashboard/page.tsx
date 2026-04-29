"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Zap, Activity, Wallet,
  BarChart2, Target, ArrowUpRight, ArrowDownRight, Plus, Search,
  Briefcase, LineChart, PieChart, Clock
} from "lucide-react";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";
import Link from "next/link";
import { useDashboard } from "@/hooks/useDashboard";
import { MarketTicker } from "@/components/dashboard/MarketTicker";
import { Input } from "@/components/ui/input";

// ─── Chart Mock Data ─────────────────────────────────────────────────────────
const performanceData = [
  { time: "09:15", pnl: 0 },
  { time: "10:00", pnl: 1200 },
  { time: "11:00", pnl: 800 },
  { time: "12:00", pnl: 2400 },
  { time: "13:00", pnl: 3100 },
  { time: "14:00", pnl: 2800 },
  { time: "15:00", pnl: 4200 },
  { time: "15:30", pnl: 3650 },
];

export default function DashboardPage() {
  const { market, stats, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#fbfcfd] rounded-xl overflow-hidden border border-slate-100 shadow-sm">
      {/* Top Real-time Ticker */}
      <MarketTicker indices={market.indices} />

      <div className="flex flex-1 overflow-hidden p-6 gap-6">

        {/* Left Side - Market Watchlist */}
        <div className="w-80 flex flex-col gap-4 hidden lg:flex">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500" />
            <Input
              placeholder="Search eg: infy bse, nifty fut, gold mcx"
              className="pl-10 h-10 border-slate-100 bg-white shadow-sm rounded-lg focus-visible:ring-1 focus-visible:ring-blue-500"
            />
          </div>

          <Card className="flex-1 shadow-sm border-slate-100 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Market Watchlist</span>
              <Plus className="h-3.5 w-3.5 text-slate-400 cursor-pointer hover:text-blue-500" />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {market.stocks.map((stock: any) => (
                <div key={stock.symbol} className="p-4 hover:bg-slate-50 cursor-pointer group transition-colors flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{stock.symbol}</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase">{stock.exchange}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">₹{stock.price.toLocaleString('en-IN')}</p>
                    <p className={cn("text-[11px] font-bold", stock.change >= 0 ? "text-emerald-500" : "text-rose-500")}>
                      {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Side - Dashboard Content */}
        <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">

          {/* Header & Quick Stats */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Hi, Trader 👋</h2>
            <div className="flex gap-3">
              <Button variant="outline" className="h-9 border-slate-200 text-slate-600 gap-2 shadow-sm rounded-lg">
                <Clock className="h-4 w-4" /> Market History
              </Button>
              <Button className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-md rounded-lg">
                <Zap className="h-4 w-4" /> Deploy New Bot
              </Button>
            </div>
          </div>

          {/* Core Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="shadow-sm border-slate-100 hover:border-blue-100 transition-colors">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Equity Balance</p>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(stats?.portfolioValue || 0)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-100 hover:border-emerald-100 transition-colors">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Realized P&L</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-black text-slate-900">{formatCurrency(stats?.todayPnl || 0)}</p>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[10px] font-bold">
                      +{stats?.pnlChange || 0}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-100 hover:border-orange-100 transition-colors">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600">
                  <Target className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">System Health</p>
                  <p className="text-xl font-black text-slate-900">98.2% <span className="text-[10px] text-slate-400 font-normal">Uptime</span></p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Chart & Recent Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            <Card className="xl:col-span-2 shadow-sm border-slate-100 bg-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-blue-500" /> Daily Equity Curve
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="rounded-md border-slate-100 text-[10px] text-slate-400 uppercase">Live Tracking</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#387ED1" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#387ED1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                    />
                    <Area
                      type="monotone" dataKey="pnl"
                      stroke="#387ED1" strokeWidth={3}
                      fill="url(#pnlGrad)"
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-100 bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-emerald-500" /> Sector Exposure
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 pt-2">
                  {[
                    { name: "Financials", val: 42, color: "#387ED1" },
                    { name: "IT Services", val: 28, color: "#10b981" },
                    { name: "Energy", val: 18, color: "#f59e0b" },
                    { name: "Others", val: 12, color: "#94a3b8" }
                  ].map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-600">
                        <span>{item.name}</span>
                        <span>{item.val}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${item.val}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" className="w-full mt-6 text-xs text-blue-600 font-bold hover:bg-blue-50 gap-2">
                  <Briefcase className="h-3 w-3" /> Full Portfolio Breakdown
                </Button>
              </CardContent>
            </Card>

          </div>

        </div>

      </div>
    </div>
  );
}
