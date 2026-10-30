'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { marketApi } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface MoveAlert {
  id: string;
  hhmm: string;
  symbol: string;
  type: 'OPEN_DRIVE' | 'BREAKDOWN' | 'BREAKOUT';
  level: number;
  ltp: number;
  open: number;
  prevClose: number;
  changePct: number;
  fromOpenPct: number;
  volPace: number;
  stopRef: number;
  text: string;
}

interface MoveAlertsData {
  day: string;
  status: string;
  updatedAt: string;
  alerts: MoveAlert[];
}

const TYPE_LABEL: Record<MoveAlert['type'], string> = {
  OPEN_DRIVE: 'Open-drive down',
  BREAKDOWN: 'Range breakdown',
  BREAKOUT: 'Range breakout',
};

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* sound is optional */ }
}

export default function MoveAlertsPage() {
  const [sound, setSound] = useState(true);
  const seen = useRef<Set<string> | null>(null);

  const { data } = useQuery({
    queryKey: ['move-alerts'],
    queryFn: async () => (await marketApi.getMoveAlerts()).data?.data as MoveAlertsData,
    refetchInterval: 15_000,
  });

  // Sound + desktop notification for alerts that arrive while the page is open (not for the ones already there).
  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.alerts.map((a) => a.id));
      return;
    }
    const fresh = data.alerts.filter((a) => !seen.current!.has(a.id));
    for (const a of fresh) {
      seen.current.add(a.id);
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`${TYPE_LABEL[a.type]}: ${a.symbol}`, { body: a.text });
        }
      } catch { /* notifications are optional */ }
    }
    if (fresh.length > 0 && sound) beep();
  }, [data, sound]);

  const enableNotifications = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
  };

  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">Move Alerts</h1>
            <Badge variant="secondary" className="text-[11px]">{data?.status ?? 'loading'}</Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Stocks down 2% / 4% from the open that never traded back above it, and breaks of a tight 5-day range on
            volume. Alerts only, no orders; you decide the trade. Scans every 30 s from 09:20 to 15:00.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={enableNotifications}>
            <BellRing className="h-4 w-4 mr-1.5" /> Desktop alerts
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSound((s) => !s)} aria-pressed={sound}>
            {sound ? <Volume2 className="h-4 w-4 mr-1.5" /> : <VolumeX className="h-4 w-4 mr-1.5" />}
            Sound {sound ? 'on' : 'off'}
          </Button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No alerts yet today. They appear here as stocks qualify after 09:20.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {alerts.map((a) => {
            const bull = a.type === 'BREAKOUT';
            return (
              <Card key={a.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                  <div className="flex items-center gap-3 sm:w-64 shrink-0">
                    <span className="text-xs tabular-nums text-muted-foreground">{a.hhmm}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{a.symbol}</div>
                      <div className={cn('text-xs font-medium', bull ? 'text-profit' : 'text-loss')}>
                        {TYPE_LABEL[a.type]}
                        {a.type === 'OPEN_DRIVE' ? ` ${a.level}%` : ''}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-1 text-xs flex-1">
                    <div><dt className="text-muted-foreground">LTP</dt><dd className="tabular-nums text-foreground">{formatINR(a.ltp)}</dd></div>
                    <div><dt className="text-muted-foreground">From open</dt><dd className={cn('tabular-nums', a.fromOpenPct < 0 ? 'text-loss' : 'text-profit')}>{a.fromOpenPct.toFixed(1)}%</dd></div>
                    <div><dt className="text-muted-foreground">Day change</dt><dd className={cn('tabular-nums', a.changePct < 0 ? 'text-loss' : 'text-profit')}>{a.changePct.toFixed(1)}%</dd></div>
                    <div><dt className="text-muted-foreground">Volume pace</dt><dd className="tabular-nums text-foreground">{a.volPace.toFixed(1)}x</dd></div>
                    <div><dt className="text-muted-foreground">{bull ? 'Stop ref (day low)' : 'Stop ref (day high)'}</dt><dd className="tabular-nums text-foreground">{formatINR(a.stopRef)}</dd></div>
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
