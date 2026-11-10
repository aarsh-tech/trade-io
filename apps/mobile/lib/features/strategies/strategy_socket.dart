import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/token_store.dart';
import '../../core/lifecycle/app_lifecycle.dart';
import '../../core/socket/authed_socket.dart';
import 'strategies_models.dart';

/// [hasOrders] is false for the engines' own `strategy-event` pushes, which carry logs and
/// state only; the order list then stays as last loaded (same rule as the web's detail page).
typedef StrategySnapshot = ({StrategyStatus value, DateTime at, bool hasOrders});
final strategyEventsProvider = StreamProvider.autoDispose.family<StrategySnapshot, String>((ref, id) {
  final tokens = ref.watch(tokenStoreProvider);
  final api = ref.watch(apiClientProvider);
  // Riverpod owns the stream and closes it with this subscription.
  final controller = StreamController<StrategySnapshot>();
  final socket = AuthedSocket(
    '/strategy',
    readAccessToken: tokens.readAccess,
    refreshAccessToken: () async => api.refreshAccessToken(),
  );
  socket.socket.onConnect((_) => socket.socket.emit('subscribe', {'strategyId': id}));
  socket.socket.on('strategy-event', (dynamic raw) {
    if (raw is Map) {
      try {
        final orders = raw['orders'];
        final value = StrategyStatus.fromJson(Map<String, dynamic>.from(raw));
        controller.add((value: value, at: DateTime.now(), hasOrders: orders is List && orders.isNotEmpty));
      } catch (e, stack) {
        controller.addError(e, stack);
      }
    }
  });
  ref.listen(appForegroundProvider, (_, next) {
    if (next) socket.wake();
  });
  ref.onDispose(() {
    socket.dispose();
    controller.close();
  });
  socket.connect();
  return controller.stream;
});
