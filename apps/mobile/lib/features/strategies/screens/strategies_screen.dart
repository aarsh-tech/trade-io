import 'dart:async';

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../home/app_chrome.dart';
import '../strategies_api.dart';
import '../strategies_models.dart';
import '../strategies_providers.dart';
import '../strategy_labels.dart';

enum _Filter { all, active, scheduled, intraday, options }

/// Web /strategies on a phone: counts, filters, search, one card per strategy, quick deploy.
class StrategiesScreen extends ConsumerStatefulWidget {
  const StrategiesScreen({super.key});
  @override
  ConsumerState<StrategiesScreen> createState() => _StrategiesScreenState();
}

class _StrategiesScreenState extends ConsumerState<StrategiesScreen> {
  _Filter _filter = _Filter.all;
  String _query = '';

  bool _matches(StrategyRow s) {
    switch (_filter) {
      case _Filter.active when !s.isActive:
      case _Filter.scheduled when !s.autoStart:
      case _Filter.options when !isOptionsStrategy(s.type?.wire):
      case _Filter.intraday when isOptionsStrategy(s.type?.wire):
        return false;
      default:
    }
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return s.name.toLowerCase().contains(q) ||
        (s.type?.wire ?? '').toLowerCase().contains(q) ||
        '${s.config['symbol'] ?? ''}'.toLowerCase().contains(q);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final strategies = ref.watch(strategiesProvider);
    return TabScaffold(
      title: 'Strategies',
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(Routes.strategyNew),
        icon: const Icon(Icons.add_rounded, size: 20),
        label: const Text('New strategy'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(strategiesProvider.future),
        child: AsyncView(
          value: strategies,
          onRetry: () => ref.invalidate(strategiesProvider),
          data: (all) {
            final shown = all.where(_matches).toList();
            final running = all.where((s) => s.isActive).length;
            final scheduled = all.where((s) => s.autoStart).length;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(AppSpace.page, AppSpace.page, AppSpace.page, 88),
              children: [
                const PageHeader(
                  'Strategies',
                  subtitle: 'Start, stop and schedule your algos. Paper first, then live.',
                ),
                const SizedBox(height: AppSpace.gap),
                StatStrip(
                  items: [
                    (label: 'Total', value: '${all.length}', color: null),
                    (label: 'Running', value: '$running', color: running > 0 ? c.profit : null),
                    (label: 'Armed for 09:15', value: '$scheduled', color: scheduled > 0 ? c.warn : null),
                    (
                      label: 'Today (closed)',
                      value: formatInr(all.fold<double>(0, (sum, s) => sum + (s.todayPnl ?? 0)), signed: true),
                      color: c.pnl(all.fold<double>(0, (sum, s) => sum + (s.todayPnl ?? 0))),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.gap),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final f in _Filter.values) ...[
                        ChoiceChip(
                          label: Text(_filterLabel(f, all.length)),
                          selected: _filter == f,
                          onSelected: (_) => setState(() => _filter = f),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                SearchField(hint: 'Search name, type or symbol…', onChanged: (v) => setState(() => _query = v)),
                const SizedBox(height: AppSpace.gap),
                if (all.isEmpty)
                  Card(
                    child: EmptyPanel(
                      icon: Icons.trending_up_rounded,
                      title: 'No trading strategies configured',
                      message: 'Create one with the guided wizard, or quick-deploy the ₹500 stock-picker preset below.',
                      actions: [
                        ToneButton(
                          label: 'New strategy',
                          icon: Icons.add_rounded,
                          filled: true,
                          onPressed: () => context.push(Routes.strategyNew),
                        ),
                      ],
                    ),
                  )
                else if (shown.isEmpty)
                  const Card(
                    child: EmptyPanel(
                      icon: Icons.search_off_rounded,
                      title: 'No matching strategies',
                      message: 'Try another search or switch the filter.',
                    ),
                  ),
                for (final s in shown) ...[StrategyCard(strategy: s), const SizedBox(height: AppSpace.gap)],
                const SizedBox(height: 4),
                const GroupLabel('Quick deploy presets'),
                const _QuickDeploy(),
              ],
            );
          },
        ),
      ),
    );
  }
}

String _filterLabel(_Filter f, int total) => switch (f) {
  _Filter.all => 'All ($total)',
  _Filter.active => 'Running',
  _Filter.scheduled => 'Scheduled',
  _Filter.intraday => 'Intraday stocks',
  _Filter.options => 'Index options',
};

/// Mode, status and 09:15 pills (web ModeBadge / StatusBadge).
class StrategyBadges extends StatelessWidget {
  const StrategyBadges({super.key, required this.strategy});
  final StrategyRow strategy;
  @override
  Widget build(BuildContext context) {
    final s = strategy;
    final status = s.runStatus;
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        Pill(s.isPaperTrade ? 'PAPER' : 'LIVE', tone: s.isPaperTrade ? Tone.profit : Tone.warn),
        Pill(
          status == 'RUNNING' ? 'Running' : (status == 'COMPLETED' ? 'Completed' : 'Stopped'),
          tone: status == 'RUNNING' ? Tone.profit : Tone.neutral,
          dot: status == 'RUNNING',
        ),
        if (s.autoStart) const Pill('09:15', tone: Tone.warn, icon: Icons.alarm_rounded),
      ],
    );
  }
}

class StrategyCard extends ConsumerStatefulWidget {
  const StrategyCard({super.key, required this.strategy});
  final StrategyRow strategy;
  @override
  ConsumerState<StrategyCard> createState() => _StrategyCardState();
}

class _StrategyCardState extends ConsumerState<StrategyCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, {String? success, required String failure}) async {
    setState(() => _busy = true);
    await runWithToast(
      context,
      () async {
        await action();
        ref.invalidate(strategiesProvider);
      },
      success: success,
      failure: failure,
    );
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _toggle() async {
    final s = widget.strategy;
    final api = ref.read(strategiesApiProvider);
    if (s.isActive) {
      final ok = await confirmAction(
        context,
        title: 'Stop "${s.name}"?',
        message: 'The engine stops and any open position it holds is squared off.',
        confirmLabel: 'Stop and square off',
        destructive: true,
      );
      if (!ok) return;
      await _run(() => api.stop(s.id), success: '"${s.name}" stopped', failure: 'Could not stop');
    } else {
      if (!s.isPaperTrade) {
        final ok = await confirmAction(
          context,
          title: 'Start LIVE strategy?',
          message: '"${s.name}" will place real orders on your broker account.',
          confirmLabel: 'Start live',
        );
        if (!ok) return;
      }
      await _run(() => api.start(s.id), success: '"${s.name}" started: engine running', failure: 'Could not start');
    }
  }

  Future<void> _menu(String action) async {
    final s = widget.strategy;
    final api = ref.read(strategiesApiProvider);
    switch (action) {
      case 'edit':
        unawaited(context.push(Routes.strategyEdit(s.id)));
      case 'autostart':
        await _run(
          () => api.setAutoStart(s.id, !s.autoStart),
          success: s.autoStart ? 'Auto-start disabled' : 'Armed: starts by itself at 09:15 on trading days',
          failure: 'Failed to update auto-start',
        );
      case 'delete':
        final ok = await confirmAction(
          context,
          title: 'Delete "${s.name}"?',
          message: 'This removes the strategy and its settings. Past trades stay in your ledger.',
          confirmLabel: 'Delete strategy',
          destructive: true,
        );
        if (ok) await _run(() => api.delete(s.id), success: 'Strategy deleted', failure: 'Failed to delete strategy');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = widget.strategy;
    final type = s.type?.wire;
    final pnl = s.todayPnl;
    Widget cell(String label, String value, Color color) => Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
        decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(AppRadius.control)),
        child: Column(
          children: [
            Text(label, style: TextStyle(fontSize: 10.5, color: c.mutedForeground)),
            const SizedBox(height: 1),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: color),
            ),
          ],
        ),
      ),
    );
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: s.isActive ? c.profit.withValues(alpha: 0.45) : c.border),
      ),
      child: InkWell(
        onTap: () => context.go(Routes.strategy(s.id)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: StrategyBadges(strategy: s)),
                  PopupMenuButton<String>(
                    tooltip: 'More actions',
                    enabled: !_busy,
                    icon: Icon(Icons.more_vert_rounded, size: 18, color: c.mutedForeground),
                    onSelected: _menu,
                    itemBuilder:
                        (_) => [
                          const PopupMenuItem(value: 'edit', child: Text('Edit strategy')),
                          PopupMenuItem(
                            value: 'autostart',
                            child: Text(s.autoStart ? 'Disable 09:15 auto-start' : 'Arm 09:15 auto-start'),
                          ),
                          PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: c.loss))),
                        ],
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      s.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${strategyLabel(type)} · ${s.config['symbol'] ?? 'AUTO'} · ${s.config['exchange'] ?? 'NSE'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: c.mutedForeground),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        cell('Today', formatInr(pnl, signed: true), pnl == null ? c.mutedForeground : c.pnl(pnl)),
                        const SizedBox(width: 6),
                        cell('Stop-loss', stopLossText(type, s.config), c.loss),
                        const SizedBox(width: 6),
                        cell('Target', targetText(type, s.config), c.profit),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: ToneButton(
                            label: s.isActive ? 'Stop' : 'Start',
                            icon: s.isActive ? Icons.stop_rounded : Icons.play_arrow_rounded,
                            tone: s.isActive ? Tone.loss : Tone.profit,
                            filled: true,
                            height: 38,
                            expand: true,
                            busy: _busy,
                            onPressed: _toggle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        ToneButton(
                          label: 'Details',
                          icon: Icons.north_east_rounded,
                          height: 38,
                          onPressed: () => context.go(Routes.strategy(s.id)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The web's one-tap "Intraday Auto Stock Picker (₹500)" preset: creates it LIVE, arms 09:15
/// auto-start and starts it. Asks first, since it trades real money.
class _QuickDeploy extends ConsumerStatefulWidget {
  const _QuickDeploy();
  @override
  ConsumerState<_QuickDeploy> createState() => _QuickDeployState();
}

class _QuickDeployState extends ConsumerState<_QuickDeploy> {
  bool _busy = false;

  Future<void> _deploy() async {
    final accounts = ref.read(brokersProvider).value ?? const [];
    final broker = accounts.where((a) => a.isActive).firstOrNull ?? accounts.firstOrNull;
    if (broker == null) {
      return toast(context, 'Please connect a Zerodha broker account first (More → Brokers)', error: true);
    }
    final ok = await confirmAction(
      context,
      title: 'Deploy LIVE stock picker?',
      message:
          'Creates "Intraday Auto Stock Picker (₹500/day Target)" as a LIVE strategy on ${broker.label}, arms 09:15 auto-start and starts it now. ₹500 stop-loss, ₹500 target, 1 trade a day.',
      confirmLabel: 'Deploy live',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    final api = ref.read(strategiesApiProvider);
    await runWithToast(
      context,
      () async {
        final id = await api.save(null, {
          'name': 'Intraday Auto Stock Picker (₹500/day Target)',
          'type': 'EMA_VWAP_CROSSOVER',
          'brokerAccountId': broker.id,
          'isPaperTrade': false,
          'config': jsonEncode({
            'symbol': 'AUTO',
            'exchange': 'NSE',
            'instrumentType': 'STOCK',
            'product': 'MIS',
            'qty': 1,
            'stopLossRs': 500,
            'targetRs': 500,
            'maxTradesPerDay': 1,
            'emaPeriod': 15,
          }),
        });
        if (id != null) {
          await api.setAutoStart(id, true);
          await api.start(id);
        }
        ref.invalidate(strategiesProvider);
      },
      success: 'Intraday auto-stock strategy deployed. Auto-starts at 09:15 on trading days.',
      failure: 'Failed to deploy strategy',
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Panel(
      accent: c.profit,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Wrap(spacing: 6, children: [Pill('Equity · MIS', tone: Tone.profit), Pill('₹500 target / ₹500 SL')]),
          const SizedBox(height: 6),
          const Text('Intraday Auto Stock Picker', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(
            'Scans 180+ F&O stocks for the highest-momentum mover with 15-EMA + VWAP confirmation. Trades MIS with a ₹500 target and ₹500 stop. Deploys LIVE.',
            style: TextStyle(fontSize: 12, color: c.mutedForeground),
          ),
          const SizedBox(height: 10),
          ToneButton(
            label: 'Quick deploy ₹500 preset',
            icon: Icons.bolt_rounded,
            tone: Tone.profit,
            busy: _busy,
            height: 36,
            onPressed: _deploy,
          ),
        ],
      ),
    );
  }
}
