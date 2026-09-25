"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { MobileBottomNav } from "@/components/layout/mobile-nav";
import { AuthGuard } from "@/components/auth-guard";
import { MarketSocketProvider } from "@/components/market-socket-provider";
import { RiskDisclosureModal } from "@/components/shared/risk-disclosure-modal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <MarketSocketProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[2000] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden bg-muted/25">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <TopBar />
          <OfflineBanner />
          <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 md:p-6 pb-24 md:pb-6">
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
      <RiskDisclosureModal />
      </MarketSocketProvider>
    </AuthGuard>
  );
}
