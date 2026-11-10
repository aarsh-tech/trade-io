import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../orders/order_ticket.dart';
import '../scanner_models.dart';
import '../scanner_providers.dart';

/// Web /live-screener: Open = Low (buy) and Open = High (sell) stocks, live, with suggested
/// stop-loss and targets and one tap into the order ticket.
class ScreenerScreen extends ConsumerStatefulWidget {
  const ScreenerScreen({super.key});
  @override
  ConsumerState<ScreenerScreen> createState() => _ScreenerScreenState();
}

class _ScreenerScreenState extends ConsumerState<ScreenerScreen> {
  String _universe = 'fno', _signal = 'ALL', _search = '';
  double _tolerance = 0.05;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final query = (universe: _universe, tolerance: _tolerance);
    final data = ref.watch(liveScreenerProvider(query));
    final all = data.value?.stocks ?? const <ScreenerStock>[];
    int count(String s) => all.where((x) => x.signal == s).length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('OHL Screener'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(screenerProvider(query)),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(screenerProvider(query).future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: AppSpace.pageInsets,
          children: [
            const PageHeader(
              'Live OHL screener',
              subtitle: 'Open = Low (bullish) and Open = High (bearish) stocks, live',
            ),
            const SizedBox(height: AppSpace.gap),
            StatStrip(
              items: [
                (label: 'Open = Low (buy)', value: '${count('OPEN_LOW')}', color: c.profit),
                (label: 'Open = High (sell)', value: '${count('OPEN_HIGH')}', color: c.loss),
                (label: 'Near O=L', value: '${count('NEAR_OPEN_LOW')}', color: null),
                (label: 'Near O=H', value: '${count('NEAR_OPEN_HIGH')}', color: null),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            SegmentTabs<String>(
              options: const [
                (value: 'fno', label: 'F&O stocks', tone: null),
                (value: 'nifty50', label: 'NIFTY 50', tone: null),
              ],
              value: _universe,
              onChanged: (v) => setState(() => _universe = v),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('Tolerance', style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(width: 8),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final t in const [0.0, 0.05, 0.1, 0.25]) ...[
                          ChoiceChip(
                            label: Text(t == 0 ? 'Exact' : '$t%'),
                            selected: _tolerance == t,
                            onSelected: (_) => setState(() => _tolerance = t),
                          ),
                          const SizedBox(width: 6),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (s, label) in const [
                    ('ALL', 'All'),
                    ('OPEN_LOW', 'Open = Low'),
                    ('OPEN_HIGH', 'Open = High'),
                    ('NEAR_OPEN_LOW', 'Near O=L'),
                    ('NEAR_OPEN_HIGH', 'Near O=H'),
                  ]) ...[
                    ChoiceChip(
                      label: Text(label),
                      selected: _signal == s,
                      onSelected: (_) => setState(() => _signal = s),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),
            SearchField(onChanged: (v) => setState(() => _search = v.toUpperCase())),
            const SizedBox(height: AppSpace.gap),
            AsyncView(
              value: data,
              loading: const Loading(label: 'Scanning opening ranges…'),
              onRetry: () => ref.invalidate(screenerProvider(query)),
              data: (d) {
                final rows =
                    d.stocks
                        .where(
                          (s) => s.symbol.toUpperCase().contains(_search) && (_signal == 'ALL' || s.signal == _signal),
                        )
                        .toList();
                if (rows.isEmpty) {
                  return const Card(
                    child: EmptyPanel(
                      icon: Icons.manage_search_rounded,
                      title: 'No matching stocks',
                      message: 'Try a wider tolerance or another universe. Signals appear after the open.',
                    ),
                  );
                }
                return Card(
                  child: Column(
                    children: [
                      for (final (i, s) in rows.indexed) ...[
                        if (i > 0) Divider(color: c.border),
                        _ScreenerRow(stock: s),
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

class _ScreenerRow extends StatelessWidget {
  const _ScreenerRow({required this.stock});
  final ScreenerStock stock;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = stock;
    final bullish = s.signal.endsWith('OPEN_LOW');
    final bearish = s.signal.endsWith('OPEN_HIGH');
    final tone = bullish ? Tone.profit : (bearish ? Tone.loss : Tone.neutral);
    void trade(String side) => context.push(
      Routes.trade,
      extra: TicketPrefill(
        symbol: s.symbol,
        exchange: s.exchange,
        side: side,
        ltp: s.ltp,
        qty: s.lotSize > 1 ? s.lotSize : null,
        note:
            s.suggestedSL > 0
                ? 'Suggested stop ${formatPrice(s.suggestedSL)} · targets ${formatPrice(s.suggestedTarget)} / ${formatPrice(s.suggestedTarget2)}'
                : null,
      ),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
      child: Column(
        children: [
          Row(
            children: [
              Text(s.symbol, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              const SizedBox(width: 6),
              Pill(s.signal.replaceAll('_', ' '), tone: tone),
              const Spacer(),
              Text(formatPrice(s.ltp), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              const SizedBox(width: 8),
              SizedBox(
                width: 58,
                child: Text(
                  formatPct(s.changePct),
                  textAlign: TextAlign.end,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.pnl(s.changePct)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Open ${formatPrice(s.open)}'
                  '${s.suggestedSL > 0 ? ' · SL ${formatPrice(s.suggestedSL)} · T ${formatPrice(s.suggestedTarget)}' : ''}'
                  '${s.volume > 0 ? ' · Vol ${formatQty(s.volume)}' : ''}',
                  style: TextStyle(fontSize: 11, color: c.mutedForeground),
                ),
              ),
              ToneButton(label: 'B', tone: Tone.brand, height: 26, onPressed: () => trade('BUY')),
              const SizedBox(width: 4),
              ToneButton(label: 'S', tone: Tone.loss, height: 26, onPressed: () => trade('SELL')),
            ],
          ),
        ],
      ),
    );
  }
}
