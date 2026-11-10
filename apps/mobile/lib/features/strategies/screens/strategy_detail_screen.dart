import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/action_button.dart';
import '../../../shared/widgets/async_view.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../strategies_api.dart';
import '../strategies_providers.dart';
import '../strategy_socket.dart';
import '../strategy_state.dart';

class StrategyDetailScreen extends ConsumerStatefulWidget {
  const StrategyDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<StrategyDetailScreen> createState() => _StrategyDetailScreenState();
}

class _StrategyDetailScreenState extends ConsumerState<StrategyDetailScreen> {
  String get id => widget.id;
  bool _busy = false;
  void _busyChanged(bool value) {
    if (mounted) setState(() => _busy = value);
  }

  void _refresh(WidgetRef ref) {
    ref
      ..invalidate(strategyProvider(id))
      ..invalidate(strategyStatusProvider(id))
      ..invalidate(strategyEventsProvider(id))
      ..invalidate(strategiesProvider)
      ..invalidate(ordersProvider)
      ..invalidate(positionsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(strategiesApiProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Strategy'),
        actions: [IconButton(tooltip: 'Refresh', onPressed: () => _refresh(ref), icon: const Icon(Icons.refresh))],
      ),
      body: AsyncView(
        value: ref.watch(strategyProvider(id)),
        onRetry: () => _refresh(ref),
        data:
            (strategy) => ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(strategy.name, style: Theme.of(context).textTheme.headlineSmall),
                Text(
                  '${strategy.type?.wire ?? 'Legacy strategy'} · ${strategy.isPaperTrade ? 'Paper trading' : 'LIVE TRADING'}',
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    ActionButton(
                      onBusyChanged: _busyChanged,
                      label: 'Start',
                      enabled: !_busy && !strategy.isActive,
                      confirm: 'Start ${strategy.name} in ${strategy.isPaperTrade ? 'paper' : 'LIVE'} mode?',
                      action: () => api.start(id),
                      onSuccess: () => _refresh(ref),
                    ),
                    ActionButton(
                      onBusyChanged: _busyChanged,
                      label: 'Stop',
                      enabled: !_busy,
                      confirm:
                          'Stops new entries. Existing positions may remain open. Use Square off to close strategy positions.',
                      action: () => api.stop(id),
                      onSuccess: () => _refresh(ref),
                    ),
                    ActionButton(
                      onBusyChanged: _busyChanged,
                      label: 'Square off',
                      enabled: !_busy,
                      confirm: 'Close all open positions belonging to this strategy at the broker?',
                      action: () => api.squareOff(id),
                      onSuccess: () => _refresh(ref),
                    ),
                    OutlinedButton(
                      onPressed: _busy || strategy.isActive ? null : () => context.push(Routes.strategyEdit(id)),
                      child: const Text('Edit'),
                    ),
                    ActionButton(
                      onBusyChanged: _busyChanged,
                      label: strategy.autoStart ? 'Disable auto-start' : 'Enable auto-start',
                      enabled: !_busy,
                      confirm: 'Change automatic start at market open (09:15 IST)?',
                      action: () => api.setAutoStart(id, !strategy.autoStart),
                      onSuccess: () => _refresh(ref),
                    ),
                    ActionButton(
                      onBusyChanged: _busyChanged,
                      label: 'Delete',
                      enabled: !_busy && !strategy.isActive,
                      confirm: 'Delete this saved strategy? Stop it and close any positions first.',
                      action: () => api.delete(id),
                      onSuccess: () {
                        ref.invalidate(strategiesProvider);
                        context.pop();
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                AsyncView(
                  value: ref.watch(liveStrategyProvider(id)),
                  onRetry: () => _refresh(ref),
                  data:
                      (status) => Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(status.running ? 'Running' : 'Stopped', style: Theme.of(context).textTheme.titleMedium),
                          if (status.state != null)
                            ExpansionTile(
                              title: const Text('Trade status'),
                              initiallyExpanded: true,
                              children: [
                                for (final item in strategyStateSummary(status.state!))
                                  ListTile(title: Text(item.$1), subtitle: Text(item.$2)),
                              ],
                            ),
                          const SizedBox(height: 12),
                          Text('Orders', style: Theme.of(context).textTheme.titleMedium),
                          if (status.orders.isEmpty) const Text('No strategy orders yet.'),
                          for (final order in status.orders)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text('${order.symbol} · ${order.side?.wire ?? ''} ${order.qty}'),
                              subtitle: Text(order.status?.wire ?? 'Unknown'),
                              trailing: Text(formatPrice(order.avgPrice ?? order.price)),
                            ),
                          const SizedBox(height: 16),
                          Text('Live console', style: Theme.of(context).textTheme.titleMedium),
                          if (status.logs.isEmpty) const Text('No logs yet.'),
                          // One text block, newest first: hundreds of separate selectable lines are
                          // slow to rebuild on every engine event.
                          if (status.logs.isNotEmpty)
                            SelectableText(
                              status.logs.reversed.take(200).join('\n\n'),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                ),
              ],
            ),
      ),
    );
  }
}
