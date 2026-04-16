import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { brokerApi } from "@/lib/api";
import { toast } from "sonner";

export const BROKER_KEYS = {
  all: ["brokers"] as const,
  list: () => [...BROKER_KEYS.all, "list"] as const,
};

export function useBrokers() {
  const queryClient = useQueryClient();

  const brokersQuery = useQuery({
    queryKey: BROKER_KEYS.list(),
    queryFn: async () => {
      const res = await brokerApi.list();
      return res.data.data;
    },
  });

  const connectMutation = useMutation({
    mutationFn: brokerApi.connect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BROKER_KEYS.list() });
      toast.success("Broker connected successfully!");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to connect broker");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: brokerApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BROKER_KEYS.list() });
      toast.success("Broker disconnected");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to disconnect");
    },
  });

  return {
    brokers: brokersQuery.data || [],
    isLoading: brokersQuery.isLoading,
    connect: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    disconnect: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
  };
}
