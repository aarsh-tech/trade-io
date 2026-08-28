"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (isAuthenticated || token) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbfbfb]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-xs text-[#777777] font-medium">Redirecting...</p>
      </div>
    </div>
  );
}
