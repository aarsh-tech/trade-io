import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/token_store.dart';

String fakeJwt(Map<String, Object?> payload) {
  String b64(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${b64({'alg': 'HS256', 'typ': 'JWT'})}.${b64(payload)}.signature';
}

/// Secure storage that behaves like a broken Android Keystore: reads and/or writes throw.
class _BrokenStorage implements FlutterSecureStorage {
  _BrokenStorage({this.readFails = false, this.writeFails = false});

  final bool readFails;
  final bool writeFails;
  final values = <String, String>{};
  int deleteAllCalls = 0;

  static PlatformException get _keystoreError =>
      PlatformException(code: 'Exception', message: 'java.security.InvalidKeyException: Failed to unwrap key');

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (readFails) throw _keystoreError;
    return values[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (writeFails) throw _keystoreError;
    values[key] = value!;
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => values.remove(key);

  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    deleteAllCalls++;
    values.clear();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('TokenStore on a broken Keystore', () {
    test('an unreadable session reads as signed out and is wiped', () async {
      final storage = _BrokenStorage(readFails: true);
      final store = TokenStore(storage);
      expect(await store.readAccess(), isNull);
      expect(await store.readRefresh(), isNull);
      expect(await store.readUser(), isNull);
      expect(storage.deleteAllCalls, greaterThan(0));
    });
    test('a failed save still keeps the session for this run of the app', () async {
      final store = TokenStore(_BrokenStorage(writeFails: true));
      await store.saveTokens(access: 'a1', refresh: 'r1');
      await store.saveUser({'id': 'u1'});
      expect(await store.readAccess(), 'a1');
      expect(await store.readRefresh(), 'r1');
      expect(await store.readUser(), {'id': 'u1'});
    });
    test('sign-out clears the session but keeps other settings', () async {
      final storage = _BrokenStorage()..values['appearance'] = 'dark';
      final store = TokenStore(storage);
      await store.saveTokens(access: 'a1', refresh: 'r1');
      await store.clear();
      expect(await store.readAccess(), isNull);
      expect(storage.values, {'appearance': 'dark'});
    });
  });

  group('TokenStore.expiryOf', () {
    test('reads exp as a UTC time', () {
      final jwt = fakeJwt({'sub': 'u1', 'exp': 1_800_000_000});
      expect(TokenStore.expiryOf(jwt), DateTime.fromMillisecondsSinceEpoch(1_800_000_000 * 1000, isUtc: true));
    });
    test('returns null for a token without exp or a malformed token', () {
      expect(TokenStore.expiryOf(fakeJwt({'sub': 'u1'})), isNull);
      expect(TokenStore.expiryOf('not.a.jwt.at.all'), isNull);
      expect(TokenStore.expiryOf(''), isNull);
    });
  });
}
