"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FoStocksRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/live-screener");
  }, [router]);

  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="text-center space-y-2">
        <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent animate-spin rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">Redirecting to Live OHL Screener & Market Watch...</p>
      </div>
    </div>
  );
}
