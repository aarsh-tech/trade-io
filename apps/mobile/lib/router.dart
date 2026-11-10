import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/auth_controller.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/home/home_shell.dart';
import 'features/more/screens/more_screen.dart';
import 'shared/widgets/placeholder_screen.dart';

/// Route paths in one place, so screens link with `context.go(Routes.orders)`, never a string.
abstract final class Routes {
  static const splash = '/splash';
  static const login = '/login';
  static const dashboard = '/dashboard';
  static const positions = '/positions';
  static const orders = '/orders';
  static const strategies = '/strategies';
  static const more = '/more';
}

final routerProvider = Provider<GoRouter>((ref) {
  // go_router re-runs `redirect` whenever this notifier fires; we fire it on every auth change.
  final authChanges = ValueNotifier<AuthState>(ref.read(authControllerProvider));
  ref
    ..listen(authControllerProvider, (_, next) => authChanges.value = next)
    ..onDispose(authChanges.dispose);

  return GoRouter(
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
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.dashboard,
                builder: (_, __) => const PlaceholderScreen(title: 'Dashboard', phase: 1),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.positions,
                builder: (_, __) => const PlaceholderScreen(title: 'Positions', phase: 1),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: Routes.orders, builder: (_, __) => const PlaceholderScreen(title: 'Orders', phase: 1)),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.strategies,
                builder: (_, __) => const PlaceholderScreen(title: 'Strategies', phase: 2),
              ),
            ],
          ),
          StatefulShellBranch(routes: [GoRoute(path: Routes.more, builder: (_, __) => const MoreScreen())]),
        ],
      ),
    ],
  );
});

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator()));
}
