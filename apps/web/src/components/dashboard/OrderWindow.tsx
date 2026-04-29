"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Info, Settings, ChevronDown, RotateCcw, Plus } from "lucide-react";
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

export function OrderWindow({ isOpen, onClose, symbol, type, ltp, availableMargin, brokerId, onTypeChange }: OrderWindowProps) {
  const [product, setProduct] = useState<'MIS' | 'CNC'>('MIS');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL' | 'SL-M'>('LIMIT');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(ltp);
  const [triggerPrice, setTriggerPrice] = useState(0);
  const [activeTab, setActiveTab] = useState('Regular');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');

  useEffect(() => {
    setPrice(ltp);
  }, [ltp, isOpen]);

  if (!isOpen) return null;

  const isBuy = type === 'BUY';
  const themeColor = isBuy ? '#448aff' : '#ff5722';

  const marginRequired = product === 'MIS'
    ? ((orderType === 'MARKET' ? ltp : price) * qty) / 5
    : ((orderType === 'MARKET' ? ltp : price) * qty);

  const handlePlaceOrder = async () => {
    if (!brokerId) {
      toast.error("No active broker selected");
      return;
    }
    try {
      setIsSubmitting(true);
      await brokerApi.placeOrder(brokerId, {
        symbol,
        exchange,
        side: type,
        product,
        orderType,
        qty: qty,
        price: orderType === 'MARKET' ? 0 : price,
        triggerPrice: orderType.startsWith('SL') ? triggerPrice : 0,
      });
      toast.success(`Order placed for ${qty} ${symbol}`);
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed z-[100] w-[450px] bg-white rounded-md shadow-2xl border border-slate-200 overflow-hidden font-sans select-none"
        style={{ left: '40%', top: '25%' }}
      >
        {/* Header */}
        <div
          className={cn(
            "px-4 py-3 flex items-center justify-between text-white",
            isBuy ? "bg-[#448aff]" : "bg-[#ff5722]"
          )}
        >
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm uppercase">{isBuy ? 'Buy' : 'Sell'} {symbol}</span>
              <span className="text-[10px] font-medium px-1 bg-white/20 rounded-sm">x {qty}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] mt-1 text-white/90">
              <div
                className={cn("flex items-center gap-1 cursor-pointer transition-opacity", exchange === 'BSE' ? "opacity-100 font-bold" : "opacity-60")}
                onClick={() => setExchange('BSE')}
              >
                <div className={cn("h-1.5 w-1.5 rounded-full", exchange === 'BSE' ? "bg-white" : "bg-white/40")} />
                <span>BSE ₹{ltp.toLocaleString('en-IN')}</span>
              </div>
              <div
                className={cn("flex items-center gap-1 cursor-pointer transition-opacity", exchange === 'NSE' ? "opacity-100 font-bold" : "opacity-60")}
                onClick={() => setExchange('NSE')}
              >
                <div className={cn("h-1.5 w-1.5 rounded-full", exchange === 'NSE' ? "bg-white" : "bg-white/40")} />
                <span>NSE ₹{ltp.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-5 w-9 bg-white/20 rounded-full relative cursor-pointer shadow-inner"
              onClick={() => onTypeChange?.(isBuy ? 'SELL' : 'BUY')}
            >
              <div className={cn(
                "absolute top-0.5 h-4 w-4 bg-white rounded-full transition-all duration-200 shadow-sm",
                isBuy ? "left-0.5" : "left-[18px]"
              )} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          {['Regular', 'Cover', 'AMO', 'Iceberg'].map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2.5 text-[11px] font-bold cursor-pointer border-b-2 transition-colors",
                activeTab === tab ? "border-[#448aff] text-[#448aff]" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
              style={{ borderBottomColor: activeTab === tab ? themeColor : 'transparent', color: activeTab === tab ? themeColor : undefined }}
            >
              {tab}
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex items-center px-4 text-slate-300">
            <Settings className="h-3.5 w-3.5 hover:text-slate-500 cursor-pointer" />
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6">
          {/* Product Selector */}
          <div className="flex items-center gap-8">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={cn(
                "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                product === 'MIS' ? "border-[#448aff]" : "border-slate-300 group-hover:border-slate-400"
              )} style={{ borderColor: product === 'MIS' ? themeColor : undefined }}>
                {product === 'MIS' && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
              </div>
              <input type="radio" className="hidden" checked={product === 'MIS'} onChange={() => setProduct('MIS')} />
              <span className={cn("text-[12px] font-medium", product === 'MIS' ? "text-slate-700" : "text-slate-500")}>Intraday <span className="text-[10px] text-slate-400 uppercase ml-1">MIS</span></span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={cn(
                "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                product === 'CNC' ? "border-[#448aff]" : "border-slate-300 group-hover:border-slate-400"
              )} style={{ borderColor: product === 'CNC' ? themeColor : undefined }}>
                {product === 'CNC' && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
              </div>
              <input type="radio" className="hidden" checked={product === 'CNC'} onChange={() => setProduct('CNC')} />
              <span className={cn("text-[12px] font-medium", product === 'CNC' ? "text-slate-700" : "text-slate-500")}>Longterm <span className="text-[10px] text-slate-400 uppercase ml-1">CNC</span></span>
            </label>
          </div>

          {/* Inputs Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Qty.</label>
              <div className="relative group">
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="h-10 text-[13px] font-bold focus-visible:ring-1 focus-visible:ring-slate-200 border-slate-200 pr-8"
                />
                <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-slate-200 overflow-hidden rounded-r-md">
                  <div
                    className="flex-1 px-1.5 hover:bg-slate-50 cursor-pointer flex items-center justify-center select-none"
                    onClick={() => setQty(prev => prev + 1)}
                  >
                    <Plus className="h-2 w-2" />
                  </div>
                  <div
                    className="flex-1 px-1.5 border-t border-slate-200 hover:bg-slate-50 cursor-pointer flex items-center justify-center select-none"
                    onClick={() => setQty(prev => Math.max(1, prev - 1))}
                  >
                    -
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Price</label>
              <Input
                type="number"
                step="0.05"
                value={price}
                disabled={orderType === 'MARKET'}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="h-10 text-[13px] font-bold focus-visible:ring-1 focus-visible:ring-slate-200 border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Trigger price</label>
              <Input
                type="number"
                step="0.05"
                value={triggerPrice}
                disabled={!orderType.startsWith('SL')}
                onChange={(e) => setTriggerPrice(Number(e.target.value))}
                className="h-10 text-[13px] font-bold focus-visible:ring-1 focus-visible:ring-slate-200 border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
              />
            </div>
          </div>

          {/* Order Type Selector */}
          <div className="flex items-center gap-6">
            {['Market', 'Limit', 'SL', 'SL-M'].map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer group">
                <div className={cn(
                  "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                  orderType.toUpperCase() === t.toUpperCase() ? "border-[#448aff]" : "border-slate-300 group-hover:border-slate-400"
                )} style={{ borderColor: orderType.toUpperCase() === t.toUpperCase() ? themeColor : undefined }}>
                  {orderType.toUpperCase() === t.toUpperCase() && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
                </div>
                <input type="radio" className="hidden" checked={orderType.toUpperCase() === t.toUpperCase()} onChange={() => setOrderType(t.toUpperCase() as any)} />
                <span className={cn("text-[12px] font-medium", orderType.toUpperCase() === t.toUpperCase() ? "text-slate-700" : "text-slate-500")}>{t}</span>
              </label>
            ))}
          </div>
        </div>

        {/* More Options Link */}
        <div className="px-6 py-2 flex items-center justify-between text-[11px] text-blue-500 font-bold hover:underline cursor-pointer group">
          <div className="flex items-center gap-1">
            Advanced options <ChevronDown className="h-3 w-3 group-hover:translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-100">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-slate-400">Margin required</span>
              <span className="font-bold text-slate-700">₹{marginRequired.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              <RotateCcw className="h-3 w-3 text-slate-300 cursor-pointer hover:text-slate-500" />
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-400">Available</span>
              <span className="font-bold text-slate-700">₹{availableMargin.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              <span className="text-blue-500 hover:underline cursor-pointer">Add funds</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              className="bg-white border border-slate-200 text-slate-600 font-bold px-6 h-10 hover:bg-slate-50 hover:border-slate-300"
            >
              Cancel
            </Button>
            <Button
              className={cn(
                "text-white font-bold px-8 h-10",
                isBuy ? "bg-[#448aff] hover:bg-[#3d7ae6]" : "bg-[#ff5722] hover:bg-[#f4511e]"
              )}
              style={{ backgroundColor: themeColor }}
              onClick={handlePlaceOrder}
              disabled={isSubmitting}
            >
              {isSubmitting ? '...' : (isBuy ? 'Buy' : 'Sell')}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
