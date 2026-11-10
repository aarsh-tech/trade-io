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
import '../../orders/order_ticket.dart';
import '../holdings_summary.dart';
import '../live_pnl.dart';
import '../portfolio_models.dart';
import '../portfolio_providers.dart';

enum _Tab { holdings, positions }

enum _Filter { all, profit, loss }

/// Web /portfolio: holdings and positions with valuation, funds and quick trade.
class PortfolioScreen extends ConsumerStatefulWidget {
  const PortfolioScreen({super.key});
  @override
  ConsumerState<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends ConsumerState<PortfolioScreen> {
  _Tab _tab = _Tab.holdings;
  _Filter _filter = _Filter.all;
  String _query = '';

  bool _keep(String symbol, double pnl) {
    if (_query.isNotEmpty && !symbol.toLowerCase().contains(_query.toLowerCase())) return false;
    return switch (_filter) {
      _Filter.all => true,
      _Filter.profit => pnl > 0,
      _Filter.loss => pnl < 0,
    };
  }

  void _trade({String? symbol, String exchange = 'NSE', String side = 'BUY', double? ltp, int? qty, String? product}) =>
      context.push(
        Routes.trade,
        extra:
            symbol == null
                ? null
                : TicketPrefill(symbol: symbol, exchange: exchange, side: side, ltp: ltp, qty: qty, product: product),
      );

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final broker = ref.watch(activeBrokerProvider).value;
    final id = broker?.id;
    final holdings = id == null ? const AsyncData(<Holding>[]) : ref.watch(holdingsProvider(id));
    final positions = id == null ? const AsyncData(<LivePosition>[]) : ref.watch(livePositionsProvider(id));
    final margins = id == null ? null : ref.watch(marginsProvider(id)).value;
    final h = HoldingsSummary.of(holdings.value ?? const []);
    final hasAccount = id != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Portfolio')),
      body: RefreshIndicator(
        onRefresh: () async {
          if (id == null) return;
          ref
            ..invalidate(holdingsProvider(id))
            ..invalidate(positionsProvider(id))
            ..invalidate(marginsProvider(id));
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: AppSpace.pageInsets,
          children: [
            PageHeader(
              'Portfolio & holdings',
              subtitle: 'Holdings, intraday positions, valuation and available funds',
              actions: [
                if (hasAccount)
                  ToneButton(
                    label: 'Daily login',
                    icon: Icons.bolt_rounded,
                    tone: Tone.warn,
                    height: 34,
                    onPressed: () => showKiteSheet(context),
                  ),
                ToneButton(
                  label: 'Place order',
                  icon: Icons.shopping_cart_outlined,
                  filled: true,
                  height: 34,
                  onPressed: () => _trade(),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            const BrokerBanner(),
            if (hasAccount) ...[const BrokerPicker(), const SizedBox(height: AppSpace.gap)],
            StatStrip(
              items: [
                (label: 'Portfolio value', value: hasAccount ? formatInr(h.current) : empty, color: null),
                (label: 'Invested', value: hasAccount ? formatInr(h.invested) : empty, color: null),
                (
                  label: 'Holdings P&L · ${h.up} up / ${h.down} down',
                  value: hasAccount ? '${formatInr(h.pnl, signed: true)} (${formatPct(h.pnlPct)})' : empty,
                  color: hasAccount ? c.pnl(h.pnl) : null,
                ),
                (label: 'Available cash', value: formatInr(margins?.equityAvailable), color: null),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SegmentTabs<_Tab>(
                          options: [
                            (value: _Tab.holdings, label: 'Holdings (${holdings.value?.length ?? 0})', tone: null),
                            (value: _Tab.positions, label: 'Positions (${positions.value?.length ?? 0})', tone: null),
                          ],
                          value: _tab,
                          onChanged: (t) => setState(() => _tab = t),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(child: SearchField(onChanged: (v) => setState(() => _query = v.trim()))),
                            const SizedBox(width: 8),
                            SegmentTabs<_Filter>(
                              expand: false,
                              options: const [
                                (value: _Filter.all, label: 'All', tone: null),
                                (value: _Filter.profit, label: 'Profit', tone: Tone.profit),
                                (value: _Filter.loss, label: 'Loss', tone: Tone.loss),
                              ],
                              value: _filter,
                              onChanged: (f) => setState(() => _filter = f),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Divider(color: c.border),
                  if (!hasAccount)
                    EmptyPanel(
                      icon: Icons.work_outline_rounded,
                      title: 'Select a broker account',
                      message: 'Connect your trading account to see holdings, valuation and open positions.',
                      actions: [
                        ToneButton(
                          label: 'Manage brokers',
                          icon: Icons.power_outlined,
                          filled: true,
                          onPressed: () => context.go(Routes.brokers),
                        ),
                      ],
                    )
                  else if (_tab == _Tab.holdings)
                    AsyncView(
                      value: holdings,
                      loading: const Loading(label: 'Fetching holdings from broker…'),
                      onRetry: () => ref.invalidate(holdingsProvider(id)),
                      data: (list) {
                        final rows = list.map(HoldingValue.new).where((v) => _keep(v.holding.symbol, v.pnl)).toList();
                        if (rows.isEmpty) {
                          return EmptyPanel(
                            icon: Icons.layers_outlined,
                            title: 'No holdings found',
                            message:
                                _query.isNotEmpty || _filter != _Filter.all
                                    ? 'No holdings match the current filter or search.'
                                    : 'No delivery holdings in this account, or a daily login is required.',
                            actions: [
                              ToneButton(
                                label: 'Daily login',
                                icon: Icons.bolt_rounded,
                                tone: Tone.warn,
                                onPressed: () => showKiteSheet(context),
                              ),
                            ],
                          );
                        }
                        return Column(
                          children: [
                            for (final (i, v) in rows.indexed) ...[
                              if (i > 0) Divider(color: c.border),
                              _HoldingRow(
                                value: v,
                                onBuy:
                                    () => _trade(
                                      symbol: v.holding.symbol,
                                      exchange: v.holding.exchange ?? 'NSE',
                                      ltp: v.holding.ltp,
                                      product: 'CNC',
                                    ),
                                onSell:
                                    () => _trade(
                                      symbol: v.holding.symbol,
                                      exchange: v.holding.exchange ?? 'NSE',
                                      side: 'SELL',
                                      ltp: v.holding.ltp,
                                      qty: v.holding.qty,
                                      product: 'CNC',
                                    ),
                              ),
                            ],
                          ],
                        );
                      },
                    )
                  else
                    AsyncView(
                      value: positions,
                      loading: const Loading(label: 'Fetching positions from broker…'),
                      onRetry: () => ref.invalidate(positionsProvider(id)),
                      data: (list) {
                        final rows = list.where((r) => _keep(r.symbol, r.pnl)).toList();
                        if (rows.isEmpty) {
                          return EmptyPanel(
                            icon: Icons.show_chart_rounded,
                            title: 'No open positions',
                            message:
                                _query.isNotEmpty || _filter != _Filter.all
                                    ? 'No positions match the current filter or search.'
                                    : 'No open intraday or derivative positions in this account.',
                            actions: [
                              ToneButton(
                                label: 'OHL screener',
                                icon: Icons.manage_search_rounded,
                                filled: true,
                                onPressed: () => context.go(Routes.screener),
                              ),
                            ],
                          );
                        }
                        return Column(
                          children: [
                            for (final (i, r) in rows.indexed) ...[
                              if (i > 0) Divider(color: c.border),
                              _PositionRow(
                                row: r,
                                onAdd:
                                    () => _trade(
                                      symbol: r.symbol,
                                      exchange: exchangeOf(r.position),
                                      side: r.qty < 0 ? 'SELL' : 'BUY',
                                      ltp: r.ltp,
                                      product: r.position.product,
                                    ),
                                onExit:
                                    () => _trade(
                                      symbol: r.symbol,
                                      exchange: exchangeOf(r.position),
                                      side: r.qty > 0 ? 'SELL' : 'BUY',
                                      ltp: r.ltp,
                                      qty: r.qty.abs(),
                                      product: r.position.product,
                                    ),
                              ),
                            ],
                          ],
                        );
                      },
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HoldingRow extends StatelessWidget {
  const _HoldingRow({required this.value, required this.onBuy, required this.onSell});
  final HoldingValue value;
  final VoidCallback onBuy, onSell;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final h = value.holding;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: h.symbol, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                      TextSpan(
                        text: '  ${h.exchange ?? 'NSE'}',
                        style: TextStyle(fontSize: 10, color: c.mutedForeground),
                      ),
                    ],
                  ),
                ),
              ),
              Text(
                formatPrice(value.pnl, signed: true),
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.pnl(value.pnl)),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${h.qty} × ${formatPrice(h.avgPrice)} · Inv ${formatInr(value.invested, decimals: 0)}',
                  style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                ),
              ),
              Text(formatPct(value.pnlPct), style: TextStyle(fontSize: 11.5, color: c.pnl(value.pnl))),
            ],
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                    children: [
                      const TextSpan(text: 'LTP '),
                      TextSpan(
                        text: formatPrice(h.ltp),
                        style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground),
                      ),
                      TextSpan(text: '  ·  Cur ${formatInr(value.current, decimals: 0)}'),
                    ],
                  ),
                ),
              ),
              ToneButton(label: 'BUY', tone: Tone.brand, height: 28, onPressed: onBuy),
              const SizedBox(width: 6),
              ToneButton(label: 'SELL', tone: Tone.loss, height: 28, onPressed: onSell),
            ],
          ),
        ],
      ),
    );
  }
}

class _PositionRow extends StatelessWidget {
  const _PositionRow({required this.row, required this.onAdd, required this.onExit});
  final LivePosition row;
  final VoidCallback onAdd, onExit;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = row.position;
    final long = p.qty > 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Column(
        children: [
          Row(
            children: [
              Pill(long ? 'BUY' : (p.qty < 0 ? 'SELL' : 'FLAT'), tone: long ? Tone.brand : Tone.warn),
              const SizedBox(width: 4),
              Pill(p.product),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  p.symbol,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                formatPrice(row.pnl, signed: true),
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.pnl(row.pnl)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Qty ${p.qty > 0 ? '+' : ''}${p.qty} · Avg ${formatPrice(p.avgPrice)} · LTP ${formatPrice(row.ltp)}',
                  style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                ),
              ),
              if (row.isOpen) ...[
                ToneButton(label: 'Add', height: 28, onPressed: onAdd),
                const SizedBox(width: 6),
                ToneButton(label: 'Exit', tone: Tone.loss, height: 28, onPressed: onExit),
              ] else
                Text('Closed', style: TextStyle(fontSize: 11.5, color: c.mutedForeground)),
            ],
          ),
        ],
      ),
    );
  }
}
