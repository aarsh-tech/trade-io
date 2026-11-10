import 'portfolio_models.dart';

/// Port of apps/web/src/hooks/useLivePositions.ts.
///
/// Kite's P&L is linear in the LTP (sell value − buy value + qty × LTP), so a position's live
/// P&L is the broker's figure plus qty × the move since the broker's LTP. That keeps the
/// realised part of a partly closed position and matches Kite exactly when the prices agree.
class LivePosition {
  const LivePosition({
    required this.position,
    required this.ltp,
    required this.pnl,
    required this.pnlPct,
    required this.hasLiveTick,
  });

  final BrokerPosition position;
  final double ltp;
  final double pnl;
  final double pnlPct;
  final bool hasLiveTick;

  String get symbol => position.symbol;
  int get qty => position.qty;
  bool get isOpen => position.isOpen;
}

final _derivative = RegExp(r'(CE|PE|FUT)$');

/// The position's own exchange from Kite; the guess is only for a row without one.
String exchangeOf(BrokerPosition p) {
  final ex = p.exchange;
  if (ex != null && ex.isNotEmpty) return ex;
  if (_derivative.hasMatch(p.symbol)) {
    return (p.symbol.startsWith('SENSEX') || p.symbol.startsWith('BANKEX')) ? 'BFO' : 'NFO';
  }
  return 'NSE';
}

/// Market-feed key for a position (`EXCH:SYMBOL`).
String positionKey(BrokerPosition p) => '${exchangeOf(p)}:${p.symbol}';

/// [tick] is the latest LTP from the feed, or null when none has arrived.
LivePosition withLiveTick(BrokerPosition p, double? tick) {
  final brokerLtp = p.ltp > 0 ? p.ltp : p.avgPrice;
  // Discard a tick >50% away from the broker's LTP (a same-named instrument on another exchange).
  final sane = p.isOpen && tick != null && tick > 0 && (brokerLtp <= 0 || (tick - brokerLtp).abs() / brokerLtp < 0.5);
  final ltp = sane ? tick : p.ltp;
  final pnl = sane && p.ltp > 0 ? p.pnl + p.qty * (tick - p.ltp) : p.pnl;
  final pnlPct =
      p.isOpen && p.avgPrice > 0 && ltp > 0 ? (ltp - p.avgPrice) / p.avgPrice * 100 * (p.qty > 0 ? 1 : -1) : 0.0;
  return LivePosition(position: p, ltp: ltp, pnl: pnl, pnlPct: pnlPct, hasLiveTick: sane);
}

/// Totals for the summary header. Closed-today rows (qty 0) count toward P&L only, like Kite.
class PositionsSummary {
  const PositionsSummary({
    required this.totalPnl,
    required this.invested,
    required this.openCount,
    required this.winners,
    required this.losers,
  });

  final double totalPnl;
  final double invested;
  final int openCount;
  final int winners;
  final int losers;

  static PositionsSummary of(Iterable<LivePosition> rows) {
    var pnl = 0.0, invested = 0.0;
    var open = 0, wins = 0, losses = 0;
    for (final r in rows) {
      pnl += r.pnl;
      if (!r.isOpen) continue;
      open++;
      invested += (r.qty * r.position.avgPrice).abs();
      if (r.pnl > 0) wins++;
      if (r.pnl < 0) losses++;
    }
    return PositionsSummary(totalPnl: pnl, invested: invested, openCount: open, winners: wins, losers: losses);
  }
}
