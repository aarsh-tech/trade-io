"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";

interface QueryErrorProps {
  error: unknown;
  onRetry?: () => void;
  /** What failed to load, e.g. "orders". */
  what: string;
  /** True while a retry is in flight. */
  retrying?: boolean;
}

/** Inline failure panel for a data section: says what failed, why, and offers a retry. */
export function QueryError({ error, onRetry, what, retrying }: QueryErrorProps) {
  return (
    <div role="alert" className="py-14 px-4 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-loss/10 flex items-center justify-center mb-3">
        <AlertTriangle className="h-6 w-6 text-loss" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-foreground">Could not load {what}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
        {apiErrorMessage(error, "Check your connection and broker session, then try again.")}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying} className="mt-4 gap-1.5">
          <RefreshCcw className={retrying ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}
