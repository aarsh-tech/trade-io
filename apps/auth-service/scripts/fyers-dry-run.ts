/**
 * Read-only FYERS adapter check against a real FYERS session: profile, funds, quotes, candles, instrument master and
 * (with --scan) one pass of the EMA-VWAP stock scanner. It never places, modifies or cancels an order: live orders are
 * forced off and the order methods are replaced with throwing stubs before anything runs.
 *
 *   # token from a FYERS account already linked in the app (decrypted with ENCRYPTION_SECRET from .env):
 *   pnpm --filter @algo-trade/auth-service fyers:dry-run -- --account <brokerAccountId> [--scan]
 *   # or a token you have in hand (never printed):
 *   FYERS_APP_ID=AB12CD34EF-100 FYERS_ACCESS_TOKEN=... pnpm --filter @algo-trade/auth-service fyers:dry-run -- [--scan]
 */
import * as path from 'path';
import { FyersClient } from '../src/brokers/broker-client.factory';
import { getTopCandidateStocks } from '../src/strategy/smart-stock-picker';

process.env.FYERS_LIVE_ORDERS = 'false';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function credentials(): Promise<{ appId: string; accessToken: string }> {
  const accountId = option('--account');
  if (accountId) {
    try { (process as any).loadEnvFile(path.resolve(__dirname, '../../../.env')); } catch { /* env already set */ }
    const { PrismaClient } = require('@prisma/client');
    const { decrypt } = require('../src/common/utils/crypto');
    const prisma = new PrismaClient();
    try {
      const acc = await prisma.brokerAccount.findUnique({ where: { id: accountId } });
      if (!acc) throw new Error(`Broker account ${accountId} not found`);
      if (acc.broker !== 'FYERS') throw new Error(`Broker account ${accountId} is ${acc.broker}, not FYERS`);
      if (!acc.accessToken) throw new Error('That FYERS account has no session: log in from the Brokers page first');
      return { appId: decrypt(acc.apiKeyEnc), accessToken: decrypt(acc.accessToken) };
    } finally {
      await prisma.$disconnect();
    }
  }
  const appId = process.env.FYERS_APP_ID;
  const accessToken = process.env.FYERS_ACCESS_TOKEN;
  if (!appId || !accessToken) throw new Error('Pass --account <id>, or set FYERS_APP_ID and FYERS_ACCESS_TOKEN');
  return { appId, accessToken };
}

async function step(name: string, fn: () => Promise<string>) {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`✔ ${name} (${Date.now() - t0} ms)\n    ${out.split('\n').join('\n    ')}`);
    return true;
  } catch (err: any) {
    console.log(`✘ ${name} (${Date.now() - t0} ms): ${err?.error_type ? `${err.error_type}: ` : ''}${err?.message || err}`);
    return false;
  }
}

async function main() {
  const { appId, accessToken } = await credentials();
  const client = new FyersClient(appId, accessToken);
  const kite = (client as any).kite;
  const blocked = async () => { throw new Error('dry run: order calls are disabled'); };
  kite.placeOrder = blocked;
  kite.modifyOrder = blocked;
  kite.cancelOrder = blocked;

  let ok = true;
  ok = await step('profile', async () => {
    const p = await client.getProfile!();
    return `client ${p.user_id} (${p.user_name})`;
  }) && ok;
  ok = await step('funds -> Kite margins', async () => {
    const m = await client.getMargins();
    return `equity live_balance ₹${m.equity.available.live_balance} | cash ₹${m.equity.available.cash} | used ₹${m.equity.utilised.debits}`;
  }) && ok;
  ok = await step('quotes', async () => {
    const q = await client.getQuotes(['NSE:SBIN', 'NSE:RELIANCE', 'NSE:NIFTY 50', 'NSE:NIFTY BANK']);
    return Object.entries(q).map(([k, v]) => `${k}: ltp ${v.ltp} | prev close ${v.close} | vol ${v.volume} | ${v.exchangeTs}`).join('\n');
  }) && ok;
  ok = await step('5m candles (engine path: symbol -> token -> FYERS history)', async () => {
    const to = new Date();
    const c = await client.getHistoricalData('SBIN', 'NSE', '5minute', new Date(to.getTime() - 5 * 24 * 3600_000), to);
    const last = c[c.length - 1];
    return `${c.length} candles, last ${last?.date?.toISOString()} O ${last?.open} H ${last?.high} L ${last?.low} C ${last?.close} V ${last?.volume}`;
  }) && ok;
  ok = await step('daily index candles', async () => {
    const to = new Date();
    const c = await client.getHistoricalData('NIFTY 50', 'NSE', 'day', new Date(to.getTime() - 10 * 24 * 3600_000), to);
    return `${c.length} NIFTY 50 daily candles, last close ${c[c.length - 1]?.close}`;
  }) && ok;
  ok = await step('instrument master + tick size', async () => {
    const nse = await client.getInstruments('NSE');
    const eq = nse.filter((i: any) => i.instrument_type === 'EQ').length;
    return `${nse.length} NSE rows (${eq} EQ); SBIN tick ${await client.getTickSize('SBIN', 'NSE')}; SBIN lot ${await client.getLotSize!('SBIN')}`;
  }) && ok;
  ok = await step('positions / orders / trades (read only)', async () => {
    const [pos, ord, trd] = await Promise.all([client.getPositions(), client.getOrders(), client.getTrades()]);
    return `${pos.length} positions, ${ord.length} orders, ${trd.length} trades today`;
  }) && ok;
  if (flag('--scan')) {
    ok = await step('EMA-VWAP stock scanner (whole NSE market, ~45 quote calls)', async () => {
      const picks = await getTopCandidateStocks(kite, 1000, 500, undefined, undefined, 10);
      return picks.length
        ? picks.slice(0, 10).map((c: any) => `${c.symbol} ₹${c.ltp} score ${c.score}`).join('\n')
        : 'no candidates (normal outside market hours if quotes show no movement)';
    }) && ok;
  }
  console.log(`\nFYERS API requests: ${kite.http.stats.requests} (rate-limited retries: ${kite.http.stats.rateLimited})`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`✘ ${err?.message || err}`);
  process.exit(1);
});
