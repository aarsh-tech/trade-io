import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// Also brings in the `onConnect` / `onDisconnect` extension methods on Socket.
import 'package:socket_io_client/socket_io_client.dart';

import '../../features/market/market_models.dart';
import '../auth/auth_controller.dart';
import '../auth/token_store.dart';
import '../lifecycle/app_lifecycle.dart';
import 'authed_socket.dart';

/// Ticks are buffered and written to state at most this often, so the UI rebuilds ≤ ~8×/s.
const _flushInterval = Duration(milliseconds: 125);

@immutable
class MarketState {
  const MarketState({this.ticks = const {}, this.connected = false, this.feed = FeedStatus.closed});

  /// Latest tick per canonical `EXCH:SYMBOL` key.
  final Map<String, MarketTick> ticks;
  final bool connected;
  final FeedStatus feed;

  MarketState copyWith({Map<String, MarketTick>? ticks, bool? connected, FeedStatus? feed}) =>
      MarketState(ticks: ticks ?? this.ticks, connected: connected ?? this.connected, feed: feed ?? this.feed);

  /// A tick for `EXCH:SYMBOL` or a bare symbol (NSE, then NFO, then BSE), like `findTick` on the web.
  MarketTick? find(String? symbol) {
    if (symbol == null || symbol.isEmpty) return null;
    final exact = ticks[symbol];
    if (exact != null) return exact;
    if (symbol.contains(':')) return null;
    return ticks['NSE:$symbol'] ?? ticks['NFO:$symbol'] ?? ticks['BSE:$symbol'] ?? ticks['BFO:$symbol'];
  }
}

/// The shared `/market` socket. Port of apps/web/src/components/market-socket-provider.tsx.
///
/// Lives while someone is signed in. Subscriptions are ref-counted: the server is told about a
/// symbol on its first holder and when its last holder leaves. Widgets read one instrument with
/// `ref.watch(marketSocketProvider.select((s) => s.ticks[key]))` so only that row rebuilds.
class MarketSocket extends Notifier<MarketState> {
  AuthedSocket? _socket;
  final _refCounts = <String, int>{};
  final _pending = <MarketTick>[];
  Timer? _flushTimer;
  late StreamController<OrderUpdate> _orderUpdates;

  /// Kite order postbacks for the signed-in user, as they arrive.
  Stream<OrderUpdate> get orderUpdates => _orderUpdates.stream;

  @override
  MarketState build() {
    final signedIn = ref.watch(authControllerProvider.select((s) => s is AuthSignedIn ? s.user.id : null));
    _orderUpdates = StreamController<OrderUpdate>.broadcast();
    _refCounts.clear();
    ref
      ..listen<bool>(appForegroundProvider, (_, foreground) {
        if (foreground) _socket?.wake();
      })
      ..onDispose(_teardown);
    if (signedIn != null) _connect();
    return const MarketState();
  }

  void _connect() {
    final tokens = ref.read(tokenStoreProvider);
    final api = ref.read(apiClientProvider);
    final s = AuthedSocket(
      '/market',
      readAccessToken: tokens.readAccess,
      refreshAccessToken: () async => api.refreshAccessToken(),
    );
    _socket = s;
    s.socket
      ..onConnect((_) {
        state = state.copyWith(connected: true);
        if (_refCounts.isNotEmpty) s.socket.emit('subscribe', {'symbols': _refCounts.keys.toList()});
      })
      ..onDisconnect((_) {
        state = state.copyWith(connected: false, feed: state.feed.copyWith(status: FeedState.stale));
      })
      ..on('ticks', _onTicks)
      ..on('feed:status', (data) {
        if (data is Map) state = state.copyWith(feed: FeedStatus.fromJson(Map<String, dynamic>.from(data)));
      })
      ..on('order_update', (data) {
        if (data is Map) _orderUpdates.add(OrderUpdate.fromJson(Map<String, dynamic>.from(data)));
      });
    s.connect();
  }

  void _onTicks(dynamic data) {
    if (data is! List) return;
    for (final raw in data) {
      if (raw is! Map) continue;
      final map = Map<String, dynamic>.from(raw);
      if (map['key'] is String && map['ltp'] is num) _pending.add(MarketTick.fromJson(map));
    }
    _flushTimer ??= Timer(_flushInterval, _flush);
  }

  void _flush() {
    _flushTimer = null;
    if (_pending.isEmpty) return;
    final next = Map<String, MarketTick>.from(state.ticks);
    for (final t in _pending) {
      next[t.key] = t; // later ticks for a key win
    }
    _pending.clear();
    state = state.copyWith(ticks: next);
  }

  /// Holds a server subscription for [symbols] until the returned callback runs.
  VoidCallback subscribe(Iterable<String> symbols) {
    final held = symbols.where((s) => s.isNotEmpty).toSet().toList();
    final added = <String>[];
    for (final s in held) {
      final n = _refCounts[s] ?? 0;
      _refCounts[s] = n + 1;
      if (n == 0) added.add(s);
    }
    final socket = _socket?.socket;
    if (added.isNotEmpty && socket != null && socket.connected) socket.emit('subscribe', {'symbols': added});

    var released = false;
    return () {
      if (released) return;
      released = true;
      final dropped = <String>[];
      for (final s in held) {
        final n = (_refCounts[s] ?? 1) - 1;
        if (n <= 0) {
          _refCounts.remove(s);
          dropped.add(s);
        } else {
          _refCounts[s] = n;
        }
      }
      final sock = _socket?.socket;
      if (dropped.isNotEmpty && sock != null && sock.connected) sock.emit('unsubscribe', {'symbols': dropped});
    };
  }

  void _teardown() {
    _flushTimer?.cancel();
    _flushTimer = null;
    _pending.clear();
    _socket?.dispose();
    _socket = null;
    _orderUpdates.close();
  }
}

final marketSocketProvider = NotifierProvider<MarketSocket, MarketState>(MarketSocket.new);

/// Order postbacks as a provider, so data providers can `ref.listen` and refresh on each one.
final orderUpdateStreamProvider = StreamProvider<OrderUpdate>((ref) {
  ref.watch(authControllerProvider.select((s) => s is AuthSignedIn ? s.user.id : null));
  return ref.watch(marketSocketProvider.notifier).orderUpdates;
});

/// Subscribes to [keys] for as long as the provider that calls this is alive.
extension MarketSubscriptionRef on Ref {
  void holdMarketSubscription(Iterable<String> keys) {
    final list = keys.toList();
    if (list.isEmpty) return;
    final release = read(marketSocketProvider.notifier).subscribe(list);
    onDispose(release);
  }
}
