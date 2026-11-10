import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import 'strategies_api.dart';
import 'strategies_models.dart';
import 'strategy_socket.dart';

final strategiesProvider = FutureProvider<List<StrategyRow>>((ref) {
  ref.pollEvery(const Duration(seconds: 30));
  return ref.watch(strategiesApiProvider).list();
});

final strategyProvider = FutureProvider.autoDispose.family<StrategyRow, String>((ref, id) {
  ref.pollEvery(const Duration(seconds: 30));
  return ref.watch(strategiesApiProvider).get(id);
});

final strategyStatusProvider = FutureProvider.autoDispose.family<StrategySnapshot, String>((ref, id) async {
  ref.pollEvery(const Duration(seconds: 30));
  final api = ref.watch(strategiesApiProvider);
  final started = DateTime.now();
  return (value: await api.status(id), at: started, hasOrders: true);
});

// Socket payloads carry logs and state (orders only in the first one after subscribing), and
// no authoritative `running` flag.
StrategyStatus mergeStrategySnapshots(StrategySnapshot rest, StrategySnapshot? event) {
  if (event == null || !event.at.isAfter(rest.at)) return rest.value;
  return rest.value.copyWith(
    logs: event.value.logs.isEmpty ? rest.value.logs : event.value.logs,
    state: event.value.state ?? rest.value.state,
    orders: event.hasOrders ? event.value.orders : rest.value.orders,
  );
}

final liveStrategyProvider = Provider.autoDispose.family<AsyncValue<StrategyStatus>, String>((ref, id) {
  // The engines do not push their orders, so a fill reloads the status (orders included).
  ref.listen(orderUpdateStreamProvider, (_, next) {
    if (next.hasValue) ref.invalidate(strategyStatusProvider(id));
  });
  final rest = ref.watch(strategyStatusProvider(id));
  final event = ref.watch(strategyEventsProvider(id)).value;
  return rest.whenData((value) => mergeStrategySnapshots(value, event));
});
