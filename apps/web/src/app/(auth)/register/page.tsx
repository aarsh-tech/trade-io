"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
      toast.error(err?.response?.data?.message || err?.response?.data?.error || "Registration failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-[400px] bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-[fade-up_0.5s_ease_both]">
        
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-extrabold text-slate-900">TradeIO</span>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Create an account</h1>
          <p className="text-sm text-slate-500 mt-2">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 block">Full Name</label>
            <input
              id="name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 block">Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700 block">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? "text" : "password"}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="w-full h-10 px-3 pr-10 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg mt-2" disabled={isRegistering}>
            {isRegistering ? "Creating Account..." : "Create Account"}
          </Button>

          <p className="text-xs text-slate-500 text-center leading-relaxed font-medium pt-2">
            By signing up, you agree to our <span className="text-blue-600 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-blue-600 hover:underline cursor-pointer">Privacy Policy</span>.
          </p>
        </form>
      </div>
    </div>
  );
}

