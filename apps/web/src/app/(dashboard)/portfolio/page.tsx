"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, TrendingUp, TrendingDown, RefreshCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function PortfolioPage() {
  const { brokers = [], isLoading: brokersLoading } = useBrokers();
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"holdings" | "positions">("holdings");
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [requestToken, setRequestToken] = useState("");

  const { 
    holdings = [], 
    positions = [],
    isLoading: holdingsLoading, 
    isPositionsLoading,
    refreshHoldings, 
    renewSession, 
    isRenewing, 
    getLoginUrl 
  } = usePortfolio(selectedBroker);

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

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Portfolio</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor your holdings and open positions across brokers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
            value={selectedBroker || ""}
            onChange={(e) => setSelectedBroker(e.target.value)}
          >
            <option value="" disabled>Select Broker Account</option>
            {brokers?.map((b: any) => (
              <option key={b.id} value={b.id}>{b.broker} ({b.clientId})</option>
            ))}
            {brokers?.length === 0 && !brokersLoading && <option disabled>No brokers connected</option>}
          </select>
          {selectedBroker && (
            <Button variant="outline" size="sm" className="gap-2 border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100" onClick={() => setShowRenewModal(true)}>
              <Zap className="h-4 w-4" /> Daily Login
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="border-slate-200 h-10 w-10 flex items-center justify-center p-0"
            onClick={() => refreshHoldings()}
            disabled={holdingsLoading}
          >
            <RefreshCcw className={cn("h-4 w-4 text-slate-500", holdingsLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-100">
          <CardContent className="pt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Equity</p>
            <h3 className="text-2xl font-bold text-slate-900">₹{holdings.reduce((sum: number, h: any) => sum + (h.ltp * h.qty), 0).toLocaleString()}</h3>
            <p className="text-xs text-slate-400 mt-1">Invested: ₹{holdings.reduce((sum: number, h: any) => sum + (h.avgPrice * h.qty), 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100">
          <CardContent className="pt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total P&L</p>
            <div className="flex items-center gap-2">
              <h3 className={cn("text-2xl font-bold", holdings.reduce((sum: number, h: any) => sum + (h.pnl || 0), 0) >= 0 ? "text-green-600" : "text-red-500")}>
                ₹{holdings.reduce((sum: number, h: any) => sum + (h.pnl || 0), 0).toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-100">
          <CardContent className="pt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</p>
            <div className="flex items-center gap-2">
              <Badge variant={holdings.length > 0 ? "running" : "stopped"}>
                {holdings.length > 0 ? "Live Connection" : "Awaiting Login"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden min-h-[400px]">
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setActiveTab("holdings")}
            className={cn(
              "px-6 py-4 text-sm font-semibold transition-all border-b-2",
              activeTab === "holdings"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Holdings ({holdings?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("positions")}
            className={cn(
              "px-6 py-4 text-sm font-semibold transition-all border-b-2",
              activeTab === "positions"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            Positions ({positions?.length || 0})
          </button>
        </div>

        <div className="p-0 overflow-x-auto">
          {!selectedBroker ? (
            <div className="py-20 text-center">
              <Briefcase className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900">Select a broker account</h3>
              <p className="text-sm text-slate-500">Connect a broker to see your live holdings</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Price</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">LTP</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activeTab === "holdings" && holdings?.map((h: any) => (
                  <tr key={h.symbol} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div>
                        <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{h.symbol}</p>
                        <p className="text-[10px] font-bold text-slate-400">EQ</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-600">{h.qty}</td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-600">₹{h.avgPrice?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-900">₹{h.ltp?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-right">
                      <p className={cn("text-sm font-bold", (h.pnl || 0) >= 0 ? "text-green-600" : "text-red-500 uppercase")}>
                        {(h.pnl || 0) >= 0 ? "+" : ""}₹{Math.abs(h.pnl || 0).toLocaleString()}
                      </p>
                      <p className={cn("text-[10px] font-bold", (h.pnl || 0) >= 0 ? "text-green-500/80" : "text-red-400")}>
                        {(h.pnl || 0) >= 0 ? "+" : ""}{h.pnlPct || 0}%
                      </p>
                    </td>
                  </tr>
                ))}
                {(activeTab === "holdings" && holdings?.length === 0 && !holdingsLoading) && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-slate-400 italic font-medium">
                      Holdings not loaded. Please perform a Daily Login.
                    </td>
                  </tr>
                )}
                {activeTab === "positions" && positions?.map((p: any) => (
                  <tr key={p.symbol} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{p.symbol}</p>
                          <div className="flex items-center gap-1">
                             <Badge variant={p.side === "BUY" ? "running" : "destructive"} className="text-[8px] px-1 py-0 h-3.5">
                               {p.side}
                             </Badge>
                             <span className="text-[10px] font-bold text-slate-400">{p.product}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-600">{p.qty}</td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-600">₹{p.avgPrice?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-sm font-semibold text-slate-900">₹{p.ltp?.toLocaleString()}</td>
                    <td className="px-6 py-5 text-right">
                      <p className={cn("text-sm font-bold", (p.pnl || 0) >= 0 ? "text-green-600" : "text-red-500")}>
                        {(p.pnl || 0) >= 0 ? "+" : ""}₹{Math.abs(p.pnl || 0).toLocaleString()}
                      </p>
                    </td>
                  </tr>
                ))}
                {(activeTab === "positions" && positions?.length === 0 && !isPositionsLoading) && (
                   <tr>
                     <td colSpan={5} className="py-20 text-center text-slate-400 italic font-medium">No open positions</td>
                   </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={showRenewModal} onOpenChange={setShowRenewModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-orange-100">
          <DialogHeader className="px-6 pt-6 pb-2">
            <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <Zap className="h-6 w-6 text-orange-500" />
            </div>
            <DialogTitle className="text-xl font-bold">Kite Daily Login</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              Zerodha requires a fresh session every day. Follow these steps:
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0 mt-0.5">1</div>
                <p className="text-[12.5px] text-slate-600 font-medium">Click the button below to open the Kite login page.</p>
              </div>
              <Button onClick={handleOpenLogin} className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-sm">
                1. Open Kite Login Page
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0 mt-0.5">2</div>
                <p className="text-[12.5px] text-slate-600 font-medium leading-relaxed">
                  After logging in, look at the URL in your browser. Copy the characters after <code className="bg-slate-100 px-1 rounded text-orange-600">request_token=...</code>
                </p>
              </div>
              <form onSubmit={handleRenewSession} className="space-y-3 pt-1">
                <Input
                  value={requestToken}
                  onChange={(e) => setRequestToken(e.target.value)}
                  placeholder="Paste request_token here"
                  className="h-11 border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                  required
                />
                <Button type="submit" disabled={isRenewing} className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold">
                  {isRenewing ? "Activating..." : "2. Activate Session"}
                </Button>
              </form>
            </div>
          </div>

          <div className="bg-slate-50 p-6 flex justify-end">
            <Button type="button" variant="ghost" className="text-slate-500 font-semibold" onClick={() => setShowRenewModal(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
