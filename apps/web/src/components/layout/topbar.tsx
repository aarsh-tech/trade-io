"use client";

import { Bell, Zap, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useAuthStore } from "@/store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  return (
    <header className="h-14 sm:h-16 bg-white/95 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-3.5 sm:px-6 sticky top-0 z-30 shrink-0 shadow-2xs">
      {/* Left: Mobile Brand & Page Indicator */}
      <div className="flex items-center gap-2.5">
        <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 shadow-xs">
            <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-base bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500">
            TradeIO
          </span>
        </Link>

        {/* Live status badge */}
        <div className="flex items-center px-2 py-1 sm:px-2.5 sm:py-1 rounded-full bg-emerald-50 border border-emerald-200/60 gap-1.5">
          <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Live
          </span>
        </div>
      </div>

      {/* Right: User Profile & Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 p-1 sm:p-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
        >
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs sm:text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors truncate max-w-[140px]">
              {user?.name || "User"}
            </span>
            <span className="text-[9px] text-slate-400 font-medium">Standard Account</span>
          </div>
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 font-bold text-xs sm:text-sm shadow-2xs group-hover:bg-blue-600 group-hover:text-white transition-all">
            {user?.name?.charAt(0) || "U"}
          </div>
        </Link>
      </div>
    </header>
  );
}
