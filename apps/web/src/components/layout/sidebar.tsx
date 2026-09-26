"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, LogOut, ShieldAlert, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useAuthStore } from "@/store";
import { authApi } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { openRiskDisclosure } from "@/components/shared/risk-disclosure-modal";
import { ADMIN_NAV, NAV_GROUPS, isActivePath, type NavItem } from "@/components/layout/nav-config";

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const { href, label, icon: Icon, live } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-2.5 h-9 text-[13px] font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" aria-hidden />}
      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 1.9} aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && live && (
        <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-profit">
          <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden />
          Live
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user, clearAuth } = useAuthStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch { }
    clearAuth();
    router.replace("/login");
    toast.success("Logged out successfully");
  }

  return (
    <>
      <aside
        aria-label="Main navigation"
        className={cn(
          "hidden md:flex flex-col h-screen bg-popover border-r border-border transition-[width] duration-200 ease-out relative shrink-0",
          sidebarCollapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Brand */}
        <div className={cn("flex items-center h-12 border-b border-border shrink-0", sidebarCollapsed ? "justify-center" : "px-4")}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" aria-label="Tradeio home">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary shrink-0">
              <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} aria-hidden />
            </span>
            {!sidebarCollapsed && (
              <span className="font-semibold text-[15px] tracking-tight text-foreground truncate">
                Tradeio<span className="text-muted-foreground font-normal">.site</span>
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 overflow-y-auto py-3", sidebarCollapsed ? "px-2" : "px-3")}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title} className={cn(gi > 0 && "mt-4")}>
              {sidebarCollapsed ? (
                gi > 0 && <div className="mx-2 mb-3 border-t border-border" aria-hidden />
              ) : (
                <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} collapsed={sidebarCollapsed} />
                ))}
              </div>
            </div>
          ))}

          {user?.role === "ADMIN" && (
            <div className="mt-4">
              {sidebarCollapsed ? (
                <div className="mx-2 mb-3 border-t border-border" aria-hidden />
              ) : (
                <p className="px-2.5 mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-info">
                  Administration
                </p>
              )}
              <div className="space-y-0.5">
                {ADMIN_NAV.map((item) => (
                  <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} collapsed={sidebarCollapsed} />
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Footer: account, disclosure, logout, collapse */}
        <div className={cn("border-t border-border py-2.5 space-y-0.5 shrink-0", sidebarCollapsed ? "px-2" : "px-3")}>
          {!sidebarCollapsed && user && (
            <Link href="/settings" className="flex items-center gap-2.5 rounded-md px-2 py-2 mb-1 hover:bg-muted transition-colors">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-foreground truncate">{user.name}</span>
                  {user.role === "ADMIN" && (
                    <span className="text-[9px] font-semibold px-1 py-px rounded bg-accent text-accent-foreground shrink-0">ADMIN</span>
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">{user.email}</span>
              </span>
            </Link>
          )}

          <button
            type="button"
            onClick={openRiskDisclosure}
            title={sidebarCollapsed ? "SEBI Risk Disclosure" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2.5 h-9 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer",
              sidebarCollapsed && "justify-center px-0"
            )}
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-warn" aria-hidden />
            {!sidebarCollapsed && <span>Risk Disclosure</span>}
          </button>

          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            title={sidebarCollapsed ? "Logout" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2.5 h-9 text-[13px] font-medium text-muted-foreground hover:bg-loss/10 hover:text-loss transition-colors cursor-pointer",
              sidebarCollapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2.5 h-9 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer",
              sidebarCollapsed && "justify-center px-0"
            )}
          >
            <ChevronsLeft className={cn("h-4 w-4 shrink-0 transition-transform", sidebarCollapsed && "rotate-180")} aria-hidden />
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        onConfirm={handleLogout}
        title="Confirm Logout"
        description="Are you sure you want to logout?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
