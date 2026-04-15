"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  FlaskConical,
  Plug,
  ClipboardList,
  Settings,
  ChevronLeft,
  Zap,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useAuthStore } from "@/store";
import { authApi } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/strategies",  label: "Strategies",  icon: TrendingUp },
  { href: "/backtest",    label: "Backtest",    icon: FlaskConical },
  { href: "/brokers",     label: "Brokers",     icon: Plug },
  { href: "/orders",      label: "Orders",      icon: ClipboardList },
  { href: "/settings",    label: "Settings",    icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user, clearAuth } = useAuthStore();

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
      {/* Mobile backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity md:hidden",
          sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
        onClick={toggleSidebar}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col h-screen bg-white border-r border-slate-200 transition-all duration-300 ease-in-out w-64 md:relative md:translate-x-0",
          sidebarCollapsed ? "-translate-x-full md:w-16" : "translate-x-0"
        )}
      >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200">
        {!sidebarCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-md">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">AlgoTrade</span>
          </Link>
        )}
        {sidebarCollapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 mx-auto shadow-sm">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            "p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all hidden md:block",
            sidebarCollapsed && "absolute -right-3 top-5 bg-white border border-slate-200 shadow-md"
          )}
        >
          <ChevronLeft
            className={cn("h-4 w-4 transition-transform duration-300", sidebarCollapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active
                  ? "bg-blue-50 text-blue-600 border border-blue-100 shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent",
                sidebarCollapsed && "justify-center px-0"
              )}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active && "text-blue-600")}
              />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="px-3 py-4 border-t border-slate-200">
        {!sidebarCollapsed && user && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all",
            sidebarCollapsed && "justify-center px-0"
          )}
          title={sidebarCollapsed ? "Logout" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
