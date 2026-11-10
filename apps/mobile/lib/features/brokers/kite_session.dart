import '../../shared/enums.dart';
import 'brokers_models.dart';

/// Zerodha access-token state shown in the top bar and status strip
/// (port of the `tokenState` rule in apps/web/src/components/layout/status-bar.tsx).
enum KiteTokenState { none, ok, soon, expired }

class KiteSession {
  const KiteSession(this.state, {this.account, this.remaining});

  final KiteTokenState state;
  final BrokerAccount? account;

  /// Time until the token expires (only for [KiteTokenState.ok] / [KiteTokenState.soon]).
  final Duration? remaining;

  bool get connected => state == KiteTokenState.ok || state == KiteTokenState.soon;

  /// The first Zerodha account; tokens expire daily at 06:00 IST and the server sets `tokenExpiry`.
  static KiteSession of(List<BrokerAccount> accounts, DateTime now) {
    final kite = accounts.where((a) => a.broker == BrokerType.zerodha).firstOrNull;
    if (kite == null) return const KiteSession(KiteTokenState.none);
    final expiry = kite.tokenExpiry;
    if (!kite.isActive || expiry == null || kite.sessionExpired) {
      return KiteSession(KiteTokenState.expired, account: kite);
    }
    final left = expiry.difference(now);
    if (left <= Duration.zero) return KiteSession(KiteTokenState.expired, account: kite);
    return KiteSession(
      left < const Duration(hours: 1) ? KiteTokenState.soon : KiteTokenState.ok,
      account: kite,
      remaining: left,
    );
  }
}
