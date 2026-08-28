"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store";

export default function AuthLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (isAuthenticated || token) {
      router.replace("/dashboard");
    } else {
      setChecking(false);
    }
  }, [isAuthenticated, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fbfbfb]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-xs text-[#777777] font-medium">Checking session...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
