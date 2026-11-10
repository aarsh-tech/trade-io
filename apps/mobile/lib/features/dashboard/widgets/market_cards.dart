import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../market/market_models.dart';
import '../../market/market_providers.dart';
import '../../orders/order_ticket.dart';

/// NIFTY 50 / SENSEX / NIFTY BANK in one compact row, live.
class IndicesRow extends ConsumerWidget {
  const IndicesRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(marketOverviewProvider);
    final indices = overview.value?.indices ?? const <IndexQuote>[];
    if (indices.isEmpty) return const SizedBox.shrink();
    return Card(
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (i, index) in indices.take(3).indexed) ...[
              if (i > 0) VerticalDivider(width: 1, color: context.colors.border),
              Expanded(child: _IndexCell(index: index)),
            ],
          ],
        ),
      ),
    );
  }
}

class _IndexCell extends ConsumerWidget {
  const _IndexCell({required this.index});
  final IndexQuote index;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final tick = ref.watch(marketSocketProvider.select((s) => s.find(index.key)));
    final price = tick?.ltp ?? index.price;
    final pct = tick?.changePct ?? index.change;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            index.symbol,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: c.mutedForeground),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              price > 0 ? formatPrice(price) : empty,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            price > 0 ? formatPct(pct) : '',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: c.pnl(pct)),
          ),
        ],
      ),
    );
  }
}

/// Top gainers / losers (server-side NIFTY universe, cached a minute). Tap a row to trade it.
class MoversPanel extends ConsumerStatefulWidget {
  const MoversPanel({super.key});

  @override
  ConsumerState<MoversPanel> createState() => _MoversPanelState();
}

class _MoversPanelState extends ConsumerState<MoversPanel> {
  bool _gainers = true;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final movers = ref.watch(moversProvider);
    return Panel(
      title: 'Market movers',
      icon: Icons.swap_vert_rounded,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: SegmentTabs<bool>(
              options: const [
                (value: true, label: 'Top gainers', tone: Tone.profit),
                (value: false, label: 'Top losers', tone: Tone.loss),
              ],
              value: _gainers,
              onChanged: (v) => setState(() => _gainers = v),
            ),
          ),
          AsyncView(
            value: movers,
            onRetry: () => ref.invalidate(moversProvider),
            data: (m) {
              final rows = _gainers ? m.topGainers : m.topLosers;
              if (rows.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text('No market data (broker not connected or market closed).'),
                );
              }
              return Column(
                children: [
                  for (final (i, r) in rows.indexed) ...[
                    if (i > 0) Divider(color: c.border),
                    InkWell(
                      onTap:
                          () => context.push(
                            Routes.trade,
                            extra: TicketPrefill(symbol: r.symbol, exchange: r.exchange, ltp: r.ltp),
                          ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text.rich(
                                TextSpan(
                                  children: [
                                    TextSpan(
                                      text: r.symbol,
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                    ),
                                    TextSpan(
                                      text: '  ${r.exchange}',
                                      style: TextStyle(fontSize: 10, color: c.mutedForeground),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            Text(formatPrice(r.ltp), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                            const SizedBox(width: 10),
                            SizedBox(
                              width: 64,
                              child: Text(
                                formatPct(r.changePercent),
                                textAlign: TextAlign.end,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: c.pnl(r.changePercent),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
