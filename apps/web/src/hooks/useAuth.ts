import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function useAuth() {
  const queryClient = useQueryClient();
  const { setAuth, clearAuth } = useAuthStore();
  const router = useRouter();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
      toast.success("Logged out successfully");
      router.push("/login");
    },
    onError: () => {
      // Even if API fails, clear local state
      clearAuth();
      queryClient.clear();
      router.push("/login");
    },
  });

  return {
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,

    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,

    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,

    forgotPassword: useMutation({
      mutationFn: authApi.forgotPassword,
      onSuccess: () => toast.success("Reset link sent to your email!"),
      onError: (err: any) => toast.error(err?.response?.data?.message || "Failed to send reset link"),
    }).mutateAsync,

    resetPassword: useMutation({
      mutationFn: authApi.resetPassword,
      onSuccess: () => {
        toast.success("Password reset successful!");
        router.push("/login");
      },
      onError: (err: any) => toast.error(err?.response?.data?.message || "Invalid or expired token"),
    }).mutateAsync,
  };
}

export function use2FA() {
  const setupMutation = useMutation({
    mutationFn: authApi.setup2fa,
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to setup 2FA");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: authApi.verify2fa,
    onSuccess: () => {
      toast.success("2FA enabled successfully!");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Invalid 2FA code");
    },
  });

  const disableMutation = useMutation({
    mutationFn: authApi.disable2fa,
    onSuccess: () => {
      toast.success("2FA disabled successfully!");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to disable 2FA");
    },
  });

  return {
    setup2FA: setupMutation.mutateAsync,
    isSettingUp: setupMutation.isPending,

    verify2FA: verifyMutation.mutateAsync,
    isVerifying: verifyMutation.isPending,

    disable2FA: disableMutation.mutateAsync,
    isDisabling: disableMutation.isPending,
  };
}

import { userApi } from "@/lib/api";

export function useUser() {
  const { updateUser } = useAuthStore();

  const updateProfileMutation = useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: (res) => {
      updateUser(res.data.data);
      toast.success("Profile updated successfully");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to update profile");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: userApi.changePassword,
    onSuccess: () => {
      toast.success("Password changed successfully");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to change password");
    },
  });

  return {
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,

    changePassword: changePasswordMutation.mutateAsync,
    isChangingPassword: changePasswordMutation.isPending,
  };
}

