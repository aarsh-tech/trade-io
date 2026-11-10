import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../core/utils/market_time.dart';
import '../../../router.dart';
import '../../../shared/enums.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../strategies_api.dart';
import '../strategies_models.dart';
import '../strategies_providers.dart';
import '../strategy_config.dart';
import '../strategy_labels.dart';
import '../strategy_socket.dart';
import '../strategy_state.dart';
import 'strategies_screen.dart';

enum _Tab { live, config, analytics, history }

/// Web /strategies/:id: header with actions, the four metric tiles, then Live / Config /
/// Analytics / History.
class StrategyDetailScreen extends ConsumerStatefulWidget {
  const StrategyDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<StrategyDetailScreen> createState() => _StrategyDetailScreenState();
}

class _StrategyDetailScreenState extends ConsumerState<StrategyDetailScreen> {
  String get id => widget.id;
  _Tab _tab = _Tab.live;
  bool _busy = false;

  void _refresh() {
    ref
      ..invalidate(strategyProvider(id))
      ..invalidate(strategyStatusProvider(id))
      ..invalidate(strategyEventsProvider(id))
      ..invalidate(strategiesProvider)
      ..invalidate(ordersProvider)
      ..invalidate(positionsProvider);
  }

  Future<void> _run(Future<void> Function() action, {String? success, required String failure}) async {
    setState(() => _busy = true);
    await runWithToast(context, action, success: success, failure: failure);
    _refresh();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _toggle(StrategyRow s, bool running) async {
    final api = ref.read(strategiesApiProvider);
    if (running) {
      if (!await confirmAction(
        context,
        title: 'Stop "${s.name}"?',
        message: 'The engine stops taking new entries. Use Square off to close its open position.',
        confirmLabel: 'Stop',
        destructive: true,
      )) {
        return;
      }
      await _run(() => api.stop(id), success: 'Strategy stopped', failure: 'Could not stop');
    } else {
      if (!await confirmAction(
        context,
        title: s.isPaperTrade ? 'Start strategy?' : 'Start LIVE strategy?',
        message:
            s.isPaperTrade
                ? 'Starts ${s.name} in paper mode.'
                : '${s.name} will place real orders on your broker account.',
        confirmLabel: s.isPaperTrade ? 'Start' : 'Start live',
      )) {
        return;
      }
      await _run(() => api.start(id), success: 'Engine started', failure: 'Could not start');
    }
  }

  Future<void> _squareOff() async {
    if (!await confirmAction(
      context,
      title: 'Square off?',
      message: 'Closes all open positions belonging to this strategy at the broker.',
      confirmLabel: 'Square off',
      destructive: true,
    )) {
      return;
    }
    await _run(
      () => ref.read(strategiesApiProvider).squareOff(id),
      success: 'Square-off sent',
      failure: 'Square-off failed',
    );
  }

  Future<void> _menu(String action, StrategyRow s, bool running) async {
    final api = ref.read(strategiesApiProvider);
    switch (action) {
      case 'edit':
        unawaited(context.push(Routes.strategyEdit(id)));
      case 'autostart':
        await _run(
          () => api.setAutoStart(id, !s.autoStart),
          success: s.autoStart ? 'Auto-start disabled' : 'Armed: starts by itself at 09:15',
          failure: 'Failed to update auto-start',
        );
      case 'delete':
        if (running) return toast(context, 'Stop the strategy before deleting it', error: true);
        if (!await confirmAction(
          context,
          title: 'Delete "${s.name}"?',
          message: 'Removes the strategy and its settings. Past trades stay in your ledger.',
          confirmLabel: 'Delete',
          destructive: true,
        )) {
          return;
        }
        if (!mounted) return;
        final router = GoRouter.of(context);
        final ok = await runWithToast(
          context,
          () => api.delete(id),
          success: 'Strategy deleted',
          failure: 'Failed to delete',
        );
        if (ok) {
          ref.invalidate(strategiesProvider);
          router.go(Routes.strategies);
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final live = ref.watch(liveStrategyProvider(id));
    final strategy = ref.watch(strategyProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: Text(strategy.value?.name ?? 'Strategy', maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: 'Refresh', onPressed: _refresh, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: AsyncView(
        value: strategy,
        onRetry: _refresh,
        data: (s) {
          // The engine's own answer wins; the saved flag covers the moment before it arrives.
          final running = live.value?.running ?? s.isActive;
          final perf = s.performance;
          final m = StrategyMetrics.of(
            running: running,
            runStatus: running ? 'RUNNING' : s.runStatus,
            state: live.value?.state,
            perfTodayTrades: perf?.todayTrades,
            perfTodayPnl: perf?.todayPnl,
            totalTrades: perf?.totalTrades ?? 0,
            winRate: perf?.winRate ?? 0,
          );
          final maxTrades = s.config['maxTradesPerDay'] ?? s.config['maxPositions'];
          return RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView(
              padding: AppSpace.pageInsets,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 4, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(child: StrategyBadges(strategy: s.copyWith(isActive: running))),
                            PopupMenuButton<String>(
                              tooltip: 'More actions',
                              enabled: !_busy,
                              icon: Icon(Icons.more_vert_rounded, size: 18, color: c.mutedForeground),
                              onSelected: (a) => _menu(a, s, running),
                              itemBuilder:
                                  (_) => [
                                    const PopupMenuItem(value: 'edit', child: Text('Edit strategy')),
                                    PopupMenuItem(
                                      value: 'autostart',
                                      child: Text(s.autoStart ? 'Disable 09:15 auto-start' : 'Arm 09:15 auto-start'),
                                    ),
                                    PopupMenuItem(
                                      value: 'delete',
                                      child: Text('Delete', style: TextStyle(color: c.loss)),
                                    ),
                                  ],
                            ),
                          ],
                        ),
                        Text(s.name, style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          '${strategyLabel(s.type?.wire)} · ${s.config['symbol'] ?? 'AUTO'} · ${s.config['product'] ?? 'MIS'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: ToneButton(
                                  label: running ? 'Stop' : 'Start',
                                  icon: running ? Icons.stop_rounded : Icons.play_arrow_rounded,
                                  tone: running ? Tone.loss : Tone.profit,
                                  filled: true,
                                  height: 38,
                                  expand: true,
                                  busy: _busy,
                                  onPressed: () => _toggle(s, running),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: ToneButton(
                                  label: 'Square off',
                                  icon: Icons.logout_rounded,
                                  tone: Tone.loss,
                                  height: 38,
                                  expand: true,
                                  onPressed: _busy ? null : _squareOff,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: AppSpace.gap),
                StatStrip(
                  items: [
                    (
                      label: "Today's P&L",
                      value: formatInr(m.todayPnl, signed: true),
                      color: m.todayPnl == null ? c.mutedForeground : c.pnl(m.todayPnl!),
                    ),
                    (
                      label: maxTrades == null ? 'Trades today' : 'Trades today (max $maxTrades)',
                      value: m.tradesToday == null ? empty : '${m.tradesToday}',
                      color: null,
                    ),
                    (
                      label: m.totalTrades > 0 ? 'Win rate (${m.totalTrades}, 30d)' : 'Win rate',
                      value: m.winRate == null ? empty : '${m.winRate!.toStringAsFixed(1)}%',
                      color: null,
                    ),
                    (
                      label: s.isPaperTrade ? 'Status · paper' : 'Status · live',
                      value: m.statusText,
                      color: running ? c.profit : c.mutedForeground,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.gap),
                SegmentTabs<_Tab>(
                  options: [
                    (value: _Tab.live, label: 'Live', tone: null),
                    (value: _Tab.config, label: 'Config', tone: null),
                    (value: _Tab.analytics, label: 'Analytics', tone: null),
                    (
                      value: _Tab.history,
                      label: s.executions.isEmpty ? 'History' : 'History ${s.executions.length}',
                      tone: null,
                    ),
                  ],
                  value: _tab,
                  onChanged: (t) => setState(() => _tab = t),
                ),
                const SizedBox(height: AppSpace.gap),
                switch (_tab) {
                  _Tab.live => live.when(
                    skipLoadingOnReload: true,
                    loading: () => const Loading(),
                    error:
                        (_, __) => const Panel(
                          title: 'Live status',
                          child: Text('Live status is unavailable. Pull to refresh.'),
                        ),
                    data: (status) => _LiveTab(status: status),
                  ),
                  _Tab.config => _ConfigTab(strategy: s),
                  _Tab.analytics => _AnalyticsTab(strategy: s),
                  _Tab.history => _HistoryTab(strategy: s),
                },
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Trade status, the strategy's orders and its console, from the live engine feed.
class _LiveTab extends StatelessWidget {
  const _LiveTab({required this.status});
  final StrategyStatus status;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final summary = status.state == null ? const <(String, String)>[] : strategyStateSummary(status.state!);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (summary.isNotEmpty) ...[
          Panel(
            title: 'Trade status',
            icon: Icons.track_changes_rounded,
            child: Column(children: [for (final (label, value) in summary) KV(label, value)]),
          ),
          const SizedBox(height: AppSpace.gap),
        ],
        Panel(
          title: 'Orders',
          icon: Icons.receipt_long_outlined,
          trailing: Padding(padding: const EdgeInsets.only(right: 6), child: Pill('${status.orders.length}')),
          padding: EdgeInsets.zero,
          child:
              status.orders.isEmpty
                  ? const Padding(padding: EdgeInsets.all(12), child: Text('No strategy orders yet.'))
                  : Column(
                    children: [
                      for (final (i, o) in status.orders.indexed) ...[
                        if (i > 0) Divider(color: c.border),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: Row(
                            children: [
                              Pill(o.side?.wire ?? '—', tone: o.side == OrderSide.buy ? Tone.brand : Tone.loss),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      o.symbol,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                    ),
                                    Text(
                                      '${o.qty} qty · ${o.status?.wire ?? 'Unknown'}',
                                      style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                formatPrice(o.avgPrice ?? o.price),
                                style: const TextStyle(fontSize: 13, fontFeatures: [FontFeature.tabularFigures()]),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
        ),
        const SizedBox(height: AppSpace.gap),
        Panel(
          title: 'Engine console',
          icon: Icons.terminal_rounded,
          padding: EdgeInsets.zero,
          child: LogConsole(lines: status.logs.reversed.take(200).toList()),
        ),
      ],
    );
  }
}

/// Monospace log block, newest first, with the time stamp dimmed and errors highlighted.
class LogConsole extends StatelessWidget {
  const LogConsole({super.key, required this.lines, this.maxHeight = 420});
  final List<String> lines;
  final double maxHeight;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final time = RegExp(r'^\[?(\d{1,2}:\d{2}(:\d{2})?)\]?\s*');
    return Container(
      constraints: BoxConstraints(minHeight: 64, maxHeight: maxHeight),
      color: c.logBackground,
      child:
          lines.isEmpty
              ? Padding(
                padding: const EdgeInsets.all(12),
                child: Text('No logs yet.', style: TextStyle(color: c.logTime, fontSize: 12)),
              )
              : ListView.builder(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 6),
                itemCount: lines.length,
                itemBuilder: (_, i) {
                  final line = lines[i];
                  final m = time.firstMatch(line);
                  final lower = line.toLowerCase();
                  final error = lower.contains('error') || lower.contains('failed') || lower.contains('rejected');
                  return Container(
                    color: error ? c.lossSubtle : null,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                    child: Text.rich(
                      TextSpan(
                        style: TextStyle(
                          fontFamily: fontMono,
                          fontSize: 11,
                          height: 1.5,
                          color: error ? c.loss : c.logText,
                        ),
                        children: [
                          if (m != null) TextSpan(text: '${m.group(1)}  ', style: TextStyle(color: c.logTime)),
                          TextSpan(text: m == null ? line : line.substring(m.end)),
                        ],
                      ),
                    ),
                  );
                },
              ),
    );
  }
}

class _ConfigTab extends StatelessWidget {
  const _ConfigTab({required this.strategy});
  final StrategyRow strategy;
  @override
  Widget build(BuildContext context) {
    final s = strategy;
    final cfg = s.config;
    final broker = s.brokerAccount;
    String show(Object? v) => v is bool ? (v ? 'On' : 'Off') : '$v';
    const main = {'symbol', 'exchange', 'product', 'stopLossRs', 'targetRs', 'maxTradesPerDay'};
    final rest = cfg.entries.where((e) => !main.contains(e.key) && e.value is! Map && e.value is! List).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Panel(
          title: 'Instrument & risk',
          icon: Icons.tune_rounded,
          trailing: TextButton(onPressed: () => context.push(Routes.strategyEdit(s.id)), child: const Text('Edit')),
          child: Column(
            children: [
              KV('Strategy type', strategyLabel(s.type?.wire)),
              KV('Symbol', '${cfg['symbol'] ?? 'Auto'}'),
              KV('Exchange', '${cfg['exchange'] ?? (cfg['symbol'] == 'SENSEX' ? 'BFO' : 'NSE')}'),
              KV('Product', '${cfg['product'] ?? 'MIS'}'),
              KV('Broker', broker == null ? 'Virtual paper broker' : '${broker['broker']} (${broker['clientId']})'),
              KV('Mode', s.isPaperTrade ? 'Paper' : 'Live'),
              KV('Stop-loss', stopLossText(s.type?.wire, cfg), color: context.colors.loss),
              KV('Target', targetText(s.type?.wire, cfg), color: context.colors.profit),
              if (cfg['maxTradesPerDay'] != null) KV('Max trades per day', '${cfg['maxTradesPerDay']}'),
            ],
          ),
        ),
        if (rest.isNotEmpty) ...[
          const SizedBox(height: AppSpace.gap),
          Panel(
            title: 'All settings',
            icon: Icons.list_alt_rounded,
            child: Column(children: [for (final e in rest) KV(configLabel(e.key), show(e.value))]),
          ),
        ],
      ],
    );
  }
}

class _AnalyticsTab extends StatelessWidget {
  const _AnalyticsTab({required this.strategy});
  final StrategyRow strategy;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = strategy.performance;
    if (p == null || p.totalTrades == 0) {
      return const Card(
        child: EmptyPanel(
          icon: Icons.bar_chart_rounded,
          title: 'No completed trades yet',
          message: 'Win rate, P&L and profit factor appear here once this strategy has closed a trade.',
        ),
      );
    }
    final pf = p.profitFactor;
    return Panel(
      title: 'Performance',
      icon: Icons.bar_chart_rounded,
      trailing: const Padding(padding: EdgeInsets.only(right: 6), child: Pill('Last 30 days')),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Caption('Win rate'),
          Row(
            children: [
              Text(
                '${p.winRate.toStringAsFixed(1)}%',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 12),
              Expanded(child: Meter(p.winRate / 100, color: c.profit)),
            ],
          ),
          Text(
            '${p.totalTrades} completed trade${p.totalTrades == 1 ? '' : 's'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Divider(color: c.border),
          const SizedBox(height: 10),
          const Caption('Net realised P&L'),
          Text(
            formatInr(p.netPnl, signed: true),
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600, color: c.pnl(p.netPnl)),
          ),
          Text('Average win ${formatInr(p.avgProfitPerWin)}', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          Divider(color: c.border),
          const SizedBox(height: 10),
          const Caption('Profit factor'),
          Row(
            children: [
              Text(
                pf == 99.9 ? '∞' : (pf.isFinite ? pf.toStringAsFixed(2) : empty),
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 10),
              Pill(
                pf >= 2 ? 'Excellent' : (pf >= 1.2 ? 'Healthy' : 'Moderate'),
                tone: pf >= 1.5 ? Tone.profit : Tone.neutral,
              ),
            ],
          ),
          Text('Gross profit divided by gross loss', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          Notice(
            strategy.isPaperTrade
                ? 'Simulated executions recorded in paper mode.'
                : 'Executions recorded through your connected broker account.',
          ),
        ],
      ),
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.strategy});
  final StrategyRow strategy;

  String _when(DateTime? t) => t == null ? '—' : formatMarketTimestamp(t.toIso8601String());

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final sessions = strategy.executions;
    if (sessions.isEmpty) {
      return const Card(
        child: EmptyPanel(
          icon: Icons.history_rounded,
          title: 'No sessions yet',
          message: 'Each time you start this strategy, the run is recorded here with its logs.',
        ),
      );
    }
    return Panel(
      title: 'Sessions (${sessions.length})',
      icon: Icons.history_rounded,
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (final (i, ex) in sessions.indexed) ...[
            if (i > 0) Divider(color: c.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                _when(ex.startedAt),
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Pill(
                              ex.status,
                              tone: switch (ex.status) {
                                'RUNNING' => Tone.profit,
                                'ERROR' => Tone.loss,
                                'COMPLETED' => Tone.brand,
                                'STOPPED' => Tone.warn,
                                _ => Tone.neutral,
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Duration ${ex.duration}${ex.stoppedAt == null ? '' : ' · ended ${_when(ex.stoppedAt)}'}',
                          style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                        ),
                        if (ex.errorMsg != null)
                          Text(
                            ex.errorMsg!,
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: c.loss),
                          ),
                      ],
                    ),
                  ),
                  ToneButton(
                    label: 'Logs',
                    icon: Icons.terminal_rounded,
                    onPressed:
                        () => showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          useSafeArea: true,
                          builder:
                              (ctx) => Padding(
                                padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Text('Session logs', style: Theme.of(ctx).textTheme.titleSmall),
                                    Text('Started ${_when(ex.startedAt)}', style: Theme.of(ctx).textTheme.bodySmall),
                                    const SizedBox(height: 10),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(AppRadius.card),
                                      child: LogConsole(
                                        lines: ex.logLines,
                                        maxHeight: MediaQuery.sizeOf(ctx).height * 0.6,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                        ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
