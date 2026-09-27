"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, ChevronDown, ChevronUp, RotateCcw, Plus, Minus, Loader2, AlertTriangle, X,
  Zap, ShieldAlert, Target, CheckCircle2, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useOrderTicket } from "@/hooks/useOrderTicket";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formatINR } from "@/lib/format";
import { useBrokers } from "@/hooks/useBrokers";
import { useMarketData } from "@/hooks/use-market-data";
import { brokerApi } from "@/lib/api";
import { newIdempotencyKey } from "@/lib/order-ticket";

// ─── Shared types ───────────────────────────────────────────────────────────
export type TabType = 'Regular' | 'Bracket' | 'Cover' | 'AMO' | 'Iceberg';
export type ProductType = 'MIS' | 'NRML';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type ValidityType = 'DAY' | 'IOC' | 'TTL';

export const orderFormSchema = z.object({
  product: z.enum(['MIS', 'NRML']),
  orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  exchange: z.enum(['NSE', 'BSE']),
  qty: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  triggerPrice: z.coerce.number().min(0, "Trigger price cannot be negative"),
  validity: z.enum(['DAY', 'IOC', 'TTL']),
  ttlMinutes: z.coerce.number().min(1).optional(),
  disclosedQty: z.coerce.number().min(0).optional(),
  orderTag: z.string().max(20, "Tag cannot exceed 20 characters").optional(),
}).refine((data) => {
  if ((data.orderType === 'LIMIT' || data.orderType === 'SL') && data.price <= 0) {
    return false;
  }
  return true;
}, {
  message: "Price must be > 0 for Limit & SL orders",
  path: ["price"],
}).refine((data) => {
  if ((data.orderType === 'SL' || data.orderType === 'SL-M') && data.triggerPrice <= 0) {
    return false;
  }
  return true;
}, {
  message: "Trigger price must be > 0 for SL & SL-M orders",
  path: ["triggerPrice"],
});

export type OrderFormValues = z.infer<typeof orderFormSchema>;

/** Suggested bracket levels (from a scanner signal) that pre-fill the Bracket tab. */
export interface BracketPreset {
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  product?: ProductType;
  isFnO?: boolean;
  /** Fallback quantity used only when entry and target1 are equal (zero profit-per-share). */
  suggestedQty?: number;
}

interface OrderWindowProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  /** Trading exchange segment, e.g. NSE / BSE / NFO. Only used as a label in Bracket mode; the
   *  Regular/Cover/AMO/Iceberg ticket always lets the user pick NSE vs BSE explicitly. */
  exchange?: string;
  type: 'BUY' | 'SELL';
  ltp: number;
  /** Not needed in Bracket mode, which places orders directly without a margin gate. */
  availableMargin?: number;
  brokerId?: string;
  /** Contract lot size for F&O; quantity must then be a multiple of it. */
  lotSize?: number;
  onTypeChange?: (type: 'BUY' | 'SELL') => void;
  /** When provided, the window opens directly on the Bracket tab, pre-filled with these levels. */
  bracket?: BracketPreset;
  /** Bracket-only: desired profit goal (₹) used to size quantity from entry→target1 distance. */
  targetRs?: number;
}

const DEFAULT_TICK = 0.05;

function getDecimals(tick: number): number {
  const tickStr = tick.toString();
  const dotIdx = tickStr.indexOf('.');
  return dotIdx === -1 ? 0 : tickStr.length - dotIdx - 1;
}

function snapToTick(price: number, tick: number = DEFAULT_TICK): number {
  if (isNaN(price) || price <= 0) return 0;
  const snapped = Math.round(price / tick) * tick;
  const decimals = getDecimals(tick);
  return parseFloat(snapped.toFixed(decimals));
}

function isTickValid(price: number, tick: number = DEFAULT_TICK): boolean {
  if (isNaN(price) || price <= 0) return false;
  const decimals = getDecimals(tick);
  const roundedPrice = parseFloat(price.toFixed(decimals));
  const tickCount = roundedPrice / tick;
  return Math.abs(Math.round(tickCount) - tickCount) < 1e-9;
}

/** Buffers the trigger price by 0.5% so an SL order clears broker market-protection bands. */
function getSlLimitPrice(triggerPrice: number, side: string, tick: number = DEFAULT_TICK): number {
  const buffer = triggerPrice * 0.005;
  const limit = side === "BUY" ? triggerPrice + buffer : triggerPrice - buffer;
  return snapToTick(limit, tick);
}

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getOrderVariety(): "regular" | "amo" {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short',
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
  const openMinutes = 9 * 60 + 15;
  const closeMinutes = 15 * 60 + 30;
  return (currentMinutes < openMinutes || currentMinutes >= closeMinutes) ? "amo" : "regular";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function OrderWindow({
  isOpen,
  onClose,
  symbol,
  exchange: exchangeProp,
  type,
  ltp,
  availableMargin = 0,
  brokerId,
  lotSize,
  onTypeChange,
  bracket,
  targetRs = 500,
}: OrderWindowProps) {
  // Callers (scanner pages) often pass `bracket` as a fresh object literal on every render, and a
  // live tick re-renders those pages continuously while this window is open. Keying effects off a
  // stable, value-based string (instead of the object reference) stops every tick from re-triggering
  // the snapshot/reset below — which otherwise wiped whatever the user had typed several times a second.
  const bracketKey = bracket
    ? `${bracket.entryPrice}|${bracket.stopLoss}|${bracket.target1}|${bracket.target2}|${bracket.product ?? ""}|${bracket.isFnO ?? ""}|${bracket.suggestedQty ?? ""}`
    : "";

  // Snapshot the incoming props while open so a close animation never flashes empty content.
  const [snap, setSnap] = useState({ symbol, exchange: exchangeProp, type, ltp, availableMargin, brokerId, lotSize, bracket, targetRs });
  useEffect(() => {
    if (isOpen) setSnap({ symbol, exchange: exchangeProp, type, ltp, availableMargin, brokerId, lotSize, bracket, targetRs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, symbol, exchangeProp, type, ltp, availableMargin, brokerId, lotSize, bracketKey, targetRs]);

  const [activeTab, setActiveTab] = useState<TabType>(bracket ? 'Bracket' : 'Regular');
  useEffect(() => {
    if (isOpen) setActiveTab(bracket ? 'Bracket' : 'Regular');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bracketKey]);

  // ─── Live tick: subscribes only while the window is open, overrides the REST snapshot ───
  const { getPrice } = useMarketData(isOpen && snap.symbol ? [snap.symbol] : []);
  const liveLtp = snap.symbol ? getPrice(snap.symbol) : null;
  const isLive = typeof liveLtp === "number" && liveLtp > 0;
  const effectiveLtp = isLive ? liveLtp : snap.ltp;

  const {
    handleSubmit,
    watch,
    setValue,
    resetField,
    formState: { errors, dirtyFields },
  } = useForm<OrderFormValues>({
    // pnpm resolves @hookform/resolvers against zod 4 types while this schema is zod 3; runtime is v3-compatible.
    resolver: zodResolver(orderFormSchema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: {
      product: 'MIS',
      orderType: 'LIMIT',
      exchange: 'NSE',
      qty: 1,
      price: ltp > 0 ? Number(ltp.toFixed(2)) : 0,
      triggerPrice: 0,
      validity: 'DAY',
      ttlMinutes: 2,
      disclosedQty: 0,
      orderTag: '',
    },
  });

  const product = watch("product");
  const orderType = watch("orderType");
  const qty = watch("qty") ?? 1;
  const price = watch("price") ?? 0;
  const triggerPrice = watch("triggerPrice") ?? 0;
  const exchange = watch("exchange");
  const validity = watch("validity");
  const ttlMinutes = watch("ttlMinutes") ?? 2;
  const disclosedQty = watch("disclosedQty") ?? 0;
  const orderTag = watch("orderTag") ?? "";

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isRefreshingMargin, setIsRefreshingMargin] = useState(false);

  // A new symbol (re)opening the window should get a fresh auto-filled price again, even if the
  // user had edited the price field for whatever was open before.
  useEffect(() => {
    if (isOpen) resetField("price");
  }, [isOpen, snap.symbol, resetField]);

  useEffect(() => {
    // Auto-fill the price from the live tick only until the user edits it themselves — otherwise
    // every incoming tick (several times a second in an active market) stomps whatever they typed
    // and the field, and the whole watch()-driven form, re-renders in a near-continuous loop.
    if (effectiveLtp > 0 && isOpen && !dirtyFields.price) {
      setValue("price", Number(effectiveLtp.toFixed(2)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLtp, isOpen, dirtyFields.price, setValue]);

  useEffect(() => {
    if (orderType === 'MARKET' && effectiveLtp > 0) {
      setValue("price", Number(effectiveLtp.toFixed(2)));
    }
  }, [orderType, effectiveLtp, setValue]);

  const effectivePrice = orderType === 'MARKET' ? effectiveLtp : price;
  const marginRequired = product === 'MIS' ? (effectivePrice * qty) / 5 : (effectivePrice * qty);

  // ─── Broker selection (shared by every tab) ──────────────────────────────
  const { brokers } = useBrokers();
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>(snap.brokerId ?? "");
  useEffect(() => {
    if (snap.brokerId) { setSelectedBrokerId(snap.brokerId); return; }
    if (brokers.length > 0 && !selectedBrokerId) setSelectedBrokerId(brokers[0].id);
  }, [snap.brokerId, brokers, selectedBrokerId]);
  const showBrokerPicker = !snap.brokerId && brokers.length > 0;

  const ticket = useOrderTicket({
    enabled: isOpen && activeTab !== 'Bracket',
    symbol: snap.symbol,
    exchange,
    brokerId: selectedBrokerId,
    side: type,
    orderType,
    product,
    qty,
    price,
    triggerPrice,
    ltp: effectiveLtp,
    availableMargin: snap.availableMargin,
    marginRequired,
    lotSize: snap.lotSize,
  });
  const qtyError = errors.qty?.message ?? ticket.fieldError("qty");
  const priceError = errors.price?.message ?? ticket.fieldError("price");
  const triggerError = errors.triggerPrice?.message ?? ticket.fieldError("triggerPrice");
  const formIssues = ticket.issues.filter((i) => i.field === "form" || i.severity === "warning");

  // ─── Bracket tab state (Entry / Stop-Loss / Target1 / Target2) ───────────
  const [bQty, setBQty] = useState(1);
  const [entryPrice, setEntryPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [bTarget1, setBTarget1] = useState("");
  const [bTarget2, setBTarget2] = useState("");
  const [bStep, setBStep] = useState<"idle" | "placing" | "done" | "error">("idle");
  const [placedOrders, setPlacedOrders] = useState<string[]>([]);
  const [bErrorMsg, setBErrorMsg] = useState("");
  const [tickSize, setTickSize] = useState(DEFAULT_TICK);
  const legKeys = useRef(new Map<string, string>());

  useEffect(() => {
    if (isOpen) setTickSize(DEFAULT_TICK);
  }, [isOpen, snap.bracket]);

  // Fetch the real tick size from the broker for this instrument.
  useEffect(() => {
    if (!isOpen || activeTab !== 'Bracket' || !snap.symbol || !selectedBrokerId) return;
    let cancelled = false;
    brokerApi.tickSize(selectedBrokerId, snap.symbol, snap.exchange || "NSE")
      .then((res) => {
        if (!cancelled && res.data?.data?.tickSize) setTickSize(res.data.data.tickSize);
      })
      .catch(() => { if (!cancelled) setTickSize(DEFAULT_TICK); });
    return () => { cancelled = true; };
  }, [isOpen, activeTab, snap.symbol, snap.exchange, selectedBrokerId]);

  // Recalculate suggested qty & snap levels to the tick whenever the preset or tick size changes.
  useEffect(() => {
    if (!snap.bracket) return;
    const b = snap.bracket;
    const profitPerShare = Math.abs(b.target1 - b.entryPrice);
    const calcQty = profitPerShare > 0 ? Math.ceil(snap.targetRs / profitPerShare) : (b.suggestedQty ?? 1);

    const isFnO = b.isFnO ?? false;
    const lot = snap.lotSize ?? 1;
    let qtyVal = calcQty;
    if (isFnO) {
      const lots = Math.max(1, Math.round(calcQty / lot));
      qtyVal = lots * lot;
    }
    setBQty(qtyVal);

    const decimals = getDecimals(tickSize);
    setEntryPrice(snapToTick(b.entryPrice, tickSize).toFixed(decimals));
    setSlPrice(snapToTick(b.stopLoss, tickSize).toFixed(decimals));
    setBTarget1(snapToTick(b.target1, tickSize).toFixed(decimals));
    setBTarget2(snapToTick(b.target2, tickSize).toFixed(decimals));
    setBStep("idle");
    setPlacedOrders([]);
    setBErrorMsg("");
  }, [snap.bracket, snap.targetRs, snap.lotSize, tickSize]);

  // Escape closes the ticket, as with any modal dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const isBuy = snap.type === 'BUY';
  const themeColor = isBuy ? 'hsl(var(--buy))' : 'hsl(var(--sell))';
  const onTheme = isBuy ? 'text-primary-foreground' : 'text-on-loss';
  const isBracket = activeTab === 'Bracket';
  const isFnO = snap.bracket?.isFnO ?? false;
  const lot = snap.lotSize ?? 1;
  const bracketProduct: ProductType = snap.bracket?.product ?? (isBuy ? "NRML" : "MIS");

  const entryNum = parseFloat(entryPrice) || 0;
  const slNum = parseFloat(slPrice) || 0;
  const target1Num = parseFloat(bTarget1) || 0;
  const target2Num = parseFloat(bTarget2) || 0;
  const bracketCapital = bQty * entryNum;
  const bracketRisk = bQty * Math.abs(entryNum - slNum);
  const bracketReward = bQty * Math.abs(target1Num - entryNum);
  const entrySide = isBuy ? "BUY" : "SELL";
  const slSide = isBuy ? "SELL" : "BUY";

  function placeLeg(brokerIdArg: string, payload: Record<string, unknown>) {
    const fingerprint = JSON.stringify(payload);
    let key = legKeys.current.get(fingerprint);
    if (!key) {
      key = newIdempotencyKey();
      legKeys.current.set(fingerprint, key);
    }
    return brokerApi.placeOrder(brokerIdArg, payload, key);
  }

  async function executeBracketTrade() {
    if (bStep === "placing") return;
    if (!selectedBrokerId) {
      toast.error("Please connect a broker first (Settings → Brokers)");
      return;
    }

    const invalidPrices = [
      { label: "Entry", value: entryNum },
      { label: "Stop-Loss", value: slNum },
      { label: "Target 1", value: target1Num },
      { label: "Target 2", value: target2Num },
    ].filter((p) => !isTickValid(p.value, tickSize));

    if (invalidPrices.length > 0) {
      const names = invalidPrices.map((p) => `${p.label} (₹${fmt(p.value)})`).join(", ");
      const msg = `Tick size for this script is ${tickSize}. Kindly enter trigger price in a multiple of ${tickSize} for: ${names}`;
      setBErrorMsg(msg);
      setBStep("error");
      toast.error(msg, { duration: 6000 });
      return;
    }

    setBStep("placing");
    setPlacedOrders([]);
    setBErrorMsg("");
    const variety = getOrderVariety();

    try {
      const placed: string[] = [];

      const entryOrder = await placeLeg(selectedBrokerId, {
        symbol: snap.symbol,
        exchange: snap.exchange || "NSE",
        side: entrySide,
        product: bracketProduct,
        orderType: "SL",
        variety,
        qty: bQty,
        price: getSlLimitPrice(entryNum, entrySide, tickSize),
        triggerPrice: entryNum,
      });
      const entryId = entryOrder.data?.data?.orderId ?? "entry-placed";
      placed.push(`✅ Entry ${entrySide} ${bQty}x ${snap.symbol} @ ₹${fmt(entryNum)} — ${entryId}`);
      setPlacedOrders([...placed]);

      await delay(400);

      if (bracketProduct === "NRML") {
        const gttOrder = await brokerApi.placeGtt(selectedBrokerId, {
          symbol: snap.symbol,
          exchange: snap.exchange || "NSE",
          side: slSide,
          product: bracketProduct,
          qty: bQty,
          entryPrice: entryNum,
          slTriggerPrice: slNum,
          slLimitPrice: getSlLimitPrice(slNum, slSide, tickSize),
          targetPrice: target1Num,
        });
        const gttId = gttOrder.data?.data?.triggerId ?? "gtt-placed";
        placed.push(`🛑🎯 GTT Stop-Loss & Target Placed — ${gttId}`);
        setPlacedOrders([...placed]);
        legKeys.current.clear();
        setBStep("done");
      } else {
        const slOrder = await placeLeg(selectedBrokerId, {
          symbol: snap.symbol,
          exchange: snap.exchange || "NSE",
          side: slSide,
          product: bracketProduct,
          orderType: "SL",
          variety,
          qty: bQty,
          price: getSlLimitPrice(slNum, slSide, tickSize),
          triggerPrice: slNum,
        });
        const slId = slOrder.data?.data?.orderId ?? "sl-placed";
        placed.push(`🛑 Stop-Loss ${slSide} @ ₹${fmt(slNum)} — ${slId}`);
        setPlacedOrders([...placed]);

        await delay(400);

        const t1Order = await placeLeg(selectedBrokerId, {
          symbol: snap.symbol,
          exchange: snap.exchange || "NSE",
          side: slSide,
          product: bracketProduct,
          orderType: "LIMIT",
          variety,
          qty: bQty,
          price: target1Num,
          triggerPrice: 0,
        });
        const t1Id = t1Order.data?.data?.orderId ?? "t1-placed";
        placed.push(`🎯 Target 1 ${slSide} @ ₹${fmt(target1Num)} — ${t1Id}`);
        setPlacedOrders([...placed]);

        legKeys.current.clear();
        setBStep("done");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Order placement failed. Check broker session.";
      setBErrorMsg(msg);
      setBStep("error");
      toast.error(msg);
    }
  }

  const onSubmit = (data: OrderFormValues) => {
    const variety = activeTab === 'AMO' ? 'amo' : activeTab === 'Cover' ? 'co' : activeTab === 'Iceberg' ? 'iceberg' : 'regular';
    return ticket.submit(
      {
        symbol: snap.symbol,
        exchange: data.exchange,
        side: type,
        product: data.product,
        orderType: data.orderType,
        qty: data.qty,
        price: data.orderType === 'MARKET' ? 0 : data.price,
        triggerPrice: data.orderType.startsWith('SL') ? data.triggerPrice : 0,
        variety,
        validity: data.validity,
        disclosedQty: data.disclosedQty,
        tag: data.orderTag || undefined,
      },
      () => {
        toast.success(`${activeTab === 'AMO' ? 'AMO' : type} order placed for ${data.qty} ${snap.symbol}`);
        onClose();
      },
    );
  };

  const handleRefreshMargin = () => {
    setIsRefreshingMargin(true);
    setTimeout(() => setIsRefreshingMargin(false), 400);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-0 bg-secondary/60 backdrop-blur-xs pointer-events-auto"
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={`${isBuy ? "Buy" : "Sell"} ${snap.symbol || "order"}`}
            className="relative z-10 pointer-events-auto w-full md:w-[480px] md:max-w-lg bg-card rounded-t-xl md:rounded-xl shadow-2xl border-t md:border border-border overflow-hidden font-sans select-none max-h-[92vh] flex flex-col mx-0 md:mx-4"
          >
            {/* ─── HEADER ─── */}
            <div
              className={`px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col ${onTheme} transition-colors duration-200 shrink-0`}
              style={{ backgroundColor: themeColor }}
            >
              <div className="w-10 h-1 bg-current/40 rounded-full mx-auto mb-2 md:hidden" />

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm sm:text-[15px] uppercase tracking-wide truncate">
                      {isBuy ? "BUY" : "SELL"} {snap.symbol}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 bg-current/20 rounded text-current">
                      x {isBracket ? bQty : qty}
                    </span>
                  </div>

                  {isBracket ? (
                    <div className="flex items-center gap-2 text-[11px] text-current/90 font-medium">
                      <span>{snap.exchange || "NSE"} · CMP ₹{fmt(effectiveLtp)}</span>
                      <span className={cn("flex items-center gap-1 text-[10px] font-semibold", isLive ? "text-current" : "text-current/60")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-current animate-pulse" : "bg-current/50")} />
                        {isLive ? "LIVE" : "DELAYED"}
                      </span>
                    </div>
                  ) : (
                    <div role="radiogroup" aria-label="Exchange" className="flex items-center gap-3 text-[11px] text-current/90 font-medium">
                      <button type="button" role="radio" aria-checked={exchange === "BSE"}
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-100 transition-opacity"
                        onClick={() => setValue("exchange", "BSE")}
                      >
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all",
                          exchange === "BSE" ? "bg-card ring-2 ring-current/40" : "bg-current/40 border border-current/60"
                        )} />
                        <span className={exchange === "BSE" ? "font-semibold text-current" : "text-current/80"}>
                          BSE ₹{effectiveLtp > 0 ? effectiveLtp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                        </span>
                      </button>

                      <button type="button" role="radio" aria-checked={exchange === "NSE"}
                        className="flex items-center gap-1.5 cursor-pointer hover:opacity-100 transition-opacity"
                        onClick={() => setValue("exchange", "NSE")}
                      >
                        <div className={cn(
                          "h-2 w-2 rounded-full transition-all",
                          exchange === "NSE" ? "bg-card ring-2 ring-current/40" : "bg-current/40 border border-current/60"
                        )} />
                        <span className={exchange === "NSE" ? "font-semibold text-current" : "text-current/80"}>
                          NSE ₹{effectiveLtp > 0 ? effectiveLtp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                        </span>
                      </button>

                      <span className={cn("flex items-center gap-1 text-[10px] font-semibold ml-1", isLive ? "text-current" : "text-current/60")} title={isLive ? "Live tick" : "Waiting for a live tick"}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-current animate-pulse" : "bg-current/50")} />
                        {isLive ? "LIVE" : "DELAYED"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  {!isBracket && (
                    <button type="button" role="switch" aria-checked={!isBuy} aria-label="Order side: on for sell, off for buy"
                      className="w-11 h-6 bg-current/30 rounded-full relative cursor-pointer p-0.5 transition-colors flex items-center"
                      title={`Switch to ${isBuy ? "SELL" : "BUY"}`}
                      onClick={() => onTypeChange?.(isBuy ? "SELL" : "BUY")}
                    >
                      <motion.div
                        layout
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className={cn("h-5 w-5 bg-card rounded-full shadow-md", isBuy ? "translate-x-0" : "translate-x-5")}
                      />
                    </button>
                  )}

                  <button type="button" onClick={onClose} aria-label="Close order window"
                    className="p-1 rounded-full bg-current/10 hover:bg-current/20 text-current transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ─── TABS BAR ─── */}
            {/* Only the tab list itself scrolls horizontally — the settings popover must NOT sit inside an
                overflow-x-auto ancestor, since that forces the other axis to clip too (a CSS quirk), which
                trapped the absolutely-positioned popover inside the bar's own height as a tiny scrollable sliver. */}
            <div className="flex items-center justify-between border-b border-border bg-card px-2 shrink-0">
              <div className="flex items-center overflow-x-auto no-scrollbar">
                {(['Regular', 'Bracket', 'Cover', 'AMO', 'Iceberg'] as TabType[]).map((tab) => {
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold cursor-pointer border-b-2 transition-all relative whitespace-nowrap",
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground border-transparent"
                      )}
                      style={{ borderBottomColor: active ? themeColor : 'transparent', color: active ? themeColor : undefined }}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              {!isBracket && (
                <div className="relative pr-2 shrink-0">
                  <button type="button" onClick={() => setShowSettings(!showSettings)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground/75 transition-colors"
                    title="Order Window Preferences"
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  <AnimatePresence>
                    {showSettings && (
                      <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        className="absolute right-0 top-8 z-50 w-56 bg-card border border-border rounded-xl shadow-xl p-3 text-xs space-y-2 text-foreground/75"
                      >
                        <div className="flex items-center justify-between font-semibold border-b pb-1 text-foreground">
                          <span>Order Preferences</span>
                          <X className="h-3.5 w-3.5 cursor-pointer text-muted-foreground hover:text-foreground/75" onClick={() => setShowSettings(false)} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Default Product</span>
                          <select
                            value={product}
                            onChange={(e) => setValue("product", e.target.value as ProductType)}
                            className="w-full border rounded-lg px-2 py-1 bg-muted/50 text-xs"
                          >
                            <option value="MIS">Intraday (MIS)</option>
                            <option value="NRML">Delivery (NRML)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Default Order Type</span>
                          <select
                            value={orderType}
                            onChange={(e) => setValue("orderType", e.target.value as OrderType)}
                            className="w-full border rounded-lg px-2 py-1 bg-muted/50 text-xs"
                          >
                            <option value="LIMIT">Limit</option>
                            <option value="MARKET">Market</option>
                            <option value="SL">SL</option>
                            <option value="SL-M">SL-M</option>
                          </select>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* ─── FORM BODY ─── */}
            <div className="p-3.5 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto flex-1 overscroll-contain">
              {showBrokerPicker && (
                <div className="space-y-1.5">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Broker Account</label>
                  <select
                    value={selectedBrokerId}
                    onChange={(e) => setSelectedBrokerId(e.target.value)}
                    className="w-full border border-border rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-foreground/75 focus:outline-none focus:border-primary bg-card"
                  >
                    {brokers.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.broker} — {b.clientId}</option>
                    ))}
                  </select>
                </div>
              )}

              {isBracket ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground">
                    {isBuy ? "Long (Buy)" : "Short (Sell)"} · {bracketProduct === "NRML" ? "Delivery NRML" : "Intraday MIS"}
                  </p>

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <div className={cn("p-3 rounded-xl border", isBuy ? "bg-profit-subtle border-profit/30" : "bg-loss-subtle border-loss/30")}>
                      <div className={cn("text-[9px] font-semibold uppercase tracking-widest mb-1", isBuy ? "text-profit" : "text-loss")}>
                        {isBuy ? "↑ Entry (Buy Above)" : "↓ Entry (Sell Below)"}
                      </div>
                      <input
                        type="number" step={tickSize} value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        onBlur={(e) => setEntryPrice(snapToTick(parseFloat(e.target.value) || 0, tickSize).toFixed(getDecimals(tickSize)))}
                        className={cn("w-full bg-transparent text-lg font-semibold focus:outline-none",
                          isBuy ? "text-profit" : "text-loss", !isTickValid(entryNum, tickSize) && "text-loss")}
                      />
                      <div className="text-[9px] font-medium text-muted-foreground mt-0.5">trigger price · tick {tickSize}</div>
                    </div>

                    <div className="p-3 rounded-xl bg-loss-subtle border border-loss/30">
                      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-loss mb-1">
                        <ShieldAlert className="h-2.5 w-2.5" /> Stop-Loss
                      </div>
                      <input
                        type="number" step={tickSize} value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        onBlur={(e) => setSlPrice(snapToTick(parseFloat(e.target.value) || 0, tickSize).toFixed(getDecimals(tickSize)))}
                        className={cn("w-full bg-transparent text-lg font-semibold text-loss focus:outline-none", !isTickValid(slNum, tickSize) && "text-loss")}
                      />
                      <div className="text-[9px] font-medium text-muted-foreground mt-0.5">Risk ₹{fmt(Math.abs(entryNum - slNum))} / share</div>
                    </div>

                    <div className="p-3 rounded-xl bg-brand-subtle border border-primary/30">
                      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-accent-foreground mb-1">
                        <Target className="h-2.5 w-2.5" /> Target 1
                      </div>
                      <input
                        type="number" step={tickSize} value={bTarget1}
                        onChange={(e) => setBTarget1(e.target.value)}
                        onBlur={(e) => setBTarget1(snapToTick(parseFloat(e.target.value) || 0, tickSize).toFixed(getDecimals(tickSize)))}
                        className={cn("w-full bg-transparent text-lg font-semibold text-accent-foreground focus:outline-none", !isTickValid(target1Num, tickSize) && "text-loss")}
                      />
                      <div className="text-[9px] font-medium text-muted-foreground mt-0.5">Profit ₹{fmt(Math.abs(target1Num - entryNum))} / share</div>
                    </div>

                    <div className="p-3 rounded-xl bg-brand-subtle border border-primary/30">
                      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-accent-foreground mb-1">
                        <Target className="h-2.5 w-2.5" /> Target 2
                      </div>
                      <input
                        type="number" step={tickSize} value={bTarget2}
                        onChange={(e) => setBTarget2(e.target.value)}
                        onBlur={(e) => setBTarget2(snapToTick(parseFloat(e.target.value) || 0, tickSize).toFixed(getDecimals(tickSize)))}
                        className={cn("w-full bg-transparent text-lg font-semibold text-accent-foreground focus:outline-none", !isTickValid(target2Num, tickSize) && "text-loss")}
                      />
                      <div className="text-[9px] font-medium text-muted-foreground mt-0.5">Profit ₹{fmt(Math.abs(target2Num - entryNum))} / share</div>
                    </div>
                  </div>

                  <div className="bg-muted/50 border border-border rounded-lg p-3.5">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="h-3.5 w-3.5 text-warn" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Trade Summary</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold uppercase mb-0.5">Qty</p>
                        <input
                          type="number" min={isFnO ? lot : 1} step={isFnO ? lot : 1} value={bQty}
                          onChange={(e) => { const val = Number(e.target.value); setBQty(isFnO ? Math.max(lot, val) : Math.max(1, val)); }}
                          onBlur={() => { if (isFnO) setBQty(Math.max(1, Math.round(bQty / lot)) * lot); }}
                          className="w-full bg-transparent text-sm font-semibold text-foreground text-center focus:outline-none border-b border-input focus:border-primary pb-0.5"
                        />
                        {isFnO && (
                          <p className="text-[8px] text-muted-foreground font-medium mt-0.5">
                            {Math.round(bQty / lot)} Lot{Math.round(bQty / lot) > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold uppercase mb-0.5">Capital</p>
                        <p className="text-sm font-semibold num text-foreground">{formatINR(Math.round(bracketCapital), { decimals: 0 })}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold uppercase mb-0.5">Risk</p>
                        <p className="text-sm font-semibold num text-loss">{formatINR(Math.round(bracketRisk), { decimals: 0 })}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-semibold uppercase mb-0.5">Reward T1</p>
                        <p className="text-sm font-semibold num text-profit">{formatINR(Math.round(bracketReward), { decimals: 0 })}</p>
                      </div>
                    </div>
                  </div>

                  {placedOrders.length > 0 && (
                    <div className="space-y-1.5">
                      {placedOrders.map((line, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs font-medium text-foreground/75 bg-muted/50 rounded-xl px-3 py-2 border border-border">
                          {line}
                        </div>
                      ))}
                    </div>
                  )}

                  {bStep === "error" && (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-loss-subtle border border-loss/30">
                      <AlertTriangle className="h-4 w-4 text-loss shrink-0 mt-0.5" />
                      <p className="text-xs text-loss font-medium">{bErrorMsg}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {bracketProduct === "NRML" ? (
                      <>2 orders will be placed: <strong>Entry (SL trigger)</strong> → <strong>GTT (Stop-Loss &amp; Target)</strong>.</>
                    ) : (
                      <>3 orders will be placed: <strong>Entry (SL trigger)</strong> → <strong>Stop-Loss (SL)</strong> → <strong>Target 1 (LIMIT)</strong>.</>
                    )}
                    {getOrderVariety() === "amo" && (
                      <span className="text-warn font-semibold ml-1">(Market is closed. Placing as After Market Orders - AMO)</span>
                    )}
                  </p>
                </>
              ) : (
                <>
                  {/* Product Type Selector */}
                  <div role="radiogroup" aria-label="Product" className="flex items-center gap-6 sm:gap-8">
                    <button type="button" role="radio" aria-checked={product === 'MIS'} className="flex items-center gap-2 cursor-pointer group" onClick={() => setValue("product", "MIS")}>
                      <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center transition-all", product === 'MIS' ? "border-transparent" : "border-border group-hover:border-muted-foreground")}
                        style={{ borderColor: product === 'MIS' ? themeColor : undefined, borderWidth: product === 'MIS' ? '2px' : '1px' }}>
                        {product === 'MIS' && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
                      </div>
                      <span className="text-xs sm:text-[13px] font-medium text-foreground">
                        Intraday <span className="text-[10px] sm:text-[11px] text-muted-foreground uppercase font-normal ml-0.5">MIS</span>
                      </span>
                    </button>

                    <button type="button" role="radio" aria-checked={product === 'NRML'} className="flex items-center gap-2 cursor-pointer group" onClick={() => setValue("product", "NRML")}>
                      <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center transition-all", product === 'NRML' ? "border-transparent" : "border-border group-hover:border-muted-foreground")}
                        style={{ borderColor: product === 'NRML' ? themeColor : undefined, borderWidth: product === 'NRML' ? '2px' : '1px' }}>
                        {product === 'NRML' && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
                      </div>
                      <span className="text-xs sm:text-[13px] font-medium text-foreground">
                        Delivery <span className="text-[10px] sm:text-[11px] text-muted-foreground uppercase font-normal ml-0.5">NRML</span>
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">QTY.</label>
                      <div className="relative flex items-center rounded-lg sm:rounded-xl bg-muted border border-border/80 focus-within:bg-card focus-within:ring-1 focus-within:ring-primary/20 transition-all h-9 sm:h-10 overflow-hidden">
                        <input
                          type="number" min={1} value={qty}
                          onChange={(e) => setValue("qty", Math.max(1, parseInt(e.target.value) || 1), { shouldValidate: true })}
                          className="w-full h-full bg-transparent pl-2 sm:pl-3 pr-5 sm:pr-6 text-xs sm:text-[14px] font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <div className="absolute right-0 top-0 bottom-0 w-5 sm:w-6 flex flex-col border-l border-border/60 bg-muted/50">
                          <button type="button" onClick={() => setValue("qty", qty + 1, { shouldValidate: true })} className="flex-1 flex items-center justify-center text-muted-foreground hover:bg-border/70 hover:text-foreground transition-colors">
                            <Plus className="h-2 sm:h-2.5 w-2 sm:w-2.5" />
                          </button>
                          <div className="border-t border-border/60" />
                          <button type="button" onClick={() => setValue("qty", Math.max(1, qty - 1), { shouldValidate: true })} className="flex-1 flex items-center justify-center text-muted-foreground hover:bg-border/70 hover:text-foreground transition-colors">
                            <Minus className="h-2 sm:h-2.5 w-2 sm:w-2.5" />
                          </button>
                        </div>
                      </div>
                      {qtyError && <p className="text-[10px] text-loss font-semibold">{qtyError}</p>}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">PRICE</label>
                      <div className={cn("relative flex items-center rounded-lg sm:rounded-xl border transition-all h-9 sm:h-10 overflow-hidden",
                        orderType === 'MARKET' ? "bg-muted border-border text-muted-foreground cursor-not-allowed" : "bg-muted border-border/80 focus-within:bg-card focus-within:ring-1 focus-within:ring-primary/20")}>
                        <input
                          type="number" step="0.05" disabled={orderType === 'MARKET'}
                          value={orderType === 'MARKET' ? (effectiveLtp > 0 ? effectiveLtp : 0) : price}
                          onChange={(e) => setValue("price", parseFloat(e.target.value) || 0, { shouldValidate: true })}
                          className={cn("w-full h-full bg-transparent px-2 sm:px-3 text-xs sm:text-[14px] font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            orderType === 'MARKET' ? "text-muted-foreground cursor-not-allowed" : "text-foreground")}
                        />
                      </div>
                      {priceError && <p className="text-[10px] text-loss font-semibold">{priceError}</p>}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate block">TRIGGER PRICE</label>
                      <div className={cn("relative flex items-center rounded-lg sm:rounded-xl border transition-all h-9 sm:h-10 overflow-hidden",
                        !orderType.startsWith('SL') ? "bg-muted border-border text-muted-foreground cursor-not-allowed" : "bg-muted border-border/80 focus-within:bg-card focus-within:ring-1 focus-within:ring-primary/20")}>
                        <input
                          type="number" step="0.05" disabled={!orderType.startsWith('SL')}
                          value={orderType.startsWith('SL') ? triggerPrice : 0}
                          onChange={(e) => setValue("triggerPrice", parseFloat(e.target.value) || 0, { shouldValidate: true })}
                          className={cn("w-full h-full bg-transparent px-2 sm:px-3 text-xs sm:text-[14px] font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            !orderType.startsWith('SL') ? "text-muted-foreground cursor-not-allowed" : "text-foreground")}
                        />
                      </div>
                      {triggerError && <p className="text-[10px] text-loss font-semibold">{triggerError}</p>}
                    </div>
                  </div>

                  <div role="radiogroup" aria-label="Order type" className="flex items-center flex-wrap gap-3 sm:gap-6 pt-1">
                    {(['Market', 'Limit', 'SL', 'SL-M'] as const).map((t) => {
                      const isSelected = orderType === t.toUpperCase();
                      return (
                        <button type="button" role="radio" aria-checked={isSelected} key={t} className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group"
                          onClick={() => setValue("orderType", t.toUpperCase() as OrderType, { shouldValidate: true })}>
                          <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center transition-all", isSelected ? "border-transparent" : "border-border group-hover:border-muted-foreground")}
                            style={{ borderColor: isSelected ? themeColor : undefined, borderWidth: isSelected ? '2px' : '1px' }}>
                            {isSelected && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
                          </div>
                          <span className={cn("text-xs sm:text-[13px] font-medium transition-colors", isSelected ? "text-foreground font-semibold" : "text-foreground/75")}>{t}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-1">
                    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-[11px] sm:text-[12px] font-semibold text-primary hover:underline focus:outline-none">
                      <span>Advanced options</span>
                      {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-3 sm:space-y-4 pt-3 text-xs">
                          <div className="space-y-1.5">
                            <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">Validity</label>
                            <div className="flex items-center gap-4">
                              {(['DAY', 'IOC', 'TTL'] as ValidityType[]).map((v) => (
                                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="radio" checked={validity === v} onChange={() => setValue("validity", v, { shouldValidate: true })} className="accent-primary" />
                                  <span className="text-foreground/75 font-medium text-xs">{v}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {validity === 'TTL' && (
                            <div className="space-y-1">
                              <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">TTL (Minutes)</label>
                              <Input type="number" min={1} value={ttlMinutes} onChange={(e) => setValue("ttlMinutes", parseInt(e.target.value) || 1)} className="h-8 text-xs bg-muted border-border w-28 rounded-lg" />
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">Disclosed Qty</label>
                              <Input type="number" min={0} value={disclosedQty} onChange={(e) => setValue("disclosedQty", parseInt(e.target.value) || 0)} className="h-8 text-xs bg-muted border-border rounded-lg" placeholder="Optional" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">Order Tag</label>
                              <Input type="text" value={orderTag} onChange={(e) => setValue("orderTag", e.target.value)} className="h-8 text-xs bg-muted border-border rounded-lg" placeholder="e.g. Scalp1" />
                              {errors.orderTag && <p className="text-[10px] text-loss font-semibold">{errors.orderTag.message}</p>}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>

            {/* ─── RISK PREVIEW / CONFIRM (ticket tabs only) ─── */}
            {!isBracket && (formIssues.length > 0 || ticket.confirming) && (
              <div className="px-3.5 sm:px-5 py-2 border-t border-border space-y-1 shrink-0" role="status" aria-live="polite">
                {formIssues.map((issue, idx) => (
                  <p key={idx} className={cn("flex items-start gap-1.5 text-[11px] font-medium", issue.severity === "error" ? "text-loss" : "text-warn")}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
                    <span>{issue.message}</span>
                  </p>
                ))}
                {ticket.confirming && (
                  <p className="text-[12px] font-semibold text-foreground">
                    Confirm: {isBuy ? "BUY" : "SELL"} {qty} {snap.symbol} at {orderType === "MARKET" || orderType === "SL-M" ? "market" : formatINR(price)} (~{formatINR(ticket.orderValue)}). Press {isBuy ? "Buy" : "Sell"} again to place it.
                  </p>
                )}
              </div>
            )}

            {/* ─── FOOTER ─── */}
            {isBracket ? (
              <div className="px-4 sm:px-6 pb-4 sm:pb-5 pt-3 sm:pt-4 flex gap-3 shrink-0 bg-card border-t border-border">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-foreground/75 hover:bg-muted/50 transition-colors">
                  Cancel
                </button>
                {bStep === "done" ? (
                  <button onClick={onClose} className="flex-[2] py-3 rounded-xl bg-profit text-on-profit text-sm font-semibold flex items-center justify-center gap-2 shadow-lg">
                    <CheckCircle2 className="h-5 w-5" /> Orders Placed!
                  </button>
                ) : (
                  <button
                    onClick={executeBracketTrade}
                    disabled={bStep === "placing" || brokers.length === 0}
                    className={cn(
                      "flex-[2] py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg",
                      isBuy ? "bg-profit hover:bg-profit/90 text-on-profit disabled:bg-border disabled:text-muted-foreground disabled:shadow-none"
                            : "bg-loss hover:bg-loss/90 text-on-loss disabled:bg-border disabled:text-muted-foreground disabled:shadow-none"
                    )}
                  >
                    {bStep === "placing" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Placing Orders...</>
                    ) : (
                      <><Zap className="h-4 w-4" /> {isBuy ? `Buy ${snap.symbol}` : `Short ${snap.symbol}`}</>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-muted/60 px-3.5 sm:px-5 py-3 sm:py-3.5 border-t border-border flex items-center justify-between gap-2 shrink-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                    <span className="text-muted-foreground font-normal truncate">Req:</span>
                    <span className="font-semibold text-foreground whitespace-nowrap">{formatINR(marginRequired)}</span>
                    <button type="button" onClick={handleRefreshMargin} className="p-0.5 text-muted-foreground hover:text-foreground/75 transition-colors focus:outline-none shrink-0" title="Refresh Margin">
                      <RotateCcw className={cn("h-3 w-3", isRefreshingMargin && "animate-spin text-primary")} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
                    <span className="text-muted-foreground font-normal truncate">Avail:</span>
                    <span className="font-semibold text-foreground whitespace-nowrap">{formatINR(snap.availableMargin)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button type="button" variant="outline" onClick={onClose}
                    className="bg-card border border-border text-foreground/75 font-semibold px-3 sm:px-5 h-8.5 sm:h-9 rounded-lg sm:rounded-xl text-xs hover:bg-muted/50 hover:text-foreground transition-colors">
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSubmit(onSubmit)} disabled={ticket.isSubmitting || ticket.hasErrors}
                    className={`${onTheme} disabled:opacity-50 font-semibold px-5 sm:px-8 h-8.5 sm:h-9 rounded-lg sm:rounded-xl text-xs transition-all hover:brightness-105 active:scale-[0.98]`}
                    style={{ backgroundColor: themeColor }}>
                    {ticket.isSubmitting ? (
                      <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Placing...</span>
                    ) : (
                      ticket.confirming ? (isBuy ? 'Confirm Buy' : 'Confirm Sell') : (isBuy ? 'Buy' : 'Sell')
                    )}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
