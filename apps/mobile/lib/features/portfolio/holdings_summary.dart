import 'portfolio_models.dart';

/// One holding's values (web Portfolio table): invested, current, P&L, P&L %.
class HoldingValue {
  const HoldingValue(this.holding);

  final Holding holding;

  double get invested => holding.avgPrice * holding.qty;
  double get current => holding.ltp * holding.qty;

  /// The broker's P&L when sent, else current − invested.
  double get pnl => holding.pnl ?? current - invested;
  double get pnlPct => holding.pnlPct ?? (invested > 0 ? pnl / invested * 100 : 0);
}

/// Totals over the holdings (web Portfolio / Dashboard stats).
class HoldingsSummary {
  const HoldingsSummary({
    required this.count,
    required this.invested,
    required this.current,
    required this.up,
    required this.down,
  });

  final int count;
  final double invested;
  final double current;
  final int up;
  final int down;

  double get pnl => current - invested;
  double get pnlPct => invested > 0 ? pnl / invested * 100 : 0;

  static HoldingsSummary of(Iterable<Holding> holdings) {
    var invested = 0.0, current = 0.0;
    var up = 0, down = 0, count = 0;
    for (final h in holdings.map(HoldingValue.new)) {
      count++;
      invested += h.invested;
      current += h.current;
      if (h.pnl > 0) up++;
      if (h.pnl < 0) down++;
    }
    return HoldingsSummary(count: count, invested: invested, current: current, up: up, down: down);
  }
}
