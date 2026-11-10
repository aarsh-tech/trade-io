import 'dart:async';
import 'dart:math' as math;

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/app_config.dart';

/// A socket.io connection to one gateway namespace (`/market`, `/strategy`) that stays alive.
/// Port of apps/web/src/lib/socket.ts.
///
/// socket.io only auto-reconnects on network failures. When the *server* ends the session
/// (reason "io server disconnect": our gateways do this for an expired or invalid JWT) the
/// client stays down for good, so on that reason we refresh the access token and reconnect
/// ourselves, with backoff. The handshake token is read fresh on every attempt, so a
/// refreshed token is always the one sent. [wake] revives a socket that gave up while the app
/// was in the background.
class AuthedSocket {
  AuthedSocket(
    this.namespace, {
    required Future<String?> Function() readAccessToken,
    required Future<void> Function() refreshAccessToken,
  }) : _readAccessToken = readAccessToken,
       _refreshAccessToken = refreshAccessToken {
    socket = io.io(
      '${AppConfig.socketBaseUrl}$namespace',
      io.OptionBuilder()
          // Plain websocket only: the Dart client's long-polling fallback is unreliable and the
          // gateway accepts websocket upgrades directly.
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(1 << 30)
          .setReconnectionDelay(_reconnectBaseMs)
          .setReconnectionDelayMax(_reconnectMaxMs)
          .setTimeout(20000)
          .setAuthFn((cb) async => cb({'token': await _readAccessToken()}))
          .build(),
    );
    socket
      ..onConnect((_) {
        _serverDrops = 0;
        _clearRetry();
      })
      ..onDisconnect((reason) {
        if (reason == 'io server disconnect') _reviveAfterServerDisconnect();
      });
  }

  static const _reconnectBaseMs = 1000;
  static const _reconnectMaxMs = 15000;

  final String namespace;
  final Future<String?> Function() _readAccessToken;
  final Future<void> Function() _refreshAccessToken;

  late final io.Socket socket;

  Timer? _retryTimer;
  int _serverDrops = 0;
  bool _disposed = false;

  bool get isConnected => socket.connected;

  void connect() {
    if (_disposed || socket.connected) return;
    socket.connect();
  }

  /// Call when the app returns to the foreground or the network comes back.
  void wake() {
    if (_disposed || socket.connected || socket.active) return;
    socket.connect();
  }

  void _clearRetry() {
    _retryTimer?.cancel();
    _retryTimer = null;
  }

  void _reviveAfterServerDisconnect() {
    if (_disposed || _retryTimer != null) return;
    final delay = math.min(_reconnectBaseMs * math.pow(2, _serverDrops).toInt(), _reconnectMaxMs);
    _serverDrops += 1;
    _retryTimer = Timer(Duration(milliseconds: delay), () async {
      _retryTimer = null;
      if (_disposed || socket.connected) return;
      try {
        await _refreshAccessToken();
      } catch (_) {
        // Offline or backend restarting: still retry below, the next handshake will tell.
      }
      if (!_disposed && !socket.connected) socket.connect();
    });
  }

  void dispose() {
    _disposed = true;
    _clearRetry();
    socket
      ..clearListeners()
      ..disconnect()
      ..dispose();
  }
}
