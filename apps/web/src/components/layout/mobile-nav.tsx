"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronRight, LogOut, Menu, Moon, ShieldAlert, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import { authApi } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { openRiskDisclosure } from "@/components/shared/risk-disclosure-modal";
import {
  ADMIN_NAV,
  ALL_NAV_ITEMS,
  MOBILE_PRIMARY_HREFS,
  NAV_GROUPS,
  isActivePath,
} from "@/components/layout/nav-config";

const primaryNav = MOBILE_PRIMARY_HREFS.map((href) => ALL_NAV_ITEMS.find((i) => i.href === href)!);

function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? resolvedTheme : undefined;

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
      {([
        { value: "light", label: "Light", icon: Sun },
        { value: "dark", label: "Dark", icon: Moon },
      ] as const).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex items-center justify-center gap-1.5 h-8 rounded text-xs font-medium transition-colors cursor-pointer",
            current === value ? "bg-card text-foreground " : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isSecondaryActive = !primaryNav.some((item) => isActivePath(pathname, item.href));

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {}
    clearAuth();
    router.replace("/login");
    toast.success("Logged out successfully");
  }

  const tabClass = (active: boolean) =>
    cn(
      "relative flex flex-col items-center justify-center gap-0.5 h-full text-[11px] font-medium select-none transition-colors",
      active ? "text-accent-foreground" : "text-muted-foreground active:text-foreground"
    );

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 inset-x-0 z-40 bg-popover border-t border-border md:hidden pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="grid grid-cols-5 h-14 max-w-lg mx-auto">
          {primaryNav.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setDrawerOpen(false)}
                className={tabClass(active)}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-b bg-primary" aria-hidden />}
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.8} aria-hidden />
                <span className="truncate max-w-[64px]">{label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            aria-expanded={drawerOpen}
            aria-controls="mobile-more-sheet"
            className={tabClass(isSecondaryActive || drawerOpen)}
          >
            {(isSecondaryActive || drawerOpen) && <span className="absolute top-0 h-0.5 w-8 rounded-b bg-primary" aria-hidden />}
            {drawerOpen ? <X className="h-5 w-5" strokeWidth={2.25} aria-hidden /> : <Menu className="h-5 w-5" strokeWidth={1.8} aria-hidden />}
            <span>{drawerOpen ? "Close" : "More"}</span>
          </button>
        </div>
      </nav>

      {/* "More" bottom sheet */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-scrim/40 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div
            id="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-lg border-t border-border shadow-2xl max-h-[85vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)] animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-border" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-sm font-semibold text-foreground">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4">
              {user && (
                <Link
                  href="/settings"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted transition-colors"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                    {user.name?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate">{user.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{user.email}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                </Link>
              )}

              {[...NAV_GROUPS, ...(user?.role === "ADMIN" ? [{ title: "Administration", items: ADMIN_NAV }] : [])].map((group) => {
                const items = group.items.filter((i) => !MOBILE_PRIMARY_HREFS.includes(i.href));
                if (items.length === 0) return null;
                return (
                  <div key={group.title}>
                    <p className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>
                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                      {items.map(({ href, label, icon: Icon, live }) => {
                        const active = isActivePath(pathname, href);
                        return (
                          <Link
                            key={href}
                            href={href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setDrawerOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 h-11 text-sm transition-colors",
                              active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"
                            )}
                          >
                            <Icon className={cn("h-4 w-4 shrink-0", !active && "text-muted-foreground")} aria-hidden />
                            <span className="flex-1 truncate">{label}</span>
                            {live && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-profit">
                                <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden />
                                Live
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" aria-hidden />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div>
                <p className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Appearance</p>
                <ThemeSwitch />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    openRiskDisclosure();
                  }}
                  className="flex items-center justify-center gap-2 h-10 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted"
                >
                  <ShieldAlert className="h-4 w-4 text-warn" aria-hidden />
                  Risk disclosure
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setShowLogoutConfirm(true);
                  }}
                  className="flex items-center justify-center gap-2 h-10 rounded-md border border-loss/30 text-xs font-medium text-loss hover:bg-loss/10"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        onConfirm={handleLogout}
        title="Confirm Logout"
        description="Are you sure you want to log out of your Tradeio.site account?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
