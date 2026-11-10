import '../../core/utils/format.dart';

/// Label/value rows for the "Trade status" card, from an engine's `state` snapshot
/// (`getState` in emavwap.engine.ts / breakout15min.engine.ts, `snapshot` in
/// stocks-in-play.engine.ts). Unknown or absent fields are skipped, never shown as zero.
List<(String, String)> strategyStateSummary(Map<String, dynamic> state) {
  final items = <(String, String)>[];
  String? text(String key) {
    final v = state[key];
    return v is String && v.isNotEmpty ? v : null;
  }

  num? number(String key) {
    final v = state[key];
    return v is num && v.isFinite ? v : null;
  }

  final symbol = text('optionSymbol') ?? text('futureSymbol') ?? text('activeSymbol') ?? text('symbol');
  if (symbol != null) items.add(('Instrument', symbol));

  final trades = number('tradesToday');
  if (trades != null) {
    final wins = number('winningTradesToday'), losses = number('losingTradesToday');
    final record = wins == null || losses == null ? '' : ' (${wins}W / ${losses}L)';
    items.add(('Trades today', '${formatQty(trades)}$record'));
  }

  final side = text('entryTriggered');
  final entry = number('entryPrice');
  if (side != null && entry != null && entry > 0) {
    items.add(('Position', '$side ${formatQty(number('qty'))}'));
    items.add(('Entry price', formatInr(entry)));
    final ltp = number('currentLtp'), stop = number('stopLossPrice'), target = number('targetPrice');
    if (ltp != null && ltp > 0) items.add(('Last price', formatInr(ltp)));
    if (stop != null && stop > 0) items.add(('Stop loss', formatInr(stop)));
    if (target != null && target > 0) items.add(('Target', formatInr(target)));
    final open = number('pnlRs');
    if (open != null) items.add(('Open P&L', formatInr(open, signed: true)));
  } else {
    items.add(('Position', 'None'));
  }

  // The stock engines can hold more than one position; the first is the one summarised above.
  final positions = state['positions'];
  if (positions is List && positions.length > 1) {
    for (final p in positions.skip(1).whereType<Map<dynamic, dynamic>>()) {
      final pnl = p['pnlRs'];
      final pnlText = pnl is num ? ' · ${formatInr(pnl, signed: true)}' : '';
      items.add(('Also open', '${p['symbol']} ${p['side']} ${p['qty']}$pnlText'));
    }
  }

  final realised = number('dailyRealizedPnlRs') ?? number('realizedTodayRs');
  if (realised != null) items.add(('Realised today', formatInr(realised, signed: true)));

  final candidates = state['candidates'];
  if (candidates is List) {
    final watching = [
      for (final c in candidates.whereType<Map<dynamic, dynamic>>())
        if (c['done'] != true && c['symbol'] is String) '${c['symbol']}${c['side'] is String ? ' ${c['side']}' : ''}',
    ];
    if (watching.isNotEmpty) items.add(('Watching', watching.join(', ')));
  }
  return items;
}

/// The four tiles at the top of a strategy (port of the web's MetricCards).
class StrategyMetrics {
  const StrategyMetrics({
    required this.todayPnl,
    required this.inPosition,
    required this.tradesToday,
    required this.winRate,
    required this.totalTrades,
    required this.statusText,
  });

  /// Null when there is nothing to show yet.
  final double? todayPnl;
  final bool inPosition;
  final int? tradesToday;
  final double? winRate;
  final int totalTrades;
  final String statusText;

  static StrategyMetrics of({
    required bool running,
    required String runStatus,
    Map<String, dynamic>? state,
    int? perfTodayTrades,
    double? perfTodayPnl,
    int totalTrades = 0,
    double winRate = 0,
  }) {
    num? first(List<String> keys) {
      for (final k in keys) {
        final v = state?[k];
        final n = v is num ? v : num.tryParse('${v ?? ''}');
        if (v != null && n != null && n.isFinite) return n;
      }
      return null;
    }

    final triggered = state?['entryTriggered'];
    final inPosition =
        state != null &&
        (state['stateType'] == 'ACTIVE_POSITION' ||
            triggered == true ||
            (triggered is String && triggered.isNotEmpty) ||
            ((first(['entryPrice']) ?? 0) > 0 && (first(['positionQty', 'qty']) ?? 0) > 0));
    // Stored fills are net of charges, so they win; the engine's gross figure covers the gap.
    final stored = (perfTodayTrades ?? 0) > 0 ? perfTodayPnl : null;
    final realised = stored ?? first(['dailyRealizedPnlRs'])?.toDouble();
    final open = inPosition ? (first(['pnlRs'])?.toDouble() ?? 0) : 0.0;
    final hasPnl = realised != null || inPosition;
    final trades = first(['tradesToday', 'tradesTaken', 'tradeCount', 'dailyTradeCount'])?.toInt() ?? perfTodayTrades;
    final statusText =
        runStatus == 'RUNNING'
            ? (inPosition ? 'In position' : (state?['isGoalAchieved'] == true ? 'Target hit' : 'Scanning'))
            : (runStatus == 'COMPLETED' ? 'Completed' : 'Stopped');
    return StrategyMetrics(
      todayPnl: hasPnl ? (realised ?? 0) + open : null,
      inPosition: inPosition,
      tradesToday: trades,
      winRate: totalTrades > 0 ? winRate : null,
      totalTrades: totalTrades,
      statusText: running ? statusText : (runStatus == 'COMPLETED' ? 'Completed' : 'Stopped'),
    );
  }
}
