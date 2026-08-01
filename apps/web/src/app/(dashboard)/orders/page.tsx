"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function OrdersPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/fo-stocks");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      <p className="text-sm font-medium text-muted-foreground">Redirecting to F&O Live Watchlist...</p>
    </div>
  );
}
