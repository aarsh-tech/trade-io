"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Strategy } from "./types";

// ─── Status helpers ──────────────────────────────────────────────────────────

export type RunStatus = "RUNNING" | "STOPPED" | "COMPLETED";

/** Running when the engine is on; otherwise Completed if the latest session finished cleanly, else Stopped. */
export function getRunStatus(s: Pick<Strategy, "isActive" | "executions">): RunStatus {
  if (s.isActive) return "RUNNING";
  const latest = [...(s.executions ?? [])].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  return latest?.status === "COMPLETED" ? "COMPLETED" : "STOPPED";
}

export function isInPosition(liveState: any): boolean {
  return Boolean(liveState?.entryTriggered) || liveState?.stateType === "ACTIVE_POSITION";
}

const TYPE_LABELS: Record<string, string> = {
  NIFTY_OPTIONS_SCALPER: "Nifty 10-Pt Scalper",
  STOCK_OPTIONS_BUYING: "Stock Options",
  GAMMA_BLAST_EXPIRY: "Daily Index Scalper",
  BREAKOUT_15MIN: "15-Min Breakout",
  EMA_VWAP_CROSSOVER: "15-EMA & VWAP",
  DAILY_SCALPER: "Daily Scalper",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

export function StatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const map = {
    RUNNING: { label: "Running", cls: "bg-profit-subtle text-profit border-profit/30" },
    STOPPED: { label: "Stopped", cls: "bg-muted text-muted-foreground border-border" },
    COMPLETED: { label: "Completed", cls: "bg-info-subtle text-info border-info/30" },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", map.cls, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "RUNNING" && "animate-pulse")} aria-hidden />
      {map.label}
    </span>
  );
}

/** LIVE is a solid, high-contrast chip so real-money strategies are never mistaken for paper ones. */
export function ModeBadge({ paper, className }: { paper: boolean; className?: string }) {
  return paper ? (
    <span className={cn("inline-flex items-center rounded-md border border-info/30 bg-info-subtle px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-info", className)}>
      Paper
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-warn px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-warn", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      Live
    </span>
  );
}

// ─── Layout bits ─────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden />;
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      <div className="mb-2 text-muted-foreground/60">{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Overflow menu (no dropdown primitive in the project) ────────────────────

export function OverflowMenu({ label = "More actions", children }: { label?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-input text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:w-10"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 min-w-[210px] rounded-lg border border-border bg-popover p-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px] font-medium transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50 md:min-h-9",
        danger ? "text-loss hover:bg-loss-subtle" : "text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
