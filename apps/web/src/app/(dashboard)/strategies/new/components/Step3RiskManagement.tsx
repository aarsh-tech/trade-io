"use client";

import React from "react";
import { Check, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState } from "../types";
import { Advanced, NumberField, Section } from "../../_components/form-ui";
import { PRESET_LEVELS, activePreset, estimateRisk, getPresets, inr, type PresetLevel } from "../../_components/strategy-types";
import { Step3RiskAdvanced } from "./Step3RiskAdvanced";

interface Step3Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
  /** Validation messages from the shared config validator. */
  errors: string[];
}

const PRESET_HINT: Record<PresetLevel, string> = {
  Conservative: "Smaller losses, fewer trades",
  Balanced: "Recommended starting point",
  Aggressive: "Bigger swings, more trades",
};

/** First validator message that starts with any of the given labels. */
const errorFor = (errors: string[], labels: string[]) => errors.find((e) => labels.some((l) => e.startsWith(l))) ?? null;

export function Step3RiskManagement({ form, set, errors }: Step3Props) {
  const presets = getPresets(form.type);
  const current = activePreset(form);
  const risk = estimateRisk(form);
  const t = form.type;

  const applyPreset = (level: PresetLevel) => {
    if (!presets) return;
    (Object.entries(presets[level]) as [keyof StrategyFormState, unknown][]).forEach(([k, v]) => set(k, v));
  };

  const tradesField = (
    <NumberField
      label="Max trades per day"
      value={form.maxTradesPerDay}
      onChange={(v) => set("maxTradesPerDay", v)}
      min={1}
      hint="The strategy stops opening new trades after this many."
      error={errorFor(errors, ["Max trades per day"])}
    />
  );

  return (
    <div className="space-y-4">
      {presets && (
        <Section title="Risk preset" description="Pick a starting point. It fills the fields below, and you can still edit any of them.">
          <div role="radiogroup" aria-label="Risk preset" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PRESET_LEVELS.map((level) => {
              const selected = current === level;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => applyPreset(level)}
                  className={cn(
                    "flex min-h-14 items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-brand-subtle ring-1 ring-primary/40" : "border-border bg-card hover:border-primary/50 hover:bg-muted",
                  )}
                >
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{level}</span>
                    <span className="block text-xs text-muted-foreground">{PRESET_HINT[level]}</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
          {!current && <p className="text-xs text-muted-foreground">Custom values: you have changed the preset.</p>}
        </Section>
      )}

      <Section title="Risk and sizing" description="The limits that protect your capital. Every trade follows these.">
        {t === "STOCK_OPTIONS_BUYING" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Capital per trade"
              prefix={"₹"}
              value={form.sMaxCapital}
              onChange={(v) => set("sMaxCapital", v)}
              min={1}
              required
              hint="The most premium the strategy deploys on one trade."
              error={errorFor(errors, ["Max capital"]) ?? (Number(form.sMaxCapital) > 0 ? null : "Enter an amount above 0.")}
            />
            <NumberField
              label="Reward for every 1 risked"
              suffix="x"
              decimal
              value={form.sRiskRewardRatio}
              onChange={(v) => set("sRiskRewardRatio", v)}
              min={0.1}
              required
              hint="2 means the target is twice the distance of the stop-loss."
              error={errorFor(errors, ["Risk:reward"]) ?? (Number(form.sRiskRewardRatio) > 0 ? null : "Enter a ratio above 0.")}
            />
            {tradesField}
          </div>
        ) : t === "NIFTY_OPTIONS_SCALPER" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Stop-loss"
              suffix="points"
              value={form.dsStopLossPoints}
              onChange={(v) => set("dsStopLossPoints", v)}
              min={1}
              decimal
              hint="Exit if the option falls this many points. Placed on the exchange."
              error={Number(form.dsStopLossPoints) > 0 ? null : "Enter a stop-loss above 0."}
            />
            <NumberField
              label="Target"
              suffix="points"
              value={form.dsTargetPoints}
              onChange={(v) => set("dsTargetPoints", v)}
              min={1}
              decimal
              hint="First profit milestone."
              error={Number(form.dsTargetPoints) > 0 ? null : "Enter a target above 0."}
            />
            {tradesField}
            <NumberField
              label="Stop for the day after losses"
              value={form.dsMaxLossesPerDay || ""}
              onChange={(v) => set("dsMaxLossesPerDay", v)}
              min={1}
              hint="Circuit-breaker: no more trades after this many stop-loss hits."
              error={errorFor(errors, ["Max losses per day"])}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Stop-loss per trade"
              prefix={"₹"}
              value={form.stopLossRs}
              onChange={(v) => set("stopLossRs", v)}
              min={1}
              decimal
              required
              hint="Position exits if the loss reaches this amount."
              error={errorFor(errors, ["Stop-loss"])}
            />
            <NumberField
              label={t === "GAMMA_BLAST_EXPIRY" ? "Profit goal" : "Profit target per trade"}
              prefix={"₹"}
              value={form.targetRs}
              onChange={(v) => set("targetRs", v)}
              min={1}
              decimal
              required
              hint="Position exits, or starts trailing, at this profit."
              error={errorFor(errors, ["Target ("])}
            />
            {tradesField}
            {t === "BREAKOUT_15MIN" && (
              <NumberField
                label="Stop for the day after losses"
                value={form.b15MaxLossesPerDay || ""}
                onChange={(v) => set("b15MaxLossesPerDay", v)}
                min={1}
                hint="1 means: after one stop-loss hit, no more trades today."
                error={errorFor(errors, ["Max losses per day"])}
              />
            )}
          </div>
        )}
      </Section>

      {/* Live worst-case summary */}
      <section aria-live="polite" className="rounded-lg border border-loss/30 bg-loss-subtle p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-loss" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">What you can lose</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Max loss per trade</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-loss">{inr(risk.perTrade)}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Max loss per day</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-loss">{inr(risk.perDay)}</p>
          </div>
        </div>
        {risk.targetPerTrade ? (
          <p className="mt-3 text-xs text-foreground">
            Target per trade: <span className="font-semibold text-profit">{inr(risk.targetPerTrade)}</span>
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">{risk.basis}</p>
      </section>

      <Advanced title="Advanced risk options" description="Trailing, partial booking, filters and time windows. Defaults are already set.">
        <Step3RiskAdvanced form={form} set={set} />
      </Advanced>
    </div>
  );
}
