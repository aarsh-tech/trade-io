"use client";

export const runtime = "edge";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function RegisterPage() {
  return (
    <AuthLayout
      title="Registration Closed"
      subtitle="Tradeio.site is an exclusive, private algorithmic trading terminal."
    >
      <div className="space-y-6 text-center py-4">
        <div className="h-14 w-14 rounded-full bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-600 shadow-2xs">
          <Lock className="h-6 w-6 stroke-[2]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">
            Invite-Only Platform
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
            Public signups are currently disabled. Accounts can only be provisioned directly by the platform administrator.
          </p>
        </div>

        <div className="pt-2">
          <Link href="/login" className="block w-full">
            <Button
              type="button"
              className="w-full h-[42px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-[3px] shadow-none cursor-pointer transition-colors"
            >
              Return to Login
            </Button>
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
