"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { MobileBottomNav } from "@/components/layout/mobile-nav";
import { AuthGuard } from "@/components/auth-guard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-slate-50/50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <TopBar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 md:p-6 pb-24 md:pb-6">
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
