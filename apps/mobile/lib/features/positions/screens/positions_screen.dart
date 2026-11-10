import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../brokers/widgets/broker_banner.dart';
import '../../brokers/widgets/broker_picker.dart';
import '../../home/app_chrome.dart';
import '../../portfolio/live_pnl.dart';
import '../../portfolio/portfolio_providers.dart';
import '../position_actions.dart';
import '../widgets/position_row.dart';

/// Web /positions on a phone: summary strip, open positions, today's closed ones.
class PositionsScreen extends ConsumerWidget {
  const PositionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(activeBrokerProvider);
    return TabScaffold(
      title: 'Positions',
      body: AsyncView(
        value: active,
        onRetry: () => ref.invalidate(brokersProvider),
        data:
            (broker) =>
                broker == null
                    ? ListView(
                      padding: AppSpace.pageInsets,
                      children: [
                        const BrokerBanner(),
                        EmptyPanel(
                          icon: Icons.show_chart_rounded,
                          title: 'No broker linked',
                          message: 'Connect your Zerodha account to see live positions.',
                          actions: [
                            ToneButton(
                              label: 'Manage brokers',
                              icon: Icons.power_outlined,
                              filled: true,
                              onPressed: () => context.go(Routes.brokers),
                            ),
                          ],
                        ),
                      ],
                    )
                    : _PositionsBody(accountId: broker.id),
      ),
    );
  }
}

class _PositionsBody extends ConsumerWidget {
  const _PositionsBody({required this.accountId});

  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final live = ref.watch(livePositionsProvider(accountId));
    return RefreshIndicator(
      onRefresh: () => ref.refresh(positionsProvider(accountId).future),
      child: AsyncView(
        value: live,
        onRetry: () => ref.invalidate(positionsProvider(accountId)),
        data: (rows) {
          final open = rows.where((r) => r.isOpen).toList();
          final closed = rows.where((r) => !r.isOpen).toList();
          final s = PositionsSummary.of(rows);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: AppSpace.pageInsets,
            children: [
              const BrokerBanner(),
              Row(
                children: [
                  const Expanded(child: BrokerPicker()),
                  if (open.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    ToneButton(
                      label: 'Square off all',
                      icon: Icons.gpp_maybe_outlined,
                      tone: Tone.loss,
                      height: 36,
                      onPressed:
                          () => squareOffAll(
                            context,
                            ref,
                            accountId: accountId,
                            open: [for (final r in open) r.position],
                          ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: AppSpace.gap),
              StatStrip(
                items: [
                  (label: 'Total P&L', value: formatInr(s.totalPnl, signed: true), color: c.pnl(s.totalPnl)),
                  (label: 'Invested', value: formatInr(s.invested, decimals: 0), color: null),
                  (label: 'Open positions', value: '${s.openCount}', color: null),
                  (label: 'In profit / loss', value: '${s.winners} / ${s.losers}', color: null),
                ],
              ),
              const SizedBox(height: AppSpace.gap),
              Panel(
                title: 'Open positions',
                trailing: Padding(padding: const EdgeInsets.only(right: 6), child: Pill('${open.length}')),
                padding: EdgeInsets.zero,
                child:
                    open.isEmpty
                        ? EmptyPanel(
                          icon: Icons.show_chart_rounded,
                          title: 'No open positions',
                          message: 'Strategies place orders when their setups trigger, or place one yourself.',
                          actions: [
                            ToneButton(
                              label: 'Place order',
                              icon: Icons.shopping_cart_outlined,
                              filled: true,
                              onPressed: () => context.push(Routes.trade),
                            ),
                          ],
                        )
                        : _Rows(accountId: accountId, rows: open),
              ),
              if (closed.isNotEmpty) ...[
                const SizedBox(height: AppSpace.gap),
                Panel(
                  title: 'Closed today',
                  trailing: Padding(padding: const EdgeInsets.only(right: 6), child: Pill('${closed.length}')),
                  padding: EdgeInsets.zero,
                  child: _Rows(accountId: accountId, rows: closed),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _Rows extends ConsumerWidget {
  const _Rows({required this.accountId, required this.rows});
  final String accountId;
  final List<LivePosition> rows;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final total = rows.fold<double>(0, (sum, r) => sum + r.pnl);
    return Column(
      children: [
        for (final (i, r) in rows.indexed) ...[
          if (i > 0) Divider(color: c.border),
          PositionRow(
            key: ValueKey('$accountId:${positionKey(r.position)}:${r.position.product}'),
            row: r,
            onExit: () => squareOffPosition(context, ref, accountId: accountId, p: r.position),
          ),
        ],
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: c.muted.withValues(alpha: 0.5),
            border: Border(top: BorderSide(color: c.border)),
          ),
          child: KV('Total P&L', formatPrice(total, signed: true), color: c.pnl(total), bold: true),
        ),
      ],
    );
  }
}
