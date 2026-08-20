"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, RefreshCcw, CheckCircle2, XCircle, Clock,
  AlertCircle, ArrowUpRight, ArrowDownRight, Ban, Filter,
  Layers, Search, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const { brokers = [] } = useBrokers();
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
    refetchInterval: 5000,
  });

  const orders = useMemo(() => ordersData || [], [ordersData]);

  // Summary Metrics
  const stats = useMemo(() => {
    let open = 0;
    let completed = 0;
    let cancelledOrRejected = 0;

    orders.forEach((o) => {
      if (o.status === "OPEN" || o.status === "PENDING") open++;
      else if (o.status === "COMPLETE") completed++;
      else cancelledOrRejected++;
    });

    return {
      total: orders.length,
      open,
      completed,
      cancelledOrRejected,
    };
  }, [orders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesStatus =
        filterStatus === "ALL"
          ? true
          : filterStatus === "OPEN"
          ? o.status === "OPEN" || o.status === "PENDING"
          : o.status === filterStatus;

      const matchesSearch =
        searchQuery.trim() === ""
          ? true
          : o.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.brokerOrderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.execution?.strategy?.name?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [orders, filterStatus, searchQuery]);

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

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 animate-[fade-up_0.3s_ease_both]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-500" />
            Order Book & Trade History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete real-time record of all live algorithmic & manual market orders
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-blue-500")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Orders Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Punched during this session
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur">
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
              Awaiting price fill / trigger
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur">
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

        <Card className="border-border bg-card/60 backdrop-blur">
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
              Cancelled or rejected by RMS
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(["ALL", "OPEN", "COMPLETE", "CANCELLED", "REJECTED"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  filterStatus === st
                    ? "bg-blue-600 text-white"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {st === "ALL" ? "All Orders" : st === "OPEN" ? "Open" : st === "COMPLETE" ? "Executed" : st === "CANCELLED" ? "Cancelled" : "Rejected"}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search symbol or order ID..."
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
              <p className="text-sm text-muted-foreground">Loading order history...</p>
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
                  : "No orders have been recorded for today's trading session."}
              </p>
              <Link href="/fo-stocks">
                <Button size="sm" variant="default" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                  <ArrowUpRight className="h-4 w-4" />
                  Place First Trade
                </Button>
              </Link>
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
                    <th className="py-3 px-4 text-right">Price</th>
                    <th className="py-3 px-4 text-right">Avg. Executed</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOrders.map((ord) => {
                    const isBuy = ord.side === "BUY";
                    const isOpen = ord.status === "OPEN" || ord.status === "PENDING";

                    return (
                      <tr key={ord.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(ord.createdAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 border-0",
                              isBuy
                                ? "bg-blue-600 text-white"
                                : "bg-rose-600 text-white"
                            )}
                          >
                            {ord.side}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-foreground">{ord.symbol}</div>
                          {ord.execution?.strategy?.name && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                              {ord.execution.strategy.name}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs">
                          <Badge variant="secondary" className="text-[11px] font-bold">
                            {ord.productType || "MIS"}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">
                          {ord.orderType}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                          {ord.filledQty > 0 ? `${ord.filledQty}/${ord.qty}` : ord.qty}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                          {ord.price && ord.price > 0 ? `₹${ord.price.toFixed(2)}` : "MKT"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-foreground">
                          {ord.avgPrice && ord.avgPrice > 0 ? `₹${ord.avgPrice.toFixed(2)}` : "-"}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[11px] font-medium inline-flex items-center gap-1",
                              ord.status === "COMPLETE"
                                ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                                : isOpen
                                ? "border-amber-500/30 text-amber-500 bg-amber-500/10"
                                : "border-rose-500/30 text-rose-500 bg-rose-500/10"
                            )}
                          >
                            {ord.status === "COMPLETE" && <CheckCircle2 className="h-3 w-3" />}
                            {isOpen && <Clock className="h-3 w-3" />}
                            {ord.status === "CANCELLED" && <Ban className="h-3 w-3" />}
                            {ord.status === "REJECTED" && <XCircle className="h-3 w-3" />}
                            {ord.status}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-center">
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
                            <span className="text-xs text-muted-foreground font-mono">
                              {ord.brokerOrderId ? ord.brokerOrderId.slice(-6) : "-"}
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
