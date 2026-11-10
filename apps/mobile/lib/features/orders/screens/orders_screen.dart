import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../core/utils/market_time.dart';
import '../../../router.dart';
import '../../../shared/enums.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../brokers/brokers_api.dart';
import '../orders_api.dart';
import '../orders_models.dart';
import '../orders_providers.dart';

enum _Scope { today, all }

/// The order book: today / all, status filter, search, cancel for open broker orders.
/// Port of the web's Orders page.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  _Scope _scope = _Scope.today;
  OrderStatus? _status;
  String _query = '';
  bool _syncing = false;
  final _cancelling = <String>{};

  bool _isToday(DateTime utc) {
    return isSameMarketDay(utc, DateTime.now());
  }

  List<Order> _filter(List<Order> all) {
    final q = _query.trim().toLowerCase();
    return all.where((o) {
      if (_scope == _Scope.today && !_isToday(o.createdAt)) return false;
      if (_status != null && o.status != _status) return false;
      if (q.isEmpty) return true;
      return o.symbol.toLowerCase().contains(q) ||
          (o.brokerOrderId?.toLowerCase().contains(q) ?? false) ||
          (o.strategyName?.toLowerCase().contains(q) ?? false) ||
          o.exchange.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await ref.read(ordersApiProvider).sync();
      ref
        ..invalidate(ordersProvider)
        ..invalidate(dayPnlProvider);
      messenger.showSnackBar(SnackBar(content: Text(result.message ?? 'Orders synchronised with the broker')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(apiErrorMessage(e, 'Sync failed'))));
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _cancel(Order order) async {
    if (!_cancelling.add(order.id)) return;
    try {
      final brokerOrderId = order.brokerOrderId;
      if (brokerOrderId == null) return;
      final ok = await showDialog<bool>(
        context: context,
        builder:
            (ctx) => AlertDialog(
              title: const Text('Cancel order?'),
              content: Text('${order.side?.wire ?? ''} ${order.qty} ${order.symbol} · #$brokerOrderId'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: ctx.colors.loss),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Cancel order'),
                ),
              ],
            ),
      );
      if (ok != true || !mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      final accountId = order.brokerAccountId;
      if (accountId == null) {
        messenger.showSnackBar(const SnackBar(content: Text('No broker account for this order')));
        return;
      }
      try {
        await ref.read(brokersApiProvider).cancelOrder(accountId, brokerOrderId);
        ref.invalidate(ordersProvider);
        messenger.showSnackBar(SnackBar(content: Text('Cancellation requested for $brokerOrderId')));
      } catch (e) {
        messenger.showSnackBar(SnackBar(content: Text(apiErrorMessage(e, 'Could not cancel the order'))));
      }
    } finally {
      _cancelling.remove(order.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersProvider);
    final dayPnl = ref.watch(dayPnlProvider).value;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Orders'),
        actions: [
          IconButton(tooltip: 'New order', onPressed: () => context.push(Routes.orderNew), icon: const Icon(Icons.add)),
          IconButton(
            tooltip: 'Sync with broker',
            onPressed: _syncing ? null : _sync,
            icon:
                _syncing
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.sync),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SegmentedButton<_Scope>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: _Scope.today, label: Text('Today')),
                    ButtonSegment(value: _Scope.all, label: Text('All')),
                  ],
                  selected: {_scope},
                  onSelectionChanged: (s) => setState(() => _scope = s.first),
                ),
                const SizedBox(height: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Realised today', style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
                    PnlText(
                      dayPnl?.realizedPnl,
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: const InputDecoration(
                isDense: true,
                prefixIcon: Icon(Icons.search, size: 20),
                hintText: 'Symbol, order id or strategy',
              ),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              children: [
                _filterChip(null, 'All'),
                for (final s in [OrderStatus.open, OrderStatus.complete, OrderStatus.cancelled, OrderStatus.rejected])
                  _filterChip(s, _statusLabel(s)),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(ordersProvider.future),
              child: AsyncView(
                value: orders,
                onRetry: () => ref.invalidate(ordersProvider),
                data: (all) {
                  final rows = _filter(all);
                  if (rows.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: _scope == _Scope.today ? 'No orders today' : 'No orders',
                          message:
                              all.isEmpty
                                  ? 'Orders placed by you or a strategy appear here.'
                                  : 'Nothing matches the filter.',
                        ),
                      ],
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: rows.length,
                    itemBuilder: (_, i) => _OrderTile(order: rows[i], onCancel: _cancel),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(OrderStatus? status, String label) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: FilterChip(
      label: Text(label),
      selected: _status == status,
      showCheckmark: false,
      onSelected: (_) => setState(() => _status = status),
    ),
  );
}

String _statusLabel(OrderStatus? s) => switch (s) {
  OrderStatus.pending => 'Pending',
  OrderStatus.open => 'Open',
  OrderStatus.complete => 'Complete',
  OrderStatus.rejected => 'Rejected',
  OrderStatus.cancelled => 'Cancelled',
  null => 'Unknown',
};

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order, required this.onCancel});

  final Order order;
  final Future<void> Function(Order) onCancel;

  static final _time = DateFormat('HH:mm:ss');
  static final _dateTime = DateFormat('dd MMM, HH:mm');

  @override
  Widget build(BuildContext context) {
    final o = order;
    final theme = Theme.of(context);
    final colors = context.colors;
    final muted = TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 12);
    final isBuy = o.side == OrderSide.buy;
    final sideColor = isBuy ? colors.buy : colors.sell;
    final statusColor = switch (o.status) {
      OrderStatus.complete => colors.profit,
      OrderStatus.rejected => colors.loss,
      OrderStatus.cancelled => theme.colorScheme.onSurfaceVariant,
      OrderStatus.open || OrderStatus.pending => colors.warn,
      null => theme.colorScheme.onSurfaceVariant,
    };
    final local = marketTime(o.createdAt);
    final sameDay = isSameMarketDay(o.createdAt, DateTime.now());
    final priceText = switch (o.orderType) {
      OrderType.market => o.avgPrice != null && o.avgPrice! > 0 ? 'avg ${formatPrice(o.avgPrice)}' : 'MARKET',
      OrderType.limit => 'LIMIT ${formatPrice(o.price)}',
      OrderType.sl => 'SL ${formatPrice(o.price)} · trg ${formatPrice(o.triggerPrice)}',
      OrderType.slM => 'SL-M trg ${formatPrice(o.triggerPrice)}',
      null => formatPrice(o.price),
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        StatusChip(o.side?.wire ?? '—', color: sideColor),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            o.symbol,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                        if (o.isPaperTrade) ...[const SizedBox(width: 6), StatusChip('PAPER', color: colors.signal)],
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '${o.filledQty}/${o.qty} · $priceText · ${o.exchange} ${o.productType?.wire ?? ''}',
                      style: tabular(muted),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        sameDay ? _time.format(local) : _dateTime.format(local),
                        if (o.strategyName != null) o.strategyName!,
                        if (o.brokerOrderId != null) '#${o.brokerOrderId}',
                      ].join(' · '),
                      style: muted,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  StatusChip(_statusLabel(o.status).toUpperCase(), color: statusColor),
                  if (o.canCancel)
                    IconButton(
                      tooltip: 'Cancel order',
                      visualDensity: VisualDensity.compact,
                      icon: Icon(Icons.cancel_outlined, color: colors.loss, size: 20),
                      onPressed: () => onCancel(o),
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
