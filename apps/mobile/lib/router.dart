import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/auth_controller.dart';
import 'features/auth/screens/forgot_password_screen.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/auth/screens/register_screen.dart';
import 'features/auth/screens/splash_screen.dart';
import 'features/brokers/screens/broker_login_screen.dart';
import 'features/brokers/screens/brokers_screen.dart';
import 'features/dashboard/screens/dashboard_screen.dart';
import 'features/home/home_shell.dart';
import 'features/market/screens/move_alerts_screen.dart';
import 'features/market/screens/picks_screen.dart';
import 'features/market/screens/screener_screen.dart';
import 'features/market/screens/swing_screen.dart';
import 'features/more/screens/more_screen.dart';
import 'features/orders/order_ticket.dart';
import 'features/orders/screens/ledger_screen.dart';
import 'features/orders/screens/order_ticket_screen.dart';
import 'features/orders/screens/orders_screen.dart';
import 'features/portfolio/screens/portfolio_screen.dart';
import 'features/positions/screens/positions_screen.dart';
import 'features/risk/screens/risk_screen.dart';
import 'features/settings/screens/settings_screen.dart';
import 'features/strategies/screens/strategies_screen.dart';
import 'features/strategies/screens/strategy_detail_screen.dart';
import 'features/strategies/screens/strategy_wizard_screen.dart';

/// Route paths in one place, so screens link with `context.go(Routes.orders)`, never a string.
/// Same pages and order as the web's nav-config.ts.
abstract final class Routes {
  static const splash = '/splash';
  static const login = '/login';
  static const register = '/register';
  static const forgotPassword = '/forgot-password';
  static const resetPassword = '/reset-password';

  // Bottom tabs.
  static const dashboard = '/dashboard';
  static const strategies = '/strategies';
  static const positions = '/positions';
  static const orders = '/orders';
  static const more = '/more';

  // Pages in the More menu (they keep the bottom bar).
  static const portfolio = '/more/portfolio';
  static const brokers = '/more/brokers';
  static const risk = '/more/risk';
  static const screener = '/more/screener';
  static const moveAlerts = '/more/move-alerts';
  static const swing = '/more/swing';
  static const picks = '/more/intraday-picks';
  static const ledger = '/more/ledger';
  static const settings = '/more/settings';

  static String strategy(String id) => '$strategies/${Uri.encodeComponent(id)}';

  // Full-screen flows over the tabs.
  static const trade = '/trade';
  static const strategyNew = '/strategy/new';
  static String strategyEdit(String id) => '/strategy/${Uri.encodeComponent(id)}/edit';
  static String brokerLogin(String id) => '/broker-login/${Uri.encodeComponent(id)}';
}

const _publicRoutes = {Routes.login, Routes.register, Routes.forgotPassword, Routes.resetPassword};

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

final routerProvider = Provider<GoRouter>((ref) {
  // go_router re-runs `redirect` whenever this notifier fires; we fire it on every auth change.
  final authChanges = ValueNotifier<AuthState>(ref.read(authControllerProvider));
  ref
    ..listen(authControllerProvider, (_, next) => authChanges.value = next)
    ..onDispose(authChanges.dispose);

  GoRoute page(String path, Widget Function(GoRouterState) build) =>
      GoRoute(path: path, builder: (_, state) => build(state));

  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.dashboard,
    refreshListenable: authChanges,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final at = state.matchedLocation;
      switch (auth) {
        case AuthUnknown():
          return at == Routes.splash ? null : Routes.splash;
        case AuthSignedOut():
          return _publicRoutes.contains(at) ? null : Routes.login;
        case AuthSignedIn():
          return (_publicRoutes.contains(at) || at == Routes.splash) ? Routes.dashboard : null;
      }
    },
    routes: [
      page(Routes.splash, (_) => const SplashScreen()),
      page(Routes.login, (_) => const LoginScreen()),
      page(Routes.register, (_) => const RegisterScreen()),
      page(Routes.forgotPassword, (_) => const ForgotPasswordScreen()),
      page(Routes.resetPassword, (s) => ResetPasswordScreen(token: s.uri.queryParameters['token'])),
      GoRoute(
        path: Routes.trade,
        parentNavigatorKey: _rootKey,
        builder:
            (_, state) =>
                OrderTicketScreen(prefill: state.extra is TicketPrefill ? state.extra! as TicketPrefill : null),
      ),
      GoRoute(path: Routes.strategyNew, parentNavigatorKey: _rootKey, builder: (_, __) => const StrategyWizardScreen()),
      GoRoute(
        path: '/strategy/:id/edit',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => StrategyWizardScreen(id: state.pathParameters['id']),
      ),
      GoRoute(
        path: '/broker-login/:id',
        parentNavigatorKey: _rootKey,
        builder: (_, state) => BrokerLoginScreen(id: state.pathParameters['id']!),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [page(Routes.dashboard, (_) => const DashboardScreen())]),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.strategies,
                builder: (_, __) => const StrategiesScreen(),
                routes: [
                  GoRoute(path: ':id', builder: (_, state) => StrategyDetailScreen(id: state.pathParameters['id']!)),
                ],
              ),
            ],
          ),
          StatefulShellBranch(routes: [page(Routes.positions, (_) => const PositionsScreen())]),
          StatefulShellBranch(routes: [page(Routes.orders, (_) => const OrdersScreen())]),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.more,
                builder: (_, __) => const MoreScreen(),
                routes: [
                  GoRoute(path: 'portfolio', builder: (_, __) => const PortfolioScreen()),
                  GoRoute(path: 'brokers', builder: (_, __) => const BrokersScreen()),
                  GoRoute(path: 'risk', builder: (_, __) => const RiskScreen()),
                  GoRoute(path: 'screener', builder: (_, __) => const ScreenerScreen()),
                  GoRoute(path: 'move-alerts', builder: (_, __) => const MoveAlertsScreen()),
                  GoRoute(path: 'swing', builder: (_, __) => const SwingScreen()),
                  GoRoute(path: 'intraday-picks', builder: (_, __) => const PicksScreen()),
                  GoRoute(path: 'ledger', builder: (_, __) => const LedgerScreen()),
                  GoRoute(path: 'settings', builder: (_, __) => const SettingsScreen()),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
