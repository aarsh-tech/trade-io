"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  ClipboardList,
  TrendingUp,
  Menu,
  X,
  Zap,
  ScanSearch,
  Layers,
  Wallet,
  BookOpen,
  Plug,
  Settings,
  LogOut,
  ChevronRight,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import { authApi } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/positions", label: "Positions", icon: Activity },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/strategies", label: "Strategies", icon: TrendingUp },
];

const secondaryNav = [
  { href: "/live-screener", label: "Live OHL Screener", icon: ScanSearch, badge: "LIVE" },
  { href: "/swing-scanner", label: "Swing Scanner", icon: Layers },
  { href: "/intraday-picks", label: "Intraday Picks", icon: Zap },
  { href: "/portfolio", label: "Portfolio & Margins", icon: Wallet },
  { href: "/ledger", label: "P&L Ledger", icon: BookOpen },
  { href: "/brokers", label: "Connected Brokers", icon: Plug },
  { href: "/settings", label: "Settings & Security", icon: Settings },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Check if current route is in secondary nav
  const isSecondaryActive = secondaryNav.some((item) => pathname.startsWith(item.href));

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {}
    clearAuth();
    router.replace("/login");
    toast.success("Logged out successfully");
  }

  return (
    <>
      {/* ─── 1. Fixed Bottom Navigation Bar ─── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto items-center px-1">
          {primaryNav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "flex flex-col items-center justify-center h-full py-1 gap-1 text-[10px] font-semibold transition-all relative select-none",
                  active
                    ? "text-blue-600 font-bold"
                    : "text-slate-500 hover:text-slate-900 active:scale-95"
                )}
              >
                {active && (
                  <span className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-full shadow-[0_2px_6px_rgba(37,99,235,0.4)]" />
                )}
                <div className={cn(
                  "p-1 rounded-lg transition-transform",
                  active && "scale-110"
                )}>
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                </div>
                <span className="truncate max-w-[64px] tracking-tight">{label}</span>
              </Link>
            );
          })}

          {/* 5th Tab: Menu / More Drawer Trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={cn(
              "flex flex-col items-center justify-center h-full py-1 gap-1 text-[10px] font-semibold transition-all relative select-none",
              isSecondaryActive || drawerOpen
                ? "text-blue-600 font-bold"
                : "text-slate-500 hover:text-slate-900 active:scale-95"
            )}
          >
            {(isSecondaryActive || drawerOpen) && (
              <span className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-full shadow-[0_2px_6px_rgba(37,99,235,0.4)]" />
            )}
            <div className={cn(
              "p-1 rounded-lg transition-transform",
              (isSecondaryActive || drawerOpen) && "scale-110"
            )}>
              {drawerOpen ? (
                <X className="h-5 w-5 text-blue-600" strokeWidth={2.4} />
              ) : (
                <Menu className="h-5 w-5" strokeWidth={isSecondaryActive ? 2.4 : 1.8} />
              )}
            </div>
            <span className="truncate max-w-[64px] tracking-tight">
              {drawerOpen ? "Close" : "More"}
            </span>
          </button>
        </div>
      </nav>

      {/* ─── 2. Slide-up "More" Drawer for Secondary Links ─── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs md:hidden transition-opacity"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="fixed inset-x-0 bottom-16 z-50 bg-white rounded-t-2xl border-t border-slate-200 shadow-2xl max-h-[75vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Handle & Header */}
            <div className="pt-3 pb-2 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-xs">
                  <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <span className="font-bold text-sm text-slate-900">TradeIO Hub</span>
                  <p className="text-[10px] text-slate-400 font-medium">All Tools & Features</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* User Profile Mini Card */}
            {user && (
              <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100/50 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                    {user.name?.charAt(0) || "U"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{user.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                  </div>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setDrawerOpen(false)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-white px-2.5 py-1 rounded-md border border-blue-200 shadow-2xs shrink-0"
                >
                  Profile
                </Link>
              </div>
            )}

            {/* Links Grid */}
            <div className="p-3 overflow-y-auto space-y-1 divide-y divide-slate-50 flex-1">
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {secondaryNav.map(({ href, label, icon: Icon, badge }: any) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold transition-all border",
                        active
                          ? "bg-blue-600/10 text-blue-600 border-blue-600/20 shadow-2xs"
                          : "bg-slate-50/60 text-slate-700 hover:bg-slate-100 border-slate-100/80 active:scale-98"
                      )}
                    >
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        active ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200/60"
                      )}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate flex-1">{label}</span>
                      {badge && (
                        <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Logout Row */}
              <div className="pt-3 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setShowLogoutConfirm(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout from Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        onConfirm={handleLogout}
        title="Confirm Logout"
        description="Are you sure you want to log out of your TradeIO account?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
