import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../brokers/brokers_providers.dart';
import '../brokers/kite_session.dart';
import '../orders/orders_models.dart';
import '../orders/orders_providers.dart';
import '../risk/risk_models.dart';
import '../risk/risk_providers.dart';

/// A wall clock that ticks every 30 s, for countdowns (Kite token, next open).
final clockProvider = StreamProvider<DateTime>(
  (ref) => Stream<DateTime>.periodic(const Duration(seconds: 30), (_) => DateTime.now()),
);

DateTime _now(Ref ref) => ref.watch(clockProvider).value ?? DateTime.now();

/// The Zerodha token state for the top bar, status strip and dashboard.
final kiteSessionProvider = Provider<KiteSession?>((ref) {
  final accounts = ref.watch(brokersProvider).value;
  if (accounts == null) return null;
  return KiteSession.of(accounts, _now(ref));
});

/// Today's P&L as the web's `useDayPnl`: realised (net of charges, from the ledger) +
/// unrealised (open positions, from the risk service).
class DayTotals {
  const DayTotals({this.realised, this.risk});

  final DayPnl? realised;
  final RiskStatus? risk;

  double? get unrealised => risk?.unrealizedPnl;
  double? get total => realised != null && risk != null ? realised!.realizedPnl + risk!.unrealizedPnl : null;

  double get lossPct => risk?.lossUsagePct ?? 0;

  /// Colour is never the only signal: the level is stated in words too.
  String get lossLevel => lossPct >= 80 ? 'Critical' : (lossPct >= 50 ? 'Elevated' : 'Normal');
}

final dayTotalsProvider = Provider<DayTotals>(
  (ref) => DayTotals(realised: ref.watch(dayPnlProvider).value, risk: ref.watch(riskStatusProvider).value),
);
