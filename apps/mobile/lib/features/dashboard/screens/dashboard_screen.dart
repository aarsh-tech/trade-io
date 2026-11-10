import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../brokers/brokers_providers.dart';
import '../../brokers/widgets/broker_banner.dart';
import '../../market/market_models.dart';
import '../../market/market_providers.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../risk/risk_providers.dart';
import '../../strategies/strategies_providers.dart';
import '../widgets/market_cards.dart';
import '../widgets/today_summary.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  Future<void> _refreshAll(WidgetRef ref) async {
    final brokerId = ref.read(activeBrokerProvider).value?.id;
    ref
      ..invalidate(marketOverviewProvider)
      ..invalidate(moversProvider)
      ..invalidate(sessionProvider)
      ..invalidate(dayPnlProvider)
      ..invalidate(riskStatusProvider)
      ..invalidate(strategiesProvider)
      ..invalidate(brokersProvider);
    if (brokerId != null) ref.invalidate(marginsProvider(brokerId));
    // Wait for the two main loads so the refresh spinner means something; errors show in their cards.
    await Future.wait<void>([
      ref.read(marketOverviewProvider.future).then<void>((_) {}, onError: (Object _) {}),
      ref.read(dayPnlProvider.future).then<void>((_) {}, onError: (Object _) {}),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keeps the feed subscription for the indices and watchlist alive while this tab exists.
    ref.watch(overviewSubscriptionProvider);
    final session = ref.watch(sessionProvider).value;
    final feed = ref.watch(marketSocketProvider.select((s) => s.feed.status));
    final colors = context.colors;

    final feedColor = switch (feed) {
      FeedState.connected => colors.profit,
      FeedState.stale => colors.warn,
      FeedState.closed => Theme.of(context).colorScheme.onSurfaceVariant,
    };
    final feedLabel = switch (feed) {
      FeedState.connected => 'Live',
      FeedState.stale => 'Stale',
      FeedState.closed => 'Feed off',
    };

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          if (session != null)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: StatusChip(
                session.state.label,
                color:
                    session.state == SessionState.open ? colors.profit : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: StatusChip(feedLabel, color: feedColor, icon: Icons.circle),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _refreshAll(ref),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: const [
            BrokerBanner(),
            SizedBox(height: 12),
            TodaySummary(),
            SizedBox(height: 12),
            IndicesStrip(),
            WatchlistCard(),
            MoversCard(),
          ],
        ),
      ),
    );
  }
}
