import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_api.dart';
import '../../brokers/brokers_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../order_ticket.dart';
import '../orders_providers.dart';
import '../ticket_models.dart';
import '../ticket_providers.dart';

/// Kite-style order window (web OrderWindow, Regular tab): a header in the side's colour with
/// the BUY/SELL switch and live LTP, then product, quantity, price, type and the account.
class OrderTicketScreen extends ConsumerStatefulWidget {
  const OrderTicketScreen({super.key, this.prefill});

  final TicketPrefill? prefill;

  @override
  ConsumerState<OrderTicketScreen> createState() => _OrderTicketScreenState();
}

class _OrderTicketScreenState extends ConsumerState<OrderTicketScreen> {
  late final _qty = TextEditingController(text: '${widget.prefill?.qty ?? 1}');
  late final _price = TextEditingController(text: _initialPrice());
  late final _trigger = TextEditingController(
    text: widget.prefill?.trigger == null ? '' : widget.prefill!.trigger!.toStringAsFixed(2),
  );
  late String _side = widget.prefill?.side ?? 'BUY';
  late String _type = widget.prefill?.orderType ?? 'LIMIT';
  late String _product = widget.prefill?.product ?? 'MIS';
  late Instrument? _instrument =
      widget.prefill == null
          ? null
          : Instrument(symbol: widget.prefill!.symbol, exchange: widget.prefill!.exchange, ltp: widget.prefill!.ltp);
  final _attempt = OrderAttempt();
  String _search = '';
  String? _account;
  bool _busy = false;
  List<String> _errors = [];

  String _initialPrice() {
    final p = widget.prefill;
    final price = p?.price ?? p?.ltp;
    return price == null || price <= 0 ? '' : price.toStringAsFixed(2);
  }

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
      final warnings = issues.map((i) => i.message).join('\n');
      final ok = await confirmAction(
        context,
        title: 'Place LIVE order?',
        message:
            '$_side ${_qty.text} ${query.exchange}:${query.symbol}\n$_type · $_product'
            '${ticket.hasPrice ? ' · ${formatPrice(ticket.price)}' : ''}'
            '${ticket.hasTrigger ? ' · trigger ${formatPrice(ticket.triggerPrice)}' : ''}'
            '${warnings.isEmpty ? '' : '\n\n$warnings'}',
        confirmLabel: 'Place $_side order',
        destructive: _side == 'SELL',
      );
      if (!ok || !mounted) return;
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
        toast(context, 'Order placed: $_side ${_qty.text} ${query.symbol}');
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
    final c = context.colors;
    final accounts = ref.watch(brokersProvider).value ?? [];
    final account = _account ?? ref.watch(activeBrokerProvider).value?.id;
    final instrument = _instrument;
    final query =
        account == null || instrument == null
            ? null
            : (accountId: account, symbol: instrument.symbol, exchange: instrument.exchange);
    var ltp = instrument?.ltp ?? 0;
    if (instrument != null) {
      final key = '${instrument.exchange}:${instrument.symbol}';
      ref.watch(ticketSubscriptionProvider(key));
      ltp = ref.watch(marketSocketProvider.select((s) => s.find(key)?.ltp)) ?? ltp;
    }
    final isBuy = _side == 'BUY';
    final sideColor = isBuy ? c.buy : c.sell;
    final onSide = isBuy ? c.onPrimary : c.onLoss;
    final margins = account == null ? null : ref.watch(marginsProvider(account)).value;
    final qty = double.tryParse(_qty.text) ?? 0;
    final price = _type == 'MARKET' || _type == 'SL-M' ? ltp : (double.tryParse(_price.text) ?? ltp);
    final value = qty * price;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: sideColor,
        foregroundColor: onSide,
        iconTheme: IconThemeData(color: onSide),
        shape: const Border(),
        titleSpacing: 0,
        title:
            instrument == null
                ? Text('${isBuy ? 'Buy' : 'Sell'} · new order', style: TextStyle(color: onSide))
                : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${isBuy ? 'Buy' : 'Sell'} ${instrument.symbol}', style: TextStyle(color: onSide)),
                    Text(
                      '${instrument.exchange} · LTP ${ltp > 0 ? formatPrice(ltp) : empty}',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        color: onSide.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ),
        actions: [
          Text(isBuy ? 'BUY' : 'SELL', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: onSide)),
          Switch(
            value: !isBuy,
            onChanged: _busy ? null : (v) => setState(() => _side = v ? 'SELL' : 'BUY'),
            thumbColor: WidgetStatePropertyAll(onSide),
            trackColor: WidgetStatePropertyAll(onSide.withValues(alpha: 0.3)),
            trackOutlineColor: WidgetStatePropertyAll(onSide.withValues(alpha: 0.5)),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: ListView(
        padding: AppSpace.pageInsets,
        children: [
          if (widget.prefill?.note != null) ...[
            Notice(widget.prefill!.note!, title: 'Trade setup', tone: Tone.brand, icon: Icons.track_changes_rounded),
            const SizedBox(height: AppSpace.gap),
          ],
          if (instrument == null) ...[
            TextField(
              enabled: !_busy && account != null,
              autofocus: true,
              textInputAction: TextInputAction.search,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Find instrument',
                hintText: 'Symbol, then search',
                prefixIcon: Icon(Icons.search_rounded, size: 18),
              ),
              onSubmitted: (v) => setState(() => _search = v.trim()),
            ),
            if (_search.isNotEmpty && account != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: AsyncView(
                  value: ref.watch(instrumentSearchProvider((query: _search, accountId: account))),
                  loading: const LinearProgressIndicator(),
                  onRetry: () => ref.invalidate(instrumentSearchProvider),
                  data:
                      (rows) =>
                          rows.isEmpty
                              ? Text(
                                'No results. Check your broker session and symbol.',
                                style: Theme.of(context).textTheme.bodySmall,
                              )
                              : Card(
                                child: Column(
                                  children: [
                                    for (final (i, row) in rows.take(20).indexed) ...[
                                      if (i > 0) Divider(color: c.border),
                                      ListTile(
                                        title: Text(row.symbol),
                                        subtitle: Text([row.exchange, if (row.name != null) row.name!].join(' · ')),
                                        trailing: row.lotSize > 1 ? Pill('Lot ${row.lotSize}') : null,
                                        onTap:
                                            _busy
                                                ? null
                                                : () => setState(() {
                                                  _instrument = row;
                                                  _qty.text = '${row.lotSize}';
                                                  if ((row.ltp ?? 0) > 0) _price.text = row.ltp!.toStringAsFixed(2);
                                                }),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                ),
              ),
            const SizedBox(height: AppSpace.gap),
          ] else
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _busy ? null : () => setState(() => _instrument = null),
                icon: const Icon(Icons.swap_horiz_rounded, size: 16),
                label: const Text('Change instrument'),
              ),
            ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SegmentTabs<String>(
                    options: const [
                      (value: 'MIS', label: 'Intraday MIS', tone: null),
                      (value: 'CNC', label: 'Delivery CNC', tone: null),
                      (value: 'NRML', label: 'NRML', tone: null),
                    ],
                    value: _product,
                    onChanged: (v) => _busy ? null : setState(() => _product = v),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _qty,
                          enabled: !_busy,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          onChanged: (_) => setState(() {}),
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                          decoration: InputDecoration(
                            labelText: 'Qty',
                            helperText: (instrument?.lotSize ?? 1) > 1 ? 'Lot ${instrument!.lotSize}' : null,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: _price,
                          enabled: !_busy && (_type == 'LIMIT' || _type == 'SL'),
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          onChanged: (_) => setState(() {}),
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                          decoration: InputDecoration(
                            labelText: 'Price',
                            prefixText: '₹ ',
                            helperText: _type == 'MARKET' || _type == 'SL-M' ? 'At market' : null,
                          ),
                        ),
                      ),
                      if (_type == 'SL' || _type == 'SL-M') ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _trigger,
                            enabled: !_busy,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                            decoration: const InputDecoration(labelText: 'Trigger', prefixText: '₹ '),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  SegmentTabs<String>(
                    options: const [
                      (value: 'MARKET', label: 'Market', tone: null),
                      (value: 'LIMIT', label: 'Limit', tone: null),
                      (value: 'SL', label: 'SL', tone: null),
                      (value: 'SL-M', label: 'SL-M', tone: null),
                    ],
                    value: _type,
                    onChanged: (v) => _busy ? null : setState(() => _type = v),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpace.gap),
          DropdownButtonFormField<String>(
            isExpanded: true,
            value: accounts.any((a) => a.id == account) ? account : null,
            decoration: const InputDecoration(labelText: 'Broker account'),
            items: [
              for (final a in accounts) DropdownMenuItem(value: a.id, child: Text('${a.label} · ${a.clientId ?? ''}')),
            ],
            onChanged:
                _busy
                    ? null
                    : (v) => setState(() {
                      _account = v;
                      if (widget.prefill == null) _instrument = null;
                    }),
          ),
          const SizedBox(height: AppSpace.gap),
          Panel(
            child: Column(
              children: [
                KV('Approx. order value', value > 0 ? formatInr(value) : empty, bold: true),
                KV('Available funds', formatInr(margins?.equityAvailable)),
                if (query != null)
                  ref
                      .watch(ticketMetadataProvider(query))
                      .when(
                        skipLoadingOnReload: true,
                        loading: () => const KV('Tick / lot', '…'),
                        error: (_, __) => const KV('Tick / lot', 'unavailable'),
                        data:
                            (meta) => Column(
                              children: [
                                KV('Tick / lot', '${meta.tick} / ${meta.lot}'),
                                if (meta.limits.killSwitchActive)
                                  KV('Kill switch', 'ACTIVE: new orders blocked', color: c.loss, bold: true),
                              ],
                            ),
                      ),
              ],
            ),
          ),
          if (_errors.isNotEmpty) ...[
            const SizedBox(height: AppSpace.gap),
            Notice(_errors.join('\n'), tone: Tone.loss, icon: Icons.error_outline_rounded),
          ],
          const SizedBox(height: AppSpace.gap),
          Notice('Live order. It goes straight to your broker account.', tone: Tone.warn, icon: Icons.bolt_rounded),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: c.card, border: Border(top: BorderSide(color: c.border))),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpace.page, 8, AppSpace.page, 8),
            child: Row(
              children: [
                OutlinedButton(
                  onPressed: _busy ? null : () => Navigator.maybePop(context),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: sideColor,
                      foregroundColor: onSide,
                      minimumSize: const Size.fromHeight(44),
                    ),
                    onPressed:
                        _busy ||
                                query == null ||
                                (ref.watch(ticketMetadataProvider(query)).value?.limits.killSwitchActive ?? false)
                            ? null
                            : () => _submit(query, ltp),
                    child: Text(
                      _busy
                          ? 'Submitting…'
                          : query == null
                          ? (account == null ? 'Link a broker to trade' : 'Pick an instrument')
                          : 'Review ${isBuy ? 'BUY' : 'SELL'} order',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
