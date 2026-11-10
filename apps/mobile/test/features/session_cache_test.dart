import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/auth_controller.dart';
import 'package:tradeio_mobile/core/socket/market_socket.dart';
import 'package:tradeio_mobile/features/auth/auth_models.dart';
import 'package:tradeio_mobile/features/brokers/brokers_providers.dart';
import 'package:tradeio_mobile/features/market/market_models.dart';

class TestMarket extends MarketSocket {
  late StreamController<OrderUpdate> _updates;
  @override
  MarketState build() {
    ref.watch(authControllerProvider.select((s) => s is AuthSignedIn ? s.user.id : null));
    final updates = StreamController<OrderUpdate>.broadcast();
    _updates = updates;
    ref.onDispose(updates.close);
    return const MarketState();
  }

  @override
  Stream<OrderUpdate> get orderUpdates => _updates.stream;
  void emit(String id) => _updates.add(OrderUpdate(orderId: id, status: 'COMPLETE'));
}

class TestAuth extends AuthController {
  @override
  AuthState build() => const AuthSignedOut();
  void signIn(String id) => state = AuthSignedIn(AppUser(id: id, name: id, email: '$id@example.com'));
  void signedOut() => state = const AuthSignedOut();
}

void main() {
  test('order postbacks resubscribe to the new stream after switching accounts', () async {
    final container = ProviderContainer(
      overrides: [authControllerProvider.overrideWith(TestAuth.new), marketSocketProvider.overrideWith(TestMarket.new)],
    );
    addTearDown(container.dispose);
    final received = <String>[];
    container.listen(orderUpdateStreamProvider, (_, next) {
      if (next.hasValue) received.add(next.requireValue.orderId);
    });
    final auth = container.read(authControllerProvider.notifier) as TestAuth;
    auth.signIn('first');
    await container.pump();
    (container.read(marketSocketProvider.notifier) as TestMarket).emit('first-fill');
    await container.pump();
    auth.signIn('second');
    await container.pump();
    (container.read(marketSocketProvider.notifier) as TestMarket).emit('second-fill');
    await container.pump();
    expect(received, containsAllInOrder(['first-fill', 'second-fill']));
  });
  test('account changes recreate the API dependency and clear the selected broker', () {
    final container = ProviderContainer(overrides: [authControllerProvider.overrideWith(TestAuth.new)]);
    addTearDown(container.dispose);
    final auth = container.read(authControllerProvider.notifier) as TestAuth;
    auth.signIn('first');
    final first = container.read(apiClientProvider);
    container.read(selectedBrokerProvider.notifier).select('broker-first');
    auth.signIn('second');
    expect(container.read(apiClientProvider), isNot(same(first)));
    expect(container.read(selectedBrokerProvider), isNull);
    auth.signedOut();
    expect(container.read(apiClientProvider), isNot(same(first)));
    first.dio.close(force: true);
  });
}
