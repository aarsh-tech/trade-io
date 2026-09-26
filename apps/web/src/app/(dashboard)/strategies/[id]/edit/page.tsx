"use client";

export const runtime = "edge";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { strategyApi, brokerApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { buildStrategyConfig } from "../../new/build-config";
import { getLotSize, type BrokerAccount, type StrategyFormState } from "../../new/types";
import { StrategyWizard } from "../../_components/strategy-wizard";
import { strategyToForm } from "../../_components/form-defaults";

interface Loaded {
  form: StrategyFormState;
  config: Record<string, any>;
  wasPaper: boolean;
  isRunning: boolean;
}

export default function EditStrategyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [brokersError, setBrokersError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(null);
    try {
      const [stratRes, brokerRes] = await Promise.all([
        strategyApi.get(id),
        brokerApi.list().catch(() => {
          setBrokersError(true);
          return null;
        }),
      ]);
      if (!alive.current) return;
      const strategy = stratRes.data.data;
      setBrokers(brokerRes?.data?.data ?? []);
      setLoaded({
        form: strategyToForm(strategy),
        config: strategy.config || {},
        wasPaper: strategy.isPaperTrade !== false,
        isRunning: !!strategy.isActive || strategy.executions?.[0]?.status === "RUNNING",
      });
    } catch (err) {
      if (alive.current) setFailed(apiErrorMessage(err, "Could not load this strategy."));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const retryBrokers = useCallback(() => {
    setBrokersError(false);
    brokerApi
      .list()
      .then((r) => setBrokers(r.data?.data ?? []))
      .catch(() => setBrokersError(true));
  }, []);

  const handleSubmit = async (form: StrategyFormState): Promise<boolean> => {
    if (!loaded) return false;
    setSubmitting(true);
    try {
      // Keep any keys the wizard does not manage (older strategies carry extras), then overlay the edited ones.
      const built = buildStrategyConfig(form);
      const merged: Record<string, any> = { ...loaded.config, ...built };
      const lotSize = form.lotSize || getLotSize(form.symbol, form.lotSize);
      if ("qty" in loaded.config || "qty" in built) merged.qty = Number(form.lots) * lotSize;
      if ("lotSize" in loaded.config || "lotSize" in built) merged.lotSize = lotSize;

      await strategyApi.update(id, {
        name: form.name.trim(),
        type: form.type,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(merged),
        ...(form.isPaperTrade !== loaded.wasPaper && { isPaperTrade: form.isPaperTrade }),
      });

      toast.success("Strategy updated", {
        description: loaded.isRunning ? "Changes apply the next time it starts." : undefined,
      });
      router.push(`/strategies/${id}`);
      return true;
    } catch (err: any) {
      toast.error(apiErrorMessage(err, "Failed to update strategy"));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> Loading strategy...
      </div>
    );
  }

  if (failed || !loaded) {
    return (
      <div role="alert" className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-loss-subtle">
          <AlertTriangle className="h-6 w-6 text-loss" aria-hidden />
        </div>
        <h1 className="text-base font-semibold text-foreground">Could not load this strategy</h1>
        <p className="mt-1 text-sm text-muted-foreground">{failed}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/strategies"><ArrowLeft className="h-4 w-4" aria-hidden /> Strategies</Link>
          </Button>
          <Button onClick={load}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <StrategyWizard
      mode="edit"
      initialForm={loaded.form}
      brokers={brokers}
      brokersError={brokersError}
      onRetryBrokers={retryBrokers}
      submitting={submitting}
      onSubmit={handleSubmit}
      backHref={`/strategies/${id}`}
      isRunning={loaded.isRunning}
    />
  );
}
