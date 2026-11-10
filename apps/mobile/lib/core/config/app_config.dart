/// Build-time configuration, set with `--dart-define`.
///
/// Production (default) talks to the same hosts as the web app. For a local backend on the
/// LAN run, for example:
///
///   flutter run --dart-define=API_URL=http://192.168.1.5:3002
///
/// `API_URL` is the server origin without `/v1`; REST adds the prefix and socket.io uses the
/// origin directly (namespaces `/market` and `/strategy`), mirroring `getApiBaseUrl` /
/// `getSocketBaseUrl` in apps/web/src/lib/api.ts.
abstract final class AppConfig {
  static const String apiOrigin = String.fromEnvironment('API_URL', defaultValue: 'https://api.tradeio.site');

  static String get restBaseUrl => '${_trimSlash(apiOrigin)}/v1';

  static String get socketBaseUrl => _trimSlash(apiOrigin);

  /// True when pointed at anything other than production.
  static bool get isLocalBackend => !apiOrigin.contains('tradeio.site');

  static String _trimSlash(String s) => s.endsWith('/') ? s.substring(0, s.length - 1) : s;
}
