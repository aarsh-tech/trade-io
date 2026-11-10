import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import '../brokers/brokers_api.dart';
import 'live_pnl.dart';
import 'portfolio_models.dart';

/// Broker positions. The server caches them 3 s; live LTP/P&L between polls comes from ticks
/// (see [livePositionsProvider]), so 15 s is plenty.
final positionsProvider = FutureProvider.autoDispose.family<List<BrokerPosition>, String>((ref, accountId) {
  ref.pollEvery(const Duration(seconds: 15));
  ref.listen(orderUpdateStreamProvider, (_, next) {
    if (next.hasValue) ref.invalidateSelf();
  });
  return ref.watch(brokersApiProvider).positions(accountId);
});

final holdingsProvider = FutureProvider.autoDispose.family<List<Holding>, String>((ref, accountId) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(brokersApiProvider).holdings(accountId);
});

final marginsProvider = FutureProvider.autoDispose.family<Margins?, String>((ref, accountId) {
  ref.pollEvery(const Duration(seconds: 30));
  return ref.watch(brokersApiProvider).margins(accountId);
});

/// Keeps the market subscription for the open positions alive. Separate from the live rows so a
/// tick does not re-subscribe anything: this only changes when the position list changes.
final _positionSubscriptionProvider = Provider.autoDispose.family<void, String>((ref, accountId) {
  final positions = ref.watch(positionsProvider(accountId)).value ?? const [];
  ref.holdMarketSubscription(positions.where((p) => p.isOpen).map(positionKey));
});

/// Positions with LTP and P&L moved by the tick feed. Rebuilds only when a relevant tick changes.
final livePositionsProvider = Provider.autoDispose.family<AsyncValue<List<LivePosition>>, String>((ref, accountId) {
  ref.watch(_positionSubscriptionProvider(accountId));
  return ref.watch(positionsProvider(accountId)).whenData((positions) {
    return positions.map((p) {
      final key = positionKey(p);
      final ltp = ref.watch(marketSocketProvider.select((s) => s.find(key)?.ltp));
      return withLiveTick(p, ltp);
    }).toList();
  });
});
