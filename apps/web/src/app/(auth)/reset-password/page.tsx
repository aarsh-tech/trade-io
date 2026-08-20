"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/components/auth/AuthLayout";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { resetPassword } = useAuth();

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      return;
    }
    if (!token) return;

    setLoading(true);
    try {
      await resetPassword({ token, newPassword: form.password });
    } catch {
      // handled in hook
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center py-4 space-y-4">
        <h2 className="text-base font-medium text-[#424242]">Invalid link</h2>
        <p className="text-xs text-[#777777]">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="block pt-2">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-[3px] h-[40px]">
            Request new link
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* New Password */}
      <div className="relative">
        <input
          id="password"
          type={showPass ? "text" : "password"}
          placeholder="New password (min 8 characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={8}
          className="w-full h-[46px] px-3.5 pr-10 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors placeholder:text-[#999999]"
        />
        <button
          type="button"
          onClick={() => setShowPass((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999999] hover:text-[#555555] p-1 cursor-pointer"
          tabIndex={-1}
          aria-label={showPass ? "Hide password" : "Show password"}
        >
          {showPass ? (
            <EyeOff className="h-4 w-4 stroke-[1.75]" />
          ) : (
            <Eye className="h-4 w-4 stroke-[1.75]" />
          )}
        </button>
      </div>

      {/* Confirm Password */}
      <div className="relative">
        <input
          id="confirm"
          type="password"
          placeholder="Repeat new password"
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          required
          className="w-full h-[46px] px-3.5 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors placeholder:text-[#999999]"
        />
        {form.confirm && form.password !== form.confirm && (
          <p className="text-xs text-red-500 font-normal pt-1">Passwords do not match</p>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full h-[42px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-[3px] shadow-none cursor-pointer transition-colors mt-2"
        disabled={loading || (!!form.confirm && form.password !== form.confirm)}
      >
        {loading ? "Updating..." : "Update password"}
      </Button>

      <div className="pt-2 text-center">
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-1.5 text-xs text-[#777777] hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Set new password"
      footerLink={{
        text: "Remember your password?",
        actionText: "Login to TradeIO",
        href: "/login",
      }}
    >
      <Suspense
        fallback={<div className="text-center py-6 text-xs text-[#888888]">Loading...</div>}
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
