import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../brokers/brokers_api.dart';
import '../../brokers/brokers_providers.dart';
import '../../brokers/widgets/broker_banner.dart';
import '../../orders/order_ticket.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/live_pnl.dart';
import '../../portfolio/portfolio_providers.dart';

/// Broker positions with live P&L. Port of the web's Positions page, phone-sized.
class PositionsScreen extends ConsumerWidget {
  const PositionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brokers = ref.watch(brokersProvider).value ?? const [];
    final active = ref.watch(activeBrokerProvider);
    final connected = ref.watch(marketSocketProvider.select((s) => s.connected));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Positions'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Tooltip(
              message: connected ? 'Live prices connected' : 'Live prices disconnected',
              child: Icon(Icons.circle, size: 10, color: connected ? context.colors.profit : context.colors.warn),
            ),
          ),
          if (brokers.length > 1)
            PopupMenuButton<String>(
              tooltip: 'Choose account',
              icon: const Icon(Icons.account_balance_outlined),
              onSelected: (id) => ref.read(selectedBrokerProvider.notifier).select(id),
              itemBuilder:
                  (_) => [
                    for (final b in brokers)
                      PopupMenuItem(
                        value: b.id,
                        child: Text('${b.label}${b.clientId == null ? '' : ' · ${b.clientId}'}'),
                      ),
                  ],
            ),
        ],
      ),
      body: AsyncView(
        value: active,
        onRetry: () => ref.invalidate(brokersProvider),
        data: (broker) {
          if (broker == null) {
            return const Column(
              children: [
                BrokerBanner(),
                Expanded(child: EmptyState(icon: Icons.pie_chart_outline, title: 'No broker linked')),
              ],
            );
          }
          return _PositionsBody(accountId: broker.id);
        },
      ),
    );
  }
}

class _PositionsBody extends ConsumerWidget {
  const _PositionsBody({required this.accountId});

  final String accountId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final live = ref.watch(livePositionsProvider(accountId));
    return RefreshIndicator(
      onRefresh: () => ref.refresh(positionsProvider(accountId).future),
      child: AsyncView(
        value: live,
        onRetry: () => ref.invalidate(positionsProvider(accountId)),
        data: (rows) {
          final open = rows.where((r) => r.isOpen).toList();
          final closed = rows.where((r) => !r.isOpen).toList();
          final summary = PositionsSummary.of(rows);
          return ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              const BrokerBanner(),
              _SummaryCard(summary: summary),
              if (rows.isEmpty)
                const EmptyState(
                  icon: Icons.pie_chart_outline,
                  title: 'No positions today',
                  message: 'Open positions and today\'s closed trades show up here.',
                ),
              if (open.isNotEmpty) ...[
                _SectionHeader('Open · ${open.length}'),
                for (final r in open)
                  _PositionTile(
                    key: ValueKey('$accountId:${positionKey(r.position)}:${r.position.product}'),
                    row: r,
                    accountId: accountId,
                  ),
              ],
              if (closed.isNotEmpty) ...[
                _SectionHeader('Closed today · ${closed.length}'),
                for (final r in closed)
                  _PositionTile(
                    key: ValueKey('$accountId:${positionKey(r.position)}:${r.position.product}'),
                    row: r,
                    accountId: accountId,
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});

  final PositionsSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 12);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Today's P&L", style: muted),
                    const SizedBox(height: 2),
                    PnlText(
                      summary.totalPnl,
                      style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text('Invested ${formatInr(summary.invested, decimals: 0)}', style: muted),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${summary.openCount} open', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.arrow_upward, size: 14, color: context.colors.profit),
                      Text('${summary.winners}', style: tabular(muted)),
                      const SizedBox(width: 8),
                      Icon(Icons.arrow_downward, size: 14, color: context.colors.loss),
                      Text('${summary.losers}', style: tabular(muted)),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.6,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

class _PositionTile extends ConsumerStatefulWidget {
  const _PositionTile({super.key, required this.row, required this.accountId});

  final LivePosition row;
  final String accountId;

  @override
  ConsumerState<_PositionTile> createState() => _PositionTileState();
}

class _PositionTileState extends ConsumerState<_PositionTile> {
  LivePosition get row => widget.row;
  String get accountId => widget.accountId;
  bool _busy = false;
  final _attempt = OrderAttempt();
  Future<void> _squareOff(BuildContext context, WidgetRef ref) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final p = row.position;
      final exitSide = p.qty > 0 ? 'SELL' : 'BUY';
      final exitQty = p.qty.abs();
      final ok = await showDialog<bool>(
        context: context,
        builder:
            (ctx) => AlertDialog(
              title: Text('Exit ${p.symbol}?'),
              content: Text('Places a MARKET $exitSide for $exitQty (${p.product}) at the broker.'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: ctx.colors.loss),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Exit position'),
                ),
              ],
            ),
      );
      if (ok != true || !context.mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      final key = _attempt.keyFor('$accountId:${exchangeOf(p)}:${p.symbol}:${p.product}:${p.qty}');
      try {
        final exitOrder = <String, dynamic>{
          'symbol': p.symbol,
          'exchange': exchangeOf(p),
          'side': exitSide,
          'product': p.product,
          'orderType': 'MARKET',
          'qty': exitQty,
          'price': 0,
        };
        await ref.read(brokersApiProvider).placeOrder(accountId, exitOrder, idempotencyKey: key);
        _attempt.settle(answered: true);
        messenger.showSnackBar(SnackBar(content: Text('Exit order placed: $exitSide $exitQty ${p.symbol}')));
        ref.invalidate(positionsProvider(accountId));
        ref.invalidate(ordersProvider);
      } catch (e) {
        _attempt.settle(answered: serverAnswered(e));
        messenger.showSnackBar(
          SnackBar(
            content: Text(apiErrorMessage(e, 'Could not confirm the exit order. Check Orders before trying again.')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = row.position;
    final theme = Theme.of(context), colors = context.colors;
    final muted = TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 12);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onLongPress: row.isOpen && !_busy ? () => _squareOff(context, ref) : null,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        p.symbol,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: 6),
                    StatusChip(
                      row.isOpen ? (p.qty < 0 ? 'SHORT' : 'LONG') : 'CLOSED',
                      color: row.isOpen ? (p.qty < 0 ? colors.sell : colors.buy) : theme.colorScheme.onSurfaceVariant,
                    ),
                    if (row.isOpen)
                      IconButton(
                        tooltip: 'Exit position',
                        icon: Icon(Icons.logout, size: 18, color: colors.loss),
                        onPressed: _busy ? null : () => _squareOff(context, ref),
                      ),
                  ],
                ),
                Text(
                  '${exchangeOf(p)} · ${p.product} · ${p.qty.abs()} @ ${formatPrice(p.avgPrice)}',
                  style: tabular(muted),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: PnlText(
                          row.pnl,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                    if (row.isOpen) PctText(row.pnlPct, style: muted),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(child: Text('LTP ${formatPrice(row.ltp)}', style: tabular(muted))),
                    if (row.hasLiveTick) Icon(Icons.circle, size: 6, color: colors.profit),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
