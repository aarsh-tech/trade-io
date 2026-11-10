# Tradeio mobile — build plan

Decided 10 Nov 2026. **Android only** for now (iOS needs a Mac). The app is a second client of the existing API; business rules stay on the backend. Implementation filled one missing shared cancel-order route already called by the web client.

## Why it fits the existing backend

| Concern | How the backend already works | In the app |
|---|---|---|
| Auth | Bearer JWT (8h) + refresh token in the request body; no cookies | dio interceptor, tokens in secure storage |
| Live data | socket.io, token in the handshake `auth` field; `/market` and `/strategy` namespaces | `socket_io_client`, `AuthedSocket` |
| CORS | Requests without an `Origin` header are allowed | nothing to do |
| Zerodha login | Kite redirects to `tradeio.site/brokers/callback?request_token&state`; the page posts them to `/brokers/:id/session` | webview intercepts the callback URL and makes the same call |

## Stack

dio · flutter_riverpod 3 · go_router 17 · socket_io_client 3 · flutter_secure_storage · freezed 3 + json_serializable · intl

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Project, API client, token refresh, auth state, router with auth guard, theme (web tokens), login + 2FA, tab shell, enum-drift check, format helpers + tests, docs | **done 10 Nov** |
| 1 | Dashboard (overview, movers, today summary), Positions (live P&L from `/market` ticks), Orders (list, cancel, day P&L, `order_update`), manual order ticket | **implemented 10 Nov** |
| 2 | Strategies list + detail: live console over `/strategy`, start / stop / square-off, autoStart; create/edit form with the config bounds from `strategy-config.ts` | **implemented 10 Nov** |
| 3 | Brokers: accounts, Zerodha login in a webview, session renew; Risk: status, kill switch, settings | **implemented 10 Nov** |
| 4 | Live screener, move alerts, swing scanner, ledger | **implemented 10 Nov** |
| UI polish | Mobile visual system, consistent spacing, light/dark palettes, saved Auto / Light / Dark appearance | **implemented 10 Nov** |
| Web parity | Web design tokens + IBM Plex, web phone navigation (Dashboard · Strategies · Positions · Orders · More sheet), top bar + status strip, every web page except Admin: Portfolio, Intraday Picks, Settings (profile, password, 2FA), registration notice, forgot/reset password, the 4-step strategy wizard, strategy detail tabs, Kite-style order ticket with pre-fill | **implemented 10 Nov (evening)** |
| later | Push notifications (FCM; needs one new backend endpoint for device tokens), release signing + Play listing | |
| never | Admin screens | |

## Logic ported from the web (each with tests)

- `format.ts` → `core/utils/format.dart` ✔
- `api.ts` refresh/retry rules → `core/network/api_client.dart` ✔
- `socket.ts` reconnect rules → `core/socket/authed_socket.dart` ✔
- `useLivePositions` P&L overlay → `features/portfolio/live_pnl.dart` ✔
- `order-ticket.ts` qty/tick rounding and limits → `features/orders/order_ticket.dart` ✔
- `strategy-config.ts` bounds → `features/strategies/strategy_config.dart` ✔
- `build-config.ts` + `form-defaults.ts` + `strategy-types.ts` (form, presets, risk estimate, config↔form) → `strategies/strategy_form.dart` ✔; `defaultStrategyConfig` in `strategy_config.dart` is the regression fixture (change the web wizard and both together)
- `useOrderTicket` idempotency-key rule (reuse only while the outcome is unknown) → `OrderAttempt` in `order_ticket.dart` ✔

## Verification and remaining release work

- Unit tests cover live P&L, models, config validation, tick/lot/order limits, IST day boundaries, callback URL/state checks, API contracts and account-cache isolation.
- Widget smoke tests cover phone layouts with enlarged text; trading actions require explicit confirmation.
- The broker cancel route expected by both clients was missing. It is now implemented in auth-service with ownership/session checks; deploy that backend change before testing cancellation against production.
- Broker authentication, live order fills, strategy execution and the emergency stop still require an end-to-end check with a signed-in test account. Automated tests use fixtures and never place live orders.
- Push notifications, production signing and the Play listing remain in the **later** phase above. Appearance and typography are implemented.

## Keeping web and mobile in sync

1. Endpoint changes update `api.ts` and the Dart `*_api.dart` in the same commit (rule in the root CLAUDE.md).
2. `dart run tool/check_enums.dart` fails when `lib/shared/enums.dart` drifts from `packages/shared-types`.
3. One envelope opener (`unwrapData`), one error-message helper (`apiErrorMessage`), mirroring `api.ts` / `api-error.ts`.
4. CI (when added): `flutter analyze`, `dart format --set-exit-if-changed .`, `flutter test`, the enum check.

## Known limits

- Android pauses sockets in the background; the app re-syncs on resume, like the web does on tab focus. Alerts keep coming through Telegram until push is added.
- The server is in Sydney; every API round trip is ~230 ms from India regardless of client. Nothing in the app can change that.
