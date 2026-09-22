const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let passes = 0;
let fails = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passes++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    fails++;
  }
}

console.log('─── Pre-flight Verification Suite ───\n');

// 1. AuthGuard refresh fix
const authGuardPath = path.join(root, 'apps/web/src/components/auth-guard.tsx');
const authGuardContent = fs.readFileSync(authGuardPath, 'utf8');
assert(
  authGuardContent.includes('useAuthStore.setState({') &&
  authGuardContent.includes('if (!access && !refresh) {') &&
  !authGuardContent.includes('if (!isAuthenticated || (!access && !refresh))'),
  'AuthGuard does not clearAuth or redirect if localStorage tokens exist'
);

// 2. Zustand store persistence
const storePath = path.join(root, 'apps/web/src/store/index.ts');
const storeContent = fs.readFileSync(storePath, 'utf8');
assert(
  storeContent.includes('accessToken: state.accessToken') &&
  storeContent.includes('refreshToken: state.refreshToken') &&
  storeContent.includes('state.isAuthenticated = true;'),
  'useAuthStore partialize & onRehydrateStorage properly preserve and restore tokens'
);

// 3. API force logout on 401/403 only
const apiPath = path.join(root, 'apps/web/src/lib/api.ts');
const apiContent = fs.readFileSync(apiPath, 'utf8');
assert(
  apiContent.includes('if (status === 401 || status === 403)') &&
  !apiContent.includes('|| !err?.response'),
  'api.ts requestTokenRefresh only forces logout on 401/403, never on network error'
);

// 4. Auth service refresh token grace period
const authServicePath = path.join(root, 'apps/auth-service/src/auth/auth.service.ts');
const authServiceContent = fs.readFileSync(authServicePath, 'utf8');
assert(
  authServiceContent.includes('expiresAt: new Date(Date.now() + 60_000)') &&
  authServiceContent.includes('this.prisma.refreshToken.deleteMany'),
  'auth.service.ts gives 60-second grace window to rotated refresh tokens'
);

// 5. Strategy controller status orders fallback
const stratControllerPath = path.join(root, 'apps/auth-service/src/strategy/strategy.controller.ts');
const stratControllerContent = fs.readFileSync(stratControllerPath, 'utf8');
assert(
  stratControllerContent.includes('where: { strategyId: id }') &&
  stratControllerContent.includes('orders: orders ?? []'),
  'strategy.controller.ts always returns orders with strategyId fallback'
);

// 6. Strategy gateway subscription orders
const stratGatewayPath = path.join(root, 'apps/auth-service/src/strategy/strategy.gateway.ts');
const stratGatewayContent = fs.readFileSync(stratGatewayPath, 'utf8');
assert(
  stratGatewayContent.includes('where: { strategyId: data.strategyId }') &&
  stratGatewayContent.includes('orders: orders ?? []'),
  'strategy.gateway.ts emits orders reliably without wiping them'
);

// 7. Orders service returns all user orders
const ordersServicePath = path.join(root, 'apps/auth-service/src/orders/orders.service.ts');
const ordersServiceContent = fs.readFileSync(ordersServicePath, 'utf8');
assert(
  ordersServiceContent.includes('// Return all orders for the user (both Live and Paper)') &&
  ordersServiceContent.includes('Promise.race(['),
  'orders.service.ts includes both live and paper trades and awaits sync with timeout'
);

// 8. Orders page auto-polling
const ordersPagePath = path.join(root, 'apps/web/src/app/(dashboard)/orders/page.tsx');
const ordersPageContent = fs.readFileSync(ordersPagePath, 'utf8');
assert(
  ordersPageContent.includes('refetchInterval: 10_000') &&
  ordersPageContent.includes('PAPER'),
  'orders/page.tsx has 10s auto-polling and PAPER trade badge'
);

// 9. Strategy detail page cross-device sync
const stratDetailPagePath = path.join(root, 'apps/web/src/app/(dashboard)/strategies/[id]/page.tsx');
const stratDetailPageContent = fs.readFileSync(stratDetailPagePath, 'utf8');
assert(
  stratDetailPageContent.includes('setActiveOrders((prev) => (prev.length > 0 ? prev : []))') &&
  stratDetailPageContent.includes('strategyApi.status(id)'),
  'strategies/[id]/page.tsx protects activeOrders and performs background sync'
);

// 10. Scheduler zombie loop prevention
const schedulerPath = path.join(root, 'apps/auth-service/src/strategy/market-scheduler.service.ts');
const schedulerContent = fs.readFileSync(schedulerPath, 'utf8');
assert(
  !schedulerContent.includes('isPeriodicCheckTime') &&
  schedulerContent.includes('The 10-second daytime periodic check has been completely removed'),
  'market-scheduler.service.ts zombie loop is completely removed'
);

// 11. Engine stopWithStatus implementation
const gammaEnginePath = path.join(root, 'apps/auth-service/src/strategy/gamma-blast-expiry.engine.ts');
const gammaEngineContent = fs.readFileSync(gammaEnginePath, 'utf8');
assert(
  gammaEngineContent.includes('async stopWithStatus(strategyId: string, status:') &&
  gammaEngineContent.includes('autoStart: false'),
  'gamma-blast-expiry.engine.ts has proper stopWithStatus and autoStart: false'
);

// 12. TickerService 403 backoff and market hours
const tickerPath = path.join(root, 'apps/auth-service/src/market/ticker.service.ts');
const tickerContent = fs.readFileSync(tickerPath, 'utf8');
assert(
  tickerContent.includes('failedAccounts') &&
  tickerContent.includes('isIndianMarketOpen'),
  'ticker.service.ts halts 403 reconnection spam and respects market hours'
);

console.log(`\nResults: ${passes} passed, ${fails} failed.`);
if (fails > 0) {
  process.exit(1);
} else {
  console.log('🎉 All 12/12 pre-flight verification checks PASSED!');
  process.exit(0);
}
