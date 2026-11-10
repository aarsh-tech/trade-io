import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_envelope.dart';
import '../../../core/socket/market_socket.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../brokers/brokers_api.dart';
import '../../brokers/brokers_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../order_ticket.dart';
import '../orders_providers.dart';
import '../ticket_models.dart';
import '../ticket_providers.dart';

class OrderTicketScreen extends ConsumerStatefulWidget {
  const OrderTicketScreen({super.key});
  @override
  ConsumerState<OrderTicketScreen> createState() => _OrderTicketScreenState();
}

class _OrderTicketScreenState extends ConsumerState<OrderTicketScreen> {
  final _qty = TextEditingController(text: '1'), _price = TextEditingController(), _trigger = TextEditingController();
  String _search = '', _side = 'BUY', _type = 'LIMIT', _product = 'MIS';
  final _attempt = OrderAttempt();
  Instrument? _instrument;
  String? _account;
  bool _busy = false;
  List<String> _errors = [];
  @override
  void dispose() {
    _qty.dispose();
    _price.dispose();
    _trigger.dispose();
    super.dispose();
  }

  Future<void> _submit(TicketQuery query, double ltp) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _errors = [];
    });
    try {
      final meta = await ref.refresh(ticketMetadataProvider(query).future);
      final ticket = TicketInput(
        side: _side,
        orderType: _type,
        qty: double.tryParse(_qty.text) ?? 0,
        price: double.tryParse(_price.text) ?? 0,
        triggerPrice: double.tryParse(_trigger.text) ?? 0,
        ltp: ltp,
        tickSize: meta.tick,
        lotSize: meta.lot,
        killSwitchActive: meta.limits.killSwitchActive,
        maxOrderQty: meta.limits.maxOrderQty,
        maxOrderValue: meta.limits.maxOrderValue,
        freezeLimit: meta.limits.freezeLimit,
      );
      final issues = validateTicket(ticket);
      if (issues.any((i) => !i.warning)) {
        if (mounted) setState(() => _errors = issues.map((i) => i.message).toList());
        return;
      }
      if (!mounted) return;
      final ok = await showDialog<bool>(
        context: context,
        builder:
            (ctx) => AlertDialog(
              title: const Text('Place LIVE order?'),
              content: Text(
                '$_side ${_qty.text} ${query.exchange}:${query.symbol}\n$_type · $_product${ticket.hasPrice ? ' · ${formatPrice(ticket.price)}' : ''}\n${issues.map((i) => i.message).join('\n')}',
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Place order')),
              ],
            ),
      );
      if (ok != true || !mounted) return;
      final body = <String, dynamic>{
        'symbol': query.symbol,
        'exchange': query.exchange,
        'side': _side,
        'product': _product,
        'orderType': _type,
        'qty': ticket.qty.toInt(),
        'price': ticket.hasPrice ? ticket.price : 0,
        if (ticket.hasTrigger) 'triggerPrice': ticket.triggerPrice,
      };
      final key = _attempt.keyFor('${query.accountId}:$body');
      try {
        await ref.read(brokersApiProvider).placeOrder(query.accountId, body, idempotencyKey: key);
        _attempt.settle(answered: true);
      } catch (e) {
        _attempt.settle(answered: serverAnswered(e));
        rethrow;
      }
      ref
        ..invalidate(ordersProvider)
        ..invalidate(positionsProvider(query.accountId))
        ..invalidate(marginsProvider(query.accountId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Order placed')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(
          () =>
              _errors = [
                apiErrorMessage(
                  e,
                  'Could not place order. Check Orders before retrying; a retry of this unchanged ticket uses the same request key.',
                ),
              ],
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accounts = ref.watch(brokersProvider).value ?? [];
    final account = _account ?? ref.watch(activeBrokerProvider).value?.id;
    final instrument = _instrument;
    final query =
        account == null || instrument == null
            ? null
            : (accountId: account, symbol: instrument.symbol, exchange: instrument.exchange);
    double ltp = instrument?.ltp ?? 0;
    if (instrument != null) {
      ref.watch(ticketSubscriptionProvider('${instrument.exchange}:${instrument.symbol}'));
      ltp =
          ref.watch(marketSocketProvider.select((s) => s.find('${instrument.exchange}:${instrument.symbol}')?.ltp)) ??
          ltp;
    }
    final currentLtp = ltp;
    return Scaffold(
      appBar: AppBar(title: const Text('New order')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('LIVE broker order'),
          DropdownButtonFormField<String>(
            isExpanded: true,
            value: account,
            decoration: const InputDecoration(labelText: 'Account'),
            items: [
              for (final a in accounts) DropdownMenuItem(value: a.id, child: Text('${a.label} · ${a.clientId ?? ''}')),
            ],
            onChanged:
                _busy
                    ? null
                    : (v) => setState(() {
                      _account = v;
                      _instrument = null;
                    }),
          ),
          const SizedBox(height: 12),
          TextField(
            enabled: !_busy && account != null,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              labelText: 'Find instrument',
              hintText: 'Enter symbol and press search',
              prefixIcon: Icon(Icons.search),
            ),
            onSubmitted: (v) => setState(() => _search = v.trim()),
          ),
          if (_search.isNotEmpty && account != null && instrument == null)
            AsyncView(
              value: ref.watch(instrumentSearchProvider((query: _search, accountId: account))),
              onRetry: () => ref.invalidate(instrumentSearchProvider),
              data:
                  (rows) => Column(
                    children: [
                      if (rows.isEmpty) const Text('No results. Check your broker session and symbol.'),
                      for (final row in rows.take(20))
                        ListTile(
                          title: Text('${row.exchange}:${row.symbol}'),
                          subtitle: Text(row.name ?? ''),
                          onTap:
                              _busy
                                  ? null
                                  : () => setState(() {
                                    _instrument = row;
                                    _qty.text = '${row.lotSize}';
                                  }),
                        ),
                    ],
                  ),
            ),
          if (instrument != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${instrument.exchange}:${instrument.symbol}'),
              subtitle: Text('LTP ${formatPrice(ltp)}'),
              trailing: TextButton(
                onPressed: _busy ? null : () => setState(() => _instrument = null),
                child: const Text('Change'),
              ),
            ),
          for (final entry in [
            (_side, ['BUY', 'SELL'], 'Side'),
            (_type, ['MARKET', 'LIMIT', 'SL', 'SL-M'], 'Order type'),
            (_product, ['MIS', 'CNC', 'NRML'], 'Product'),
          ])
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: DropdownButtonFormField<String>(
                isExpanded: true,
                value: entry.$1,
                decoration: InputDecoration(labelText: entry.$3),
                items: [for (final v in entry.$2) DropdownMenuItem(value: v, child: Text(v))],
                onChanged:
                    _busy
                        ? null
                        : (v) => setState(() {
                          switch (entry.$3) {
                            case 'Side':
                              _side = v!;
                            case 'Order type':
                              _type = v!;
                            default:
                              _product = v!;
                          }
                        }),
              ),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _qty,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Quantity (units)'),
          ),
          if (_type == 'LIMIT' || _type == 'SL')
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: TextField(
                controller: _price,
                enabled: !_busy,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Limit price'),
              ),
            ),
          if (_type == 'SL' || _type == 'SL-M')
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: TextField(
                controller: _trigger,
                enabled: !_busy,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Trigger price'),
              ),
            ),
          if (query != null)
            AsyncView(
              value: ref.watch(ticketMetadataProvider(query)),
              onRetry: () => ref.invalidate(ticketMetadataProvider(query)),
              data:
                  (meta) => Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          'Tick ${meta.tick} · Lot ${meta.lot}${meta.limits.killSwitchActive ? '\nKill switch active — new orders blocked' : ''}',
                        ),
                      ),
                      FilledButton(
                        onPressed: _busy || meta.limits.killSwitchActive ? null : () => _submit(query, currentLtp),
                        child: Text(_busy ? 'Submitting…' : 'Review order'),
                      ),
                    ],
                  ),
            ),
          if (_errors.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_errors.join('\n'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
        ],
      ),
    );
  }
}
