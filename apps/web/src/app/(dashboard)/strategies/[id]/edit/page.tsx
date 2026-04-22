"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Check, Loader2, Shield, Target, Zap, Info, ArrowLeft, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { strategyApi, brokerApi } from "@/lib/api";
import Link from "next/link";

interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  instrumentType: "INDEX" | "STOCK";
  qty: number;
  product: "MIS" | "NRML";
  stopLossRs: number;
  targetRs: number;
  maxTradesPerDay: number;
}

interface BrokerAccount {
  id: string;
  broker: string;
  clientId: string;
}

export default function EditStrategyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  
  const [form, setForm] = useState({
    name: "",
    type: "" as "BREAKOUT_15MIN" | "EMA_CROSSOVER" | "",
    symbol: "",
    exchange: "NSE",
    instrumentType: "INDEX" as "INDEX" | "STOCK",
    qty: "1",
    product: "MIS" as "MIS" | "NRML",
    stopLossRs: "500",
    targetRs: "500",
    maxTradesPerDay: "1",
    brokerAccountId: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [stratRes, brokerRes] = await Promise.all([
          strategyApi.get(id),
          brokerApi.list()
        ]);
        
        const strategy = stratRes.data.data;
        const config = strategy.config as Breakout15MinConfig;
        const brokerList = brokerRes.data?.data ?? [];
        
        setBrokers(brokerList);
        setForm({
          name: strategy.name,
          type: strategy.type,
          symbol: config.symbol,
          exchange: config.exchange,
          instrumentType: config.instrumentType,
          qty: String(config.qty),
          product: config.product,
          stopLossRs: String(config.stopLossRs),
          targetRs: String(config.targetRs),
          maxTradesPerDay: String(config.maxTradesPerDay),
          brokerAccountId: strategy.brokerAccountId || "",
        });
      } catch (err) {
        toast.error("Failed to load strategy details");
        router.push("/strategies");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, router]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const config = {
        symbol: form.symbol.trim(),
        exchange: form.exchange,
        instrumentType: form.instrumentType,
        qty: Number(form.qty),
        product: form.product,
        stopLossRs: Number(form.stopLossRs),
        targetRs: Number(form.targetRs),
        maxTradesPerDay: Number(form.maxTradesPerDay),
      };

      await strategyApi.update(id, {
        name: form.name,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(config),
      });

      toast.success("Strategy updated successfully!");
      router.push(`/strategies/${id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update strategy");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div className="flex items-center gap-3">
        <Link href={`/strategies/${id}`}>
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Strategy</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Modify configuration for {form.name}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Basic Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Strategy Name</label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Symbol</label>
              <Input
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Exchange</label>
              <select
                value={form.exchange}
                onChange={(e) => set("exchange", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
              >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="NFO">NFO (F&O)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Quantity / Lots</label>
              <Input
                type="number"
                min={1}
                value={form.qty}
                onChange={(e) => set("qty", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Product Type</label>
              <select
                value={form.product}
                onChange={(e) => set("product", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
              >
                <option value="MIS">MIS (Intraday)</option>
                <option value="NRML">NRML (Overnight)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Risk & Execution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-red-500" />
                Stop Loss (₹)
              </label>
              <Input
                type="number"
                min={1}
                value={form.stopLossRs}
                onChange={(e) => set("stopLossRs", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Target className="h-4 w-4 text-green-500" />
                Target (₹)
              </label>
              <Input
                type="number"
                min={1}
                value={form.targetRs}
                onChange={(e) => set("targetRs", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-500" />
              Max Trades Per Day
            </label>
            <Input
              type="number"
              min={1}
              max={10}
              value={form.maxTradesPerDay}
              onChange={(e) => set("maxTradesPerDay", e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">Broker Account</label>
            <select
              value={form.brokerAccountId}
              onChange={(e) => set("brokerAccountId", e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
            >
              <option value="">Select broker account</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.broker} — {b.clientId}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/strategies/${id}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button 
          variant="success" 
          onClick={handleSubmit} 
          disabled={submitting}
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            <><Check className="h-4 w-4 mr-2" /> Update Strategy</>
          )}
        </Button>
      </div>
    </div>
  );
}
