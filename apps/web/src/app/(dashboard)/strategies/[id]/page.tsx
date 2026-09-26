"use client";

export const runtime = "edge";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStrategyDetail, withStrategy } from "@/features/strategies/detail/useStrategyDetail";
import { HeaderBar } from "@/features/strategies/detail/HeaderBar";
import { Skeleton } from "@/features/strategies/detail/shared";
import { TabsBar } from "@/features/strategies/detail/TabsBar";
import { LiveTab } from "@/features/strategies/detail/LiveTab";
import { ConfigTab } from "@/features/strategies/detail/ConfigTab";
import { AnalyticsTab } from "@/features/strategies/detail/AnalyticsTab";
import { HistoryTab } from "@/features/strategies/detail/HistoryTab";

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useStrategyDetail(id);
  const { loading, strategy } = detail;

  if (loading) {
    return (
      <div className="space-y-4 pb-16" aria-busy="true" aria-label="Loading strategy">
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 md:h-8 md:w-8" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px]" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="text-center py-20 bg-card rounded-lg border border-border max-w-lg mx-auto mt-10 p-8">
        <Bot className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <h2 className="text-lg font-semibold">Strategy Not Found</h2>
        <p className="text-xs text-muted-foreground mt-1">
          This strategy may have been deleted or moved.
        </p>
        <Link href="/strategies">
          <Button variant="outline" size="sm" className="mt-4 gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Strategies
          </Button>
        </Link>
      </div>
    );
  }


  const ctx = withStrategy(detail);
  if (!ctx) return null;

  return (
    <div className="space-y-4 pb-16">
      <HeaderBar ctx={ctx} />
      <TabsBar ctx={ctx} />
      <LiveTab ctx={ctx} />
      <ConfigTab ctx={ctx} />
      <AnalyticsTab ctx={ctx} />
      <HistoryTab ctx={ctx} />
    </div>
  );
}
