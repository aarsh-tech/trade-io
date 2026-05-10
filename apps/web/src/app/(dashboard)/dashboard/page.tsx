"use client";

import React, { useMemo, useState } from "react";
import {
  LayoutGrid,
  History,
  Activity,
  ArrowUpCircle,
  PieChart as PieChartIcon,
  Loader2,
  Zap
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderWindow } from "@/components/dashboard/OrderWindow";
import { useDashboard } from "@/hooks/useDashboard";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useBrokers } from "@/hooks/useBrokers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MarketItem {
  symbol: string;
  price: number;
  change: number;
  changeAbs?: number;
  exchange?: string;
}

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
}

interface Margin {
  equity: {
    available: {
      cash: number;
      live_balance?: number;
      opening_balance?: number;
    };
    utilised: { debits: number };
  };
  commodity?: {
    available: { cash: number };
    utilised: { debits: number };
  };
}

interface Broker {
  id: string;
  broker: string;
  clientId: string;
  isActive: boolean;
}

function useMarketStatus() {
  const [status, setStatus] = React.useState<"OPEN" | "CLOSED" | "PRE-OPEN">("CLOSED");

  React.useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      const str = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const istDate = new Date(str);
      const day = istDate.getDay();
      const hours = istDate.getHours();
      const minutes = istDate.getMinutes();

      if (day === 0 || day === 6) {
        setStatus("CLOSED");
        return;
      }

      const timeInMinutes = hours * 60 + minutes;
      const marketOpen = 9 * 60 + 15;
      const preOpen = 9 * 60;
      const marketClose = 15 * 60 + 30;

      if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
        setStatus("OPEN");
      } else if (timeInMinutes >= preOpen && timeInMinutes < marketOpen) {
        setStatus("PRE-OPEN");
      } else {
        setStatus("CLOSED");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return status;
}

export default function DashboardPage() {
  const { isLoading: isDashboardLoading } = useDashboard();
  const { brokers } = useBrokers();
  const marketStatus = useMarketStatus();

  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");

  // Order Window State
  const [orderState, setOrderState] = React.useState<{
    isOpen: boolean;
    type: 'BUY' | 'SELL';
    symbol: string;
    ltp: number;
  }>({
    isOpen: false,
    type: 'BUY',
    symbol: '',
    ltp: 0
  });


  // Pick first active Zerodha broker or any active broker
  const activeBroker = useMemo(() => {
    const brokerList = (brokers || []) as Broker[];
    return brokerList.find(b => b.isActive && b.broker === 'ZERODHA') || brokerList.find(b => b.isActive);
  }, [brokers]);

  const { holdings, margins, isLoading: isPortfolioLoading, renewSession, isRenewing, getLoginUrl } = usePortfolio(activeBroker?.id);

  const handleOpenLogin = async () => {
    const url = await getLoginUrl();
    if (url) window.open(url, "_blank");
  };

  const handleRenewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await renewSession(requestToken);
      setShowRenewModal(false);
      setRequestToken("");
    } catch { }
  };

  // Calculate Real Portfolio Stats
  const stats = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    const safeMargins = margins as Margin | null;

    const totalInvestment = safeHoldings.reduce((acc, h) => acc + (Number(h.avgPrice || 0) * Number(h.qty || 0)), 0);
    const currentValue = safeHoldings.reduce((acc, h) => acc + (Number(h.ltp || 0) * Number(h.qty || 0)), 0);
    const pnl = currentValue - totalInvestment;
    const pnlPercent = totalInvestment > 0 ? (pnl / totalInvestment) * 100 : 0;

    return {
      totalInvestment,
      currentValue,
      pnl,
      pnlPercent,
      marginAvailable: safeMargins?.equity?.available?.live_balance ?? safeMargins?.equity?.available?.cash ?? 0,
      marginsUsed: safeMargins?.equity?.utilised?.debits ?? 0
    };
  }, [holdings, margins]);

  // Allocation data for the bar chart
  const allocationData = useMemo(() => {
    const safeHoldings = (holdings || []) as Holding[];
    if (safeHoldings.length === 0) return [];
    return safeHoldings.map(h => ({
      symbol: h.symbol,
      value: (h.ltp || 0) * (h.qty || 0),
      color: `hsl(${Math.random() * 360}, 70%, 50%)`
    })).sort((a, b) => b.value - a.value);
  }, [holdings]);

  // Mock historical data for the chart (real data would come from marketApi.candles)
  const chartData = [
    { name: "Jul 25", value: 19500 },
    { name: "Aug 25", value: 20200 },
    { name: "Sep 25", value: 19800 },
    { name: "Oct 25", value: 21500 },
    { name: "Nov 25", value: 21200 },
    { name: "Dec 25", value: 22800 },
    { name: "Jan 26", value: 23100 },
    { name: "Feb 26", value: 22400 },
    { name: "Mar 26", value: 23800 },
    { name: "Apr 26", value: 24200 },
  ];

  if (isDashboardLoading || isPortfolioLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm font-bold text-slate-400 animate-pulse uppercase tracking-widest">Loading Kite Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100vh-64px)] bg-white overflow-hidden font-sans"
    >
      {/* Main Area expands to full width now */}

      {/* ── Main Area ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/20 p-8 flex flex-col gap-8 scrollbar-hide">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            Hi, Aarsh <span className="wave">👋</span>
          </h1>
          <div className="flex items-center gap-4">
            {activeBroker && (
              <Button variant="outline" size="sm" className="gap-2 border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100" onClick={() => setShowRenewModal(true)}>
                <Zap className="h-4 w-4" /> Daily Login
              </Button>
            )}
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Market Status</p>
              <div className="flex items-center gap-1.5 justify-end">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  marketStatus === "OPEN" ? "bg-emerald-500 animate-pulse" :
                  marketStatus === "PRE-OPEN" ? "bg-orange-500 animate-pulse" : "bg-slate-300"
                )} />
                <span className="text-xs font-bold text-slate-700 uppercase">{marketStatus}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Equity & Commodity Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm border-slate-100 hover:shadow-md transition-shadow group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ArrowUpCircle className="h-16 w-16 text-blue-600" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <LayoutGrid className="h-3 w-3" />
                Equity Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">
                    {stats.marginAvailable >= 0 ? "" : "-"}₹{Math.abs(stats.marginAvailable).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-medium text-slate-500">Margin available</span>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Margins used</span>
                    <span className="text-xs font-bold text-slate-700">₹{stats.marginsUsed.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Opening balance</span>
                    <span className="text-xs font-bold text-slate-700">₹{stats.marginAvailable.toLocaleString('en-IN')}</span>
                  </div>

                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-100 hover:shadow-md transition-shadow group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="h-16 w-16 text-slate-400" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <History className="h-3 w-3" />
                Commodity Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-4xl font-black text-slate-900 tracking-tighter">0</span>
                  <span className="text-xs font-medium text-slate-500">Margin available</span>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Margins used</span>
                    <span className="text-xs font-bold text-slate-700">0</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400 font-medium">Opening balance</span>
                    <span className="text-xs font-bold text-slate-700">0</span>
                  </div>

                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Holdings Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-3 shadow-sm border-slate-100 overflow-hidden">
            <CardHeader className="pb-2 border-b border-slate-50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Holdings ({holdings.length})
                </CardTitle>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current value</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invested</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-4 items-center">
                <div className="p-8 md:col-span-2 border-r border-slate-50 flex flex-col justify-center">
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      "text-5xl font-black tracking-tighter",
                      stats.pnl >= 0 ? "text-emerald-500" : "text-orange-600"
                    )}>
                      {stats.pnl >= 0 ? "" : "-"}₹{Math.abs(stats.pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    <span className={cn(
                      "text-lg font-bold",
                      stats.pnl >= 0 ? "text-emerald-400" : "text-orange-400"
                    )}>
                      {stats.pnl >= 0 ? "+" : ""}{stats.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Total P&L</span>

                  {/* Allocation Bar */}
                  <div className="mt-8">
                    <div className="h-8 w-full rounded-md bg-slate-100 overflow-hidden flex shadow-inner">
                      {allocationData.map((item, idx) => (
                        <div
                          key={item.symbol}
                          style={{
                            width: `${(item.value / stats.currentValue) * 100}%`,
                            backgroundColor: item.color
                          }}
                          className="h-full hover:brightness-110 transition-all cursor-help"
                          title={`${item.symbol}: ${((item.value / stats.currentValue) * 100).toFixed(1)}%`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs font-black text-slate-700">₹{stats.currentValue.toLocaleString('en-IN')}</span>
                      <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="view" defaultChecked className="h-2 w-2 accent-blue-600" /> Current value
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="view" className="h-2 w-2 accent-blue-600" /> Invested
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="view" className="h-2 w-2 accent-blue-600" /> P&L
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 flex flex-col items-center justify-center gap-2 border-r border-slate-50 h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current value</span>
                  <span className="text-xl font-black text-slate-800 tracking-tight">₹{(stats.currentValue / 1000).toFixed(2)}k</span>
                </div>

                <div className="p-8 flex flex-col items-center justify-center gap-2 h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Investment</span>
                  <span className="text-xl font-black text-slate-800 tracking-tight">₹{(stats.totalInvestment / 1000).toFixed(2)}k</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .wave {
          display: inline-block;
          animation: wave-animation 2.5s infinite;
          transform-origin: 70% 70%;
        }
        @keyframes wave-animation {
          0% { transform: rotate( 0.0deg) }
          10% { transform: rotate(14.0deg) }
          20% { transform: rotate(-8.0deg) }
          30% { transform: rotate(14.0deg) }
          40% { transform: rotate(-4.0deg) }
          50% { transform: rotate(10.0deg) }
          60% { transform: rotate( 0.0deg) }
          100% { transform: rotate( 0.0deg) }
        }
      `}</style>

      {/* Renew Session Modal */}
      <Dialog open={showRenewModal} onOpenChange={setShowRenewModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-orange-100">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <Zap className="h-6 w-6 text-orange-500" />
            </div>
            <DialogTitle className="text-xl font-bold">Broker Daily Login</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              Your broker requires a fresh session every day. Follow these steps:
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0 mt-0.5">1</div>
                <p className="text-[12.5px] text-slate-600 font-medium">Click the button below to open the broker login page.</p>
              </div>
              <Button onClick={handleOpenLogin} className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-sm">
                Open Broker Login Page
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0 mt-0.5">2</div>
                <p className="text-[12.5px] text-slate-600 font-medium leading-relaxed">
                  After logging in, copy any session token/code provided by the broker and paste it below.
                </p>
              </div>
              <form onSubmit={handleRenewSession} className="space-y-3 pt-1">
                <Button type="button" onClick={() => handleRenewSession({ preventDefault: () => { } } as any)} disabled={isRenewing} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md">
                  {isRenewing ? "Logging in..." : "Run Automated Login"}
                </Button>
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">OR PASTE MANUALLY</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <Input
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="Paste token or session ID here"
                  className="h-11 border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                />
                <Button type="submit" disabled={isRenewing || !requestToken} className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold">
                  {isRenewing ? "Activating..." : "2. Activate Manual Session"}
                </Button>
              </form>
            </div>
          </div>

          <div className="bg-slate-50 p-6 flex justify-end">
            <Button type="button" variant="ghost" className="text-slate-500 font-semibold" onClick={() => setShowRenewModal(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kite Order Window */}
      <OrderWindow
        isOpen={orderState.isOpen}
        onClose={() => setOrderState(prev => ({ ...prev, isOpen: false }))}
        symbol={orderState.symbol}
        type={orderState.type}
        ltp={orderState.ltp}
        availableMargin={stats.marginAvailable}
        brokerId={activeBroker?.id}
        onTypeChange={(newType) => setOrderState(prev => ({ ...prev, type: newType }))}
      />
    </div>
  );
}
