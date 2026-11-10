import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/auth_controller.dart';
import 'package:tradeio_mobile/core/auth/token_store.dart';
import 'package:tradeio_mobile/features/auth/auth_models.dart';

/// Answers every request like the backend's POST /auth/login does.
class _LoginAdapter implements HttpClientAdapter {
  final paths = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    paths.add(options.path);
    final body = jsonEncode({
      'success': true,
      'data': {
        'user': {'id': 'u1', 'email': 'trader@example.com', 'name': 'Trader', 'role': 'USER', 'isActive': true},
        'accessToken': 'access-1',
        'refreshToken': 'refresh-1',
      },
    });
    return ResponseBody.fromString(
      body,
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('signing in works while the per-account API client exists (no circular dependency)', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final container = ProviderContainer(
      overrides: [tokenStoreProvider.overrideWith((ref) => TokenStore(const FlutterSecureStorage()))],
    );
    addTearDown(container.dispose);

    final adapter = _LoginAdapter();
    container.read(sessionApiClientProvider).dio.httpClientAdapter = adapter;
    // On the phone something has always built this client (it watches the auth state) before the
    // user taps Sign in; that dependency is what made login throw CircularDependencyError.
    // Listened, as in the app: the router listens to the auth state, feature APIs to the client.
    container
      ..listen(authControllerProvider, (_, __) {})
      ..listen(apiClientProvider, (_, __) {});
    // Let the start-up restore finish (no saved session); storage replies take a few event-loop turns.
    for (var i = 0; i < 100 && container.read(authControllerProvider) is AuthUnknown; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(container.read(authControllerProvider), isA<AuthSignedOut>());

    final result = await container
        .read(authControllerProvider.notifier)
        .login(email: 'trader@example.com', password: 'secret');

    expect(result, isA<LoginSession>());
    expect(adapter.paths, ['/auth/login']);
    final state = container.read(authControllerProvider);
    expect(state, isA<AuthSignedIn>());
    expect((state as AuthSignedIn).user.id, 'u1');
    expect(await container.read(tokenStoreProvider).readAccess(), 'access-1');
  });
}
