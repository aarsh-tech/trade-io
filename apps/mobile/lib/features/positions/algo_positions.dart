import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../portfolio/live_pnl.dart';
import '../portfolio/portfolio_models.dart';
import '../portfolio/portfolio_providers.dart';
import '../strategies/strategies_models.dart';
import '../strategies/strategies_providers.dart';

/// Product label of a position held only by a strategy's paper engine.
const paperProduct = 'PAPER';

bool isPaper(BrokerPosition p) => p.product == paperProduct;

/// The open trade a running strategy reports in its state, as a position row
/// (port of the paper-position rule in the web's LiveAlgoPositionsCard). Null when flat.
BrokerPosition? strategyPosition(StrategyRow s, Map<String, dynamic>? state) {
  if (state == null) return null;
  String? text(String k) => state[k] is String && (state[k] as String).isNotEmpty ? state[k] as String : null;
  num n(String k) => state[k] is num ? state[k] as num : (num.tryParse('${state[k] ?? ''}') ?? 0);
  final symbol =
      text('optionSymbol') ??
      text('activeSymbol') ??
      text('activeStockSymbol') ??
      text('futureSymbol') ??
      text('symbol') ??
      (s.config['symbol'] is String ? s.config['symbol'] as String : null);
  final qtyRaw = n('positionQty') != 0 ? n('positionQty') : n('qty');
  final triggered = state['entryTriggered'];
  final open =
      state['stateType'] == 'ACTIVE_POSITION' ||
      (n('entryPrice') > 0 && qtyRaw > 0) ||
      triggered == true ||
      (triggered is String && triggered.isNotEmpty);
  if (!open || symbol == null || symbol == 'AUTO' || symbol == 'AUTO_HYBRID') return null;
  final isOption = symbol.endsWith('CE') || symbol.endsWith('PE');
  final short =
      !isOption &&
      (state['entryTriggered'] == 'SHORT' || state['signalSide'] == 'SELL' || state['signalSide'] == 'PUT');
  final qty = (qtyRaw == 0 ? 1 : qtyRaw).abs().toInt();
  final entry = n('entryPrice').toDouble();
  final ltp = n('currentLtp').toDouble();
  return BrokerPosition(
    symbol: symbol,
    qty: short ? -qty : qty,
    avgPrice: entry,
    ltp: ltp > 0 ? ltp : entry,
    pnl: n('pnlRs').toDouble(),
    side: short ? 'SELL' : 'BUY',
    product: s.isPaperTrade ? paperProduct : (s.config['product'] is String ? s.config['product'] as String : 'MIS'),
  );
}

/// Broker rows first; a strategy's row is added only when the broker has no row for that symbol
/// (live strategies' trades already appear at the broker).
List<BrokerPosition> mergeAlgoPositions(List<BrokerPosition> broker, Iterable<BrokerPosition> strategy) {
  final known = broker.map((p) => p.symbol).toSet();
  return [...broker, ...strategy.where((p) => !known.contains(p.symbol))];
}

/// Positions reported by the running strategies (paper trades and engine state).
final strategyPositionsProvider = Provider.autoDispose<List<BrokerPosition>>((ref) {
  final running = (ref.watch(strategiesProvider).value ?? const <StrategyRow>[]).where((s) => s.isActive);
  return [
    for (final s in running)
      if (strategyPosition(s, ref.watch(strategyStatusProvider(s.id)).value?.value.state) case final p?) p,
  ];
});

final _strategySubscriptionProvider = Provider.autoDispose<void>((ref) {
  ref.holdMarketSubscription(ref.watch(strategyPositionsProvider).map(positionKey));
});

/// The dashboard's "Positions" card: broker positions + strategy positions, ticking live.
/// [accountId] is null when no broker is linked (strategy rows only).
final algoPositionsProvider = Provider.autoDispose.family<AsyncValue<List<LivePosition>>, String?>((ref, accountId) {
  ref.watch(_strategySubscriptionProvider);
  final strategyRows = ref.watch(strategyPositionsProvider);
  final AsyncValue<List<LivePosition>> broker =
      accountId == null ? const AsyncData([]) : ref.watch(livePositionsProvider(accountId));
  return broker.whenData((rows) {
    final brokerSymbols = rows.map((r) => r.symbol).toSet();
    return [
      ...rows,
      for (final p in strategyRows)
        if (!brokerSymbols.contains(p.symbol))
          withLiveTick(p, ref.watch(marketSocketProvider.select((s) => s.find(positionKey(p))?.ltp))),
    ];
  });
});
