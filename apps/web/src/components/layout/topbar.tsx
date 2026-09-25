"use client";

import { Bell, Zap, Menu, ShieldAlert, Key, Server, ShieldCheck, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useAuthStore } from "@/store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { openRiskDisclosure } from "@/components/shared/risk-disclosure-modal";
import { useBrokers } from "@/hooks/useBrokers";
import { BrokerSessionModal } from "@/components/layout/broker-session-modal";
import { useRiskStatus } from "@/hooks/useRiskStatus";
import { StatusBar } from "@/components/layout/status-bar";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { brokers } = useBrokers();
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const { data: risk } = useRiskStatus();
  const isKillActive = Boolean(risk?.killSwitchActive);

  const zerodhaAccount = brokers.find((b: any) => b.broker === "ZERODHA");
  const isKiteActive = Boolean(
    zerodhaAccount?.accessToken &&
    zerodhaAccount?.tokenExpiry &&
    new Date(zerodhaAccount.tokenExpiry).getTime() > Date.now()
  );

  return (
    <>
      <header className="h-14 sm:h-16 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-2.5 sm:px-6 sticky top-0 z-30 shrink-0 shadow-2xs gap-1.5 sm:gap-4 overflow-x-hidden">
        {/* Left: Mobile Brand & Page Indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
          <Link href="/dashboard" className="flex items-center gap-1.5 md:hidden shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 shadow-xs shrink-0">
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-sm sm:text-base bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 hidden min-[440px]:inline truncate">
              Tradeio.site
            </span>
          </Link>

          {/* SEBI Risk Disclosure Trigger Button */}
          <button
            type="button"
            onClick={openRiskDisclosure}
            title="View SEBI Risk Disclosures on Derivatives"
            className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1 rounded-full bg-amber-50/90 hover:bg-amber-100 border border-amber-200/80 text-amber-800 transition-colors text-[10px] sm:text-[11px] font-semibold cursor-pointer shadow-2xs group shrink-0 whitespace-nowrap"
          >
            <ShieldAlert className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-600 group-hover:scale-110 transition-transform shrink-0" />
            <span className="hidden sm:inline">Risk Disclosure</span>
            <span className="sm:hidden">Risk</span>
          </button>

          {/* Live RMS Status / Kill Switch Indicator */}
          {isKillActive ? (
            <Link
              href="/strategies"
              title="RMS Kill Switch is ACTIVE - Click to manage"
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-colors text-[10px] sm:text-[11px] font-bold cursor-pointer shadow-xs animate-pulse shrink-0 whitespace-nowrap"
            >
              <AlertOctagon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <span className="hidden sm:inline">KILL SWITCH ON</span>
              <span className="sm:hidden">KILL ON</span>
            </Link>
          ) : (
            <Link
              href="/strategies"
              title="RMS Risk Management System Active & Protected"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted hover:bg-border/80 border border-border text-foreground/75 transition-colors text-[10px] sm:text-[11px] font-medium shrink-0 whitespace-nowrap"
            >
              <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-600 shrink-0" />
              <span>RMS Active</span>
            </Link>
          )}
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Kite API Setup (Desktop) */}
          <button
            type="button"
            onClick={() => setShowBrokerModal(true)}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-muted/90 hover:bg-border/80 border border-border/80 text-foreground/75 transition-all cursor-pointer shadow-2xs group shrink-0 whitespace-nowrap"
            title="Zerodha Kite API Settings & App Setup"
          >
            <Server className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 group-hover:scale-110 transition-transform shrink-0" />
            <span>Kite API Setup</span>
          </button>

          {/* Zerodha Kite Quick Session & Daily Login Status Button */}
          <button
            type="button"
            onClick={() => setShowBrokerModal(true)}
            className={cn(
              "flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10.5px] sm:text-xs font-semibold transition-all cursor-pointer shadow-2xs shrink-0 whitespace-nowrap",
              isKiteActive
                ? "bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800"
                : "bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 animate-pulse"
            )}
            title="Zerodha Kite Session Status & Daily Login"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                isKiteActive ? "bg-emerald-500" : "bg-amber-500"
              )}
            />
            <span className="hidden sm:inline">
              {isKiteActive ? "Kite Active" : "Connect Kite"}
            </span>
            <span className="sm:hidden">
              {isKiteActive ? "Kite Active" : "Kite Login"}
            </span>
          </button>

          <ThemeToggle />

          <Link
            href="/settings"
            className="flex items-center gap-2 p-1 sm:p-1.5 rounded-lg hover:bg-muted/50 transition-colors group shrink-0"
          >
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs sm:text-sm font-bold text-foreground/75 group-hover:text-blue-600 transition-colors truncate max-w-[140px]">
                {user?.name || "User"}
              </span>
              {user?.role === "ADMIN" ? (
                <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                  Administrator
                </span>
              ) : (
                <span className="text-[9px] text-muted-foreground font-medium">Standard Account</span>
              )}
            </div>
            <div
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shadow-2xs transition-all shrink-0",
                user?.role === "ADMIN"
                  ? "bg-purple-50 border border-purple-300 text-purple-700 group-hover:bg-purple-600 group-hover:text-white"
                  : "bg-blue-50 border border-blue-200/80 text-blue-600 group-hover:bg-blue-600 group-hover:text-white"
              )}
            >
              {user?.name?.charAt(0) || "U"}
            </div>
          </Link>
        </div>
      </header>

      <StatusBar onReconnect={() => setShowBrokerModal(true)} />

      {/* Kite Session & Developer Console Settings Modal */}
      <BrokerSessionModal
        open={showBrokerModal}
        onOpenChange={setShowBrokerModal}
      />
    </>
  );
}
