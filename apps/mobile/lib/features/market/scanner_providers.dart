import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import 'market_api.dart';
import 'scanner_models.dart';

typedef ScreenerQuery = ({String universe, double tolerance});
final screenerProvider = FutureProvider.autoDispose.family<ScreenerData, ScreenerQuery>((ref, query) {
  ref.pollEvery(const Duration(seconds: 15));
  return ref.watch(marketApiProvider).screener(query.universe, query.tolerance);
});
final screenerSubscriptionProvider = Provider.autoDispose.family<void, ScreenerQuery>((ref, query) {
  final stocks = ref.watch(screenerProvider(query)).value?.stocks ?? [];
  ref.holdMarketSubscription(stocks.map((s) => '${s.exchange}:${s.symbol}'));
});
ScreenerStock overlayStock(ScreenerStock row, double? ltp) {
  if (ltp == null || ltp <= 0) return row;
  return row.copyWith(ltp: ltp, changePct: row.close > 0 ? (ltp - row.close) / row.close * 100 : row.changePct);
}

final liveScreenerProvider = Provider.autoDispose.family<AsyncValue<ScreenerData>, ScreenerQuery>((ref, query) {
  ref.watch(screenerSubscriptionProvider(query));
  return ref
      .watch(screenerProvider(query))
      .whenData(
        (data) => data.copyWith(
          stocks: [
            for (final stock in data.stocks)
              overlayStock(
                stock,
                ref.watch(marketSocketProvider.select((s) => s.find('${stock.exchange}:${stock.symbol}')?.ltp)),
              ),
          ],
        ),
      );
});
final moveAlertsProvider = FutureProvider.autoDispose<MoveAlertsData>((ref) {
  ref.pollEvery(const Duration(seconds: 15));
  return ref.watch(marketApiProvider).moveAlerts();
});
typedef SwingQuery = ({int page, String pattern, String sortBy});
final swingProvider = FutureProvider.autoDispose.family<SwingScan?, SwingQuery>((ref, query) {
  ref.pollEvery(const Duration(seconds: 30));
  return ref.watch(marketApiProvider).swing(query.page, query.pattern, query.sortBy);
});
final swingSubscriptionProvider = Provider.autoDispose.family<void, SwingQuery>((ref, query) {
  final rows = ref.watch(swingProvider(query)).value?.results ?? [];
  ref.holdMarketSubscription(rows.map((s) => '${s.exchange}:${s.symbol}'));
});
