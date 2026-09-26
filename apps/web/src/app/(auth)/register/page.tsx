"use client";

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
        <div className="h-14 w-14 rounded-full bg-warn-subtle border border-warn/80 flex items-center justify-center mx-auto text-warn">
          <Lock className="h-6 w-6 stroke-[2]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            Invite-Only Platform
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Public signups are currently disabled. Accounts can only be provisioned directly by the platform administrator.
          </p>
        </div>

        <div className="pt-2">
          <Link href="/login" className="block w-full">
            <Button
              type="button"
              className="w-full h-[42px] bg-primary hover:bg-brand-hover active:bg-brand-hover text-primary-foreground text-sm font-medium rounded-[3px] shadow-none cursor-pointer transition-colors"
            >
              Return to Login
            </Button>
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
