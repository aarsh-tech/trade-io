import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../../market/market_models.dart';
import '../../market/market_providers.dart';

/// NIFTY 50 / SENSEX / NIFTY BANK, live.
class IndicesStrip extends ConsumerWidget {
  const IndicesStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(marketOverviewProvider);
    return AsyncView(
      value: overview,
      loading: const SizedBox(height: 84, child: Center(child: CircularProgressIndicator())),
      onRetry: () => ref.invalidate(marketOverviewProvider),
      data:
          (data) => SizedBox(
            height: 84,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: data.indices.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) => _IndexCard(index: data.indices[i]),
            ),
          ),
    );
  }
}

class _IndexCard extends ConsumerWidget {
  const _IndexCard({required this.index});

  final IndexQuote index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tick = ref.watch(marketSocketProvider.select((s) => s.find(index.key)));
    final price = tick?.ltp ?? index.price;
    final pct = tick?.changePct ?? index.change;
    final abs = tick?.change ?? index.changeAbs;
    final theme = Theme.of(context);
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(index.symbol, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 3),
              Text(
                price > 0 ? formatPrice(price) : empty,
                style: tabular(theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  PctText(price > 0 ? pct : null, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  const SizedBox(width: 6),
                  Text(
                    price > 0 ? formatPrice(abs, signed: true) : '',
                    style: tabular(TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
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

/// The user's default watchlist, live.
class WatchlistCard extends ConsumerWidget {
  const WatchlistCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stocks = ref.watch(marketOverviewProvider).value?.stocks ?? const <WatchStock>[];
    if (stocks.isEmpty) return const SizedBox.shrink();
    return _Section(title: 'Watchlist', child: Column(children: [for (final s in stocks) _WatchRow(stock: s)]));
  }
}

class _WatchRow extends ConsumerWidget {
  const _WatchRow({required this.stock});

  final WatchStock stock;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tick = ref.watch(marketSocketProvider.select((s) => s.find(stock.key)));
    final price = tick?.ltp ?? stock.price;
    final pct = tick?.changePct ?? stock.change;
    return _QuoteRow(symbol: stock.symbol, sub: stock.exchange, price: price, pct: price > 0 ? pct : null);
  }
}

/// Top gainers / losers (server-side NIFTY universe, cached a minute).
class MoversCard extends ConsumerStatefulWidget {
  const MoversCard({super.key});

  @override
  ConsumerState<MoversCard> createState() => _MoversCardState();
}

class _MoversCardState extends ConsumerState<MoversCard> {
  bool _gainers = true;

  @override
  Widget build(BuildContext context) {
    final movers = ref.watch(moversProvider);
    return _Section(
      title: 'Movers',
      trailing: SegmentedButton<bool>(
        showSelectedIcon: false,
        style: const ButtonStyle(visualDensity: VisualDensity.compact),
        segments: const [
          ButtonSegment(value: true, label: Text('Gainers')),
          ButtonSegment(value: false, label: Text('Losers')),
        ],
        selected: {_gainers},
        onSelectionChanged: (s) => setState(() => _gainers = s.first),
      ),
      child: AsyncView(
        value: movers,
        onRetry: () => ref.invalidate(moversProvider),
        data: (m) {
          final rows = _gainers ? m.topGainers : m.topLosers;
          if (rows.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'No market data (broker not connected or market closed)',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
              ),
            );
          }
          return Column(
            children: [
              for (final r in rows) _QuoteRow(symbol: r.symbol, sub: r.exchange, price: r.ltp, pct: r.changePercent),
            ],
          );
        },
      ),
    );
  }
}

class _QuoteRow extends StatelessWidget {
  const _QuoteRow({required this.symbol, required this.sub, required this.price, required this.pct});

  final String symbol;
  final String sub;
  final double price;
  final double? pct;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(symbol, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text(sub, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(price > 0 ? formatPrice(price) : empty, style: tabular(theme.textTheme.bodyMedium)),
              PctText(pct, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.trailing});

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 10, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
            Divider(height: 1, color: context.colors.border),
            child,
          ],
        ),
      ),
    );
  }
}
