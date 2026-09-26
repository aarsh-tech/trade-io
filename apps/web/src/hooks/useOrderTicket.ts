import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brokerApi, riskApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  needsConfirmation,
  newIdempotencyKey,
  orderValue,
  validateTicket,
  type OrderLimits,
  type TicketInput,
  type TicketIssue,
} from "@/lib/order-ticket";

export interface OrderTicketContext extends Omit<TicketInput, "limits" | "tickSize"> {
  symbol: string;
  exchange: string;
  brokerId?: string;
  /** Only load limits/tick size while the ticket is on screen. */
  enabled: boolean;
}

/**
 * One order ticket's brains: pre-submit validation against tick size, lot size and the
 * user's risk limits, a confirm step for risky orders, a single in-flight submit, and an
 * idempotency key so a double click or a retry after a lost response cannot place two orders.
 */
export function useOrderTicket(ctx: OrderTicketContext) {
  const queryClient = useQueryClient();
  const { symbol, exchange, brokerId, enabled } = ctx;

  const limitsQuery = useQuery({
    queryKey: ["risk", "order-limits", symbol],
    queryFn: async () => (await riskApi.orderLimits(symbol)).data?.data as OrderLimits,
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const tickQuery = useQuery({
    queryKey: ["broker", brokerId, "tick-size", exchange, symbol],
    queryFn: async () => Number((await brokerApi.tickSize(brokerId!, symbol, exchange)).data?.data?.tickSize) || null,
    enabled: enabled && !!brokerId,
    staleTime: 60 * 60_000,
  });
  const tickSize = tickQuery.data ?? undefined;

  const { side, orderType, product, qty, price, triggerPrice, ltp, availableMargin, marginRequired, lotSize } = ctx;
  const online = useOnlineStatus();
  const issues: TicketIssue[] = useMemo(
    () => [
      ...(online ? [] : [{ field: "form", severity: "error", message: "You are offline. Orders are blocked until the connection returns." } as TicketIssue]),
      ...validateTicket({
        side, orderType, product, qty, price, triggerPrice, ltp, availableMargin, marginRequired, lotSize,
        tickSize,
        limits: limitsQuery.data,
      }),
    ],
    [online, side, orderType, product, qty, price, triggerPrice, ltp, availableMargin, marginRequired, lotSize, tickSize, limitsQuery.data],
  );

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const fieldError = (field: TicketIssue["field"]) => errors.find((i) => i.field === field)?.message;

  const value = orderValue({ orderType, price, ltp, qty });
  const confirmRequired = needsConfirmation({ orderType, price, ltp, qty });

  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);
  // The key belongs to one submit intent: same payload => same key, so retrying after a
  // timeout is safe. It is dropped on success or on a definitive rejection.
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  // Any edit invalidates a pending confirmation.
  const editKey = `${side}|${orderType}|${product}|${qty}|${price}|${triggerPrice}|${symbol}|${exchange}`;
  useEffect(() => setConfirming(false), [editKey]);

  const hasErrors = errors.length > 0;

  const submit = useCallback(
    async (payload: Record<string, unknown>, onDone?: () => void) => {
      if (inFlight.current) return;
      if (!brokerId) {
        toast.error("No active broker selected");
        return;
      }
      if (hasErrors) return;
      if (confirmRequired && !confirming) {
        setConfirming(true);
        return;
      }

      const fingerprint = JSON.stringify(payload);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };

      inFlight.current = true;
      setIsSubmitting(true);
      try {
        await brokerApi.placeOrder(brokerId, payload, attempt.current.key);
        attempt.current = null;
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
        onDone?.();
      } catch (error: any) {
        // A definitive rejection (4xx) means the next click is a new intent; a network failure keeps the key.
        const status = error?.response?.status;
        if (status >= 400 && status < 500) attempt.current = null;
        toast.error(error?.response?.data?.message || "Failed to place order");
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
        setConfirming(false);
      }
    },
    [brokerId, hasErrors, confirmRequired, confirming, queryClient],
  );

  return {
    issues,
    errors,
    warnings,
    fieldError,
    hasErrors,
    limits: limitsQuery.data,
    tickSize,
    orderValue: value,
    confirmRequired,
    confirming,
    cancelConfirm: () => setConfirming(false),
    isSubmitting,
    submit,
  };
}
