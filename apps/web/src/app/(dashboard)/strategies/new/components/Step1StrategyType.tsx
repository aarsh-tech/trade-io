"use client";

import React from "react";
import { Check, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { StrategyFormState } from "../types";
import { Field, Section } from "../../_components/form-ui";
import { RISK_STYLE, STRATEGY_TYPES, getTypeMeta, type StrategyType } from "../../_components/strategy-types";

interface Step1Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
  /** Applies a type's defaults (create only). */
  onSelectType: (type: StrategyType) => void;
  /** Edit mode: the type is fixed once a strategy exists. */
  typeLocked?: boolean;
  nameError?: string | null;
}

export function Step1StrategyType({ form, set, onSelectType, typeLocked, nameError }: Step1Props) {
  const cards = typeLocked
    ? STRATEGY_TYPES.filter((t) => t.type === form.type).concat(
        STRATEGY_TYPES.some((t) => t.type === form.type) || !form.type ? [] : [getTypeMeta(form.type)],
      )
    : STRATEGY_TYPES;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (typeLocked) return;
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const idx = Math.max(0, STRATEGY_TYPES.findIndex((t) => t.type === form.type));
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = STRATEGY_TYPES[(idx + dir + STRATEGY_TYPES.length) % STRATEGY_TYPES.length];
    onSelectType(next.type);
    requestAnimationFrame(() => document.getElementById(`type-${next.type}`)?.focus());
  };

  return (
    <div className="space-y-4">
      <Section title="Name" description="Shown in your strategies list. You can change it any time.">
        <Field label="Strategy name" required error={nameError}>
          {(a11y) => (
            <Input
              {...a11y}
              value={form.name}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Nifty morning breakout"
              className={cn("font-semibold", nameError && "border-loss")}
            />
          )}
        </Field>
      </Section>

      <Section
        title={typeLocked ? "Strategy type" : "Choose a strategy type"}
        description={
          typeLocked
            ? "The type cannot be changed once a strategy is created. Create a new strategy to use a different type."
            : "Each type comes with sensible defaults, so you can adjust only what you need on the next steps."
        }
      >
        <div
          role="radiogroup"
          aria-label="Strategy type"
          onKeyDown={onKeyDown}
          className={cn("grid gap-3", typeLocked ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}
        >
          {cards.map((t) => {
            const selected = form.type === t.type;
            const Icon = t.icon;
            return (
              <button
                key={t.type}
                id={`type-${t.type}`}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (!form.type && t === cards[0]) ? 0 : -1}
                disabled={typeLocked}
                onClick={() => onSelectType(t.type)}
                className={cn(
                  "relative flex min-h-11 flex-col gap-3 rounded-lg border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-brand-subtle ring-1 ring-primary/40" : "border-border bg-card hover:border-primary/50 hover:bg-muted",
                  typeLocked && "cursor-default",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", t.tile)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">{t.label}</p>
                      <span className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", RISK_STYLE[t.risk])}>
                        {t.risk} risk
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.tagline}</p>
                  </div>
                  {selected && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden>
                      {typeLocked ? <Lock className="h-3 w-3" /> : <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Trades:</dt>
                    <dd className="font-medium text-foreground">{t.instrument}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Runs:</dt>
                    <dd className="font-medium text-foreground">{t.timing}</dd>
                  </div>
                  <div className="flex gap-1.5 sm:col-span-2">
                    <dt className="text-muted-foreground">Best for:</dt>
                    <dd className="font-medium text-foreground">{t.bestFor}</dd>
                  </div>
                </dl>
                {t.riskNote && <p className="text-xs text-muted-foreground">{t.riskNote}</p>}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
