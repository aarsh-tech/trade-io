"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, TrendingUp, TrendingDown, ShieldAlert, Target,
  Loader2, CheckCircle2, AlertTriangle, ChevronRight, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { brokerApi } from "@/lib/api";
import { useBrokers } from "@/hooks/useBrokers";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface QuickTradeStock {
  symbol: string;
  exchange: string;
  direction: "LONG" | "SHORT";   // LONG = Buy breakout, SHORT = Sell breakdown
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  currentPrice: number;
  suggestedQty: number;
  product?: "MIS" | "CNC";       // MIS for intraday, CNC for delivery/swing
}

interface Props {
  stock: QuickTradeStock | null;
  onClose: () => void;
  targetRs?: number;
}

type OrderStep = "entry" | "target" | "stoploss";
type ExecMode = "bracket" | "sequential";

// Bracket order: places entry + SL + target atomically.
// Sequential: entry → then immediately SL + target as GTT / SL orders.
// Since Kite supports GTT & CO (Cover Order), we simulate both.

const TICK = 0.05;

/** Round a price to the nearest valid tick (0.05) */
function snapToTick(price: number): number {
  return Math.round(price / TICK) * TICK;
}

/** Returns true if value is a valid multiple of TICK */
function isTickValid(price: number): boolean {
  return Math.abs(Math.round(price / TICK) * TICK - price) < 1e-9;
}

/** 
 * Calculate a limit price for Stop-Loss (SL) orders to simulate Market execution.
 * Adds/subtracts a 0.5% buffer to the trigger price to pass broker market protection.
 */
function getSlLimitPrice(triggerPrice: number, side: string): number {
  const buffer = triggerPrice * 0.005; // 0.5% slippage buffer
  const limit = side === "BUY" ? triggerPrice + buffer : triggerPrice - buffer;
  return snapToTick(limit);
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Determines if the order should be placed as AMO based on current IST time */
function getOrderVariety(): "regular" | "amo" {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short'
  });
  
  const parts = formatter.formatToParts(now);
  let hour = 0, minute = 0, weekday = '';
  
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
    if (part.type === 'weekday') weekday = part.value;
  }
  
  if (weekday === 'Sat' || weekday === 'Sun') return "amo";
  
  if (hour === 24) hour = 0;
  const currentMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 15; // 9:15 AM
  const closeMinutes = 15 * 60 + 30; // 3:30 PM
  
  return (currentMinutes < openMinutes || currentMinutes >= closeMinutes) ? "amo" : "regular";
}

// ─── Component ────────────────────────────────────────────────────────────────
export function QuickTradePanel({ stock, onClose, targetRs = 500 }: Props) {
  const { brokers } = useBrokers();

  const [qty, setQty] = useState(stock?.suggestedQty ?? 1);
  const [entryPrice, setEntryPrice] = useState(stock?.entryPrice ?? 0);
  const [slPrice, setSlPrice] = useState(stock?.stopLoss ?? 0);
  const [target1, setTarget1] = useState(stock?.target1 ?? 0);
  const [target2, setTarget2] = useState(stock?.target2 ?? 0);
  const [execMode, setExecMode] = useState<ExecMode>("sequential");
  const [step, setStep] = useState<"idle" | "placing" | "done" | "error">("idle");
  const [placedOrders, setPlacedOrders] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("");

  // Recalculate qty from targetRs whenever stock changes
  // All prices are snapped to the nearest 0.05 tick to satisfy Zerodha's requirement.
  useEffect(() => {
    if (!stock) return;
    const profitPerShare = Math.abs(stock.target1 - stock.entryPrice);
    const calcQty = profitPerShare > 0 ? Math.ceil(targetRs / profitPerShare) : stock.suggestedQty;
    setQty(calcQty);
    setEntryPrice(snapToTick(stock.entryPrice));
    setSlPrice(snapToTick(stock.stopLoss));
    setTarget1(snapToTick(stock.target1));
    setTarget2(snapToTick(stock.target2));
    setStep("idle");
    setPlacedOrders([]);
    setErrorMsg("");
  }, [stock, targetRs]);

  useEffect(() => {
    if (brokers.length > 0 && !selectedBrokerId) {
      setSelectedBrokerId(brokers[0].id);
    }
  }, [brokers, selectedBrokerId]);

  if (!stock) return null;

  const isLong = stock.direction === "LONG";
  const accentColor = isLong ? "#10b981" : "#ef4444"; // emerald / rose
  const entrySide = isLong ? "BUY" : "SELL";
  const slSide = isLong ? "SELL" : "BUY";          // opposite for SL exit
  const capital = qty * entryPrice;
  const riskAmt = qty * Math.abs(entryPrice - slPrice);
  const rewardT1 = qty * Math.abs(target1 - entryPrice);

  // ── Order Execution ────────────────────────────────────────────────────────
  async function executeTrade() {
    // Narrow `stock` from `QuickTradeStock | null` → `QuickTradeStock`.
    // TypeScript cannot carry the render-time null-guard into this async closure.
    if (!stock) return;

    if (!selectedBrokerId) {
      toast.error("Please connect a broker first (Settings → Brokers)");
      return;
    }

    // Pre-flight: all trigger prices must be multiples of TICK (0.05)
    const invalidPrices = [
      { label: "Entry", value: entryPrice },
      { label: "Stop-Loss", value: slPrice },
      { label: "Target 1", value: target1 },
      { label: "Target 2", value: target2 },
    ].filter((p) => !isTickValid(p.value));

    if (invalidPrices.length > 0) {
      const names = invalidPrices.map((p) => `${p.label} (₹${fmt(p.value)})`).join(", ");
      const msg = `Tick size for this script is ${TICK}. Kindly enter trigger price in a multiple of ${TICK} for: ${names}`;
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg, { duration: 6000 });
      return;
    }

    setStep("placing");
    setPlacedOrders([]);
    setErrorMsg("");

    const variety = getOrderVariety();
    const product = stock.product ?? "MIS";

    try {
      const placed: string[] = [];

      // ① Entry order  (SL for break-out / break-down trigger)
      const entryOrder = await brokerApi.placeOrder(selectedBrokerId, {
        symbol: stock.symbol,
        exchange: stock.exchange,
        side: entrySide,
        product,
        orderType: "SL",                 // Changed from SL-M to avoid Market Protection errors
        variety,
        qty,
        price: getSlLimitPrice(entryPrice, entrySide),
        triggerPrice: entryPrice,
      });
      const entryId = entryOrder.data?.data?.orderId ?? "entry-placed";
      placed.push(`✅ Entry ${entrySide} ${qty}x ${stock.symbol} @ ₹${fmt(entryPrice)} — ${entryId}`);
      setPlacedOrders([...placed]);
      toast.success(`Entry order placed — ${stock.symbol}`);

      // Small delay before placing SL & target
      await delay(400);

      // ② Stop-Loss order (SL on the opposite side)
      const slOrder = await brokerApi.placeOrder(selectedBrokerId, {
        symbol: stock.symbol,
        exchange: stock.exchange,
        side: slSide,
        product,
        orderType: "SL",                 // Changed from SL-M
        variety,
        qty,
        price: getSlLimitPrice(slPrice, slSide),
        triggerPrice: slPrice,
      });
      const slId = slOrder.data?.data?.orderId ?? "sl-placed";
      placed.push(`🛑 Stop-Loss ${slSide} @ ₹${fmt(slPrice)} — ${slId}`);
      setPlacedOrders([...placed]);
      toast.info(`Stop-loss placed @ ₹${fmt(slPrice)}`);

      await delay(400);

      // ③ Target 1 order (LIMIT, opposite side)
      const t1Order = await brokerApi.placeOrder(selectedBrokerId, {
        symbol: stock.symbol,
        exchange: stock.exchange,
        side: slSide,
        product,
        orderType: "LIMIT",
        variety,
        qty,
        price: target1,
        triggerPrice: 0,
      });
      const t1Id = t1Order.data?.data?.orderId ?? "t1-placed";
      placed.push(`🎯 Target 1 ${slSide} @ ₹${fmt(target1)} — ${t1Id}`);
      setPlacedOrders([...placed]);
      toast.success(`Target order placed @ ₹${fmt(target1)}`);

      setStep("done");
      toast.success(`🚀 All ${3} orders placed for ${stock.symbol}!`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Order placement failed. Check broker session.";
      setErrorMsg(msg);
      setStep("error");
      toast.error(msg);
    }
  }

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return (
    <AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.92, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* ── Header ────────────────────────────────────────────────────── */}
          <div
            className="px-6 py-5 text-white relative overflow-hidden"
            style={{
              background: isLong
                ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
                : "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)"
            }}
          >
            {/* Glow blobs */}
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {isLong
                    ? <TrendingUp className="h-5 w-5" />
                    : <TrendingDown className="h-5 w-5" />}
                  <span className="text-xs font-black uppercase tracking-widest opacity-80">
                    {isLong ? "Long (Buy)" : "Short (Sell)"} · {stock.product === "CNC" ? "Delivery CNC" : "Intraday MIS"}
                  </span>
                </div>
                <h2 className="text-2xl font-black tracking-tight">{stock.symbol}</h2>
                <p className="text-sm opacity-70 font-medium mt-0.5">
                  {stock.exchange} · CMP ₹{fmt(stock.currentPrice)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Body ──────────────────────────────────────────────────────── */}
          <div className="p-6 space-y-5">

            {/* Broker selector */}
            {brokers.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  No broker connected. Go to <strong>Settings → Brokers</strong> to connect Zerodha.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Broker Account</label>
                <select
                  value={selectedBrokerId}
                  onChange={(e) => setSelectedBrokerId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:border-indigo-400 bg-white"
                >
                  {brokers.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.broker} — {b.clientId}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Levels grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Entry */}
              <div className={cn(
                "p-3 rounded-2xl border",
                isLong ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
              )}>
                <div className={cn("text-[9px] font-black uppercase tracking-widest mb-1",
                  isLong ? "text-emerald-500" : "text-red-500")}>
                  {isLong ? "↑ Entry (Buy Above)" : "↓ Entry (Sell Below)"}
                </div>
                <input
                  type="number"
                  step="0.05"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(snapToTick(Number(e.target.value)))}
                  onBlur={(e) => setEntryPrice(snapToTick(Number(e.target.value)))}
                  className={cn("w-full bg-transparent text-lg font-extrabold focus:outline-none",
                    isLong ? "text-emerald-700" : "text-red-700",
                    !isTickValid(entryPrice) && "text-rose-500")}
                />
                <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                  trigger price · tick 0.05
                </div>
              </div>

              {/* Stop-Loss */}
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100">
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">
                  <ShieldAlert className="h-2.5 w-2.5" />
                  Stop-Loss
                </div>
                <input
                  type="number"
                  step="0.05"
                  value={slPrice}
                  onChange={(e) => setSlPrice(snapToTick(Number(e.target.value)))}
                  onBlur={(e) => setSlPrice(snapToTick(Number(e.target.value)))}
                  className={cn(
                    "w-full bg-transparent text-lg font-extrabold text-rose-700 focus:outline-none",
                    !isTickValid(slPrice) && "text-rose-300"
                  )}
                />
                <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                  Risk ₹{fmt(Math.abs(entryPrice - slPrice))} / share
                </div>
              </div>

              {/* Target 1 */}
              <div className="p-3 rounded-2xl bg-teal-50 border border-teal-100">
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-teal-500 mb-1">
                  <Target className="h-2.5 w-2.5" />
                  Target 1
                </div>
                <input
                  type="number"
                  step="0.05"
                  value={target1}
                  onChange={(e) => setTarget1(snapToTick(Number(e.target.value)))}
                  onBlur={(e) => setTarget1(snapToTick(Number(e.target.value)))}
                  className={cn(
                    "w-full bg-transparent text-lg font-extrabold text-teal-700 focus:outline-none",
                    !isTickValid(target1) && "text-rose-500"
                  )}
                />
                <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                  Profit ₹{fmt(Math.abs(target1 - entryPrice))} / share
                </div>
              </div>

              {/* Target 2 */}
              <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100">
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-1">
                  <Target className="h-2.5 w-2.5" />
                  Target 2
                </div>
                <input
                  type="number"
                  step="0.05"
                  value={target2}
                  onChange={(e) => setTarget2(snapToTick(Number(e.target.value)))}
                  onBlur={(e) => setTarget2(snapToTick(Number(e.target.value)))}
                  className={cn(
                    "w-full bg-transparent text-lg font-extrabold text-indigo-700 focus:outline-none",
                    !isTickValid(target2) && "text-rose-500"
                  )}
                />
                <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                  Profit ₹{fmt(Math.abs(target2 - entryPrice))} / share
                </div>
              </div>
            </div>

            {/* Trade Summary */}
            <div className="bg-slate-900 rounded-2xl p-4 text-white">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-yellow-400" />
                <span className="text-xs font-black uppercase tracking-widest text-slate-300">Trade Summary</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Qty</p>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-transparent text-sm font-black text-white text-center focus:outline-none border-b border-slate-700 pb-0.5"
                  />
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Capital</p>
                  <p className="text-sm font-black text-white">₹{Math.round(capital).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Risk</p>
                  <p className="text-sm font-black text-rose-400">₹{Math.round(riskAmt).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Reward T1</p>
                  <p className="text-sm font-black text-emerald-400">₹{Math.round(rewardT1).toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>

            {/* Order placement log */}
            {placedOrders.length > 0 && (
              <div className="space-y-1.5">
                {placedOrders.map((line, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-medium text-slate-600 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Error message */}
            {step === "error" && (
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-rose-50 border border-rose-100">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 font-medium">{errorMsg}</p>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 px-1">
              <Info className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-0.5" />
              <div className="text-[10px] text-slate-400 leading-relaxed">
                3 orders will be placed: <strong>Entry (SL trigger)</strong> → <strong>Stop-Loss (SL)</strong> → <strong>Target 1 (LIMIT)</strong>. 
                {getOrderVariety() === "amo" && (
                  <span className="text-amber-500 font-bold ml-1">
                    (Market is closed. Placing as After Market Orders - AMO)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>

            {step === "done" ? (
              <button
                onClick={onClose}
                className="flex-2 flex-1 py-3.5 rounded-2xl bg-emerald-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
              >
                <CheckCircle2 className="h-5 w-5" />
                Orders Placed!
              </button>
            ) : (
              <button
                onClick={executeTrade}
                disabled={step === "placing" || brokers.length === 0}
                className={cn(
                  "flex-[2] py-3.5 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 transition-all shadow-lg",
                  isLong
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100 disabled:bg-slate-200 disabled:shadow-none"
                    : "bg-rose-500 hover:bg-rose-600 shadow-rose-100 disabled:bg-slate-200 disabled:shadow-none"
                )}
              >
                {step === "placing" ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Placing Orders...</>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    {isLong ? `Buy ${stock.symbol}` : `Short ${stock.symbol}`}
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
