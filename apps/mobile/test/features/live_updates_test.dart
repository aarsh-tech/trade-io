import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/socket/market_socket.dart';
import 'package:tradeio_mobile/features/market/market_models.dart';
import 'package:tradeio_mobile/features/market/scanner_models.dart';
import 'package:tradeio_mobile/features/market/scanner_providers.dart';
import 'package:tradeio_mobile/features/orders/orders_models.dart';
import 'package:tradeio_mobile/features/strategies/strategies_models.dart';
import 'package:tradeio_mobile/features/strategies/strategies_providers.dart';
import 'package:tradeio_mobile/features/strategies/strategy_state.dart';

void main() {
  test('canonical instrument lookups never use a different exchange price', () {
    const market = MarketState(
      ticks: {
        'NSE:RELIANCE': MarketTick(key: 'NSE:RELIANCE', symbol: 'RELIANCE', exchange: 'NSE', ltp: 2500, ts: 'now'),
      },
    );
    expect(market.find('RELIANCE')?.ltp, 2500);
    expect(market.find('BSE:RELIANCE'), isNull);
  });
  test('screener overlays live price and previous-close change but keeps snapshot signals', () {
    const stock = ScreenerStock(symbol: 'RELIANCE', close: 100, ltp: 100, signal: 'OPEN_LOW');
    final live = overlayStock(stock, 102);
    expect(live.changePct, 2);
    expect(live.signal, 'OPEN_LOW');
    expect(overlayStock(stock, null), stock);
  });
  test('strategy REST resync replaces an older event and events keep the authoritative running flag', () {
    final now = DateTime.utc(2026, 11, 10);
    final rest = (value: const StrategyStatus(running: true, logs: ['fresh REST']), at: now, hasOrders: true);
    final old = (
      value: const StrategyStatus(logs: ['stale event']),
      at: now.subtract(const Duration(seconds: 1)),
      hasOrders: false,
    );
    expect(mergeStrategySnapshots(rest, old).logs, ['fresh REST']);
    final fresh = (
      value: const StrategyStatus(logs: ['live event']),
      at: now.add(const Duration(seconds: 1)),
      hasOrders: false,
    );
    expect(mergeStrategySnapshots(rest, fresh).logs, ['live event']);
    expect(mergeStrategySnapshots(rest, fresh).running, isTrue);
  });
  test('an engine event without orders keeps the loaded order list', () {
    final now = DateTime.utc(2026, 11, 10);
    final order = Order(id: 'o1', symbol: 'ITI', createdAt: now);
    final rest = (value: StrategyStatus(running: true, orders: [order]), at: now, hasOrders: true);
    final later = now.add(const Duration(seconds: 1));
    // What the engines push on every loop: logs and state only.
    final engineEvent = (value: const StrategyStatus(logs: ['tick']), at: later, hasOrders: false);
    expect(mergeStrategySnapshots(rest, engineEvent).orders, [order]);
    // The first event after subscribing does carry the orders.
    final other = Order(id: 'o2', symbol: 'ITI', createdAt: now);
    final withOrders = (value: StrategyStatus(orders: [other]), at: later, hasOrders: true);
    expect(mergeStrategySnapshots(rest, withOrders).orders, [other]);
  });
  test('trade status reads the keys the running engines send', () {
    // stocks-in-play.engine.ts snapshot(): one open short, one more candidate being watched.
    final rows = Map.fromEntries(
      strategyStateSummary({
        'entryTriggered': 'SHORT',
        'activeSymbol': 'ITI',
        'entryPrice': 300.0,
        'currentLtp': 297.5,
        'stopLossPrice': 303.6,
        'targetPrice': null,
        'qty': 138,
        'pnlRs': 345.0,
        'positions': [
          {'symbol': 'ITI', 'side': 'SHORT', 'qty': 138, 'pnlRs': 345.0},
        ],
        'candidates': [
          {'symbol': 'ITI', 'side': 'SHORT', 'done': true},
          {'symbol': 'VIJAYA', 'side': 'SHORT', 'done': false},
        ],
        'tradesToday': 1,
        'winningTradesToday': 0,
        'losingTradesToday': 0,
        'realizedTodayRs': -120.5,
      }).map((r) => MapEntry(r.$1, r.$2)),
    );
    expect(rows['Instrument'], 'ITI');
    expect(rows['Position'], 'SHORT 138');
    expect(rows['Open P&L'], '+₹345.00');
    expect(rows['Realised today'], '-₹120.50');
    expect(rows['Trades today'], '1 (0W / 0L)');
    expect(rows['Watching'], 'VIJAYA SHORT');
    expect(rows.containsKey('Target'), isFalse);
    // Flat: no entry price, so no zero-filled position rows.
    final flat = strategyStateSummary({'entryTriggered': null, 'entryPrice': null, 'qty': 0, 'tradesToday': 0});
    expect(flat, [('Trades today', '0'), ('Position', 'None')]);
  });
}
