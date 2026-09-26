"use client";

import React from "react";
import { AlertTriangle, FlaskConical, Pencil, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { StrategyFormState, BrokerAccount, getLotSize } from "../types";
import { Section, SummaryRow } from "../../_components/form-ui";
import { RISK_STYLE, estimateRisk, getTypeMeta, inr } from "../../_components/strategy-types";

interface Step4Props {
  form: StrategyFormState;
  set: (k: keyof StrategyFormState, v: any) => void;
  brokers: BrokerAccount[];
  errors: { message: string; step: number }[];
  liveAck: boolean;
  onLiveAck: (v: boolean) => void;
  onGoToStep: (step: number) => void;
}

function EditLink({ step, onGoToStep, label }: { step: number; onGoToStep: (s: number) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onGoToStep(step)}
      aria-label={`Edit ${label}`}
      className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Pencil className="h-3 w-3" aria-hidden /> Edit
    </button>
  );
}

export function Step4BrokerReview({ form, set, brokers, errors, liveAck, onLiveAck, onGoToStep }: Step4Props) {
  const meta = getTypeMeta(form.type);
  const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
  const totalQty = Number(form.lots || 1) * lotSize;
  const risk = estimateRisk(form);
  const broker = brokers.find((b) => b.id === form.brokerAccountId);
  const isAuto = form.symbol === "AUTO" || form.symbol === "AUTO_HYBRID";
  const live = !form.isPaperTrade;

  return (
    <div className="space-y-4">
      <Section title="Paper or live?" description="You can switch this later from the edit page.">
        <div role="radiogroup" aria-label="Execution mode" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            role="radio"
            aria-checked={!live}
            onClick={() => set("isPaperTrade", true)}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !live ? "border-profit bg-profit-subtle ring-1 ring-profit/40" : "border-border bg-card hover:border-profit/50 hover:bg-muted",
            )}
          >
            <span className="mb-1 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 shrink-0 text-profit" aria-hidden />
              <span className="text-sm font-semibold text-foreground">Paper trading</span>
              <span className="rounded-sm border border-profit/30 bg-profit-subtle px-1.5 py-0.5 text-[11px] font-semibold text-profit">Recommended first</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              Paper: no real orders. Trades are simulated on live prices and nothing is sent to your broker.
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={live}
            onClick={() => set("isPaperTrade", false)}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              live ? "border-warn bg-warn-subtle ring-1 ring-warn/40" : "border-border bg-card hover:border-warn/50 hover:bg-muted",
            )}
          >
            <span className="mb-1 flex items-center gap-2">
              <Zap className="h-4 w-4 shrink-0 text-warn" aria-hidden />
              <span className="text-sm font-semibold text-foreground">Live trading</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              Places real orders with real money on your connected broker account, including stop-loss orders.
            </span>
          </button>
        </div>

        {live && (
          <div role="alert" className="space-y-3 rounded-lg border border-loss/40 bg-loss-subtle p-3.5">
            <p className="flex items-start gap-2 text-sm font-semibold text-loss">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>This strategy will place real orders{broker ? ` on ${broker.broker.toUpperCase()}` : ""}. You can lose up to {inr(risk.perDay)} a day.</span>
            </p>
            {!form.brokerAccountId && (
              <p className="text-xs text-foreground">
                No broker account selected.{" "}
                <button type="button" onClick={() => onGoToStep(1)} className="font-semibold text-primary underline underline-offset-2">Choose one in step 2</button>.
              </p>
            )}
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-xs text-foreground">
              <input
                type="checkbox"
                checked={liveAck}
                onChange={(e) => onLiveAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-loss"
              />
              <span>I understand this trades with real money and I have checked the limits below.</span>
            </label>
          </div>
        )}
      </Section>

      <Section title="Review" description="Check the details. Use Edit to jump back to a step.">
        <div className="divide-y divide-border">
          <div className="pb-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategy</h3>
              <EditLink step={0} onGoToStep={onGoToStep} label="strategy" />
            </div>
            <SummaryRow label="Name">{form.name || "Untitled"}</SummaryRow>
            <SummaryRow label="Type">
              <span className="inline-flex items-center gap-2">
                {meta.label}
                <span className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", RISK_STYLE[meta.risk])}>{meta.risk} risk</span>
              </span>
            </SummaryRow>
          </div>
          <div className="py-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instrument and size</h3>
              <EditLink step={1} onGoToStep={onGoToStep} label="instrument" />
            </div>
            <SummaryRow label="Instrument">{isAuto ? "Auto-selected each day" : `${form.symbol} (${form.exchange})`}</SummaryRow>
            {form.type === "STOCK_OPTIONS_BUYING" ? (
              <SummaryRow label="Capital per trade">{inr(Number(form.sMaxCapital))}</SummaryRow>
            ) : (
              <SummaryRow label="Position size">{isAuto ? `${form.lots} lot(s)` : `${form.lots} lot(s), ${totalQty} qty`}</SummaryRow>
            )}
            <SummaryRow label="Product">{form.product}</SummaryRow>
            <SummaryRow label="Broker">{broker ? `${broker.broker.toUpperCase()} (${broker.clientId || "connected"})` : "None selected"}</SummaryRow>
          </div>
          <div className="pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk</h3>
              <EditLink step={2} onGoToStep={onGoToStep} label="risk" />
            </div>
            <SummaryRow label="Max loss per trade"><span className="text-loss">{inr(risk.perTrade)}</span></SummaryRow>
            <SummaryRow label="Max loss per day"><span className="text-loss">{inr(risk.perDay)}</span></SummaryRow>
            <SummaryRow label="Max trades per day">{form.maxTradesPerDay || "n/a"}</SummaryRow>
            {risk.targetPerTrade ? <SummaryRow label="Target per trade"><span className="text-profit">{inr(risk.targetPerTrade)}</span></SummaryRow> : null}
          </div>
        </div>
      </Section>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-loss/40 bg-loss-subtle p-3.5 text-xs">
          <p className="mb-1.5 font-semibold text-loss">Fix these before saving</p>
          <ul className="space-y-1">
            {errors.map((e) => (
              <li key={e.message} className="flex items-start justify-between gap-3 text-foreground">
                <span>{e.message}</span>
                <button type="button" onClick={() => onGoToStep(e.step)} className="shrink-0 font-semibold text-primary underline underline-offset-2">
                  Go to step {e.step + 1}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
