import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import 'market_api.dart';
import 'market_models.dart';

/// Indices + watchlist snapshot; live prices overlay it from the socket.
final marketOverviewProvider = FutureProvider<MarketOverview>((ref) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(marketApiProvider).overview();
});

/// Holds the feed subscription for everything on the overview while the dashboard is alive.
final overviewSubscriptionProvider = Provider.autoDispose<void>((ref) {
  final overview = ref.watch(marketOverviewProvider).value;
  if (overview == null) return;
  ref.holdMarketSubscription([
    ...overview.indices.map((i) => i.key).whereType<String>(),
    ...overview.stocks.map((s) => s.key),
  ]);
});

/// Server caches movers for 60 s, so polling faster gains nothing.
final moversProvider = FutureProvider<Movers>((ref) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(marketApiProvider).movers();
});

final sessionProvider = FutureProvider<SessionInfo>((ref) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(marketApiProvider).session();
});
