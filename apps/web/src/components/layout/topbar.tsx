"use client";

import { Bell, Zap, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useAuthStore } from "@/store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/v1', '') || "http://localhost:3002";

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { toggleSidebar } = useUIStore();

  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">System Live</span>
        </div>

        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        <div className="h-8 w-px bg-slate-100 mx-2" />

        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-slate-700">{user?.name}</span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Pro Account</span>
          </div>
          <div className="h-9 w-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shadow-sm group-hover:bg-blue-100 transition-colors">
            {user?.name.charAt(0)}
          </div>
        </div>
      </div>
    </header>
  );
}
