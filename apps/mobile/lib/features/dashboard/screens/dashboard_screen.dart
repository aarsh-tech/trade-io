import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/market_time.dart';
import '../../../router.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../brokers/widgets/broker_banner.dart';
import '../../home/app_chrome.dart';
import '../../market/market_providers.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../risk/risk_providers.dart';
import '../../strategies/strategies_providers.dart';
import '../widgets/algo_card.dart';
import '../widgets/funds_cards.dart';
import '../widgets/market_cards.dart';
import '../widgets/today_summary.dart';

/// Web /dashboard on a phone: greeting + actions, today's numbers, live positions and
/// strategies, funds, market movers.
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
    if (brokerId != null) {
      ref
        ..invalidate(marginsProvider(brokerId))
        ..invalidate(holdingsProvider(brokerId))
        ..invalidate(positionsProvider(brokerId));
    }
    await Future.wait<void>([
      ref.read(dayPnlProvider.future).then<void>((_) {}, onError: (Object _) {}),
      ref.read(strategiesProvider.future).then<void>((_) {}, onError: (Object _) {}),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(overviewSubscriptionProvider);
    final auth = ref.watch(authControllerProvider);
    final first = auth is AuthSignedIn ? auth.user.name.split(' ').first : '';
    final today = DateFormat('EEEE, d MMM').format(marketTime(DateTime.now()));
    return TabScaffold(
      title: 'Dashboard',
      body: RefreshIndicator(
        onRefresh: () => _refreshAll(ref),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: AppSpace.pageInsets,
          children: [
            PageHeader(
              first.isEmpty ? 'Dashboard' : 'Hi, $first',
              subtitle: '$today · Funds, live algo positions and market movers',
              actions: [
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
                  onPressed: () => context.push(Routes.trade),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            const BrokerBanner(),
            const IndicesRow(),
            const SizedBox(height: AppSpace.gap),
            const TodaySummary(),
            const SizedBox(height: AppSpace.gap),
            const AlgoCard(),
            const SizedBox(height: AppSpace.gap),
            const FundsCards(),
            const SizedBox(height: AppSpace.gap),
            const MoversPanel(),
          ],
        ),
      ),
    );
  }
}
