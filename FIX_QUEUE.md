# Fix Queue — one fix per session

`IMPROVEMENT_PLAN.md` is the full audit. This file is the working queue: each fix is small enough for one fresh session and carries everything that session needs, so it doesn't have to re-read the whole project.

## How to run a session (token-efficient)

1. Open a **new session** with the project folder connected.
2. Paste the **Start prompt** of the next unchecked fix (below). Nothing else.
3. The session should read only the files listed under "Read", make the change, run the build/tests, and stop.
4. When done, tick the box here and add a one-line note under "Log".
5. Save the `algo-trade-backend` / `algo-trade-frontend` skills first (they hold the standing rules, so prompts stay short).

Rules for every session: don't read the strategy engines end to end (use targeted `grep`), don't re-audit, don't touch files outside the list unless a compile error forces it, test with paper mode / 1 lot only, no commits unless asked.

---

## Phase 0 — before the next live session

### [x] F01 — Token health: stop marking every error as EXPIRED
Start prompt:
> Fix F01 from FIX_QUEUE.md (see IMPROVEMENT_PLAN.md B4). Read only `apps/auth-service/src/risk/risk.service.ts` (checkBrokerSessionHealth) and `apps/auth-service/src/brokers/brokers.service.ts` (isTokenExpiredError). Mark EXPIRED only for `error_type === 'TokenException'` or HTTP 403; treat network/429/5xx as transient (keep HEALTHY, log). Build must pass.

Done when: a simulated network error leaves `tokenHealth` unchanged; a 403 sets EXPIRED.

### [x] F02 — Public endpoints must not use another user's Kite session
Start prompt:
> Fix F02 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md section 1 #7). Read `market.controller.ts`, `market.service.ts`, `ohl-scanner.service.ts`, `auth/guards/jwt-auth.guard.ts`, `optional-jwt-auth.guard.ts`. Endpoints live-prices, movers, fo-stocks, ohl-stocks, lot-size are `@Public()` so `req.user` is undefined and `findFirst({userId: undefined})` picks any account. Use `OptionalJwtAuthGuard` (populates `req.user` when a token is sent) and require a user for anything that uses a broker session; never pass undefined into a Prisma `where`. Add a small helper `requireUserId()`.

Done when: two users each see data from their own broker account; an unauthenticated call gets 401 for broker-backed data.

### [x] F03 — Throttling, trust proxy, mandatory secrets
Start prompt:
> Fix F03 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md S2, S3, S6). Read `app.module.ts`, `main.ts`, `auth/auth.module.ts`, `auth/strategies/jwt.strategy.ts`, `auth/auth.controller.ts`. Register `ThrottlerGuard` via `APP_GUARD`, set `trust proxy` to 1, add limits for login/refresh/forgot-password, and fail at boot in production if `JWT_SECRET` is unset (remove the 'changeme-super-secret-jwt' defaults).

Done when: 11th login attempt in a minute from one IP returns 429; two different IPs behind nginx have separate buckets; app refuses to start in production without JWT_SECRET.

### [x] F04 — Encryption: remove hard-coded keys, version the ciphertext
Start prompt:
> Fix F04 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md S1, S4). Read `common/utils/crypto.ts`, `brokers/brokers.service.ts`, `brokers/broker-client.factory.ts` (decrypt use), `scripts/check-broker.js`. Require `ENCRYPTION_SECRET` (throw at boot if missing), remove the committed fallback keys, add versioned format `v1:` with per-record salt while still decrypting legacy records, and encrypt `BrokerAccount.accessToken` on write / decrypt on read. Provide a one-off migration script to re-encrypt existing rows. Tell me which secrets I must rotate.

Done when: existing accounts still decrypt; new writes use `v1:`; no key literals remain in the repo.

### [x] F05 — Authenticate the market socket; ownership check on strategy socket
Start prompt:
> Fix F05 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md F1, S5, S9). Read `market/market.gateway.ts`, `strategy/strategy.gateway.ts`, `main.ts` (CORS block), `apps/web/src/hooks/use-market-data.ts`, `hooks/useDashboard.ts`. Verify JWT in MarketGateway.handleConnection, restrict socket CORS to FRONTEND_URL, cap symbols per client (200), verify `strategy.userId === payload.sub` before joining a strategy room, allow LAN/localhost origins only when NODE_ENV !== production. Send the token in the client handshake `auth`.

Done when: an unauthenticated socket is disconnected; user B cannot join user A's strategy room.

### [x] F06 — PM2 memory + fail-fast on uncaught errors
Start prompt:
> Fix F06 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md B15, section 3.5). Read `ecosystem.config.js` and `main.ts`. Raise the backend heap to 512 MB (max_memory_restart 640M), add kill_timeout, and change `uncaughtException` to log + alert hook + exit(1) (PM2 restarts). Note: do this together with or after F09 (boot recovery) so restarts are safe.

Done when: config validates (`pm2 startup` docs updated in comments) and backend exits on an uncaught exception.

### [x] F07 — Remove fake market data
Start prompt:
> Fix F07 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md U3). Read `brokers/brokers.service.ts` (getMarketOverview), `apps/web/src/hooks/useDashboard.ts`, and grep `useDashboard` usages. Delete hard-coded indices/changes and the fake `stats` query; return `connected:false` with empty arrays and let the UI show an empty state with a "Connect broker" action.

Done when: with no broker connected, no invented numbers appear anywhere.

### [x] F08 — OrderGateway: single door for all orders (biggest fix, split into 3 sessions)
- **F08a** ✅ done: create `OrderGateway` service (kill switch → user limits → freeze clamp → rate/dedup for ENTRY only → Kite → DB upsert → record success/rejection), add `intent` and `tag` to `OrderParams`, add `@@unique([brokerAccountId, brokerOrderId])` + `variety`/`tag` columns (Prisma migration). Read: `risk.service.ts`, `broker-client.factory.ts` (placeOrder), `brokers.service.ts` (placeOrder), `prisma/schema.prisma`.
- **F08b** ✅ done: switch controllers, EOD square-off and kill switch to the gateway (with `market_protection: -1`, idempotent, retry, alert if still open). Read: `market-scheduler.service.ts` (enforceEodSquareOff), `risk.service.ts` (triggerKillSwitch).
- **F08c** ✅ done: all five engines (emavwap, breakout15min, stock-options-buying, nifty-options-scalper, gamma-blast) now place orders via `OrderGateway`.

Start prompt (F08a):
> Do F08a from FIX_QUEUE.md (IMPROVEMENT_PLAN.md B1, B5, B6, section 3.4). Create OrderGateway as described, keep the existing ZerodhaClient guards until F08b/c migrate callers, add the Prisma migration, and write unit tests for the gateway rules.

Done when (all of F08): `grep -rn "\.placeOrder(" src` shows only the gateway and the Kite client; kill switch blocks engine orders in the next tick.

### [x] F09 — Boot recovery + persisted engine state
Start prompt:
> Fix F09 from FIX_QUEUE.md (IMPROVEMENT_PLAN.md B3, B11). Read `market-scheduler.service.ts`, `strategy.service.ts`, and for ONE engine only (start with `emavwap.engine.ts`) the `start()`/state-recovery sections found by `grep -n "recover\|start(" `. On boot: reconcile broker positions/orders with the latest RUNNING `StrategyExecution`, re-adopt or protect open positions, make auto-start idempotent for the whole session window (not only 09:15–09:16), persist manual-stop in the DB.

Done when: restarting the backend at 11:00 with an open paper position resumes management within 10 s.

---

## Phase 1 — Kite-correct data & execution

### [x] F10 — KiteRateLimiter
> Fix F10 (IMPROVEMENT_PLAN.md §1 #4). Create a token-bucket limiter (10/s general, 1/s quote, 3/s historical, orders 10/s and 400/min), wrap `ZerodhaClient` REST calls, add 429 back-off with jitter. Read only `broker-client.factory.ts`.

### [x] F11 — Typed Kite errors, stop swallowing failures
> Fix F11 (IMPROVEMENT_PLAN.md §1 #5). `getOrders`/`getLTP` must throw typed errors instead of returning `[]`/`{}`; update callers found by grep (`position guard`, `orders.service`, `market.service`). Read `broker-client.factory.ts` and grep results only.

### [x] F12 — InstrumentStore (daily master, `exchange:tradingsymbol` keys)
> Fix F12 (B13, B14, F6). One shared daily instrument cache (08:45 IST), canonical index map, replace per-call `getInstruments`. Read `broker-client.factory.ts`, `ticker.service.ts`, `market.service.ts`, `market.constants.ts` (index section only).

### [x] F13 — TickerHub: quote mode, `order_update`, feed status, correct change %
> Fix F13 (F2–F5, §1 #6, #8). Read `ticker.service.ts`, `market.gateway.ts`, `market.service.ts` (getLivePrices/getOverview). Subscribe in `quote` mode, forward `{ltp, close, change, changePct, volume, exchangeTs}`, batch emits, handle `order_update`, emit `feed:status`.

### [x] F14 — Market calendar + session lifecycle
> Fix F14 (§1 #9, B10, S10). Add a holiday calendar service used by ticker, scheduler and auto-start; fix `setSession` expiry (next 06:00 IST); add `redirect_params` nonce to the Kite login flow. Read `ticker.service.ts`, `market-scheduler.service.ts`, `brokers.service.ts`.

## Phase 2 — Data correctness
- [x] F15 Orders `upsert` + `/trades` sync + EOD sync 15:40 IST (read `orders.service.ts`, `schema.prisma`)
- [x] F16 Ledger: charges, IST bucketing, pagination, algo-vs-manual P&L split (B7)

## Phase 3 — UI/UX (frontend skill applies)
- [x] F17 `MarketSocketProvider` + Zustand tick store + throttled rendering (U1, U2)
- [ ] F18 Design tokens + dark mode + `lib/format.ts` (U6, U9)
- [ ] F19 App shell status bar: feed, session, token expiry, kill switch, day P&L (U4)
- [ ] F20 Order ticket rebuild with confirm + idempotency (U8)
- [ ] F21 Dashboard rebuild on real data (U3)
- [ ] F22 Split strategy pages (`[id]`, `edit`, `new`) into feature folders (U7)
- [ ] F23 States (loading/empty/error/offline), query refetch policy, a11y pass (U5)

## Phase 4 — Hygiene
- [ ] F24 Tests: pure-logic extraction + tick replay for one engine
- [ ] F25 CI (lint, typecheck, test, build) and structured logging + alerts
- [ ] F26 Pick one deploy path; delete unused targets

---

## Log
(one line per finished fix: date, fix id, what changed, anything left over)
- 2026-09-25 F01 done (token health only marks EXPIRED on TokenException/403).
- 2026-09-25 F02: live-prices, movers, fo-stocks, ohl-stocks now use OptionalJwtAuthGuard + requireUserId() (401 if anonymous); removed "any account" fallbacks in market.service/ohl-scanner; search/lot-size verify accountId ownership and never borrow another user's session (lot-size falls back to static sizes); movers cache is per-user. tsc passes. Not tested against live Kite.
- 2026-09-25 F03: registered HttpThrottlerGuard as APP_GUARD (HTTP only, 500/min default; the existing @Throttle on login was inert before), limits on login 10, refresh 20, forgot-password 3, reset-password 5 per minute; `trust proxy` = 1; JWT secret via resolveJwtSecret() (throws in production if unset, random per-process secret in dev). tsc passes; not run against nginx.
- 2026-09-25 F11: typed KiteError hierarchy + withKiteRetry (kite-errors.ts); ZerodhaClient getOrders/getLTP throw; engines retry+log instead of swallowing; recovery falls back to OrderGateway records and fails closed (PositionUnknownError); OrderGateway reuses a working SL (serialised per leg). tsc passes; not run against live Kite.
- 2026-09-25 F12: InstrumentStore (brokers/instrument-store.ts): one master per exchange per trading day (stale after 08:45 IST), single-flight fetch, serves previous master if refresh fails; ZerodhaClient.getInstruments now backed by it (all engines/search/lot-size share it); canonical INDEX_INSTRUMENTS (NIFTY BANK etc., tokens from master; names+tokens verified against Kite docs/forum/chart URLs (NIFTY IT is 259849; old hard-coded 257545 was NIFTY CONSUMPTION)); ticker builds tokens from it, warms it 08:45+, transient setup failures no longer blacklist the account; B13 fixed (NFO string arg, errors logged, no LTP fallback giving fake 0% change); B14 fixed (NSE:NIFTY BANK). tsc passes; not run against live Kite.
- 2026-09-26 F13: ticker subscribes in `quote` mode (3000-token cap, re-subscribe after reconnect now includes dynamically added tokens); browsers get one batched `ticks` event per 75 ms per socket with `{key, symbol, exchange, ltp, close, change, changePct, volume, exchangeTs, ts}` (change is null, not 0, when Kite sends no close), single canonical `EXCH:SYMBOL` key, replaces the `ltp` event; ticks and subscriptions are bound to the viewer's own broker account (no borrowing another user's session); `order_update` forwarded to the owner's sockets and to `registerOrderListener` (DB sync is F15); `feed:status` (connected/stale/closed + last exchange ts) driven by Kite heartbeats, pushed on change and on socket connect; overview API returns `key`/`close`; web hooks (`useDashboard`, `use-market-data`) moved to `ticks`. tsc passes on auth-service. Not run against live Kite; no test runner in repo, so no unit tests (F24). Follow-up same day: every connection also subscribes NIFTY 50 in `full` mode as an exchange clock (quote-mode stock packets have no timestamp, so per-tick `exchangeTs` stays null for them; `feed:status.lastExchangeTs` is real); stale feed now serves REST `getQuote` snapshots (`source: 'rest'`, every 5 s, max 200 symbols, viewers only, never engines); dashboard shows a Live/Delayed/Market closed badge and reacts to `order_update` (refetch + toast); OrderWindow zod resolver type error silenced with a cast (pnpm binds @hookform/resolvers to zod 4 types locally). Still open: full status bar and shared socket provider (F17/F19).
- 2026-09-26 F14: market-calendar.ts (IST helpers, built-in NSE 2026 holidays — verify against the exchange circular; extend via `MARKET_HOLIDAYS` / `MARKET_SPECIAL_SESSIONS` env for later years or Muhurat) gates the ticker window, instrument warm-up, scheduler auto-start/stop/boot recovery and immediate auto-start; `setSession` expiry is now the next 06:00 IST after now (fixes 00:00–06:00 logins); Kite login URL carries `redirect_params=state=<ts.nonce.hmac>` (HMAC with JWT secret, 15 min TTL, bound to user+account), `setSession` verifies a supplied state, and the web redirect/auto-detect paths only auto-submit tokens that carry it (manual paste still works without). tsc passes on both apps; not run against live Kite. Scheduler still uses fixed 09:15–15:30 hours, so special-session hours only affect the ticker.
- 2026-09-26 F15: `orders` already had the unique (brokerAccountId, brokerOrderId) key from F08a; `syncBrokerOrders` now upserts on it (batched transactions, never overwrites attribution or known prices with nulls, stores variety/tag, IST start-of-day for stale-OPEN cleanup, Kite IST timestamps parsed correctly on any server TZ via `parseKiteTime`). New `trades` table (migration 20260926000000, also adds orders(userId,createdAt) and orders(strategyId,createdAt) indexes) filled from Kite `/trades` (`getTrades()` on the client, createMany skipDuplicates). `order_update` websocket events are now saved to the DB (stale/out-of-order updates dropped). EOD sync at 15:40 IST on trading days for all users with a live token, with catch-up on boot. tsc passes; migration not applied and nothing run against live Kite. Follow-up: all six engine `order.create` sites now go through `OrderGateway.recordEngineOrder` (live = upsert on the broker key, attribution only, skipped without a real broker id; paper = PAPER_ rows), so nothing races the gateway/sync any more. Left over: ledger still syncs inside the read request and does not use `trades` yet (F16).
- 2026-09-26 F16: ledger rebuilt from real fills (`trades`, falling back to COMPLETE order rows for history) via pure `ledger.ts` (FIFO per account+symbol+product; MIS never carries across IST days; shorts supported) and `charges.ts` (brokerage per order, STT, exchange txn, SEBI, stamp, GST — realizedPnl is now NET, with grossPnl/charges alongside). Month/day bucketing is IST end to end; the read request no longer calls the broker (DB is kept current by order_update, manual sync, 15:40 IST job); the month picker comes from a SQL distinct-months query. `GET /orders/ledger` takes page/pageSize/status/segment/date/q (journal is server-filtered and paginated, default 100, max 1000; summary/chart/daily are always the whole month) and returns `counts`, `pagination`, per-trade `source` (ALGO = order had strategy/execution attribution, else MANUAL) and `summary.algo/manual`. Web ledger page updated (server filters, Previous/Next, gross/charges/algo/manual line, CSV exports all filtered trades). tsc passes on both apps; sanity-checked matchFills with a script (IST day rollover, charges ≈ ₹66 on a 75-lot option round trip); not run against a live DB. VERIFY charge rates in charges.ts against Zerodha's calculator — F&O STT uses the 1 Apr 2026 revision (futures 0.05%, options 0.15%) from memory; override with STT_FUT_SELL_PCT / STT_OPT_SELL_PCT. Left over: B7 kill-switch P&L in risk.service.ts (`getRiskStatus` still counts manual positions and long-only realised P&L) was deliberately NOT touched, since it gates live trading — needs its own fix with a test plan; daily ledger no longer nests per-day `trades` (UI never used them).
- 2026-09-26 F17: one `/market` socket per session via `MarketSocketProvider` (mounted in the dashboard layout; handshake token is read on every reconnect; ref-counted `subscribe` so unmounting one page no longer drops symbols another still uses; resubscribes on reconnect; handles `ticks`, `feed:status`, `order_update` toasts + query invalidation). Ticks are buffered and flushed to a Zustand store (`store/market-store.ts`) every 125 ms (~8 fps), latest tick per key. `useMarketData` keeps its API but selects only its own symbols (shallow), `useTick(symbol)` added for single-symbol components, `useDashboard` overlays store ticks on the REST overview instead of rewriting the query cache per tick. tsc passes; not run in a browser. Left over: table rows are not yet memoised/virtualised (F21/F23 rebuilds), `/strategy` namespace socket in strategies/[id] is separate and untouched.
