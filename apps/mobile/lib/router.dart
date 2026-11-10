import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/auth_controller.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/brokers/screens/broker_login_screen.dart';
import 'features/brokers/screens/brokers_screen.dart';
import 'features/dashboard/screens/dashboard_screen.dart';
import 'features/home/home_shell.dart';
import 'features/market/screens/move_alerts_screen.dart';
import 'features/market/screens/screener_screen.dart';
import 'features/market/screens/swing_screen.dart';
import 'features/more/screens/more_screen.dart';
import 'features/orders/screens/ledger_screen.dart';
import 'features/orders/screens/order_ticket_screen.dart';
import 'features/orders/screens/orders_screen.dart';
import 'features/positions/screens/positions_screen.dart';
import 'features/risk/screens/risk_screen.dart';
import 'features/strategies/screens/strategies_screen.dart';
import 'features/strategies/screens/strategy_detail_screen.dart';
import 'features/strategies/screens/strategy_editor_screen.dart';

/// Route paths in one place, so screens link with `context.go(Routes.orders)`, never a string.
abstract final class Routes {
  static const splash = '/splash';
  static const login = '/login';
  static const dashboard = '/dashboard';
  static const positions = '/positions';
  static const orders = '/orders';
  static const orderNew = '/orders/new';
  static const strategies = '/strategies';
  static const more = '/more';
  static const strategyNew = '/strategies/new';
  static String strategy(String id) => '$strategies/${Uri.encodeComponent(id)}';
  static String strategyEdit(String id) => '${strategy(id)}/edit';
  static const brokers = '/more/brokers';
  static String brokerLogin(String id) => '$brokers/${Uri.encodeComponent(id)}/login';
  static const risk = '/more/risk';
  static const screener = '/more/screener';
  static const moveAlerts = '/more/move-alerts';
  static const swing = '/more/swing';
  static const ledger = '/more/ledger';
}

final routerProvider = Provider<GoRouter>((ref) {
  // go_router re-runs `redirect` whenever this notifier fires; we fire it on every auth change.
  final authChanges = ValueNotifier<AuthState>(ref.read(authControllerProvider));
  ref
    ..listen(authControllerProvider, (_, next) => authChanges.value = next)
    ..onDispose(authChanges.dispose);

  final router = GoRouter(
    initialLocation: Routes.dashboard,
    refreshListenable: authChanges,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final at = state.matchedLocation;
      switch (auth) {
        case AuthUnknown():
          return at == Routes.splash ? null : Routes.splash;
        case AuthSignedOut():
          return at == Routes.login ? null : Routes.login;
        case AuthSignedIn():
          return (at == Routes.login || at == Routes.splash) ? Routes.dashboard : null;
      }
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, __) => const _SplashScreen()),
      GoRoute(path: Routes.login, builder: (_, __) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: Routes.dashboard, builder: (_, __) => const DashboardScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.positions, builder: (_, __) => const PositionsScreen())]),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.orders,
                builder: (_, __) => const OrdersScreen(),
                routes: [GoRoute(path: 'new', builder: (_, __) => const OrderTicketScreen())],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.strategies,
                builder: (_, __) => const StrategiesScreen(),
                routes: [
                  GoRoute(path: 'new', builder: (_, __) => const StrategyEditorScreen()),
                  GoRoute(
                    path: ':id',
                    builder: (_, state) => StrategyDetailScreen(id: state.pathParameters['id']!),
                    routes: [
                      GoRoute(
                        path: 'edit',
                        builder: (_, state) => StrategyEditorScreen(id: state.pathParameters['id']!),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.more,
                builder: (_, __) => const MoreScreen(),
                routes: [
                  GoRoute(
                    path: 'brokers',
                    builder: (_, __) => const BrokersScreen(),
                    routes: [
                      GoRoute(
                        path: ':id/login',
                        builder: (_, state) => BrokerLoginScreen(id: state.pathParameters['id']!),
                      ),
                    ],
                  ),
                  GoRoute(path: 'risk', builder: (_, __) => const RiskScreen()),
                  GoRoute(path: 'screener', builder: (_, __) => const ScreenerScreen()),
                  GoRoute(path: 'move-alerts', builder: (_, __) => const MoveAlertsScreen()),
                  GoRoute(path: 'swing', builder: (_, __) => const SwingScreen()),
                  GoRoute(path: 'ledger', builder: (_, __) => const LedgerScreen()),
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

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator()));
}
