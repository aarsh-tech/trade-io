"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, RefreshCcw, CheckCircle2, XCircle, Clock,
  AlertCircle, ArrowUpRight, ArrowDownRight, Ban, Filter,
  Layers, Search, Loader2, BookOpen, ShieldCheck, Sparkles,
  Calendar, Check, ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { orderApi, brokerApi } from "@/lib/api";
import { useBrokers } from "@/hooks/useBrokers";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import Link from "next/link";

interface Order {
  id: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  productType: "CNC" | "MIS" | "NRML";
  qty: number;
  filledQty: number;
  price?: number | null;
  avgPrice?: number | null;
  triggerPrice?: number | null;
  brokerOrderId?: string | null;
  status: "PENDING" | "OPEN" | "COMPLETE" | "REJECTED" | "CANCELLED";
  isPaperTrade: boolean;
  createdAt: string;
  brokerAccountId?: string | null;
  execution?: {
    strategy?: {
      name: string;
    };
  };
}

/**
 * Parses technical trading symbols into human-friendly Zerodha-style labels
 * Example: NIFTY2690124250PE -> NIFTY 1st SEP 24250 PE
 */
function formatTradingSymbol(rawSymbol: string) {
  if (!rawSymbol) return { displayName: "", isDerivative: false };

  // Weekly index option pattern: NIFTY2690124250PE (Index + 2 digit yr + month code + day + strike + CE/PE)
  const weeklyMatch = rawSymbol.match(/^([A-Z]+)(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$/i);
  if (weeklyMatch) {
    const [_, underlying, , mCode, day, strike, optType] = weeklyMatch;
    const monthNames: Record<string, string> = {
      "1": "JAN", "2": "FEB", "3": "MAR", "4": "APR", "5": "MAY", "6": "JUN",
      "7": "JUL", "8": "AUG", "9": "SEP", "O": "OCT", "N": "NOV", "D": "DEC"
    };
    const month = monthNames[mCode.toUpperCase()] || mCode;
    const dayNum = parseInt(day, 10);
    const suffix = dayNum === 1 || dayNum === 21 || dayNum === 31 ? "st" : dayNum === 2 || dayNum === 22 ? "nd" : dayNum === 3 || dayNum === 23 ? "rd" : "th";
    return {
      displayName: `${underlying} ${dayNum}${suffix} ${month} ${strike} ${optType.toUpperCase()}`,
      isDerivative: true,
      strike,
      optType: optType.toUpperCase(),
      underlying,
    };
  }

  // Monthly option pattern: NIFTY26SEP24250PE
  const monthlyMatch = rawSymbol.match(/^([A-Z]+)(\d{2})([A-Z]{3})(\d+)(CE|PE)$/i);
  if (monthlyMatch) {
    const [_, underlying, , month, strike, optType] = monthlyMatch;
    return {
      displayName: `${underlying} ${month.toUpperCase()} ${strike} ${optType.toUpperCase()}`,
      isDerivative: true,
      strike,
      optType: optType.toUpperCase(),
      underlying,
    };
  }

  // Regular equity or futures
  return {
    displayName: rawSymbol,
    isDerivative: false,
  };
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const { brokers = [] } = useBrokers();
  const [dateScope, setDateScope] = useState<"TODAY" | "ALL">("TODAY");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "OPEN" | "COMPLETE" | "CANCELLED" | "REJECTED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: ordersData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["orders", "list"],
    queryFn: async () => {
      const res = await orderApi.list();
      return (res.data?.data || []) as Order[];
    },
    staleTime: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await orderApi.sync();
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.data?.message || "Orders synchronized with Zerodha successfully");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to sync broker orders");
    },
  });

  const allOrders = useMemo(() => ordersData || [], [ordersData]);

  // Today's date string in Asia/Kolkata timezone
  const todayDateStr = useMemo(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }, []);

  // Filter orders by date scope (Today vs All)
  const scopedOrders = useMemo(() => {
    if (dateScope === "ALL") return allOrders;
    return allOrders.filter((o) => {
      const orderDateStr = new Date(o.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return orderDateStr === todayDateStr;
    });
  }, [allOrders, dateScope, todayDateStr]);

  // Summary Metrics for the current scope
  const stats = useMemo(() => {
    let open = 0;
    let completed = 0;
    let cancelled = 0;
    let rejected = 0;

    scopedOrders.forEach((o) => {
      if (o.status === "OPEN" || o.status === "PENDING") open++;
      else if (o.status === "COMPLETE") completed++;
      else if (o.status === "CANCELLED") cancelled++;
      else if (o.status === "REJECTED") rejected++;
    });

    return {
      total: scopedOrders.length,
      open,
      completed,
      cancelled,
      rejected,
      cancelledOrRejected: cancelled + rejected,
    };
  }, [scopedOrders]);

  // Filtered Orders after tab filter and search
  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      const matchesStatus =
        filterStatus === "ALL"
          ? true
          : filterStatus === "OPEN"
          ? o.status === "OPEN" || o.status === "PENDING"
          : o.status === filterStatus;

      const formatted = formatTradingSymbol(o.symbol);
      const matchesSearch =
        searchQuery.trim() === ""
          ? true
          : o.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            formatted.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.brokerOrderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.execution?.strategy?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.exchange?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [scopedOrders, filterStatus, searchQuery]);

  const handleCancelOrder = async () => {
    if (!cancellingOrder || !cancellingOrder.brokerOrderId) return;
    setIsCancelling(true);
    try {
      const brokerId = cancellingOrder.brokerAccountId || (brokers as any[])[0]?.id;
      if (brokerId) {
        await brokerApi.cancelOrder(brokerId, cancellingOrder.brokerOrderId);
        toast.success(`Order ${cancellingOrder.brokerOrderId} cancelled successfully`);
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to cancel order");
    } finally {
      setIsCancelling(false);
      setCancellingOrder(null);
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
        }),
        time: d.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      };
    } catch {
      return { date: dateStr, time: "" };
    }
  };

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-blue-500" />
              Order Book & Live Execution Log
            </h1>
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium">
              Zerodha Live
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time synchronization with Zerodha Kite & algorithmic execution records
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <Link href="/ledger">
            <Button variant="outline" size="sm" className="gap-1.5 border-emerald-500/30 text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40">
              <BookOpen className="h-4 w-4 text-emerald-500" />
              Monthly P&L Ledger
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || isFetching}
            className="gap-1.5 border-blue-500/30 text-blue-600 bg-blue-50/50 hover:bg-blue-100/50 dark:bg-blue-950/20 dark:hover:bg-blue-950/40"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", syncMutation.isPending && "animate-spin text-blue-500")} />
            {syncMutation.isPending ? "Syncing Zerodha..." : "Sync Broker Orders"}
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Scope Selector & Session Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Session View:</span>
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5 border border-border">
            <button
              onClick={() => setDateScope("TODAY")}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                dateScope === "TODAY"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Today's Session ({scopedOrders.length})
            </button>
            <button
              onClick={() => setDateScope("ALL")}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-md transition-all",
                dateScope === "ALL"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              All Time Records ({allOrders.length})
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Showing {dateScope === "TODAY" ? "today's active Zerodha session" : "all persistent database orders"}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {dateScope === "TODAY" ? "Today's Orders" : "Total Orders"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dateScope === "TODAY" ? "Orders in today's Zerodha book" : "Synced across all accounts"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Open / Pending Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold font-mono", stats.open > 0 ? "text-amber-500" : "text-foreground")}>
              {stats.open}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.open === 0 ? "No active unfilled orders" : "Awaiting price fill or trigger"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Executed Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-500">
              {stats.completed}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Fully filled on exchange
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur shadow-2xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Cancelled / Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-muted-foreground">
              {stats.cancelledOrRejected}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cancelled ({stats.cancelled}) • Rejected ({stats.rejected})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="border-b border-border py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Tabs with Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(
              [
                { id: "ALL", label: "All Orders", count: stats.total },
                { id: "OPEN", label: "Open", count: stats.open },
                { id: "COMPLETE", label: "Executed", count: stats.completed },
                { id: "CANCELLED", label: "Cancelled", count: stats.cancelled },
                { id: "REJECTED", label: "Rejected", count: stats.rejected },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5",
                  filterStatus === tab.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold",
                    filterStatus === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search symbol, strike, order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-muted/40 border border-border text-foreground text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Loading orders from database & Zerodha...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center px-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <ClipboardList className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No Orders Found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                {searchQuery || filterStatus !== "ALL"
                  ? "No orders match your current filter criteria."
                  : dateScope === "TODAY"
                  ? "No orders found in today's Zerodha session. Switch to 'All Time Records' to view past days."
                  : "No orders found in the database. Click 'Sync Broker Orders' to fetch fresh records."}
              </p>
              <div className="flex items-center justify-center gap-3">
                {dateScope === "TODAY" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDateScope("ALL")}
                    className="gap-1.5"
                  >
                    <Calendar className="h-4 w-4" />
                    View All Time Records ({allOrders.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RefreshCcw className={cn("h-4 w-4", syncMutation.isPending && "animate-spin")} />
                  Sync Broker Orders
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Time (IST)</th>
                    <th className="py-3 px-4">Side</th>
                    <th className="py-3 px-4">Instrument</th>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Price / Trigger</th>
                    <th className="py-3 px-4 text-right">Avg. Executed</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Broker ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOrders.map((ord) => {
                    const isBuy = ord.side === "BUY";
                    const isOpen = ord.status === "OPEN" || ord.status === "PENDING";
                    const { date, time } = formatDateTime(ord.createdAt);
                    const formatted = formatTradingSymbol(ord.symbol);

                    return (
                      <tr key={ord.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-xs font-medium text-foreground">{time}</div>
                          <div className="text-[10px] text-muted-foreground">{date}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={cn(
                              "text-[10.5px] font-bold px-2.5 py-0.5 border-0 shadow-2xs",
                              isBuy
                                ? "bg-blue-600 text-white"
                                : "bg-rose-600 text-white"
                            )}
                          >
                            {ord.side}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground flex items-center gap-1.5">
                            <span>{formatted.displayName}</span>
                            <span className="text-[9.5px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                              {ord.exchange || (formatted.isDerivative ? "NFO" : "NSE")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {formatted.isDerivative && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {ord.symbol}
                              </span>
                            )}
                            {ord.execution?.strategy?.name ? (
                              <span className="text-[11px] text-blue-500 font-medium truncate max-w-[180px]">
                                • {ord.execution.strategy.name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                • Discretionary / Kite Trade
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          <Badge variant="outline" className="text-[10.5px] font-bold bg-muted/30">
                            {ord.productType || "MIS"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                          {ord.orderType}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                          {ord.filledQty > 0 ? (
                            <span>
                              <span className="text-emerald-500 font-bold">{ord.filledQty}</span>
                              <span className="text-muted-foreground text-[11px]">/{ord.qty}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0/{ord.qty}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs">
                          <div className="font-semibold text-foreground">
                            {ord.price && ord.price > 0 ? `₹${ord.price.toFixed(2)}` : "MARKET"}
                          </div>
                          {ord.triggerPrice && ord.triggerPrice > 0 && (
                            <div className="text-[10px] text-amber-500 font-mono">
                              Trig: ₹{ord.triggerPrice.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                          {ord.avgPrice && ord.avgPrice > 0 ? (
                            `₹${ord.avgPrice.toFixed(2)}`
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[11px] font-semibold inline-flex items-center gap-1 px-2.5 py-0.5",
                              ord.status === "COMPLETE"
                                ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                                : isOpen
                                ? "border-amber-500/30 text-amber-600 bg-amber-500/10"
                                : "border-rose-500/30 text-rose-600 bg-rose-500/10"
                            )}
                          >
                            {ord.status === "COMPLETE" && <CheckCircle2 className="h-3 w-3" />}
                            {isOpen && <Clock className="h-3 w-3" />}
                            {ord.status === "CANCELLED" && <Ban className="h-3 w-3" />}
                            {ord.status === "REJECTED" && <XCircle className="h-3 w-3" />}
                            {ord.status === "COMPLETE" ? "COMPLETE" : ord.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isOpen ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCancellingOrder(ord)}
                              disabled={isCancelling}
                              className="h-7 px-2.5 text-xs text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                            >
                              Cancel
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono" title={ord.brokerOrderId || ""}>
                              {ord.brokerOrderId ? ord.brokerOrderId.slice(-8) : "-"}
                            </span>
                          )}
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

      {/* Cancel Order Confirmation Dialog */}
      <ConfirmDialog
        open={!!cancellingOrder}
        onOpenChange={(open) => !open && setCancellingOrder(null)}
        title={`Cancel Order ${cancellingOrder?.brokerOrderId || cancellingOrder?.symbol}?`}
        description={`Are you sure you want to cancel this pending ${cancellingOrder?.side} order for ${cancellingOrder?.qty} ${cancellingOrder?.symbol}?`}
        confirmText={isCancelling ? "Cancelling..." : "Confirm Cancel"}
        onConfirm={handleCancelOrder}
      />
    </div>
  );
}
