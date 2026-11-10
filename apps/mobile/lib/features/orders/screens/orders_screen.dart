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
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_api.dart';
import '../../home/app_chrome.dart';
import '../../positions/instrument_name.dart';
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
    try {
      final result = await ref.read(ordersApiProvider).sync();
      ref
        ..invalidate(ordersProvider)
        ..invalidate(dayPnlProvider);
      if (mounted) toast(context, result.message ?? 'Orders synchronised with the broker');
    } catch (e) {
      if (mounted) toast(context, apiErrorMessage(e, 'Sync failed'), error: true);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _cancel(Order order) async {
    if (!_cancelling.add(order.id)) return;
    try {
      final brokerOrderId = order.brokerOrderId;
      if (brokerOrderId == null) return;
      final ok = await confirmAction(
        context,
        title: 'Cancel order?',
        message: '${order.side?.wire ?? ''} ${order.qty} ${order.symbol} · #$brokerOrderId',
        confirmLabel: 'Cancel order',
        destructive: true,
      );
      if (!ok || !mounted) return;
      final accountId = order.brokerAccountId;
      if (accountId == null) return toast(context, 'No broker account for this order', error: true);
      await runWithToast(
        context,
        () async {
          await ref.read(brokersApiProvider).cancelOrder(accountId, brokerOrderId);
          ref.invalidate(ordersProvider);
        },
        success: 'Cancellation requested for $brokerOrderId',
        failure: 'Could not cancel the order',
      );
    } finally {
      _cancelling.remove(order.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final orders = ref.watch(ordersProvider);
    final dayPnl = ref.watch(dayPnlProvider).value;
    final all = orders.value ?? const <Order>[];
    final scoped = _scope == _Scope.today ? all.where((o) => _isToday(o.createdAt)).toList() : all;
    int count(bool Function(Order) test) => scoped.where(test).length;
    final open = count((o) => o.status == OrderStatus.open || o.status == OrderStatus.pending);
    final done = count((o) => o.status == OrderStatus.complete);
    final rejected = count((o) => o.status == OrderStatus.rejected);
    final cancelled = count((o) => o.status == OrderStatus.cancelled);

    return TabScaffold(
      title: 'Orders',
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(Routes.trade),
        icon: const Icon(Icons.add_rounded, size: 20),
        label: const Text('Place order'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(ordersProvider.future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AppSpace.page, AppSpace.page, AppSpace.page, 88),
          children: [
            Row(
              children: [
                Expanded(
                  child: SegmentTabs<_Scope>(
                    options: const [
                      (value: _Scope.today, label: 'Today', tone: null),
                      (value: _Scope.all, label: 'All orders', tone: null),
                    ],
                    value: _scope,
                    onChanged: (v) => setState(() => _scope = v),
                  ),
                ),
                const SizedBox(width: 8),
                ToneButton(label: 'Sync', icon: Icons.sync_rounded, height: 38, busy: _syncing, onPressed: _sync),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            StatStrip(
              items: [
                (
                  label: 'Realised today (net)',
                  value: formatInr(dayPnl?.realizedPnl, signed: true),
                  color: dayPnl == null ? null : c.pnl(dayPnl.realizedPnl),
                ),
                (label: 'Charges today', value: formatInr(dayPnl?.charges), color: null),
                (label: 'Open / executed', value: '$open / $done', color: null),
                (label: 'Rejected / cancelled', value: '$rejected / $cancelled', color: rejected > 0 ? c.loss : null),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (s, label, n) in [
                    (null, 'All', scoped.length),
                    (OrderStatus.open, 'Open', open),
                    (OrderStatus.complete, 'Executed', done),
                    (OrderStatus.cancelled, 'Cancelled', cancelled),
                    (OrderStatus.rejected, 'Rejected', rejected),
                  ]) ...[
                    ChoiceChip(
                      label: Text('$label ($n)'),
                      selected: _status == s,
                      onSelected: (_) => setState(() => _status = s),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),
            SearchField(hint: 'Symbol, order id or strategy…', onChanged: (v) => setState(() => _query = v)),
            const SizedBox(height: AppSpace.gap),
            AsyncView(
              value: orders,
              loading: const Loading(label: 'Loading orders…'),
              onRetry: () => ref.invalidate(ordersProvider),
              data: (all) {
                final rows = _filter(all);
                if (rows.isEmpty) {
                  return Card(
                    child: EmptyPanel(
                      icon: Icons.receipt_long_outlined,
                      title: _scope == _Scope.today ? 'No orders today' : 'No orders found',
                      message:
                          all.isEmpty
                              ? 'Orders placed by you or a strategy appear here.'
                              : 'Nothing matches the filter.',
                    ),
                  );
                }
                return Card(
                  child: Column(
                    children: [
                      for (final (i, o) in rows.indexed) ...[
                        if (i > 0) Divider(color: c.border),
                        _OrderTile(order: o, onCancel: _cancel),
                      ],
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
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
    final c = context.colors;
    final isBuy = o.side == OrderSide.buy;
    final statusTone = switch (o.status) {
      OrderStatus.complete => Tone.profit,
      OrderStatus.rejected => Tone.loss,
      OrderStatus.open || OrderStatus.pending => Tone.warn,
      _ => Tone.neutral,
    };
    final local = marketTime(o.createdAt);
    final sameDay = isSameMarketDay(o.createdAt, DateTime.now());
    final avg = o.avgPrice != null && o.avgPrice! > 0 ? ' · avg ${formatPrice(o.avgPrice)}' : '';
    final priceText = switch (o.orderType) {
      OrderType.market => avg.isEmpty ? 'MARKET' : 'MKT$avg',
      OrderType.limit => 'LMT ${formatPrice(o.price)}$avg',
      OrderType.sl => 'SL ${formatPrice(o.price)} · trg ${formatPrice(o.triggerPrice)}',
      OrderType.slM => 'SL-M trg ${formatPrice(o.triggerPrice)}',
      null => formatPrice(o.price),
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 9, 8, 9),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Pill(o.side?.wire ?? '—', tone: isBuy ? Tone.brand : Tone.loss),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        kiteInstrumentName(o.symbol),
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(o.exchange, style: TextStyle(fontSize: 10, color: c.mutedForeground)),
                    if (o.isPaperTrade) ...[const SizedBox(width: 4), const Pill('PAPER', tone: Tone.signal)],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${o.filledQty}/${o.qty} · $priceText · ${o.productType?.wire ?? ''}',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: c.mutedForeground,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  [
                    sameDay ? _time.format(local) : _dateTime.format(local),
                    if (o.strategyName != null) o.strategyName!,
                    if (o.brokerOrderId != null) '#${o.brokerOrderId}',
                  ].join(' · '),
                  style: TextStyle(fontSize: 11, color: c.subtle),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Pill(_statusLabel(o.status).toUpperCase(), tone: statusTone),
              if (o.canCancel) ...[
                const SizedBox(height: 6),
                ToneButton(label: 'Cancel', tone: Tone.loss, height: 26, onPressed: () => onCancel(o)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
