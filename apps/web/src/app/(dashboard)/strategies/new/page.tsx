"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart2, TrendingUp, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STEPS = ["Strategy Type", "Configuration", "Broker & Risk", "Review"];

export default function NewStrategyPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    type: "" as "BREAKOUT_15MIN" | "EMA_CROSSOVER" | "",
    symbol: "NIFTY50",
    exchange: "NSE",
    qty: "50",
    stopLossPercent: "0.5",
    targetPercent: "1.0",
    fastPeriod: "9",
    slowPeriod: "15",
    interval: "15min",
    brokerAccountId: "",
    capital: "100000",
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function next() { if (step < STEPS.length - 1) setStep(step + 1); }
  function back() { if (step > 0) setStep(step - 1); }

  function handleSubmit() {
    toast.success("Strategy created successfully!", {
      description: `${form.name} is ready to deploy.`,
    });
    router.push("/strategies");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-[fade-up_0.4s_ease_both]">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create Strategy</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Build and deploy your algo in 4 steps
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
                  i < step
                    ? "bg-green-500 border-green-500 text-white"
                    : i === step
                    ? "border-blue-600 text-blue-600 bg-blue-50"
                    : "border-slate-200 text-slate-400 bg-white"
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium text-center leading-tight hidden sm:block",
                  i === step ? "text-slate-900 font-bold" : "text-slate-400"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 mt-[-16px] rounded transition-all",
                  i < step ? "bg-green-500" : "bg-slate-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Step 0: Type */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Strategy Name</label>
                <Input
                  className="bg-white border-slate-200 placeholder:text-slate-400"
                  placeholder="e.g. Nifty Breakout Strategy"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Strategy Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      type: "BREAKOUT_15MIN",
                      label: "15-Min Breakout",
                      desc: "Capture first 15-min candle high/low and trade breakouts",
                      icon: BarChart2,
                    },
                    {
                      type: "EMA_CROSSOVER",
                      label: "EMA Crossover",
                      desc: "Trade when EMA(9) crosses EMA(15) on candle close",
                      icon: TrendingUp,
                    },
                  ].map(({ type, label, desc, icon: Icon }) => (
                    <button
                      key={type}
                      onClick={() => update("type", type)}
                      className={cn(
                        "text-left p-4 rounded-xl border-2 transition-all bg-white",
                        form.type === type
                          ? "border-blue-600 bg-blue-50 shadow-sm"
                          : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shadow-sm",
                          form.type === type
                            ? "bg-blue-100"
                            : "bg-slate-100"
                        )}>
                          <Icon className={cn("h-5 w-5", form.type === type ? "text-blue-600" : "text-slate-500")} />
                        </div>
                        <p className="font-bold text-slate-900 text-sm">{label}</p>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Config */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Symbol</label>
                  <Input value={form.symbol} onChange={(e) => update("symbol", e.target.value)} placeholder="NIFTY50" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Exchange</label>
                  <select
                    value={form.exchange}
                    onChange={(e) => update("exchange", e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                    <option value="NFO">NFO</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Quantity (Lots)</label>
                <Input type="number" value={form.qty} onChange={(e) => update("qty", e.target.value)} />
              </div>

              {form.type === "BREAKOUT_15MIN" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Stop Loss %</label>
                    <Input type="number" step="0.1" value={form.stopLossPercent} onChange={(e) => update("stopLossPercent", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Target %</label>
                    <Input type="number" step="0.1" value={form.targetPercent} onChange={(e) => update("targetPercent", e.target.value)} />
                  </div>
                </div>
              )}

              {form.type === "EMA_CROSSOVER" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Fast EMA Period</label>
                      <Input type="number" value={form.fastPeriod} onChange={(e) => update("fastPeriod", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Slow EMA Period</label>
                      <Input type="number" value={form.slowPeriod} onChange={(e) => update("slowPeriod", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Interval</label>
                    <select
                      value={form.interval}
                      onChange={(e) => update("interval", e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.5)]"
                    >
                      <option value="1min">1 Minute</option>
                      <option value="5min">5 Minutes</option>
                      <option value="15min">15 Minutes</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Broker & Risk */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Broker Account</label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select broker account</option>
                  <option value="1">Zerodha — AB1234</option>
                  <option value="2">Angel One — AARSH001</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">Max Capital (₹)</label>
                <Input className="border-slate-200 bg-white text-slate-900" type="number" value={form.capital} onChange={(e) => update("capital", e.target.value)} />
              </div>
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
                <p className="text-sm font-bold text-orange-700 mb-1">⚠️ Risk Reminder</p>
                <p className="text-xs text-orange-600 font-medium">
                  Ensure your broker API has order placement permissions. Test
                  strategies in paper trading mode before going live.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-3">
              {[
                ["Name",       form.name || "—"],
                ["Type",       form.type || "—"],
                ["Symbol",     `${form.symbol} · ${form.exchange}`],
                ["Quantity",   form.qty],
                ["Capital",    `₹${Number(form.capital).toLocaleString("en-IN")}`],
                form.type === "BREAKOUT_15MIN"
                  ? ["Stop Loss / Target", `${form.stopLossPercent}% / ${form.targetPercent}%`]
                  : ["EMA Periods", `EMA${form.fastPeriod} / EMA${form.slowPeriod}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-2 rounded-lg transition-colors">
                  <span className="text-sm text-slate-500 font-medium">{label}</span>
                  <span className="text-sm font-bold text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={back} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={step === 0 && (!form.name || !form.type)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="success" onClick={handleSubmit}>
            <Check className="h-4 w-4" /> Create Strategy
          </Button>
        )}
      </div>
    </div>
  );
}
