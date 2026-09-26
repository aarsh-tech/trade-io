"use client";

import Link from "next/link";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BrokerAccount } from "../new/types";

/** Broker account choice as radio cards, with loading / empty / error states. */
export function BrokerPicker({
  brokers,
  loading,
  error,
  value,
  onChange,
  onRetry,
}: {
  brokers: BrokerAccount[];
  loading?: boolean;
  error?: boolean;
  value: string;
  onChange: (id: string) => void;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-sunken p-4 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading broker accounts...
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-loss/30 bg-loss-subtle p-3 text-xs text-loss">
        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Could not load broker accounts.</span>
        {onRetry && <button type="button" onClick={onRetry} className="min-h-9 rounded-md px-3 font-semibold text-foreground hover:bg-muted">Retry</button>}
      </div>
    );
  }
  if (brokers.length === 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-subtle p-3 text-xs text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <span>
          No broker account connected. Paper trading works without one; to trade live,{" "}
          <Link href="/brokers" className="font-semibold text-primary underline underline-offset-2">connect a broker</Link> first.
        </span>
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label="Broker account" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {brokers.map((b) => {
        const selected = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(b.id)}
            className={cn(
              "flex min-h-14 items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary bg-brand-subtle ring-1 ring-primary/40" : "border-border bg-card hover:border-primary/50 hover:bg-muted",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold uppercase text-foreground">{b.broker}</span>
              <span className="block truncate text-xs text-muted-foreground">Client ID {b.clientId || "n/a"}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge variant={b.isActive ? "success" : "destructive"} className="text-[10px]">{b.isActive ? "Connected" : "Inactive"}</Badge>
              {selected && <Check className="h-4 w-4 text-primary" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
