import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/socket/market_socket.dart';
import '../market/market_models.dart';

/// Bottom tabs. Each tab is a go_router branch with its own navigation stack, so
/// Strategies → detail and back keeps its place when you switch tabs.
///
/// Also the one place that keeps the market socket alive while signed in and turns order
/// postbacks into toasts (same as the web's MarketSocketProvider).
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _toastOrderUpdate(BuildContext context, OrderUpdate o) {
    final label = '${o.transactionType ?? ''} ${o.tradingsymbol ?? ''}'.trim();
    final String? text = switch (o.status) {
      'COMPLETE' => 'Order filled: $label (${o.filledQuantity ?? o.quantity ?? ''})',
      'REJECTED' => 'Order rejected: $label${o.statusMessage == null ? '' : ' - ${o.statusMessage}'}',
      _ => null,
    };
    if (text == null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref
      ..listen(marketSocketProvider.select((s) => s.connected), (_, __) {})
      ..listen(orderUpdateStreamProvider, (_, next) => next.whenData((o) => _toastOrderUpdate(context, o)));

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.pie_chart_outline),
            selectedIcon: Icon(Icons.pie_chart),
            label: 'Positions',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.memory_outlined),
            selectedIcon: Icon(Icons.memory),
            label: 'Strategies',
          ),
          NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}
