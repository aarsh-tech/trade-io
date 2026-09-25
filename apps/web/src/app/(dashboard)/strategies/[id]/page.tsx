"use client";

export const runtime = "edge";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStrategyDetail, withStrategy } from "@/features/strategies/detail/useStrategyDetail";
import { HeaderBar } from "@/features/strategies/detail/HeaderBar";
import { MetricCards } from "@/features/strategies/detail/MetricCards";
import { PositionHero } from "@/features/strategies/detail/PositionHero";
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
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <Bot className="w-5 h-5 text-primary absolute" />
        </div>
        <p className="text-xs font-medium text-muted-foreground animate-pulse">
          Connecting to strategy runtime & live telemetry...
        </p>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="text-center py-20 bg-card/30 rounded-2xl border border-border/60 max-w-lg mx-auto mt-10 p-8">
        <Bot className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <h2 className="text-lg font-bold">Strategy Not Found</h2>
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
    <div className="space-y-6 pb-16 animate-[fade-up_0.4s_ease_both]">
      <HeaderBar ctx={ctx} />
      <MetricCards ctx={ctx} />
      <PositionHero ctx={ctx} />
      <TabsBar ctx={ctx} />
      <LiveTab ctx={ctx} />
      <ConfigTab ctx={ctx} />
      <AnalyticsTab ctx={ctx} />
      <HistoryTab ctx={ctx} />
    </div>
  );
}
