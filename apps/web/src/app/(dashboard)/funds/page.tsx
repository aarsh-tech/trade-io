"use client";

import { Wallet } from "lucide-react";

export default function FundsPage() {
  return (
    <div className="p-12 max-w-4xl mx-auto">
      <h1 className="text-2xl font-normal text-slate-800 mb-8">Funds</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 border-t border-slate-100 pt-8">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet className="h-4 w-4" />
            <h3 className="text-[18px] font-normal">Equity</h3>
          </div>
          <div className="space-y-4 pt-4">
            <div className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-sm text-slate-500">Available margin</span>
              <span className="text-xl font-normal text-slate-800">₹1,65,800.00</span>
            </div>
            <div className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-sm text-slate-500">Used margin</span>
              <span className="text-xl font-normal text-slate-800">₹0.00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
