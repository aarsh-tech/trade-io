"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, TrendingUp, TrendingDown, RefreshCcw, AlertTriangle,
  Zap, ArrowUpRight, ArrowDownRight, Layers, ShieldAlert, CheckCircle2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrokers } from "@/hooks/useBrokers";
import { usePortfolio } from "@/hooks/usePortfolio";
import { brokerApi } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import Link from "next/link";

interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  side: "BUY" | "SELL";
  product: string;
}

export default function PositionsPage() {
  const { brokers = [], isLoading: brokersLoading } = useBrokers();
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [squareOffPosition, setSquareOffPosition] = useState<Position | null>(null);
  const [showSquareOffAll, setShowSquareOffAll] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Active broker selection
  const activeBrokerId = useMemo(() => {
    if (selectedBroker) return selectedBroker;
    const active = (brokers as any[]).find(b => b.isActive && b.broker === 'ZERODHA') || (brokers as any[]).find(b => b.isActive);
    return active?.id || null;
  }, [brokers, selectedBroker]);

  const {
    positions = [],
    isPositionsLoading,
    refreshPositions,
  } = usePortfolio(activeBrokerId);

  // Calculate summary metrics
  const { totalPnl, totalInvestment, profitableCount, losingCount } = useMemo(() => {
    let pnl = 0;
    let investment = 0;
    let wins = 0;
    let losses = 0;

    (positions as Position[]).forEach((p) => {
      pnl += p.pnl || 0;
      investment += Math.abs(p.qty * p.avgPrice);
      if (p.pnl > 0) wins++;
      else if (p.pnl < 0) losses++;
    });

    return {
      totalPnl: pnl,
      totalInvestment: investment,
      profitableCount: wins,
      losingCount: losses,
    };
  }, [positions]);

  const handleSquareOffSingle = async () => {
    if (!squareOffPosition || !activeBrokerId) return;
    setIsProcessing(true);
    try {
      const exitSide = squareOffPosition.qty > 0 ? "SELL" : "BUY";
      const exitQty = Math.abs(squareOffPosition.qty);

      await brokerApi.placeOrder(activeBrokerId, {
        symbol: squareOffPosition.symbol,
        exchange: squareOffPosition.symbol.includes("-") || squareOffPosition.symbol.startsWith("NIFTY") ? "NFO" : "NSE",
        side: exitSide,
        product: squareOffPosition.product || "MIS",
        orderType: "MARKET",
        qty: exitQty,
        price: 0,
      });

      toast.success(`Square-off order placed for ${exitQty} ${squareOffPosition.symbol}`);
      setSquareOffPosition(null);
      await refreshPositions();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to square off position");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSquareOffAll = async () => {
    if (!activeBrokerId || positions.length === 0) return;
    setIsProcessing(true);
    try {
      let successCount = 0;
      for (const pos of positions as Position[]) {
        if (pos.qty === 0) continue;
        const exitSide = pos.qty > 0 ? "SELL" : "BUY";
        const exitQty = Math.abs(pos.qty);

        await brokerApi.placeOrder(activeBrokerId, {
          symbol: pos.symbol,
          exchange: pos.symbol.includes("-") || pos.symbol.startsWith("NIFTY") ? "NFO" : "NSE",
          side: exitSide,
          product: pos.product || "MIS",
          orderType: "MARKET",
          qty: exitQty,
          price: 0,
        }).then(() => successCount++).catch(() => {});
      }

      toast.success(`Square-off orders punched for ${successCount} position(s)`);
      setShowSquareOffAll(false);
      await refreshPositions();
    } catch (err: any) {
      toast.error("Error executing bulk square off");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-500" />
            Live Positions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time open market positions, intraday P&L, and instant square-off control
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Broker Selector if multiple */}
          {brokers.length > 1 && (
            <select
              value={activeBrokerId || ""}
              onChange={(e) => setSelectedBroker(e.target.value)}
              className="bg-card border border-border text-foreground text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(brokers as any[]).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.broker} ({b.clientId})
                </option>
              ))}
            </select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshPositions()}
            disabled={isPositionsLoading}
            className="gap-1.5"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isPositionsLoading && "animate-spin text-blue-500")} />
            Refresh
          </Button>

          {positions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowSquareOffAll(true)}
              disabled={isProcessing}
              className="gap-1.5 font-semibold"
            >
              <ShieldAlert className="h-4 w-4" />
              Square Off All
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Realized + Unrealized P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold font-mono flex items-center gap-1.5",
              totalPnl > 0 ? "text-emerald-500" : totalPnl < 0 ? "text-rose-500" : "text-foreground"
            )}>
              {totalPnl > 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {totalPnl > 0 ? (
                <ArrowUpRight className="h-5 w-5 text-emerald-500" />
              ) : totalPnl < 0 ? (
                <ArrowDownRight className="h-5 w-5 text-rose-500" />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Net Day P&L across all active positions
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Open Positions Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {positions.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {profitableCount} Green / {losingCount} Red
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Capital Deployed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              ₹{totalInvestment.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Gross open exposure value
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Win / Loss Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {positions.length > 0 ? `${((profitableCount / positions.length) * 100).toFixed(0)}%` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Profitable positions proportion
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Positions Table */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-4 px-6 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-base font-semibold">Open Market Positions</CardTitle>
          </div>
          {positions.length > 0 && (
            <Badge variant="secondary" className="font-mono text-xs font-medium">
              {positions.length} Active
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isPositionsLoading && positions.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Fetching live positions from broker...</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <Activity className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No Open Positions</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                You currently have no open intraday or delivery positions in your connected broker account.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/fo-stocks">
                  <Button size="sm" variant="default" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                    <Zap className="h-4 w-4" />
                    Browse F&O Stocks
                  </Button>
                </Link>
                <Link href="/strategies">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    View Strategies
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Instrument</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Avg. Price</th>
                    <th className="py-3 px-4 text-right">LTP</th>
                    <th className="py-3 px-4 text-right">Current P&L</th>
                    <th className="py-3 px-4 text-right">Change %</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(positions as Position[]).map((pos, idx) => {
                    const isLong = pos.qty > 0;
                    const pnlPct = pos.avgPrice > 0 ? ((pos.ltp - pos.avgPrice) / pos.avgPrice) * 100 * (isLong ? 1 : -1) : 0;

                    return (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs">
                          <Badge variant="secondary" className="text-[11px] font-bold">
                            {pos.product || "MIS"}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-foreground">
                          {pos.symbol}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-mono font-semibold",
                          isLong ? "text-emerald-500" : "text-rose-500"
                        )}>
                          {pos.qty > 0 ? `+${pos.qty}` : pos.qty}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-foreground">
                          ₹{pos.avgPrice?.toFixed(2) || "0.00"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                          ₹{pos.ltp?.toFixed(2) || "0.00"}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-mono font-bold",
                          pos.pnl > 0 ? "text-emerald-500" : pos.pnl < 0 ? "text-rose-500" : "text-muted-foreground"
                        )}>
                          {pos.pnl > 0 ? "+" : ""}₹{pos.pnl?.toFixed(2) || "0.00"}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-mono text-xs font-semibold",
                          pnlPct > 0 ? "text-emerald-500" : pnlPct < 0 ? "text-rose-500" : "text-muted-foreground"
                        )}>
                          {pnlPct > 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setSquareOffPosition(pos)}
                            disabled={isProcessing}
                            className="h-7 px-2.5 text-xs font-medium"
                          >
                            Exit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single Square Off Confirmation Dialog */}
      <ConfirmDialog
        open={!!squareOffPosition}
        onOpenChange={(open) => !open && setSquareOffPosition(null)}
        title={`Square Off ${squareOffPosition?.symbol}?`}
        description={`This will place a MARKET ${squareOffPosition && squareOffPosition.qty > 0 ? "SELL" : "BUY"} order for ${Math.abs(squareOffPosition?.qty || 0)} shares to instantly close this position at current broker market price.`}
        confirmText={isProcessing ? "Exiting..." : "Confirm Square Off"}
        onConfirm={handleSquareOffSingle}
      />

      {/* Bulk Square Off All Dialog */}
      <ConfirmDialog
        open={showSquareOffAll}
        onOpenChange={setShowSquareOffAll}
        title="Square Off ALL Active Positions?"
        description={`Are you sure you want to close ALL ${positions.length} open position(s)? Market orders will be punched immediately to exit all holdings and intraday positions.`}
        confirmText={isProcessing ? "Closing All..." : "Exit All Positions Now"}
        onConfirm={handleSquareOffAll}
      />
    </div>
  );
}
