import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import 'market_api.dart';
import 'scanner_models.dart';

/// The scanner pattern behind the web's Intraday Picks page.
const intradayPattern = 'INTRADAY_MOMENTUM';

/// LONG / SHORT: the scanner's own direction, else target above entry means long (web `getDirection`).
String pickDirection(SwingResult r) => r.direction ?? (r.target1 > r.entryPrice ? 'LONG' : 'SHORT');

/// Size of a pick for a profit goal (web PickCard): enough shares that target 1 earns [targetRs].
class PickPlan {
  const PickPlan({required this.qty, required this.capital, required this.maxRisk});
  final int qty;
  final double capital;
  final double maxRisk;

  static PickPlan of(SwingResult r, double targetRs) {
    final perShare = (r.target1 - r.entryPrice).abs();
    final qty = perShare > 0 ? (targetRs / perShare).ceil() : 1;
    return PickPlan(qty: qty, capital: qty * r.entryPrice, maxRisk: qty * (r.entryPrice - r.stopLoss).abs());
  }
}

/// Latest intraday-momentum scan (up to 100 picks).
final picksProvider = FutureProvider.autoDispose<SwingScan?>((ref) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(marketApiProvider).swing(1, intradayPattern, '', pageSize: 100);
});

final picksSubscriptionProvider = Provider.autoDispose<void>((ref) {
  final rows = ref.watch(picksProvider).value?.results ?? const [];
  ref.holdMarketSubscription(rows.map((r) => '${r.exchange}:${r.symbol}'));
});
