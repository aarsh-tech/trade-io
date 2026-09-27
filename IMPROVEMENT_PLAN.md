# Algo_Trade_Web (Tradeio.site) — Audit & Improvement Plan

Reviewed: 26 Sept 2026. Scope: `apps/auth-service` (NestJS 11 + Prisma + socket.io + `kiteconnect` 5.2.0), `apps/web` (Next 16, React 19, Tailwind 4, Zustand, React Query), `prisma/schema.prisma`, `ecosystem.config.js`, `scripts/nginx-tradeio.conf`.

**Coverage note.** I read the core services in full (ticker, market gateway/service, broker client, brokers/orders/risk services, scheduler, position guard, auth, strategy controller/gateway, Prisma schema, nginx/PM2) and the key frontend plumbing (api client, auth store, market hooks, dashboard/positions/orders/screener, layout). The five strategy engines (1.6k–4.2k lines each) and the remaining frontend pages were only pattern-scanned (timers, order calls, REST calls, state), not read line by line. Findings below are tagged with file references; anything I could not confirm from code is marked **(verify)**.

---

## 1. Why it "doesn't work properly in the live market" — the short list

These are the issues most likely to explain live-market misbehaviour, in order of impact.

| # | Root cause | Where |
|---|-----------|-------|
| 1 | **Pre-trade RMS is dead code.** `RiskService.validateOrderSafety()` has zero callers. Engines call `client.placeOrder()` directly, so your per-user `maxOrderValue`, `maxOrderQty` and the kill-switch flag are never checked on strategy orders. Engines contain no `killSwitch` reference at all. | `risk.service.ts:64`, all `*.engine.ts` |
| 2 | **PM2 memory caps will restart the backend mid-session.** `--max-old-space-size=256`, `max_memory_restart: 320M` with five engines, instrument caches (NSE+NFO+BSE+BFO), candle caches and a socket server. Engine state is in-memory; after a restart running strategies are only re-armed inside the 09:15–09:16 window or on a broker re-login. Open positions can be orphaned. | `ecosystem.config.js`, `market-scheduler.service.ts:129` |
| 3 | **Any transient error marks a broker token EXPIRED.** `const healthStatus = isAuthError ? 'EXPIRED' : 'EXPIRED'`. `isTokenExpiredError` also matches any message containing `"token"`. Once `tokenHealth=EXPIRED`: ticker stops, auto-start skips the strategy, portfolio endpoints return `[]`. | `risk.service.ts:530`, `brokers.service.ts:19-31` |
| 4 | **No central Kite rate limiter.** All engines, scanners, portfolio polling, movers and the daily-loss watchdog share one api_key. Kite limits (per docs): quote 1 req/s, historical 3 req/s, orders 10 req/s, other 10 req/s, 400 orders/min, 5,000 orders/day. `getMovers` fires 4 back-to-back OHLC chunks, `getFoStocks` loops chunks, engines poll `getLTP` on a 3.5s stale check. Expect HTTP 429s under load. | `market.service.ts:305,379`, `emavwap.engine.ts:2482-2507` |
| 5 | **Swallowed errors return "empty" instead of failing.** `getOrders()` returns `[]`, `getLTP()` returns `{}` on any error. Callers (position guard, exit reconciliation, ledger sync) can't tell "no orders" from "Kite failed", which is how phantom "already flat" / "no fill" decisions happen. | `broker-client.factory.ts:193-196, 329-332` |
| 6 | **LTP has no previous close, so % change is wrong everywhere.** Kite's `/quote/ltp` returns only `instrument_token` + `last_price`. `getLivePrices()` and `getOverview()` read `close_price` from LTP responses (always missing), so change = 0. `getMarketOverview()` returns hard-coded fake changes (0.45, -0.22…) and fake prices when disconnected. The socket only streams LTP, so the UI computes drift from a wrong baseline. | `market.service.ts:123-138,168-175`, `brokers.service.ts:395-425`, `useDashboard.ts:66-96` |
| 7 | **`@Public()` endpoints run with `req.user === undefined`.** The guard returns `true` before Passport runs, so even logged-in users have no `req.user`. Services then call `prisma.brokerAccount.findFirst({ where: { userId: undefined, … } })`; Prisma ignores `undefined`, so it returns **any user's** account and uses **their** Kite session. | `market.controller.ts` (`live-prices`, `movers`, `fo-stocks`, `ohl-stocks`, `lot-size`), `jwt-auth.guard.ts` |
| 8 | **Order status is polled, not pushed.** Entries are verified with one `getOrders()` 600 ms after placement. `KiteTicker` also delivers `order_update` messages, but nothing listens to it. Partial fills, late fills and rejections after the 600 ms check are missed until the next polling loop. | `emavwap.engine.ts:1800-1830`, `ticker.service.ts` |
| 9 | **No market-holiday awareness.** Ticker and scheduler use weekday + clock only, so on exchange holidays they connect, auto-start strategies and run with no data. | `ticker.service.ts:84`, `market-scheduler.service.ts:98` |
| 10 | **Duplicate order rows → wrong P&L.** `BrokersService.placeOrder` creates the DB row asynchronously, `syncBrokerOrders` does `findFirst` then `create`, and `Order.brokerOrderId` has no unique constraint. Racing writers create duplicates that the FIFO ledger then double counts. | `brokers.service.ts:194`, `orders.service.ts:114-186`, `schema.prisma` (Order) |

---

## 2. Kite Connect v3 reference (from the docs you linked)

Used as the source of truth for the fixes below.

- **Auth**: `request_token` → `POST /session/token` with `checksum = SHA256(api_key + request_token + api_secret)`. Header: `Authorization: token api_key:access_token`. Token expires **6 AM next day**; also invalidated by logout or logging in to another API instance (`TokenException`, HTTP 403). Never expose `api_secret`/`access_token` client-side.
- **WebSocket**: `wss://ws.kite.trade`, **max 3000 instruments per connection, 3 connections per api_key**. Modes `ltp` (8 B), `quote` (44 B), `full` (184 B). Text frames carry `order` (postbacks), `error`, `message`. Prices in paise (÷100; ÷10^7 for currencies). 1-byte heartbeat.
- **Quotes**: `/quote` max 500 instruments (full), `/quote/ohlc` and `/quote/ltp` max 1000. Key = `exchange:tradingsymbol`. Missing key in response = no data. Do not key storage by token (tokens are reused after expiry).
- **Orders**: varieties `regular|amo|co|iceberg|auction`; products `CNC|NRML|MIS|MTF`; `tag` alphanumeric, **max 20 chars**; **market protection required for MARKET and SL-M** (0 is rejected, -1 = auto); `autoslice` max 10 slices; only open/pending orders can be modified/cancelled; order book lives one day; use postbacks/WebSocket for non-market order status.
- **Errors**: JSON `{status, message, error_type}`. `TokenException` 403, `InputException` 400, `OrderException`, `MarginException`, `HoldingException`, `NetworkException`, `DataException`, `GeneralException` 500. 429 = back off.
- **Historical**: `/instruments/historical/:token/:interval`, intervals `minute,3minute,5minute,10minute,15minute,30minute,60minute,day`, timestamps ISO with `+0530`.
- **GTT**: single or two-leg OCO, `trigger_values` order matches `orders` order, `last_price` required, statuses `active|triggered|disabled|expired|cancelled|rejected|deleted`.
- **Compliance (Kite forum announcement on retail algo rules)**: order endpoints need a **registered static IP** (whitelist in the developer console), a 10 orders/second per-client cap (429 above it), and market protection on MARKET/SL-M. **(verify)** the current effective dates and exact rules on the forum thread before relying on them. Your code already special-cases the "No IPs configured" error, so confirm the Lightsail server's static IP is whitelisted.

---

## 3. Full bug & risk register

### 3.1 Backend — trading safety & correctness

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| B1 | Critical | RMS pre-trade validation unused; engines bypass kill switch, user limits. | Create one `OrderGateway.place(userId, accountId, params, ctx)` used by engines, controllers and EOD/kill-switch flatten. It runs: kill switch → limits → freeze qty → margin check → rate/dedup (entries only) → Kite call → DB upsert → `recordBrokerSuccess/Rejection`. Remove direct `kite.placeOrder`/`client.placeOrder` from engines. |
| B2 | Critical | Emergency exits (`enforceEodSquareOff`, `triggerKillSwitch`) call `client['kite']` directly with no `market_protection`. Under Kite's rules MARKET orders without protection can be rejected, so the safety net may silently fail. Failures are only logged. | Route through `OrderGateway` with `marketProtection: -1`, retry with backoff, and raise an alert if a position is still open after N attempts. |
| B3 | Critical | Engine state lives in memory; restarts orphan live positions. | On boot: reconcile broker positions/orders with `StrategyExecution`, re-arm engines whose execution is `RUNNING`, or place protective exits. Persist entry/SL/target order IDs and state snapshots to the DB on every transition. |
| B4 | High | Token health marked EXPIRED on any error (see §1 #3). | Only mark EXPIRED on `error_type === 'TokenException'` or HTTP 403. Everything else = transient, keep `HEALTHY`, count failures, alert after N. |
| B5 | High | Order dedup uses tag-based "exit" detection (`tag` contains EXIT/SL/TARGET), but engines pass no `tag`. LIMIT target exits are therefore treated as entries and can be blocked by the 2 s dedup or the 10/min guard. | Add an explicit `intent: 'ENTRY'|'EXIT'|'PROTECTIVE'` field to `OrderParams`; exempt non-ENTRY intents. Also set `tag` (≤20 chars, alphanumeric) e.g. `S<shortStratId><E|X|S|T>` so orders are attributable in Kite's order book. |
| B6 | High | Two independent rate/dedup/fat-finger guard implementations (`ZerodhaClient.placeOrder` and `RiskService`) with different constants. `ZerodhaClient` has a hard-coded ₹2.5 L cap that only applies when a price is passed (MARKET orders skip it) and hard-coded freeze limits that go stale. | Single guard in `OrderGateway`. Freeze limits and lot sizes come from the instrument master (`freeze_quantity` is not in Kite's dump, so keep a config table updated from the NSE circular), not source code. |
| B7 | High | `getRiskStatus` P&L: realised P&L ignores SELL-first (short) trades; unrealised P&L includes **manual** positions on the account, so the daily-loss kill switch can fire on trades the algo never made. Runs every 15 s per user with a live `getPositions()` each time. | Use Kite positions `pnl` split by algo-tagged symbols/orders, cache positions 3–5 s, and share one poll across consumers. |
| B8 | High | EOD/kill-switch square-off is filtered by **symbol** (`algoSymbols.has(pos.tradingsymbol)`), so a manual position in the same symbol is squared off too, and it runs every minute 15:05–15:25 with no idempotency (can double-place while a prior MARKET is pending). | Match by order tag / `strategyId`, skip if an exit order for that position is already open. |
| B9 | High | `cancelOrder` hard-codes `"regular"`; CO/AMO/iceberg orders can't be cancelled. `variety` isn't stored on `Order`. | Store `variety` on the Order row; use it on cancel/modify. |
| B10 | Medium | `setSession` expiry always "tomorrow 06:00" even when logging in between 00:00–06:00. | Compute next 06:00 IST after now. |
| B11 | Medium | Scheduler auto-start only fires inside 09:15–09:16 (or on broker login). A backend restart at 09:20 leaves `autoStart` strategies stopped. `manuallyStoppedToday` is in memory. | Make auto-start idempotent and run it whenever `now ∈ [09:15, 15:00)` and strategy not `STOPPED/COMPLETED` today; persist manual-stop in DB. |
| B12 | Medium | `getOrder()` fetches the whole order book and scans; every engine loop calls `getOrders()`/`getPositions()` separately. | Kite `GET /orders/:id`; a shared per-account cache (1–2 s TTL) fed by `order_update` events. |
| B13 | Medium | `getInstruments(['NFO'])` in `getFoStocks` passes an array where the SDK expects a string; the `.catch(() => [])` hides the failure, so lot sizes never refresh. Movers use `getOHLC` then silently fall back to LTP (no close → change 0). | Fix arg, surface errors, cache instrument master once daily (08:45 IST) shared by all consumers. |
| B14 | Medium | `getOverview` asks for `NSE:BANKNIFTY`; the index tradingsymbol is `NIFTY BANK`. | Use the canonical index map (`NSE:NIFTY 50`, `NSE:NIFTY BANK`, `BSE:SENSEX`, …) in one shared constant. |
| B15 | Low | `process.on('uncaughtException')` logs and continues, leaving the process in an undefined state during live trading. | Log, alert, flatten-if-needed, then exit and let PM2 restart (with B3 recovery in place). |

### 3.2 Backend — market data feed

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| F1 | High | `MarketGateway` has no authentication and CORS `origin: callback(null, true)`. Any anonymous client can connect and drive server-side ticker subscriptions. | Verify JWT in `handleConnection` (same as `StrategyGateway`), restrict origins to `FRONTEND_URL`, cap symbols per client (e.g. 200). |
| F2 | High | Ticks are subscribed in `full` mode (184 B) although only `last_price` is used, and the payload sent to clients is LTP only. | Use `quote` mode; forward `{ltp, close, change, changePct, volume, oi, exchangeTs}` from the tick (`tick.ohlc.close`, `tick.change`). Batch into one `ticks` message per flush instead of one emit per symbol. |
| F3 | Medium | Duplicate events: a tick is mapped to both `SYMBOL` and `EXCH:SYMBOL`, each fans out to overlapping rooms, so a client can receive the same LTP 2–3 times per tick. Clients subscribe 5 aliases per symbol; `getSubscribedSymbols()` returns all aliases. | Normalise once to `EXCH:SYMBOL` server-side; a single room per instrument. |
| F4 | Medium | The ticker for dashboard symbols uses "first active strategy's account" or the first active account in the system, not the viewing user's. Users can stream on another user's Kite session, and the 3-connection limit is per api_key. | Bind subscriptions to the viewer's account (or a designated market-data account) explicitly. |
| F5 | Medium | No `order_update` handling, no feed heartbeat/staleness signal; tick timestamp is server `new Date()`, not the exchange timestamp. | Handle `order_update`, emit `feed:status` (connected/stale/closed + last exchange ts) to clients, fall back to REST quote only when stale. |
| F6 | Medium | Ticker symbol→token resolution does a per-miss `getInstruments` REST call and hard-codes index tokens. | Build the token map once from the daily instrument master; key by `exchange:tradingsymbol`. |
| F7 | Low | `cleanKiteTickerCache()` deletes `require.cache` entries to work around leaks. | Fix the underlying listener leak (remove listeners on disconnect) and delete the hack. |

### 3.3 Backend — security

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| S1 | Critical | `crypto.ts` contains a hard-coded 64-hex fallback key and a dev fallback; `encrypt()` uses `ENCRYPTION_SECRET` if set but decrypt accepts the committed keys. scrypt salt is the constant `'salt'`. | Fail on boot if `ENCRYPTION_SECRET` is missing; version the ciphertext (`v1:`) with per-record salt; rotate the committed keys (assume compromised) and re-encrypt stored API keys/secrets. |
| S2 | Critical | `ThrottlerModule` is imported but **`ThrottlerGuard` is never registered** (no `APP_GUARD`), so `@Throttle` on `/auth/login` does nothing. | Register `ThrottlerGuard` globally; add per-route limits on login/refresh/forgot-password. |
| S3 | High | Behind nginx, `trust proxy` isn't set, so `req.ip` is 127.0.0.1 for everyone. Once S2 is fixed, all users would share one login bucket. | `app.set('trust proxy', 1)` (Express adapter) and pass `X-Forwarded-For` (already in nginx). |
| S4 | High | Broker `accessToken` is stored in plaintext in `broker_accounts`; refresh tokens are stored raw. | Encrypt access tokens with the same envelope as API keys; store SHA-256 of refresh tokens. |
| S5 | High | `StrategyGateway` verifies the JWT but not that the user **owns** `strategyId`; any authenticated user can subscribe to any strategy room and read logs/orders. | Check `strategy.userId === payload.sub` before `client.join`. |
| S6 | High | JWT secret default `'changeme-super-secret-jwt'` in two places; default access expiry `8h` in code vs `15m` in `.env.example`. | Fail on boot if unset; 15 min access + rotating refresh. |
| S7 | Medium | Access/refresh tokens live in `localStorage` (XSS-exfiltratable), duplicated by Zustand `persist`. | httpOnly, `SameSite=Lax`, `Secure` refresh cookie; keep the access token in memory. Add a CSP header (Next config has none). |
| S8 | Medium | Password reset only `console.log`s the link — no email is sent, so the flow is effectively broken. | Add an email provider (Resend/SES) and log nothing sensitive. |
| S9 | Medium | CORS allows any localhost/LAN/private-IP origin in production. | Only allow those when `NODE_ENV !== 'production'`. |
| S10 | Medium | Kite login URL has no `redirect_params`/state; callback trusts whichever account is in the UI. | Send `redirect_params=accountId%3D…%26nonce%3D…`, verify nonce server-side, check `status=success`. |
| S11 | Low | `risk-disclosure` and admin flows return temporary passwords in API responses. | Deliver out-of-band, force change at first login. |

### 3.4 Data model

- `Order`: add `@@unique([brokerAccountId, brokerOrderId])`, `variety`, `tag`, `exchangeOrderId`, `statusMessage`, `updatedFromBrokerAt`. Use `upsert` everywhere.
- `Order.status` misses Kite's `TRIGGER PENDING`, `UPDATE`, `AMO REQ RECEIVED`; map explicitly rather than "anything else = OPEN".
- `Strategy.config` is a JSON **string**; move to `Json` and validate with a Zod/class-validator schema per `StrategyType`.
- Add `Trade` (fills from Kite `/trades`) so the ledger doesn't depend on order averages, and `Instrument` (daily master) to stop per-request REST fetches.
- Add indexes: `orders(userId, createdAt)`, `orders(strategyId, createdAt)`, `strategy_executions(strategyId, startedAt)`.
- Ledger (`orders.service.ts`): syncs the broker inside the read request (`getMonthlyLedger` awaits `syncBrokerOrders`), is N+1 per order, ignores brokerage/STT/charges, matches FIFO across all history without a per-day reset, and buckets months with server-local `getMonth()`. Because Kite's order book only lives a day, days you don't open the app or run an engine can be lost. Fix: EOD sync job at 15:40 IST, use `/trades`, add charges, compute day/month in IST, paginate.

### 3.5 Infra / deployment

- nginx: no `limit_req` on `/v1/auth/*`; `/v1/` block lacks `proxy_set_header Connection ""` for upstream keepalive; no CSP; `client_max_body_size 25M` is far above what the API needs. Socket.io location is fine (7d timeouts, upgrade headers).
- PM2: raise heap to ≥512 MB (or split the market-data/engine process from the HTTP API), run `pm2 startup`, add `kill_timeout` for graceful stop.
- Multiple deployment targets coexist (PM2/Lightsail, Vercel, Cloudflare `next-on-pages`, `.wrangler`, `apps/desktop/release`). Pick one and delete the rest to avoid config drift.
- `.turbo/cache` in the project folder is ~1.7 GB; it is gitignored but clean it (`pnpm clean`).
- No tests found under `src` (`turbo test` has nothing to run) and no CI.

### 3.6 Frontend

| ID | Finding | Fix |
|----|---------|-----|
| U1 | **Multiple socket connections per page.** `useMarketData` opens a new socket per call site (dashboard, positions, screener, LiveAlgoPositionsCard) and `useDashboard` opens another. Cleanup emits `unsubscribe` for raw symbols while 5 aliases were subscribed. | One app-level `MarketSocketProvider` + ref-counted subscriptions; auth token on the handshake. |
| U2 | **Render storm.** Every tick calls `setPrices({...prev})`, re-rendering every consumer (tables, cards) several times per second (and up to 3× per tick because of duplicate events). | Store ticks in a Zustand store / `useSyncExternalStore` keyed by symbol; components select one symbol; flush at ≤ 4–10 fps via `requestAnimationFrame`. Memoise table rows. |
| U3 | **Wrong / fake numbers.** `useDashboard` has a fake `stats` query (`portfolioValue: 165800`, `winRate: 68.4`), % change is derived from a wrong baseline, and the backend returns fake indices when disconnected. | Delete mocks; show "—" plus a "Connect broker" empty state; use server-provided `close`/`changePct`. |
| U4 | **No live-market state in the UI**: no connected/stale/closed feed indicator, no "market closed / holiday" banner, no per-price staleness cue, no token-expiry countdown (Kite tokens die at 06:00). | Global status bar: feed status + last tick age, market session (pre-open/open/closed/holiday), broker token expiry with one-click re-login. |
| U5 | `refetchOnWindowFocus: false` and `refetchOnReconnect: false` globally, so after laptop sleep or a network drop positions/orders stay stale up to 15–60 s. | Enable both for trading queries (positions, orders, margins, risk); keep off for static data. |
| U6 | **Theme/design debt.** ~230 hard-coded `bg-white`/`text-slate-*`/hex colours across dashboard, OrderWindow, QuickTradePanel, modals; `Toaster theme="light"`; dark variant defined but unused; only 1 `aria-label` in the app. | Semantic tokens (`--bg`, `--surface`, `--profit`, `--loss`, `--warn`, …) in `globals.css`; real dark mode via `next-themes`; a11y pass (labels, focus rings, colour + icon for P&L, not colour alone). |
| U7 | **Giant page files**: `strategies/[id]/page.tsx` 102 KB, `edit/page.tsx` 68 KB, `ledger` 62 KB, `live-screener` 53 KB, `portfolio` 44 KB, `dashboard` 34 KB. Hard to change safely. | Split into feature folders (`features/strategies/*`), server components for static shells, dynamic-import heavy chart/PDF code (`jspdf`, `recharts`). |
| U8 | Order entry (`OrderWindow`, `QuickTradePanel`): duplicated logic, no visible margin/qty/lot validation against the risk limits before submit **(verify)**, no idempotency key on submit (double-click → double order). | Shared `useOrderTicket` with lot-size/tick-size/margin validation, disabled-while-pending, confirm step for MARKET and > threshold value, idempotency key sent to backend. |
| U9 | Number formatting scattered (`toLocaleString` ×26). | One `formatINR`, `formatPct`, `formatQty` in `lib/format.ts`, tabular numerals, consistent decimals. |
| U10 | `any` casts in hooks/pages (`useAuth`, dashboard), no shared API types (only `packages/shared-types`, barely used). | Generate types from the backend DTOs / OpenAPI; type `api.ts` responses. |

---

## 4. Target architecture (what "properly working" looks like)

```
Browser ── socket (JWT) ──► MarketGateway ◄── TickerHub (1 ws per api_key, quote mode, ref-counted tokens)
   │                                     ▲                    │ order_update
   │ REST                                │                    ▼
   ▼                                     └── InstrumentStore (daily master, exchange:symbol keys)
Controllers ─► OrderGateway ─► RiskEngine (kill switch, limits, freeze, margin) ─► KiteRateLimiter ─► Kite REST
                    ▲                                                            (token buckets: 10/s, quote 1/s, hist 3/s, orders 10/s+400/min)
Strategy engines ───┘  (pure signal logic + injected clock/price feed → unit-testable, replayable)
        │
        └─► StateStore (DB snapshots) ─► Recovery on boot ─► Reconciler (broker vs DB every N s)
```

Principles: one door for orders, one door for Kite REST, one feed per api_key, engines are pure functions of (ticks, state) with side effects behind interfaces, everything idempotent and recoverable.

---

## 5. Phased plan

### Phase 0 — Stop the bleeding (do before the next live session; ~2–3 days)

1. Route **all** order flow (engines, controllers, EOD, kill switch) through one `OrderGateway`; wire `validateOrderSafety`, kill-switch check, `recordBrokerRejection/Success`; add `intent` and `tag`. (B1, B2, B5, B6)
2. Fix token-health logic (only `TokenException`/403 ⇒ EXPIRED). (B4)
3. Remove `@Public()` from market endpoints that need a user, or resolve the account explicitly; never call `findFirst` with `userId: undefined` (add a lint/guard helper). (§1 #7)
4. Register `ThrottlerGuard`, set `trust proxy`, require `JWT_SECRET`/`ENCRYPTION_SECRET` at boot, rotate the committed keys. (S1, S2, S3, S6)
5. Authenticate `MarketGateway`; ownership check on `StrategyGateway`. (F1, S5)
6. Raise PM2 heap (≥512 MB), disable `process.on('uncaughtException')` swallowing (log + exit). (B15, §3.5)
7. Delete fake market data (`getMarketOverview` mocks, `useDashboard.stats`). (U3)
8. Whitelist the server's static IP in the Kite developer console and confirm order placement works from it. **(verify)**

**Exit criteria:** with a 1-lot paper→live test, a kill-switch trigger blocks engine orders within one tick; a forced backend restart mid-position leaves no orphan (manual check); no endpoint returns another user's data (test with two users).

### Phase 1 — Kite-correct data & execution (~1 week)

1. `KiteRateLimiter` (token buckets per endpoint class) wrapping every REST call, with 429 back-off and jitter; expose metrics. (§1 #4)
2. `InstrumentStore`: daily master at 08:45 IST, `exchange:tradingsymbol` keys, lot/tick size, expiry chain lookup; replace all per-call `getInstruments`. (B13, F6)
3. `TickerHub`: one ws per api_key, `quote` mode, ref-counted subscribe/unsubscribe, handle `order_update`, heartbeat + `feed:status`, exchange timestamps, subscription cap 3000. (F2–F6, §1 #8)
4. Shared per-account cache for positions/orders/margins fed by `order_update` (replaces 600 ms poll and per-engine `getOrders`). (B12)
5. Stop swallowing errors in `ZerodhaClient`; typed `KiteError` (`TokenException`, `InputException`, `OrderException`, `MarginException`, `NetworkException`) with retry policy only for network/429/5xx. (§1 #5)
6. Market calendar (holidays, special sessions like Muhurat) gating ticker, scheduler and auto-start. (§1 #9)
7. Session lifecycle: 06:00 expiry countdown, pre-market health check at 08:30 with notification, login-URL `redirect_params` + nonce, `setSession` expiry fix. (B10, S10)
8. Boot recovery + state snapshots + broker↔DB reconciler; DB-persisted manual-stop; auto-start idempotent across the day. (B3, B11)

**Exit criteria:** load test — 5 strategies + 2 dashboard tabs for a full session with zero 429s; kill `pm2` mid-session and strategies/positions are re-adopted within 10 s; tick→UI latency p95 < 300 ms; feed status flips to STALE within 5 s of a dropped socket.

### Phase 2 — Data correctness (~3–4 days)

Unique constraint + `upsert`; `Trade` table from `/trades`; EOD sync at 15:40 IST; ledger with charges, IST bucketing, pagination; realised/unrealised P&L split algo vs manual; `variety`/`tag` persisted; JSON config validation per strategy type. (§3.4, B7, B9)

### Phase 3 — UI/UX overhaul (~1.5–2 weeks, can start in parallel with Phase 1)

1. Design tokens + dark mode + typography (tabular figures), status colours with icons. (U6)
2. App shell: top status bar (feed, session, token expiry, kill switch, day P&L), collapsible sidebar, mobile bottom nav retained. (U4)
3. `MarketSocketProvider` + tick store + throttled rendering; rebuild watchlist/positions/orders tables with virtualised rows (`@tanstack/react-table` + virtual). (U1, U2)
4. Order ticket rebuild (`useOrderTicket`), confirm/idempotency, risk-limit preview. (U8)
5. Dashboard: real day P&L, funds, running strategies with live state, risk usage meter, movers with correct % from `close`. (U3)
6. Strategy pages: split monoliths; live "engine console" (state, next check, last signal, SL/target lines, log stream with filters); a proper create/edit wizard with schema validation. (U7)
7. Loading/empty/error/offline states everywhere; `refetchOnWindowFocus/Reconnect` for trading queries. (U5)
8. Accessibility & performance budget: keyboard nav, focus states, `aria-*`, Lighthouse ≥ 90 on dashboard; dynamic imports for `recharts`/`jspdf`.

### Phase 4 — Engineering hygiene (ongoing)

Unit tests on pure strategy logic with recorded-tick replay (start with EMA/VWAP and 15-min breakout), Prisma integration tests for the ledger, Playwright smoke tests (login, connect broker, place paper order); GitHub Actions (lint, typecheck, test, build); structured logging (pino) with correlation IDs; alerts (Telegram/email) for kill switch, token expiry, rejected exits, feed stale, restart; one deploy path (PM2 or container), zero-downtime restarts; delete unused targets (Cloudflare/Vercel/desktop) or document them.

---

## 6. Live-market rollout & test protocol

1. **Replay harness**: record a full day of ticks (from the ticker hub) and replay through engines with an injected clock; assert entries/exits/PnL.
2. **Paper mode for a full week** with `OrderGateway` in dry-run (real risk checks, no Kite call), compare against actual market fills.
3. **Live with 1 lot, one strategy, MIS only**, kill switch armed, static IP confirmed, alerts on.
4. Add strategies one at a time; review the reconciler report daily (broker vs DB positions/orders must match 100%).
5. Chaos checks before scaling: kill the process, drop the websocket, expire the token, return 429 — each must end in a safe, logged state.

## 7. Suggested order of work (if you want to start immediately)

`B1/B2 OrderGateway` → `S2/S3/S1 security` → `B4 token logic` → `@Public fix` → `PM2 memory + recovery` → `KiteRateLimiter + InstrumentStore` → `TickerHub` → `UI socket provider + tick store` → `design tokens/dark mode` → `ledger/data model` → tests/CI.

---

### Sources
- [Kite Connect v3 docs](https://kite.trade/docs/connect/v3/) (user, orders, market quotes, WebSocket, historical, GTT, postbacks, exceptions & rate limits)
- [Kite Connect forum: preparing to comply with SEBI's retail algo rules](https://kite.trade/forum/discussion/15912/preparing-to-comply-with-sebis-retail-algo-rules-static-ip-ratelimits-order-types)
- [Zerodha support: static IP for the Kite API](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/static-ip)
