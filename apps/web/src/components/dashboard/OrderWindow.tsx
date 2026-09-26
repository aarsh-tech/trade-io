"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, ChevronDown, ChevronUp, RotateCcw, Plus, Minus, Loader2, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useOrderTicket } from "@/hooks/useOrderTicket";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formatINR } from "@/lib/format";

interface OrderWindowProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  type: 'BUY' | 'SELL';
  ltp: number;
  availableMargin: number;
  brokerId?: string;
  /** Contract lot size for F&O; quantity must then be a multiple of it. */
  lotSize?: number;
  onTypeChange?: (type: 'BUY' | 'SELL') => void;
}

export type TabType = 'Regular' | 'Cover' | 'AMO' | 'Iceberg';
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
  activeTab: z.enum(['Regular', 'Cover', 'AMO', 'Iceberg']),
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

export function OrderWindow({
  isOpen,
  onClose,
  symbol,
  type,
  ltp,
  availableMargin,
  brokerId,
  lotSize,
  onTypeChange,
}: OrderWindowProps) {

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
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
      activeTab: 'Regular',
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
  const activeTab = watch("activeTab");
  const exchange = watch("exchange");
  const validity = watch("validity");
  const ttlMinutes = watch("ttlMinutes") ?? 2;
  const disclosedQty = watch("disclosedQty") ?? 0;
  const orderTag = watch("orderTag") ?? "";

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Settings popover state
  const [showSettings, setShowSettings] = useState(false);

  // Loading & refresh state
  const [isRefreshingMargin, setIsRefreshingMargin] = useState(false);

  useEffect(() => {
    if (ltp > 0 && isOpen) {
      setValue("price", Number(ltp.toFixed(2)));
    }
  }, [ltp, isOpen, setValue]);

  useEffect(() => {
    // Reset price when order type changes to market
    if (orderType === 'MARKET' && ltp > 0) {
      setValue("price", Number(ltp.toFixed(2)));
    }
  }, [orderType, ltp, setValue]);

  // Margin calculation (approximate 5x leverage for MIS)
  const effectivePrice = orderType === 'MARKET' ? ltp : price;
  const marginRequired = product === 'MIS'
    ? (effectivePrice * qty) / 5
    : (effectivePrice * qty);

  const ticket = useOrderTicket({
    enabled: isOpen,
    symbol,
    exchange,
    brokerId,
    side: type,
    orderType,
    product,
    qty,
    price,
    triggerPrice,
    ltp,
    availableMargin,
    marginRequired,
    lotSize,
  });
  const qtyError = errors.qty?.message ?? ticket.fieldError("qty");
  const priceError = errors.price?.message ?? ticket.fieldError("price");
  const triggerError = errors.triggerPrice?.message ?? ticket.fieldError("triggerPrice");
  const formIssues = ticket.issues.filter((i) => i.field === "form" || i.severity === "warning");

  // Escape closes the ticket, as with any modal dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isBuy = type === 'BUY';
  // Theme tokens: `buy` / `sell` from the design system, so the ticket follows light/dark.
  const themeColor = isBuy ? 'hsl(var(--buy))' : 'hsl(var(--sell))';
  const themeHover = isBuy ? 'hsl(var(--brand-hover))' : 'hsl(var(--sell) / 0.9)';
  const onTheme = isBuy ? 'text-primary-foreground' : 'text-on-loss';

  const onSubmit = (data: OrderFormValues) => {
    const variety = data.activeTab === 'AMO' ? 'amo' : data.activeTab === 'Cover' ? 'co' : data.activeTab === 'Iceberg' ? 'iceberg' : 'regular';
    return ticket.submit(
      {
        symbol,
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
        toast.success(`${data.activeTab === 'AMO' ? 'AMO' : type} order placed for ${data.qty} ${symbol}`);
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
          {/* Backdrop for all screens */}
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
            aria-label={`${type === "BUY" ? "Buy" : "Sell"} ${symbol || "order"}`}
            className="relative z-10 pointer-events-auto w-full md:w-[480px] md:max-w-lg bg-card rounded-t-xl md:rounded-xl shadow-2xl border-t md:border border-border overflow-hidden font-sans select-none max-h-[92vh] flex flex-col mx-0 md:mx-4"
          >
            {/* ─── HEADER ─── */}
            <div
              className={`px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col ${onTheme} transition-colors duration-200 shrink-0`}
              style={{ backgroundColor: themeColor }}
            >
              {/* Mobile grab handle */}
              <div className="w-10 h-1 bg-current/40 rounded-full mx-auto mb-2 md:hidden" />

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm sm:text-[15px] uppercase tracking-wide truncate">
                      {isBuy ? "BUY" : "SELL"} {symbol}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 bg-current/20 rounded text-current">
                      x {qty}
                    </span>
                  </div>
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
                        BSE ₹{ltp > 0 ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
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
                        NSE ₹{ltp > 0 ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Toggle Switch (BUY / SELL) & Close Button */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  <button type="button" role="switch" aria-checked={!isBuy} aria-label="Order side: on for sell, off for buy"
                    className="w-11 h-6 bg-current/30 rounded-full relative cursor-pointer p-0.5 transition-colors flex items-center"
                    title={`Switch to ${isBuy ? "SELL" : "BUY"}`}
                    onClick={() => onTypeChange?.(isBuy ? "SELL" : "BUY")}
                  >
                    <motion.div
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className={cn(
                        "h-5 w-5 bg-card rounded-full shadow-md",
                        isBuy ? "translate-x-0" : "translate-x-5"
                      )}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close order window"
                    className="p-1 rounded-full bg-current/10 hover:bg-current/20 text-current transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ─── TABS BAR ─── */}
            <div className="flex items-center justify-between border-b border-border bg-card px-2 overflow-x-auto no-scrollbar shrink-0">
              <div className="flex items-center">
                {(['Regular', 'Cover', 'AMO', 'Iceberg'] as TabType[]).map((tab) => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setValue("activeTab", tab)}
                      className={cn(
                        "px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold cursor-pointer border-b-2 transition-all relative whitespace-nowrap",
                        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground border-transparent"
                      )}
                      style={{
                        borderBottomColor: isActive ? themeColor : 'transparent',
                        color: isActive ? themeColor : undefined,
                      }}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              <div className="relative pr-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground/75 transition-colors"
                  title="Order Window Preferences"
                >
                  <Settings className="h-4 w-4" />
                </button>

                {/* Settings Popover */}
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
            </div>

            {/* ─── FORM BODY ─── */}
            <div className="p-3.5 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto flex-1 overscroll-contain">
              {/* Product Type Selector */}
              <div role="radiogroup" aria-label="Product" className="flex items-center gap-6 sm:gap-8">
                {/* Intraday MIS */}
                <button type="button" role="radio" aria-checked={product === 'MIS'}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setValue("product", "MIS")}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                      product === 'MIS' ? "border-transparent" : "border-border group-hover:border-muted-foreground"
                    )}
                    style={{
                      borderColor: product === 'MIS' ? themeColor : undefined,
                      borderWidth: product === 'MIS' ? '2px' : '1px',
                    }}
                  >
                    {product === 'MIS' && (
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      />
                    )}
                  </div>
                  <span className="text-xs sm:text-[13px] font-medium text-foreground">
                    Intraday <span className="text-[10px] sm:text-[11px] text-muted-foreground uppercase font-normal ml-0.5">MIS</span>
                  </span>
                </button>

                {/* Delivery NRML */}
                <button type="button" role="radio" aria-checked={product === 'NRML'}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setValue("product", "NRML")}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                      product === 'NRML' ? "border-transparent" : "border-border group-hover:border-muted-foreground"
                    )}
                    style={{
                      borderColor: product === 'NRML' ? themeColor : undefined,
                      borderWidth: product === 'NRML' ? '2px' : '1px',
                    }}
                  >
                    {product === 'NRML' && (
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      />
                    )}
                  </div>
                  <span className="text-xs sm:text-[13px] font-medium text-foreground">
                    Delivery <span className="text-[10px] sm:text-[11px] text-muted-foreground uppercase font-normal ml-0.5">NRML</span>
                  </span>
                </button>
              </div>

              {/* ─── INPUT FIELDS GRID (3 COLUMNS) ─── */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {/* QTY FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    QTY.
                  </label>
                  <div className="relative flex items-center rounded-lg sm:rounded-xl bg-muted border border-border/80 focus-within:bg-card focus-within:-primary focus-within:ring-1 focus-within:-primary/20 transition-all h-9 sm:h-10 overflow-hidden">
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => setValue("qty", Math.max(1, parseInt(e.target.value) || 1), { shouldValidate: true })}
                      className="w-full h-full bg-transparent pl-2 sm:pl-3 pr-5 sm:pr-6 text-xs sm:text-[14px] font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {/* Stepper buttons (+ / -) */}
                    <div className="absolute right-0 top-0 bottom-0 w-5 sm:w-6 flex flex-col border-l border-border/60 bg-muted/50">
                      <button
                        type="button"
                        onClick={() => setValue("qty", qty + 1, { shouldValidate: true })}
                        className="flex-1 flex items-center justify-center text-muted-foreground hover:bg-border/70 hover:text-foreground transition-colors"
                      >
                        <Plus className="h-2 sm:h-2.5 w-2 sm:w-2.5" />
                      </button>
                      <div className="border-t border-border/60" />
                      <button
                        type="button"
                        onClick={() => setValue("qty", Math.max(1, qty - 1), { shouldValidate: true })}
                        className="flex-1 flex items-center justify-center text-muted-foreground hover:bg-border/70 hover:text-foreground transition-colors"
                      >
                        <Minus className="h-2 sm:h-2.5 w-2 sm:w-2.5" />
                      </button>
                    </div>
                  </div>
                  {qtyError && <p className="text-[10px] text-loss font-semibold">{qtyError}</p>}
                </div>

                {/* PRICE FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    PRICE
                  </label>
                  <div className={cn(
                    "relative flex items-center rounded-lg sm:rounded-xl border transition-all h-9 sm:h-10 overflow-hidden",
                    orderType === 'MARKET'
                      ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
                      : "bg-muted border-border/80 focus-within:bg-card focus-within:-primary focus-within:ring-1 focus-within:-primary/20"
                  )}>
                    <input
                      type="number"
                      step="0.05"
                      disabled={orderType === 'MARKET'}
                      value={orderType === 'MARKET' ? (ltp > 0 ? ltp : 0) : price}
                      onChange={(e) => setValue("price", parseFloat(e.target.value) || 0, { shouldValidate: true })}
                      className={cn(
                        "w-full h-full bg-transparent px-2 sm:px-3 text-xs sm:text-[14px] font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        orderType === 'MARKET' ? "text-muted-foreground cursor-not-allowed" : "text-foreground"
                      )}
                    />
                  </div>
                  {priceError && <p className="text-[10px] text-loss font-semibold">{priceError}</p>}
                </div>

                {/* TRIGGER PRICE FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate block">
                    TRIGGER PRICE
                  </label>
                  <div className={cn(
                    "relative flex items-center rounded-lg sm:rounded-xl border transition-all h-9 sm:h-10 overflow-hidden",
                    !orderType.startsWith('SL')
                      ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
                      : "bg-muted border-border/80 focus-within:bg-card focus-within:-primary focus-within:ring-1 focus-within:-primary/20"
                  )}>
                    <input
                      type="number"
                      step="0.05"
                      disabled={!orderType.startsWith('SL')}
                      value={orderType.startsWith('SL') ? triggerPrice : 0}
                      onChange={(e) => setValue("triggerPrice", parseFloat(e.target.value) || 0, { shouldValidate: true })}
                      className={cn(
                        "w-full h-full bg-transparent px-2 sm:px-3 text-xs sm:text-[14px] font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        !orderType.startsWith('SL') ? "text-muted-foreground cursor-not-allowed" : "text-foreground"
                      )}
                    />
                  </div>
                  {triggerError && <p className="text-[10px] text-loss font-semibold">{triggerError}</p>}
                </div>
              </div>

              {/* ─── ORDER TYPE RADIO SELECTOR ─── */}
              <div role="radiogroup" aria-label="Order type" className="flex items-center flex-wrap gap-3 sm:gap-6 pt-1">
                {(['Market', 'Limit', 'SL', 'SL-M'] as const).map((t) => {
                  const isSelected = orderType === t.toUpperCase();
                  return (
                    <button type="button" role="radio" aria-checked={isSelected}
                      key={t}
                      className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group"
                      onClick={() => setValue("orderType", t.toUpperCase() as OrderType, { shouldValidate: true })}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                          isSelected ? "border-transparent" : "border-border group-hover:border-muted-foreground"
                        )}
                        style={{
                          borderColor: isSelected ? themeColor : undefined,
                          borderWidth: isSelected ? '2px' : '1px',
                        }}
                      >
                        {isSelected && (
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: themeColor }}
                          />
                        )}
                      </div>
                      <span className={cn(
                        "text-xs sm:text-[13px] font-medium transition-colors",
                        isSelected ? "text-foreground font-semibold" : "text-foreground/75"
                      )}>
                        {t}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ─── ADVANCED OPTIONS ACCORDION ─── */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-[11px] sm:text-[12px] font-semibold -primary hover:underline focus:outline-none"
                >
                  <span>Advanced options</span>
                  {showAdvanced ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden space-y-3 sm:space-y-4 pt-3 text-xs"
                    >
                      {/* Validity */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">
                          Validity
                        </label>
                        <div className="flex items-center gap-4">
                          {(['DAY', 'IOC', 'TTL'] as ValidityType[]).map((v) => (
                            <label
                              key={v}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <input
                                type="radio"
                                checked={validity === v}
                                onChange={() => setValue("validity", v, { shouldValidate: true })}
                                className="-primary"
                              />
                              <span className="text-foreground/75 font-medium text-xs">{v}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {validity === 'TTL' && (
                        <div className="space-y-1">
                          <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">
                            TTL (Minutes)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            value={ttlMinutes}
                            onChange={(e) => setValue("ttlMinutes", parseInt(e.target.value) || 1)}
                            className="h-8 text-xs bg-muted border-border w-28 rounded-lg"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">
                            Disclosed Qty
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={disclosedQty}
                            onChange={(e) => setValue("disclosedQty", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs bg-muted border-border rounded-lg"
                            placeholder="Optional"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase">
                            Order Tag
                          </label>
                          <Input
                            type="text"
                            value={orderTag}
                            onChange={(e) => setValue("orderTag", e.target.value)}
                            className="h-8 text-xs bg-muted border-border rounded-lg"
                            placeholder="e.g. Scalp1"
                          />
                          {errors.orderTag && <p className="text-[10px] text-loss font-semibold">{errors.orderTag.message}</p>}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ─── RISK PREVIEW / CONFIRM ─── */}
            {(formIssues.length > 0 || ticket.confirming) && (
              <div className="px-3.5 sm:px-5 py-2 border-t border-border space-y-1 shrink-0" role="status" aria-live="polite">
                {formIssues.map((issue, idx) => (
                  <p
                    key={idx}
                    className={cn(
                      "flex items-start gap-1.5 text-[11px] font-medium",
                      issue.severity === "error" ? "text-loss" : "text-warn"
                    )}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
                    <span>{issue.message}</span>
                  </p>
                ))}
                {ticket.confirming && (
                  <p className="text-[12px] font-semibold text-foreground">
                    Confirm: {isBuy ? "BUY" : "SELL"} {qty} {symbol} at {orderType === "MARKET" || orderType === "SL-M" ? "market" : formatINR(price)} (~{formatINR(ticket.orderValue)}). Press {isBuy ? "Buy" : "Sell"} again to place it.
                  </p>
                )}
              </div>
            )}

            {/* ─── FOOTER SECTION ─── */}
            <div className="bg-muted/60 px-3.5 sm:px-5 py-3 sm:py-3.5 border-t border-border flex items-center justify-between gap-2 shrink-0">
              {/* Left info column */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <span className="text-muted-foreground font-normal truncate">Req:</span>
                  <span className="font-semibold text-foreground whitespace-nowrap">
                    {formatINR(marginRequired)}
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshMargin}
                    className="p-0.5 text-muted-foreground hover:text-foreground/75 transition-colors focus:outline-none shrink-0"
                    title="Refresh Margin"
                  >
                    <RotateCcw className={cn("h-3 w-3", isRefreshingMargin && "animate-spin -primary")} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
                  <span className="text-muted-foreground font-normal truncate">Avail:</span>
                  <span className="font-semibold text-foreground whitespace-nowrap">
                    {formatINR(availableMargin)}
                  </span>
                </div>
              </div>

              {/* Right action buttons column */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="bg-card border border-border text-foreground/75 font-semibold px-3 sm:px-5 h-8.5 sm:h-9 rounded-lg sm:rounded-xl text-xs hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={handleSubmit(onSubmit)}
                  disabled={ticket.isSubmitting || ticket.hasErrors}
                  className={`${onTheme} disabled:opacity-50 font-semibold px-5 sm:px-8 h-8.5 sm:h-9 rounded-lg sm:rounded-xl text-xs transition-all  hover:brightness-105 active:scale-[0.98]`}
                  style={{
                    backgroundColor: themeColor,
                  }}
                >
                  {ticket.isSubmitting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Placing...
                    </span>
                  ) : (
                    ticket.confirming ? (isBuy ? 'Confirm Buy' : 'Confirm Sell') : (isBuy ? 'Buy' : 'Sell')
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
