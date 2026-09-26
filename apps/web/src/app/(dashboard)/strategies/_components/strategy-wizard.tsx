"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { validateStrategyConfig } from "@/lib/strategy-config";
import { buildStrategyConfig } from "../new/build-config";
import { getLotSize, type BrokerAccount, type StrategyFormState } from "../new/types";
import { Step1StrategyType } from "../new/components/Step1StrategyType";
import { Step2InstrumentConfig } from "../new/components/Step2InstrumentConfig";
import { Step3RiskManagement } from "../new/components/Step3RiskManagement";
import { Step4BrokerReview } from "../new/components/Step4BrokerReview";
import { SummaryRow } from "./form-ui";
import { createDefaultForm } from "./form-defaults";
import { RISK_STYLE, STRATEGY_TYPES, estimateRisk, getTypeMeta, inr, type StrategyType } from "./strategy-types";

const STEPS = [
  { id: "type", title: "Type", hint: "What to trade with" },
  { id: "instrument", title: "Instrument", hint: "Broker, symbol and size" },
  { id: "risk", title: "Risk", hint: "Limits and sizing" },
  { id: "review", title: "Review", hint: "Paper or live, then save" },
] as const;
const LAST = STEPS.length - 1;

/** Which step a validator message belongs to, so it can be shown and fixed where it originates. */
function stepOfError(message: string): number {
  return /^(Lots|Quantity|Symbol|Product|Max lots|EMA period|Fast EMA|Slow EMA|RSI period|Start time|End time|Entry cutoff|Prime window|symbol is required|Min .*premium|Max premium)/i.test(
    message,
  )
    ? 1
    : 2;
}

export interface StrategyWizardProps {
  mode: "create" | "edit";
  initialForm: StrategyFormState;
  brokers: BrokerAccount[];
  brokersLoading?: boolean;
  brokersError?: boolean;
  onRetryBrokers?: () => void;
  submitting: boolean;
  /** Resolve true when saved so the unsaved-changes guard is released. */
  onSubmit: (form: StrategyFormState) => Promise<boolean>;
  backHref: string;
  /** Edit only: the strategy is running now, so changes apply on its next start. */
  isRunning?: boolean;
}

export function StrategyWizard({
  mode,
  initialForm,
  brokers,
  brokersLoading,
  brokersError,
  onRetryBrokers,
  submitting,
  onSubmit,
  backHref,
  isRunning,
}: StrategyWizardProps) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState<StrategyFormState>(initialForm);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(isEdit ? LAST : 0);
  const [liveAck, setLiveAck] = useState(false);
  const baseline = useRef(JSON.stringify(initialForm));

  const set = useCallback((k: keyof StrategyFormState, v: any) => setForm((f) => ({ ...f, [k]: v })), []);

  // Create: preselect the first broker account once the list arrives.
  useEffect(() => {
    if (isEdit || form.brokerAccountId || brokers.length === 0) return;
    const pick = brokers.find((b) => b.isActive) ?? brokers[0];
    baseline.current = JSON.stringify({ ...JSON.parse(baseline.current), brokerAccountId: pick.id });
    setForm((f) => ({ ...f, brokerAccountId: pick.id }));
  }, [brokers, isEdit, form.brokerAccountId]);

  const dirty = JSON.stringify(form) !== baseline.current;

  // Warn before a full page unload with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const selectType = useCallback((type: StrategyType) => {
    if (isEdit) return;
    setForm((f) => {
      const meta = getTypeMeta(type);
      const auto = STRATEGY_TYPES.map((t) => t.defaultName);
      const name = f.name.trim() && !auto.includes(f.name) ? f.name : meta.defaultName;
      return { ...createDefaultForm(), ...meta.defaults, type, name, brokerAccountId: f.brokerAccountId, isPaperTrade: f.isPaperTrade };
    });
  }, [isEdit]);

  // Same rules the API enforces, evaluated live so problems show on the step that caused them.
  const configErrors = useMemo(
    () => (form.type ? validateStrategyConfig(form.type, buildStrategyConfig(form) ?? {}) : []),
    [form],
  );
  const errorsWithStep = useMemo(() => configErrors.map((message) => ({ message, step: stepOfError(message) })), [configErrors]);
  const stepErrors = (s: number) => errorsWithStep.filter((e) => e.step === s).map((e) => e.message);

  const live = !form.isPaperTrade;

  /** Why the current step cannot be completed, or null when it can. */
  const blocker = (s: number): string | null => {
    if (s >= 0) {
      if (!form.type) return "Choose a strategy type to continue";
      if (!form.name.trim()) return "Give the strategy a name to continue";
    }
    if (s >= 1) {
      if (!form.symbol.trim()) return "Select an instrument to continue";
      if (!(Number(form.lots) >= 1)) return "Lots must be at least 1";
      const e = stepErrors(1)[0];
      if (e) return e;
    }
    if (s >= 2) {
      const e = stepErrors(2)[0];
      if (e) return e;
    }
    if (s >= 3) {
      if (live && !form.brokerAccountId) return "Select a broker account to trade live";
      if (live && !liveAck) return "Confirm you understand live trading";
      if (isEdit && !dirty) return "No changes to save yet";
    }
    return null;
  };
  const reason = blocker(step);

  const goTo = (i: number) => {
    if (i > maxStep && !isEdit) return;
    setStep(i);
    document.getElementById("main-content")?.scrollTo({ top: 0 });
  };
  const next = () => {
    if (reason || step >= LAST) return;
    setMaxStep((m) => Math.max(m, step + 1));
    setStep(step + 1);
    document.getElementById("main-content")?.scrollTo({ top: 0 });
  };
  const back = () => goTo(Math.max(0, step - 1));

  const submit = async () => {
    if (reason || submitting) return;
    const ok = await onSubmit(form);
    if (ok) baseline.current = JSON.stringify(form);
  };

  // Enter in a text/number field moves to the next step (never submits on the last step).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (t.tagName !== "INPUT") return;
    const type = (t as HTMLInputElement).type;
    if (type === "checkbox" || type === "radio" || type === "button") return;
    if (step < LAST) {
      e.preventDefault();
      next();
    }
  };

  const meta = getTypeMeta(form.type);
  const title = isEdit ? "Edit strategy" : "Create strategy";

  return (
    <div className="pb-4" onKeyDown={onKeyDown}>
      {/* ── Sticky header: title + progress ── */}
      <header className="sticky top-0 z-20 -mx-3 border-b border-border bg-background/95 px-3 pb-3 pt-2 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="icon" asChild className="shrink-0">
            <Link href={backHref} aria-label={isEdit ? "Back to strategy" : "Back to strategies"}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {isEdit && form.name ? form.name : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step].hint}`}
            </p>
          </div>
          {isEdit && (
            <Badge variant={dirty ? "warning" : "secondary"} dot className="shrink-0" aria-live="polite">
              {dirty ? "Unsaved changes" : "Saved"}
            </Badge>
          )}
        </div>

        <nav aria-label="Progress" className="mt-3">
          <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {STEPS.map((s, i) => {
              const done = i < step || (isEdit && i !== step);
              const current = i === step;
              const reachable = isEdit || i <= maxStep;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "group flex min-h-11 w-full flex-col items-start gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !reachable && "cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1 w-full rounded-full transition-colors",
                        current ? "bg-primary" : done ? "bg-profit" : "bg-border",
                      )}
                    />
                    <span className="flex items-center gap-1.5 px-0.5">
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                          current && "border-primary bg-primary text-primary-foreground",
                          !current && done && "border-profit/40 bg-profit-subtle text-profit",
                          !current && !done && "border-border text-muted-foreground",
                        )}
                      >
                        {!current && done && !isEdit ? <Check className="h-3 w-3 stroke-[3]" aria-hidden /> : i + 1}
                      </span>
                      <span className={cn("truncate text-xs font-semibold", current ? "text-foreground" : "text-muted-foreground", !current && "hidden sm:inline")}>
                        {s.title}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {/* ── Running warning (edit) ── */}
      {isEdit && isRunning && (
        <div role="status" className="mt-4 flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-subtle p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p>
            <span className="font-semibold">This strategy is running.</span> Your changes are saved now but only take effect the next time it starts. Stop and start it to apply them.
          </p>
        </div>
      )}

      {/* ── Body ── */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div key={step} className="min-w-0 animate-[fade-up_0.25s_ease_both]">
          {step === 0 && (
            <Step1StrategyType
              form={form}
              set={set}
              onSelectType={selectType}
              typeLocked={isEdit}
            />
          )}
          {step === 1 && (
            <Step2InstrumentConfig
              form={form}
              set={set}
              brokers={brokers}
              brokersLoading={brokersLoading}
              brokersError={brokersError}
              onRetryBrokers={onRetryBrokers}
            />
          )}
          {step === 2 && <Step3RiskManagement form={form} set={set} errors={stepErrors(2)} />}
          {step === 3 && (
            <Step4BrokerReview
              form={form}
              set={set}
              brokers={brokers}
              errors={errorsWithStep}
              liveAck={liveAck}
              onLiveAck={setLiveAck}
              onGoToStep={goTo}
            />
          )}

          {(step === 1 || step === 2) && stepErrors(step).length > 0 && (
            <div role="alert" className="mt-4 rounded-lg border border-loss/40 bg-loss-subtle p-3 text-xs">
              <p className="mb-1 font-semibold text-loss">Fix these before continuing</p>
              <ul className="list-disc space-y-0.5 pl-4 text-foreground">
                {stepErrors(step).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Live blueprint (desktop) */}
        <aside aria-label="Strategy summary" className="hidden lg:sticky lg:top-36 lg:block">
          <LiveSummary form={form} />
        </aside>
      </div>

      {/* ── Sticky action bar ── */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-20 -mx-3 mt-6 border-t border-border bg-card/95 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4 md:bottom-0 lg:-mx-5 lg:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2">
          {reason && (
            <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-warn">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{reason}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            {step === 0 ? (
              <Button type="button" variant="outline" asChild className="shrink-0">
                <Link href={backHref}>Cancel</Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={back} disabled={submitting} className="shrink-0">
                <ChevronLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
            )}
            <div className="flex-1" />
            {step < LAST ? (
              <Button type="button" onClick={next} disabled={!!reason} className="flex-1 sm:flex-none sm:min-w-44">
                Next: {STEPS[step + 1].title} <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                variant={live ? "danger" : "success"}
                onClick={submit}
                disabled={!!reason}
                loading={submitting}
                className="flex-1 sm:flex-none sm:min-w-52"
              >
                {!submitting && <Check className="h-4 w-4" aria-hidden />}
                {submitting ? "Saving..." : isEdit ? (live ? "Save changes (live)" : "Save changes") : live ? "Create live strategy" : "Create paper strategy"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveSummary({ form }: { form: StrategyFormState }) {
  const meta = getTypeMeta(form.type);
  const Icon = meta.icon;
  const risk = estimateRisk(form);
  const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
  const auto = form.symbol === "AUTO" || form.symbol === "AUTO_HYBRID";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", meta.tile)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{form.name || "Untitled strategy"}</p>
          <p className="truncate text-xs text-muted-foreground">{form.type ? meta.label : "No type chosen yet"}</p>
        </div>
      </div>
      <div className="pt-2">
        {form.type && (
          <SummaryRow label="Risk level">
            <span className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", RISK_STYLE[meta.risk])}>{meta.risk}</span>
          </SummaryRow>
        )}
        <SummaryRow label="Instrument">{auto ? "Auto" : form.symbol || "Not set"}</SummaryRow>
        <SummaryRow label="Size">
          {form.type === "STOCK_OPTIONS_BUYING" ? inr(Number(form.sMaxCapital)) : `${form.lots || 0} lot${auto ? "" : ` (${(Number(form.lots) || 0) * lotSize} qty)`}`}
        </SummaryRow>
        <SummaryRow label="Max loss / trade"><span className="text-loss">{inr(risk.perTrade)}</span></SummaryRow>
        <SummaryRow label="Max loss / day"><span className="text-loss">{inr(risk.perDay)}</span></SummaryRow>
        <SummaryRow label="Mode">
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold",
              form.isPaperTrade ? "border-profit/30 bg-profit-subtle text-profit" : "border-warn/30 bg-warn-subtle text-warn",
            )}
          >
            {form.isPaperTrade ? "Paper" : "Live"}
          </span>
        </SummaryRow>
      </div>
    </div>
  );
}
