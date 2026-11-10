import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/token_store.dart';

String fakeJwt(Map<String, Object?> payload) {
  String b64(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${b64({'alg': 'HS256', 'typ': 'JWT'})}.${b64(payload)}.signature';
}

void main() {
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
