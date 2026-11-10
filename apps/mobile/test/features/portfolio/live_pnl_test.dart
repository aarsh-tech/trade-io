import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/features/portfolio/live_pnl.dart';
import 'package:tradeio_mobile/features/portfolio/portfolio_models.dart';

void main() {
  const long = BrokerPosition(symbol: 'RELIANCE', exchange: 'NSE', qty: 10, avgPrice: 2500, ltp: 2510, pnl: 100);
  const short = BrokerPosition(symbol: 'INFY', exchange: 'NSE', qty: -20, avgPrice: 1500, ltp: 1490, pnl: 200);

  group('withLiveTick', () {
    test('moves P&L by qty × (tick − broker LTP), keeping the broker figure as the base', () {
      final live = withLiveTick(long, 2520);
      expect(live.ltp, 2520);
      expect(live.pnl, closeTo(200, 1e-9)); // 100 + 10 × 10
      expect(live.pnlPct, closeTo(0.8, 1e-9));
      expect(live.hasLiveTick, isTrue);
    });
    test('a short gains when the price falls', () {
      final live = withLiveTick(short, 1480);
      expect(live.pnl, closeTo(400, 1e-9)); // 200 + (−20) × (−10)
      expect(live.pnlPct, closeTo(1.3333, 1e-3));
    });
    test('no tick yet: broker values as they are', () {
      final live = withLiveTick(long, null);
      expect(live.ltp, 2510);
      expect(live.pnl, 100);
      expect(live.hasLiveTick, isFalse);
    });
    test('a tick >50% away from the broker LTP is ignored (another exchange\'s instrument)', () {
      final live = withLiveTick(long, 900);
      expect(live.ltp, 2510);
      expect(live.pnl, 100);
      expect(live.hasLiveTick, isFalse);
    });
    test('a closed-today row keeps its realised P&L and takes no tick', () {
      const closed = BrokerPosition(symbol: 'TCS', exchange: 'NSE', qty: 0, avgPrice: 3000, ltp: 3010, pnl: 55);
      final live = withLiveTick(closed, 3100);
      expect(live.pnl, 55);
      expect(live.pnlPct, 0);
      expect(live.hasLiveTick, isFalse);
    });
  });

  group('exchangeOf / positionKey', () {
    test('uses the broker exchange when present', () {
      expect(positionKey(long), 'NSE:RELIANCE');
    });
    test('guesses NFO/BFO/NSE from the symbol otherwise', () {
      expect(exchangeOf(const BrokerPosition(symbol: 'NIFTY25NOV24000CE')), 'NFO');
      expect(exchangeOf(const BrokerPosition(symbol: 'SENSEX25NOV80000PE')), 'BFO');
      expect(exchangeOf(const BrokerPosition(symbol: 'BANKNIFTY25NOVFUT')), 'NFO');
      expect(exchangeOf(const BrokerPosition(symbol: 'SBIN')), 'NSE');
    });
  });

  group('PositionsSummary', () {
    test('counts open rows only, but sums every row\'s P&L', () {
      final rows = [
        withLiveTick(long, 2520), // +200
        withLiveTick(short, 1500), // 0
        withLiveTick(const BrokerPosition(symbol: 'TCS', qty: 0, avgPrice: 3000, ltp: 3010, pnl: -40), null),
      ];
      final s = PositionsSummary.of(rows);
      expect(s.totalPnl, closeTo(160, 1e-9));
      expect(s.openCount, 2);
      expect(s.winners, 1);
      expect(s.losers, 0);
      expect(s.invested, 10 * 2500 + 20 * 1500);
    });
  });
}
