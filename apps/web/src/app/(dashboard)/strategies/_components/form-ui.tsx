"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Labelled group of fields inside a card. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface FieldA11y {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/** Label + control + helper text + inline error, wired together for screen readers. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: (a11y: FieldA11y) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const describedBy = error || hint ? descId : undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-foreground">
        {label}
        {required && <span className="text-loss" aria-hidden> *</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={descId} role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-medium text-loss">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={descId} className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Numeric input with optional unit prefix/suffix. Keeps the value a string, like the rest of the form. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  prefix,
  suffix,
  min,
  step,
  decimal,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string | null;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number | string;
  decimal?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a11y) => (
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>
          )}
          <Input
            {...a11y}
            type="number"
            inputMode={decimal ? "decimal" : "numeric"}
            min={min}
            step={step ?? (decimal ? "any" : 1)}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "font-semibold tabular-nums",
              prefix && "pl-7",
              suffix && "pr-14",
              error && "border-loss focus:border-loss focus:ring-loss/30",
            )}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
          )}
        </div>
      )}
    </Field>
  );
}

/** Progressive disclosure: collapsed by default so the basic path stays short. */
export function Advanced({
  title = "Advanced options",
  description = "Defaults are already tuned. Open only if you want to fine-tune.",
  defaultOpen = false,
  children,
}: {
  title?: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={id} className="space-y-4 border-t border-border p-4">
          {children}
        </div>
      )}
    </div>
  );
}

/** Key/value row used by summaries. */
export function SummaryRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <dl className={cn("flex items-baseline justify-between gap-3 py-1.5 text-sm", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-foreground">{children}</dd>
    </dl>
  );
}
