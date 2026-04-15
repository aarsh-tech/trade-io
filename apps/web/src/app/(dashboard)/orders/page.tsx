"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, Download, Search } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

const allOrders = [
  { id: "o1", symbol: "NIFTY50",   exchange: "NSE", side: "BUY",  orderType: "MARKET", qty: 50,  price: 22440, status: "COMPLETE",  time: "2026-04-11T09:16:00Z", strategy: "Nifty Breakout" },
  { id: "o2", symbol: "NIFTY50",   exchange: "NSE", side: "SELL", orderType: "SL",     qty: 50,  price: 22330, status: "OPEN",      time: "2026-04-11T09:16:01Z", strategy: "Nifty Breakout" },
  { id: "o3", symbol: "RELIANCE",  exchange: "NSE", side: "SELL", orderType: "MARKET", qty: 10,  price: 2888,  status: "COMPLETE",  time: "2026-04-11T09:31:00Z", strategy: "Reliance EMA" },
  { id: "o4", symbol: "BANKNIFTY", exchange: "NSE", side: "BUY",  orderType: "MARKET", qty: 25,  price: 47810, status: "OPEN",      time: "2026-04-11T09:45:00Z", strategy: "BankNifty Breakout" },
  { id: "o5", symbol: "TCS",       exchange: "NSE", side: "BUY",  orderType: "LIMIT",  qty: 5,   price: 3740,  status: "CANCELLED", time: "2026-04-11T10:02:00Z", strategy: "Manual" },
  { id: "o6", symbol: "INFY",      exchange: "NSE", side: "BUY",  orderType: "MARKET", qty: 15,  price: 1565,  status: "COMPLETE",  time: "2026-04-10T09:18:00Z", strategy: "Manual" },
  { id: "o7", symbol: "HDFCBANK",  exchange: "NSE", side: "SELL", orderType: "MARKET", qty: 20,  price: 1678,  status: "REJECTED",  time: "2026-04-10T11:30:00Z", strategy: "Manual" },
];

const statusVariant: Record<string, any> = {
  COMPLETE:   "success",
  OPEN:       "warning",
  CANCELLED:  "stopped",
  REJECTED:   "destructive",
  PENDING:    "default",
};

export default function OrdersPage() {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filtered = allOrders.filter((o) => {
    const matchFilter = filter === "ALL" || o.status === filter;
    const matchSearch = o.symbol.includes(search.toUpperCase()) || o.strategy.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {filtered.length} orders · complete audit trail
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Filter tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-[hsl(var(--secondary))]">
              {["ALL", "OPEN", "COMPLETE", "CANCELLED", "REJECTED"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    filter === s
                      ? "bg-[hsl(var(--primary))] text-white"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
              <input
                placeholder="Search symbol or strategy..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 pr-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary)/0.5)] w-52"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {["Symbol", "Side", "Type", "Qty", "Price", "Strategy", "Status", "Time"].map((h) => (
                    <th key={h} className="pb-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border)/0.5)]">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-[hsl(var(--secondary)/0.3)] transition-colors">
                    <td className="py-3 pr-4">
                      <div>
                        <p className="font-semibold">{o.symbol}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{o.exchange}</p>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn("font-bold text-xs px-2 py-0.5 rounded-full",
                        o.side === "BUY"
                          ? "bg-[hsl(var(--green)/0.15)] text-[hsl(var(--green))]"
                          : "bg-[hsl(var(--red)/0.15)] text-[hsl(var(--red))]"
                      )}>
                        {o.side}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[hsl(var(--muted-foreground))] text-xs">{o.orderType}</td>
                    <td className="py-3 pr-4 font-mono">{o.qty}</td>
                    <td className="py-3 pr-4 font-mono">₹{o.price.toLocaleString("en-IN")}</td>
                    <td className="py-3 pr-4">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{o.strategy}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusVariant[o.status] || "default"} className="text-[10px]">
                        {o.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-[hsl(var(--muted-foreground))] text-xs">
                      {formatDateTime(o.time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-16 text-center text-[hsl(var(--muted-foreground))]">
                No orders match your filter
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
