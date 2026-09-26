"use client";

import { Zap, ShieldAlert, Server, ShieldCheck, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { openRiskDisclosure } from "@/components/shared/risk-disclosure-modal";
import { useBrokers } from "@/hooks/useBrokers";
import { BrokerSessionModal } from "@/components/layout/broker-session-modal";
import { useRiskStatus } from "@/hooks/useRiskStatus";
import { StatusBar } from "@/components/layout/status-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { pageTitleFor } from "@/components/layout/nav-config";

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { brokers } = useBrokers();
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const { data: risk } = useRiskStatus();
  const isKillActive = Boolean(risk?.killSwitchActive);
  const title = pageTitleFor(pathname);

  const zerodhaAccount = brokers.find((b: any) => b.broker === "ZERODHA");
  const isKiteActive = Boolean(
    zerodhaAccount?.accessToken &&
    zerodhaAccount?.tokenExpiry &&
    new Date(zerodhaAccount.tokenExpiry).getTime() > Date.now()
  );

  return (
    <>
      <header className="h-[52px] md:h-12 bg-popover border-b border-border flex items-center justify-between gap-2 px-3 sm:px-5 sticky top-0 z-30 shrink-0">
        {/* Left: brand on mobile, page title on desktop */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden shrink-0" aria-label="Tradeio home">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Zap className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="font-semibold text-sm tracking-tight text-foreground truncate">
              {title || "Tradeio"}
            </span>
          </Link>
          {title && (
            <span className="hidden md:block text-[15px] font-semibold text-foreground truncate">{title}</span>
          )}

          {isKillActive ? (
            <Link
              href="/strategies"
              title="RMS kill switch is ACTIVE. Click to manage."
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-loss text-on-loss text-[11px] font-semibold whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
            >
              <AlertOctagon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Kill switch ON</span>
              <span className="sm:hidden">Kill ON</span>
            </Link>
          ) : (
            <Link
              href="/strategies"
              title="Risk management system is active"
              className="hidden lg:flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted whitespace-nowrap shrink-0 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-profit shrink-0" aria-hidden />
              RMS active
            </Link>
          )}
        </div>

        {/* Right: broker session, setup, disclosure, theme, profile */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowBrokerModal(true)}
            title="Zerodha Kite session status and daily login"
            className={cn(
              "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
              isKiteActive
                ? "border-profit/35 bg-profit-subtle text-profit hover:bg-profit-subtle/70"
                : "border-warn/40 bg-warn-subtle text-warn hover:bg-warn-subtle/70"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isKiteActive ? "bg-profit" : "bg-warn animate-pulse")} aria-hidden />
            {isKiteActive ? "Kite connected" : <><span className="hidden sm:inline">Connect Kite</span><span className="sm:hidden">Kite login</span></>}
          </button>

          <button
            type="button"
            onClick={() => setShowBrokerModal(true)}
            title="Zerodha Kite API settings and app setup"
            className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap cursor-pointer"
          >
            <Server className="h-3.5 w-3.5 shrink-0" aria-hidden />
            API setup
          </button>

          {/* Desktop keeps the disclosure in the sidebar; mobile has no sidebar, so show it here. */}
          <button
            type="button"
            onClick={openRiskDisclosure}
            aria-label="SEBI risk disclosure"
            title="SEBI risk disclosure on derivatives"
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-warn hover:bg-muted transition-colors cursor-pointer"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden />
          </button>

          <ThemeToggle />

          <Link
            href="/settings"
            aria-label="Account settings"
            title={user?.name || "Account"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors shrink-0 ml-0.5",
              user?.role === "ADMIN"
                ? "bg-accent text-accent-foreground ring-1 ring-primary/40 hover:bg-accent/80"
                : "bg-accent text-accent-foreground hover:bg-accent/80"
            )}
          >
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </Link>
        </div>
      </header>

      <StatusBar onReconnect={() => setShowBrokerModal(true)} />

      <BrokerSessionModal open={showBrokerModal} onOpenChange={setShowBrokerModal} />
    </>
  );
}
