"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
      <div className="text-center py-8">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid Reset Link</h2>
        <p className="text-sm text-slate-500 mb-6">This link is invalid or has expired.</p>
        <Link href="/forgot-password" title="Forgot Password Page">
           <Button className="w-full bg-blue-600 hover:bg-blue-700">Request New Link</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Set new password</h1>
        <p className="text-sm text-slate-500 mt-2">
          Your new password must be different from previous used passwords.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700 block">New Password</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700 block">Confirm Password</label>
          <input
            type="password"
            placeholder="Repeat new password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
            className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
          />
          {form.confirm && form.password !== form.confirm && (
            <p className="text-xs text-red-500 font-medium">Passwords do not match</p>
          )}
        </div>

        <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg" disabled={loading || form.password !== form.confirm}>
          {loading ? "Resetting..." : "Reset password"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-[400px] bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-[fade-up_0.5s_ease_both]">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-extrabold text-slate-900">AlgoTrade</span>
        </div>

        <Suspense fallback={<div className="text-center py-8 text-slate-500">Loading form...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
