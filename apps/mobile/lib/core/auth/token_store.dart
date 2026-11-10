import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the session lives on the device: the two JWTs and the last known user, encrypted
/// by the Android Keystore. Both tokens are also kept in memory, so attaching the access token
/// to every request doesn't cost a platform call.
///
/// The Keystore can fail on a real phone in ways a test never sees (a key that no longer matches
/// its encrypted data after a reinstall, a vendor Keystore bug). None of that may stop someone
/// from signing in, so every storage error is caught here:
/// * a read that fails counts as "nothing saved" and wipes the unreadable data;
/// * a write that fails keeps the session in memory, so this run of the app stays signed in
///   and only the next cold start asks for the password again.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _accessKey = 'accessToken';
  static const _refreshKey = 'refreshToken';
  static const _userKey = 'user';

  String? _accessCache;
  String? _refreshCache;
  Map<String, dynamic>? _userCache;

  Future<String?> readAccess() async => _accessCache ??= await _read(_accessKey);

  Future<String?> readRefresh() async => _refreshCache ??= await _read(_refreshKey);

  Future<Map<String, dynamic>?> readUser() async {
    if (_userCache != null) return _userCache;
    final raw = await _read(_userKey);
    if (raw == null) return null;
    try {
      return _userCache = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveTokens({required String access, required String refresh}) async {
    _accessCache = access;
    _refreshCache = refresh;
    await _write(_accessKey, access);
    await _write(_refreshKey, refresh);
  }

  Future<void> saveUser(Map<String, dynamic> user) async {
    _userCache = user;
    await _write(_userKey, jsonEncode(user));
  }

  Future<void> clear() async {
    _accessCache = null;
    _refreshCache = null;
    _userCache = null;
    // Key by key: the same storage also holds the appearance setting, which outlives a sign-out.
    for (final key in const [_accessKey, _refreshKey, _userKey]) {
      try {
        await _storage.delete(key: key);
      } catch (e) {
        debugPrint('TokenStore: deleting "$key" failed: $e');
      }
    }
  }

  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (e) {
      // Unreadable (usually a Keystore key that no longer matches the data): start clean.
      debugPrint('TokenStore: reading "$key" failed, clearing saved session: $e');
      try {
        await _storage.deleteAll();
      } catch (_) {}
      return null;
    }
  }

  Future<void> _write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } catch (e) {
      debugPrint('TokenStore: saving "$key" failed, keeping it in memory only: $e');
    }
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
