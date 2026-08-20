"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const { register, isRegistering } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    try {
      const { data } = await register(form);
      setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
      toast.success("Account created!", { description: "Welcome to TradeIO." });
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Registration failed. Please check your details."
      );
    }
  }

  return (
    <AuthLayout
      title="Open a TradeIO account"
      footerLink={{
        text: "Already have an account?",
        actionText: "Login to TradeIO",
        href: "/login",
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div className="relative">
          <input
            id="name"
            type="text"
            placeholder=" "
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="peer w-full h-[46px] px-3.5 pt-1 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors"
          />
          <label
            htmlFor="name"
            className="absolute left-2.5 -top-2.5 px-1 bg-white text-xs text-[#888888] transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-[#999999] peer-placeholder-shown:top-3 peer-placeholder-shown:left-3.5 peer-focus:-top-2.5 peer-focus:left-2.5 peer-focus:text-xs peer-focus:text-blue-600 pointer-events-none"
          >
            Full name
          </label>
        </div>

        {/* Email */}
        <div className="relative">
          <input
            id="email"
            type="email"
            placeholder=" "
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="peer w-full h-[46px] px-3.5 pt-1 text-sm bg-white text-[#424242] border border-[#dcdcdc] rounded-[3px] focus:outline-none focus:border-blue-600 transition-colors"
          />
          <label
            htmlFor="email"
            className="absolute left-2.5 -top-2.5 px-1 bg-white text-xs text-[#888888] transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-[#999999] peer-placeholder-shown:top-3 peer-placeholder-shown:left-3.5 peer-focus:-top-2.5 peer-focus:left-2.5 peer-focus:text-xs peer-focus:text-blue-600 pointer-events-none"
          >
            Email address
          </label>
        </div>

        {/* Password */}
        <div className="relative">
          <input
            id="password"
            type={showPass ? "text" : "password"}
            placeholder="Password (min 8 characters)"
            autoComplete="new-password"
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

        {/* Continue Button */}
        <Button
          type="submit"
          className="w-full h-[42px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-[3px] shadow-none cursor-pointer transition-colors mt-2"
          disabled={isRegistering}
        >
          {isRegistering ? "Creating account..." : "Continue"}
        </Button>

        {/* Terms text */}
        <p className="text-[11px] text-[#999999] text-center leading-relaxed pt-1">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
