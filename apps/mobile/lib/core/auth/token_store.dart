import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the session lives on the device: the two JWTs and the last known user, encrypted
/// by the Android Keystore. The access token is also kept in memory so attaching it to
/// every request doesn't cost a platform call.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _accessKey = 'accessToken';
  static const _refreshKey = 'refreshToken';
  static const _userKey = 'user';

  String? _accessCache;

  Future<String?> readAccess() async => _accessCache ??= await _storage.read(key: _accessKey);

  Future<String?> readRefresh() => _storage.read(key: _refreshKey);

  Future<Map<String, dynamic>?> readUser() async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveTokens({required String access, required String refresh}) async {
    _accessCache = access;
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<void> saveUser(Map<String, dynamic> user) => _storage.write(key: _userKey, value: jsonEncode(user));

  Future<void> clear() async {
    _accessCache = null;
    await Future.wait([
      _storage.delete(key: _accessKey),
      _storage.delete(key: _refreshKey),
      _storage.delete(key: _userKey),
    ]);
  }

  /// The `exp` claim of a JWT as a UTC time, or null when it can't be read.
  /// Lets the app refresh only when a token is actually close to expiry
  /// (same rule as useTokenRefresh in the web app).
  static DateTime? expiryOf(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length != 3) return null;
      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final exp = (jsonDecode(payload) as Map<String, dynamic>)['exp'];
      if (exp is! num) return null;
      return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true);
    } catch (_) {
      return null;
    }
  }
}

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore(const FlutterSecureStorage()));
