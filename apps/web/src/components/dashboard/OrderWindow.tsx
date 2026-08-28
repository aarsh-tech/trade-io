"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, ChevronDown, ChevronUp, RotateCcw, Plus, Minus, Loader2, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { brokerApi } from "@/lib/api";
import { toast } from "sonner";

interface OrderWindowProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  type: 'BUY' | 'SELL';
  ltp: number;
  availableMargin: number;
  brokerId?: string;
  onTypeChange?: (type: 'BUY' | 'SELL') => void;
}

type TabType = 'Regular' | 'Cover' | 'AMO' | 'Iceberg';
type ProductType = 'MIS' | 'CNC';
type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
type ValidityType = 'DAY' | 'IOC' | 'TTL';

export function OrderWindow({
  isOpen,
  onClose,
  symbol,
  type,
  ltp,
  availableMargin,
  brokerId,
  onTypeChange,
}: OrderWindowProps) {
  const [product, setProduct] = useState<ProductType>('MIS');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(ltp);
  const [triggerPrice, setTriggerPrice] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('Regular');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');

  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validity, setValidity] = useState<ValidityType>('DAY');
  const [disclosedQty, setDisclosedQty] = useState(0);
  const [orderTag, setOrderTag] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState(2);

  // Settings popover state
  const [showSettings, setShowSettings] = useState(false);

  // Loading & refresh state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingMargin, setIsRefreshingMargin] = useState(false);

  useEffect(() => {
    if (ltp > 0) {
      setPrice(Number(ltp.toFixed(2)));
    }
  }, [ltp, isOpen]);

  useEffect(() => {
    // Reset trigger price when order type changes
    if (orderType === 'MARKET') {
      setPrice(ltp);
    }
  }, [orderType, ltp]);

  if (!isOpen) return null;

  const isBuy = type === 'BUY';
  // Exact Zerodha Kite colors: #4184f3 for Buy, #ff5722 for Sell
  const themeColor = isBuy ? '#4184f3' : '#ff5722';
  const themeHover = isBuy ? '#3371dc' : '#ea4c19';

  // Margin calculation (approximate 5x leverage for MIS)
  const effectivePrice = orderType === 'MARKET' ? ltp : price;
  const marginRequired = product === 'MIS'
    ? (effectivePrice * qty) / 5
    : (effectivePrice * qty);

  const handlePlaceOrder = async () => {
    if (!brokerId) {
      toast.error("No active broker selected");
      return;
    }

    try {
      setIsSubmitting(true);
      const variety = activeTab === 'AMO' ? 'amo' : activeTab === 'Cover' ? 'co' : activeTab === 'Iceberg' ? 'iceberg' : 'regular';
      await brokerApi.placeOrder(brokerId, {
        symbol,
        exchange,
        side: type,
        product,
        orderType,
        qty: qty,
        price: orderType === 'MARKET' ? 0 : price,
        triggerPrice: orderType.startsWith('SL') ? triggerPrice : 0,
        variety,
        validity,
        disclosedQty,
        tag: orderTag || undefined,
      });

      toast.success(`${activeTab === 'AMO' ? 'AMO' : type} order placed for ${qty} ${symbol}`);
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
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
            className="fixed inset-0 z-0 bg-slate-950/60 backdrop-blur-xs pointer-events-auto"
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative z-10 pointer-events-auto w-full md:w-[480px] md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl border-t md:border border-slate-200 overflow-hidden font-sans select-none max-h-[92vh] flex flex-col mx-0 md:mx-4"
          >
            {/* ─── HEADER ─── */}
            <div
              className="px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col text-white transition-colors duration-200 shrink-0"
              style={{ backgroundColor: themeColor }}
            >
              {/* Mobile grab handle */}
              <div className="w-10 h-1 bg-white/40 rounded-full mx-auto mb-2 md:hidden" />

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm sm:text-[15px] uppercase tracking-wide truncate">
                      {isBuy ? "BUY" : "SELL"} {symbol}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 bg-white/20 rounded text-white">
                      x {qty}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-white/90 font-medium">
                    <label
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={() => setExchange("BSE")}
                    >
                      <div className={cn(
                        "h-2 w-2 rounded-full transition-all",
                        exchange === "BSE" ? "bg-white ring-2 ring-white/40" : "bg-white/40 border border-white/60"
                      )} />
                      <span className={exchange === "BSE" ? "font-bold text-white" : "text-white/80"}>
                        BSE ₹{ltp > 0 ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                      </span>
                    </label>

                    <label
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={() => setExchange("NSE")}
                    >
                      <div className={cn(
                        "h-2 w-2 rounded-full transition-all",
                        exchange === "NSE" ? "bg-white ring-2 ring-white/40" : "bg-white/40 border border-white/60"
                      )} />
                      <span className={exchange === "NSE" ? "font-bold text-white" : "text-white/80"}>
                        NSE ₹{ltp > 0 ? ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Toggle Switch (BUY / SELL) & Close Button */}
                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  <div
                    className="w-11 h-6 bg-white/30 rounded-full relative cursor-pointer p-0.5 transition-colors shadow-inner flex items-center"
                    title={`Switch to ${isBuy ? "SELL" : "BUY"}`}
                    onClick={() => onTypeChange?.(isBuy ? "SELL" : "BUY")}
                  >
                    <motion.div
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className={cn(
                        "h-5 w-5 bg-white rounded-full shadow-md",
                        isBuy ? "translate-x-0" : "translate-x-5"
                      )}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ─── TABS BAR ─── */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-2 overflow-x-auto no-scrollbar shrink-0">
              <div className="flex items-center">
                {(['Regular', 'Cover', 'AMO', 'Iceberg'] as TabType[]).map((tab) => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold cursor-pointer border-b-2 transition-all relative whitespace-nowrap",
                        isActive ? "text-[#333]" : "text-slate-500 hover:text-slate-800 border-transparent"
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
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
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
                      className="absolute right-0 top-8 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs space-y-2 text-slate-700"
                    >
                      <div className="flex items-center justify-between font-bold border-b pb-1 text-slate-800">
                        <span>Order Preferences</span>
                        <X className="h-3.5 w-3.5 cursor-pointer text-slate-400 hover:text-slate-600" onClick={() => setShowSettings(false)} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-400">Default Product</span>
                        <select
                          value={product}
                          onChange={(e) => setProduct(e.target.value as ProductType)}
                          className="w-full border rounded-lg px-2 py-1 bg-slate-50 text-xs"
                        >
                          <option value="MIS">Intraday (MIS)</option>
                          <option value="CNC">Longterm (CNC)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-400">Default Order Type</span>
                        <select
                          value={orderType}
                          onChange={(e) => setOrderType(e.target.value as OrderType)}
                          className="w-full border rounded-lg px-2 py-1 bg-slate-50 text-xs"
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
              <div className="flex items-center gap-6 sm:gap-8">
                {/* Intraday MIS */}
                <label
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setProduct('MIS')}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                      product === 'MIS' ? "border-transparent" : "border-slate-300 group-hover:border-slate-400"
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
                  <span className="text-xs sm:text-[13px] font-medium text-slate-800">
                    Intraday <span className="text-[10px] sm:text-[11px] text-slate-400 uppercase font-normal ml-0.5">MIS</span>
                  </span>
                </label>

                {/* Longterm CNC */}
                <label
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setProduct('CNC')}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                      product === 'CNC' ? "border-transparent" : "border-slate-300 group-hover:border-slate-400"
                    )}
                    style={{
                      borderColor: product === 'CNC' ? themeColor : undefined,
                      borderWidth: product === 'CNC' ? '2px' : '1px',
                    }}
                  >
                    {product === 'CNC' && (
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      />
                    )}
                  </div>
                  <span className="text-xs sm:text-[13px] font-medium text-slate-800">
                    Longterm <span className="text-[10px] sm:text-[11px] text-slate-400 uppercase font-normal ml-0.5">CNC</span>
                  </span>
                </label>
              </div>

              {/* ─── INPUT FIELDS GRID (3 COLUMNS) ─── */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {/* QTY FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    QTY.
                  </label>
                  <div className="relative flex items-center rounded-lg sm:rounded-xl bg-[#edf2f7] border border-slate-200/80 focus-within:bg-white focus-within:border-[#4184f3] focus-within:ring-1 focus-within:ring-[#4184f3]/20 transition-all h-9 sm:h-10 overflow-hidden">
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full h-full bg-transparent pl-2 sm:pl-3 pr-5 sm:pr-6 text-xs sm:text-[14px] font-bold text-slate-800 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {/* Stepper buttons (+ / -) */}
                    <div className="absolute right-0 top-0 bottom-0 w-5 sm:w-6 flex flex-col border-l border-slate-200/60 bg-slate-100/50">
                      <button
                        type="button"
                        onClick={() => setQty((prev) => prev + 1)}
                        className="flex-1 flex items-center justify-center text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
                      >
                        <Plus className="h-2 sm:h-2.5 w-2 sm:w-2.5" />
                      </button>
                      <div className="border-t border-slate-200/60" />
                      <button
                        type="button"
                        onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                        className="flex-1 flex items-center justify-center text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
                      >
                        <Minus className="h-2 sm:h-2.5 w-2 sm:w-2.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* PRICE FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    PRICE
                  </label>
                  <div className={cn(
                    "relative flex items-center rounded-lg sm:rounded-xl border transition-all h-9 sm:h-10 overflow-hidden",
                    orderType === 'MARKET'
                      ? "bg-[#f8f9fa] border-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-[#edf2f7] border-slate-200/80 focus-within:bg-white focus-within:border-[#4184f3] focus-within:ring-1 focus-within:ring-[#4184f3]/20"
                  )}>
                    <input
                      type="number"
                      step="0.05"
                      disabled={orderType === 'MARKET'}
                      value={orderType === 'MARKET' ? (ltp > 0 ? ltp : 0) : price}
                      onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                      className={cn(
                        "w-full h-full bg-transparent px-2 sm:px-3 text-xs sm:text-[14px] font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        orderType === 'MARKET' ? "text-slate-400 cursor-not-allowed" : "text-slate-800"
                      )}
                    />
                  </div>
                </div>

                {/* TRIGGER PRICE FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate block">
                    TRIGGER PRICE
                  </label>
                  <div className={cn(
                    "relative flex items-center rounded-lg sm:rounded-xl border transition-all h-9 sm:h-10 overflow-hidden",
                    !orderType.startsWith('SL')
                      ? "bg-[#f8f9fa] border-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-[#edf2f7] border-slate-200/80 focus-within:bg-white focus-within:border-[#4184f3] focus-within:ring-1 focus-within:ring-[#4184f3]/20"
                  )}>
                    <input
                      type="number"
                      step="0.05"
                      disabled={!orderType.startsWith('SL')}
                      value={orderType.startsWith('SL') ? triggerPrice : 0}
                      onChange={(e) => setTriggerPrice(parseFloat(e.target.value) || 0)}
                      className={cn(
                        "w-full h-full bg-transparent px-2 sm:px-3 text-xs sm:text-[14px] font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        !orderType.startsWith('SL') ? "text-slate-400 cursor-not-allowed" : "text-slate-800"
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* ─── ORDER TYPE RADIO SELECTOR ─── */}
              <div className="flex items-center flex-wrap gap-3 sm:gap-6 pt-1">
                {(['Market', 'Limit', 'SL', 'SL-M'] as const).map((t) => {
                  const isSelected = orderType === t.toUpperCase();
                  return (
                    <label
                      key={t}
                      className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group"
                      onClick={() => setOrderType(t.toUpperCase() as OrderType)}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                          isSelected ? "border-transparent" : "border-slate-300 group-hover:border-slate-400"
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
                        isSelected ? "text-slate-800 font-semibold" : "text-slate-600"
                      )}>
                        {t}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* ─── ADVANCED OPTIONS ACCORDION ─── */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-[11px] sm:text-[12px] font-semibold text-[#4184f3] hover:underline focus:outline-none"
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
                        <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase">
                          Validity
                        </label>
                        <div className="flex items-center gap-4">
                          {(['DAY', 'IOC', 'TTL'] as ValidityType[]).map((v) => (
                            <label
                              key={v}
                              className="flex items-center gap-1.5 cursor-pointer"
                              onClick={() => setValidity(v)}
                            >
                              <input
                                type="radio"
                                checked={validity === v}
                                onChange={() => setValidity(v)}
                                className="accent-[#4184f3]"
                              />
                              <span className="text-slate-700 font-medium text-xs">{v}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {validity === 'TTL' && (
                        <div className="space-y-1">
                          <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase">
                            TTL (Minutes)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            value={ttlMinutes}
                            onChange={(e) => setTtlMinutes(parseInt(e.target.value) || 1)}
                            className="h-8 text-xs bg-[#edf2f7] border-slate-200 w-28 rounded-lg"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase">
                            Disclosed Qty
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={disclosedQty}
                            onChange={(e) => setDisclosedQty(parseInt(e.target.value) || 0)}
                            className="h-8 text-xs bg-[#edf2f7] border-slate-200 rounded-lg"
                            placeholder="Optional"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase">
                            Order Tag
                          </label>
                          <Input
                            type="text"
                            value={orderTag}
                            onChange={(e) => setOrderTag(e.target.value)}
                            className="h-8 text-xs bg-[#edf2f7] border-slate-200 rounded-lg"
                            placeholder="e.g. Scalp1"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ─── FOOTER SECTION ─── */}
            <div className="bg-[#f9fafb] px-3.5 sm:px-5 py-3 sm:py-3.5 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
              {/* Left info column */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <span className="text-slate-500 font-normal truncate">Req:</span>
                  <span className="font-bold text-slate-800 whitespace-nowrap">
                    ₹{marginRequired.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshMargin}
                    className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none shrink-0"
                    title="Refresh Margin"
                  >
                    <RotateCcw className={cn("h-3 w-3", isRefreshingMargin && "animate-spin text-[#4184f3]")} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
                  <span className="text-slate-500 font-normal truncate">Avail:</span>
                  <span className="font-semibold text-slate-800 whitespace-nowrap">
                    ₹{availableMargin.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Right action buttons column */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="bg-white border border-slate-300 text-slate-700 font-semibold px-3 sm:px-5 h-8.5 sm:h-9 rounded-lg sm:rounded-xl text-xs hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={isSubmitting}
                  className="text-white font-bold px-5 sm:px-8 h-8.5 sm:h-9 rounded-lg sm:rounded-xl text-xs transition-all shadow-sm hover:brightness-105 active:scale-[0.98]"
                  style={{
                    backgroundColor: themeColor,
                  }}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Placing...
                    </span>
                  ) : (
                    isBuy ? 'Buy' : 'Sell'
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
