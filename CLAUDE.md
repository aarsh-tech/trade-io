# Algo_Trade_Web (tradeio.site)

pnpm/turbo monorepo. `apps/auth-service` is the NestJS API and the source of truth for every rule. Two clients call it with the same endpoints: `apps/web` (Next.js, auto-deploys from main via Cloudflare) and `apps/mobile` (Flutter, Android; not part of pnpm/turbo).

## Keep the clients in sync
- A backend endpoint change is finished only when `apps/web/src/lib/api.ts` **and** the matching `apps/mobile/lib/features/<feature>/<feature>_api.dart` are updated in the same commit.
- Shared enums live in `packages/shared-types`; mirror changes in `apps/mobile/lib/shared/enums.dart` and run `dart run tool/check_enums.dart` from `apps/mobile`.
- Every response is `{ success, data }`. Clients open it in exactly one place (`api.ts` / `api_envelope.dart`).

## Working rules
- Never commit or push without asking.
- Backend deploy: `ssh trade-io 'cd /var/www/trade-io && bash update.sh'`. It restarts PM2, so run it only outside 09:15–15:30 IST on trading days; check the time with `ssh trade-io date` (the local shell's clock is not IST).
- Each app has its own CLAUDE.md with its layout and commands.
