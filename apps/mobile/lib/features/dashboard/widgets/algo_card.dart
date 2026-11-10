import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../positions/algo_positions.dart';
import '../../positions/position_actions.dart';
import '../../positions/widgets/position_row.dart';
import '../../strategies/strategies_api.dart';
import '../../strategies/strategies_models.dart';
import '../../strategies/strategies_providers.dart';
import '../../strategies/strategy_labels.dart';

/// The web's LiveAlgoPositionsCard: open positions (broker + strategy) with live MTM and
/// square-off, then every strategy with its state and a Start / Pause button.
class AlgoCard extends ConsumerWidget {
  const AlgoCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final accountId = ref.watch(activeBrokerProvider).value?.id;
    final rows = ref.watch(algoPositionsProvider(accountId));
    final live = ref.watch(marketSocketProvider.select((s) => s.connected));
    final strategies = ref.watch(strategiesProvider);
    final open = (rows.value ?? const []).where((r) => r.isOpen).toList();
    final mtm = open.fold<double>(0, (sum, r) => sum + r.pnl);

    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
            child: Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text('Positions (${open.length})', style: Theme.of(context).textTheme.titleSmall),
                      if (open.isNotEmpty) Pill('MTM ${formatPrice(mtm, signed: true)}', tone: pnlTone(mtm)),
                      Pill(live ? 'Live ticks' : 'Connecting', tone: live ? Tone.profit : Tone.warn, dot: true),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                if (open.isNotEmpty)
                  ToneButton(
                    label: 'Exit all',
                    icon: Icons.gpp_maybe_outlined,
                    tone: Tone.loss,
                    height: 28,
                    onPressed:
                        () =>
                            squareOffAll(context, ref, accountId: accountId, open: [for (final r in open) r.position]),
                  )
                else
                  IconButton(
                    tooltip: 'Sync broker positions',
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.sync_rounded, size: 18),
                    onPressed: () {
                      if (accountId != null) ref.invalidate(positionsProvider(accountId));
                      ref.invalidate(strategiesProvider);
                    },
                  ),
              ],
            ),
          ),
          rows.when(
            skipLoadingOnReload: true,
            loading: () => const Loading(label: 'Loading open positions…'),
            error: (_, __) => const Padding(padding: EdgeInsets.all(12), child: Text('Could not load positions.')),
            data:
                (_) =>
                    open.isEmpty
                        ? Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            'No open market positions. Strategies place orders automatically when setups trigger.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: c.mutedForeground),
                          ),
                        )
                        : Column(
                          children: [
                            for (final (i, r) in open.indexed) ...[
                              if (i > 0) Divider(color: c.border),
                              PositionRow(
                                row: r,
                                onExit: () => squareOffPosition(context, ref, accountId: accountId, p: r.position),
                              ),
                            ],
                          ],
                        ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            decoration: BoxDecoration(
              color: c.muted.withValues(alpha: 0.5),
              border: Border(top: BorderSide(color: c.border)),
            ),
            child: AsyncView(
              value: strategies,
              loading: const LinearProgressIndicator(),
              onRetry: () => ref.invalidate(strategiesProvider),
              data: (list) {
                final active = list.where((s) => s.isActive).length;
                final armed = list.where((s) => s.autoStart && !s.isActive).length;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.smart_toy_outlined, size: 15, color: c.accentForeground),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                              children: [
                                TextSpan(
                                  text: 'STRATEGIES (${list.length})',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 0.4,
                                    color: c.foreground,
                                  ),
                                ),
                                TextSpan(
                                  text: '  ·  $active live',
                                  style: TextStyle(color: c.profit, fontWeight: FontWeight.w600),
                                ),
                                TextSpan(
                                  text: '  ·  $armed armed',
                                  style: TextStyle(color: c.warn, fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                        ),
                        PanelLink('Manage', onTap: () => context.go(Routes.strategies)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    if (list.isEmpty)
                      TextButton(
                        onPressed: () => context.push(Routes.strategyNew),
                        child: const Text('No strategies configured. Create one now'),
                      ),
                    for (final s in list) ...[_StrategyMini(strategy: s), const SizedBox(height: 6)],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StrategyMini extends ConsumerStatefulWidget {
  const _StrategyMini({required this.strategy});
  final StrategyRow strategy;
  @override
  ConsumerState<_StrategyMini> createState() => _StrategyMiniState();
}

class _StrategyMiniState extends ConsumerState<_StrategyMini> {
  bool _busy = false;

  Future<void> _toggle() async {
    final s = widget.strategy;
    if (!s.isActive && !s.isPaperTrade) {
      final ok = await confirmAction(
        context,
        title: 'Start LIVE strategy?',
        message: '"${s.name}" will place real orders on your broker account.',
        confirmLabel: 'Start live',
      );
      if (!ok) return;
    }
    if (!mounted) return;
    setState(() => _busy = true);
    final api = ref.read(strategiesApiProvider);
    await runWithToast(
      context,
      () async {
        s.isActive ? await api.stop(s.id) : await api.start(s.id);
        ref.invalidate(strategiesProvider);
      },
      success: s.isActive ? 'Engine paused for ${s.name}' : 'Engine started for ${s.name}',
      failure: 'Failed to update strategy',
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = widget.strategy;
    final borderColor =
        s.isActive
            ? c.profit.withValues(alpha: 0.35)
            : s.autoStart
            ? c.warn.withValues(alpha: 0.35)
            : c.border;
    return Material(
      color: c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: borderColor),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: () => context.go(Routes.strategy(s.id)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 5,
                      runSpacing: 3,
                      children: [
                        if (s.isActive)
                          const Pill('LIVE ACTIVE', tone: Tone.profit, dot: true)
                        else if (s.autoStart)
                          const Pill('09:15 ARMED', tone: Tone.warn, icon: Icons.alarm_rounded)
                        else
                          const Pill('PAUSED'),
                        Pill(strategyLabel(s.type?.wire), tone: Tone.brand),
                        if (s.isPaperTrade) const Pill('PAPER'),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      s.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      '${s.config['symbol'] ?? 'AUTO'} · ${s.config['product'] ?? 'MIS'} · 09:15–15:05 IST',
                      style: TextStyle(fontSize: 10.5, color: c.mutedForeground),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              ToneButton(
                label: s.isActive ? 'Pause' : 'Start',
                icon: s.isActive ? Icons.pause_rounded : Icons.play_arrow_rounded,
                tone: s.isActive ? Tone.warn : Tone.profit,
                height: 30,
                busy: _busy,
                onPressed: _toggle,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
