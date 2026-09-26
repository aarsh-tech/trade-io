"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api-error";
import { strategyApi, brokerApi } from "@/lib/api";
import { buildStrategyConfig } from "./build-config";
import type { BrokerAccount, StrategyFormState } from "./types";
import { StrategyWizard } from "../_components/strategy-wizard";
import { createDefaultForm } from "../_components/form-defaults";

export default function NewStrategyPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [brokersLoading, setBrokersLoading] = useState(true);
  const [brokersError, setBrokersError] = useState(false);
  const initialForm = useMemo(() => createDefaultForm(), []);

  const loadBrokers = useCallback(() => {
    setBrokersLoading(true);
    setBrokersError(false);
    brokerApi
      .list()
      .then((r) => setBrokers(r.data?.data ?? []))
      .catch(() => setBrokersError(true))
      .finally(() => setBrokersLoading(false));
  }, []);

  useEffect(() => {
    loadBrokers();
  }, [loadBrokers]);

  const handleSubmit = async (form: StrategyFormState): Promise<boolean> => {
    setSubmitting(true);
    try {
      const config = buildStrategyConfig(form);
      await strategyApi.create({
        name: form.name.trim(),
        type: form.type,
        brokerAccountId: form.brokerAccountId || undefined,
        config: JSON.stringify(config),
        isPaperTrade: form.isPaperTrade,
      });
      toast.success("Strategy created", {
        description: `${form.name.trim()} is ready. Start it from the Strategies page.`,
      });
      router.push("/strategies");
      return true;
    } catch (err: any) {
      toast.error(apiErrorMessage(err, "Failed to create strategy"));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StrategyWizard
      mode="create"
      initialForm={initialForm}
      brokers={brokers}
      brokersLoading={brokersLoading}
      brokersError={brokersError}
      onRetryBrokers={loadBrokers}
      submitting={submitting}
      onSubmit={handleSubmit}
      backHref="/strategies"
    />
  );
}
