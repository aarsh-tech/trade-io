import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import 'orders_api.dart';
import 'orders_models.dart';

/// The order book. Fills and rejections arrive as `order_update` socket events, which refresh
/// this at once; the 30 s poll is the fallback (same as the web's Orders page).
final ordersProvider = FutureProvider<List<Order>>((ref) {
  ref
    ..pollEvery(const Duration(seconds: 30))
    ..listen(orderUpdateStreamProvider, (_, next) {
      if (next.hasValue) ref.invalidateSelf();
    });
  return ref.watch(ordersApiProvider).list();
});

final dayPnlProvider = FutureProvider<DayPnl>((ref) {
  ref
    ..pollEvery(const Duration(seconds: 60))
    ..listen(orderUpdateStreamProvider, (_, next) {
      if (next.hasValue) ref.invalidateSelf();
    });
  return ref.watch(ordersApiProvider).dayPnl();
});
