import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';

/**
 * Shared crash / restart recovery for strategy engines.
 *
 * After a restart an engine has an empty in-memory state, so a position that was open when the
 * process died would otherwise be left unmanaged. `findOpenPosition` reconstructs that position:
 *  - LIVE:  from the broker's net positions, but only for symbols this strategy itself ordered
 *           today (manual / overnight positions are never adopted).
 *  - PAPER: from today's saved paper orders (net of COMPLETE buys and sells per symbol).
 * Engines then map the result onto their own state and resume their real-time monitor.
 */

export interface RecoveredPosition {
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  /** Quantity when the position was opened (differs from qty after a partial booking). */
  initialQty: number;
  avgPrice: number;
  entryOrderId: string | null;
  slOrderId: string | null;
  slPrice: number | null;
  targetOrderId: string | null;
  targetPrice: number | null;
  isPaper: boolean;
}

/** Orders of a strategy, including legacy rows that were saved with only an executionId. */
export function strategyOrderWhere(strategyId: string) {
  return { OR: [{ strategyId }, { execution: { strategyId } }] };
}

export function istDayStart(now = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${day}T00:00:00.000+05:30`);
}

interface FindArgs {
  prisma: PrismaService;
  factory: BrokerClientFactory;
  strategyId: string;
  executionId: string;
  isPaper: boolean;
  brokerAccount: any | null;
  /** Optional filter, e.g. restrict to a product type or symbol prefix. */
  accept?: (symbol: string) => boolean;
}

export async function findOpenPosition(args: FindArgs): Promise<RecoveredPosition | null> {
  const { prisma, isPaper } = args;
  const since = istDayStart();
  const accept = args.accept ?? (() => true);

  const todays: any[] = await prisma.order
    .findMany({
      where: { ...strategyOrderWhere(args.strategyId), createdAt: { gte: since }, isPaperTrade: isPaper },
      orderBy: { createdAt: 'asc' },
    })
    .catch(() => []);
  if (todays.length === 0) return null;

  return isPaper ? findPaper(args, todays, accept) : findLive(args, todays, accept);
}

// ── PAPER ────────────────────────────────────────────────────────────────────

async function findPaper(
  { prisma, executionId }: FindArgs,
  todays: any[],
  accept: (s: string) => boolean,
): Promise<RecoveredPosition | null> {
  const complete = todays.filter((o) => o.status === 'COMPLETE' && accept(o.symbol));

  // Walk each symbol's fills; the position is open when the running net quantity is non-zero.
  const open: { symbol: string; net: number; entryQty: number; cost: number; entryOrderId: string | null; exchange: string; at: number }[] = [];
  const bySymbol = new Map<string, any[]>();
  for (const o of complete) {
    if (!bySymbol.has(o.symbol)) bySymbol.set(o.symbol, []);
    bySymbol.get(o.symbol)!.push(o);
  }
  for (const [symbol, list] of bySymbol) {
    let net = 0;
    let entryQty = 0;
    let entryCost = 0;
    let entryOrderId: string | null = null;
    let entrySign = 0;
    for (const o of list) {
      const px = o.price ?? o.avgPrice ?? 0;
      const signed = o.side === 'BUY' ? o.qty : -o.qty;
      // SL / target / exit legs can never open a position; when a paper close flips several legs
      // to COMPLETE, the extra ones must not be read as a fresh opposite entry.
      if (net === 0 && /(_SL|TARGET|EXIT|PARTIAL)/.test(o.brokerOrderId ?? '')) continue;
      if (net === 0) {
        entryQty = 0;
        entryCost = 0;
        entryOrderId = o.brokerOrderId ?? null;
        entrySign = Math.sign(signed);
      }
      if (Math.sign(signed) === entrySign) {
        entryQty += Math.abs(signed);
        entryCost += px * Math.abs(signed);
      }
      net += signed;
      // Paper exits can be over-filled (SL + target legs both flipped to COMPLETE on close);
      // treat crossing zero as flat rather than a phantom opposite position.
      if (net !== 0 && Math.sign(net) !== entrySign) net = 0;
    }
    if (net !== 0 && entryQty > 0) {
      open.push({
        symbol,
        net,
        entryQty,
        cost: entryCost / entryQty,
        entryOrderId,
        exchange: list[list.length - 1].exchange,
        at: new Date(list[list.length - 1].createdAt).getTime(),
      });
    }
  }
  if (open.length === 0) return null;
  const pos = open.sort((a, b) => b.at - a.at)[0];
  const exitSide = pos.net > 0 ? 'SELL' : 'BUY';

  // Paper SL / target legs are saved as OPEN orders on the exit side.
  const legs = todays
    .filter((o) => o.symbol === pos.symbol && o.status === 'OPEN' && o.side === exitSide)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sl = legs.find((o) => o.orderType === 'SL' || o.orderType === 'SL_M');
  const target = legs.find((o) => o.orderType === 'LIMIT');

  // The engines' paper monitors look legs up by executionId, so adopt them into the new execution.
  const legIds = legs.map((o) => o.id);
  if (legIds.length > 0) {
    await prisma.order
      .updateMany({ where: { id: { in: legIds } }, data: { executionId } })
      .catch(() => undefined);
  }

  return {
    symbol: pos.symbol,
    exchange: pos.exchange,
    side: pos.net > 0 ? 'LONG' : 'SHORT',
    qty: Math.abs(pos.net),
    initialQty: pos.entryQty,
    avgPrice: pos.cost,
    entryOrderId: pos.entryOrderId,
    slOrderId: sl?.brokerOrderId ?? null,
    slPrice: sl ? (sl.triggerPrice ?? sl.price ?? null) : null,
    targetOrderId: target?.brokerOrderId ?? null,
    targetPrice: target ? (target.price ?? target.triggerPrice ?? null) : null,
    isPaper: true,
  };
}

// ── LIVE ─────────────────────────────────────────────────────────────────────

async function findLive(
  { factory, brokerAccount }: FindArgs,
  todays: any[],
  accept: (s: string) => boolean,
): Promise<RecoveredPosition | null> {
  if (!brokerAccount?.accessToken) return null;

  // Ownership shield: only symbols this strategy has ordered today may be adopted.
  const owned = new Set<string>(todays.map((o) => o.symbol).filter(accept));
  if (owned.size === 0) return null;

  try {
    const client = factory.createClient(brokerAccount);
    const kite = (client as any)['kite'] || client;
    if (!kite?.getPositions) return null;

    const positions = await kite.getPositions().catch(() => null);
    const net: any[] = positions?.net || [];
    const openPos = net.find((p) => Number(p.quantity) !== 0 && owned.has(p.tradingsymbol));
    if (!openPos) return null;

    const rawQty = Number(openPos.quantity);
    const symbol: string = openPos.tradingsymbol;
    const avgPrice = Number(openPos.average_price) || Number(openPos.buy_price) || Number(openPos.sell_price) || 0;

    const orders: any[] = await (kite.getOrders ? kite.getOrders() : []).catch(() => []);
    const openOrders = (orders || []).filter(
      (o: any) => o.tradingsymbol === symbol && (o.status === 'TRIGGER PENDING' || o.status === 'OPEN'),
    );
    const sl = openOrders.find((o: any) => o.order_type === 'SL' || o.order_type === 'SL-M');
    const target = openOrders.find((o: any) => o.order_type === 'LIMIT');

    return {
      symbol,
      exchange: openPos.exchange,
      side: rawQty > 0 ? 'LONG' : 'SHORT',
      qty: Math.abs(rawQty),
      initialQty: Math.abs(rawQty),
      avgPrice,
      entryOrderId: null,
      slOrderId: sl?.order_id ?? null,
      slPrice: sl ? Number(sl.trigger_price) || Number(sl.price) || null : null,
      targetOrderId: target?.order_id ?? null,
      targetPrice: target ? Number(target.price) || null : null,
      isPaper: false,
    };
  } catch {
    return null;
  }
}

export interface DailyTally {
  trades: number;
  wins: number;
  losses: number;
  realizedPnlRs: number;
}

/** Today's completed round-trips for a strategy, rebuilt from saved COMPLETE orders. */
export async function tallyTodaysTrades(prisma: PrismaService, strategyId: string): Promise<DailyTally> {
  const orders: any[] = await prisma.order
    .findMany({
      where: { ...strategyOrderWhere(strategyId), createdAt: { gte: istDayStart() }, status: 'COMPLETE' },
      orderBy: { createdAt: 'asc' },
    })
    .catch(() => []);

  const tally: DailyTally = { trades: 0, wins: 0, losses: 0, realizedPnlRs: 0 };
  const bySymbol = new Map<string, any[]>();
  for (const o of orders) {
    if (!bySymbol.has(o.symbol)) bySymbol.set(o.symbol, []);
    bySymbol.get(o.symbol)!.push(o);
  }
  for (const list of bySymbol.values()) {
    let pos = 0;
    let cash = 0;
    for (const o of list) {
      const px = o.price ?? o.avgPrice ?? 0;
      if (pos === 0) tally.trades++;
      if (o.side === 'BUY') {
        pos += o.qty;
        cash -= px * o.qty;
      } else {
        pos -= o.qty;
        cash += px * o.qty;
      }
      if (pos === 0) {
        tally.realizedPnlRs += cash;
        if (cash > 0) tally.wins++;
        else if (cash < 0) tally.losses++;
        cash = 0;
      }
    }
  }
  return tally;
}
