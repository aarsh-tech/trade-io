import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../strategies_providers.dart';

class StrategiesScreen extends ConsumerWidget {
  const StrategiesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Strategies')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: () => context.push(Routes.strategyNew),
      icon: const Icon(Icons.add),
      label: const Text('Create'),
    ),
    body: AsyncView(
      value: ref.watch(strategiesProvider),
      onRetry: () => ref.invalidate(strategiesProvider),
      data:
          (rows) => RefreshIndicator(
            onRefresh: () => ref.refresh(strategiesProvider.future),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (rows.isEmpty)
                  const EmptyState(
                    icon: Icons.auto_graph,
                    title: 'No strategies yet',
                    message: 'Create a paper strategy to get started.',
                  ),
                for (final row in rows)
                  Card(
                    child: ListTile(
                      title: Text(row.name),
                      subtitle: Text(
                        '${row.type?.wire ?? 'Legacy strategy'}\n${row.isPaperTrade ? 'Paper' : 'LIVE'} · ${row.isActive ? 'Running' : 'Stopped'}${row.autoStart ? ' · Auto-start' : ''}',
                      ),
                      isThreeLine: true,
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push(Routes.strategy(row.id)),
                    ),
                  ),
              ],
            ),
          ),
    ),
  );
}
