import 'strategy_form.dart';

/// The web's name for a strategy type ("Intraday Stock Picker", "Stocks-in-Play", ...).
String strategyLabel(String? type) => typeMeta(type).label;

/// Index-option strategies vs intraday stock ones (the web list's Options / Intraday tabs).
bool isOptionsStrategy(String? type) => type == 'BREAKOUT_15MIN' || (type ?? '').contains('OPTIONS');

/// "Stop-loss" cell of a strategy card (web StrategyCard).
String stopLossText(String? type, Map<String, dynamic> cfg) {
  if (type == 'STOCKS_IN_PLAY') return 'Max ₹${cfg['stopLossRs'] ?? 0}/trade';
  if (type == 'BREAKOUT_15MIN') return 'Candle SL';
  if (cfg['exitExactAtTarget'] == true) return 'Fixed ₹${cfg['stopLossRs'] ?? 500}';
  if (type == 'EMA_VWAP_CROSSOVER') return 'Candle low';
  return cfg['stopLossRs'] != null ? '₹${cfg['stopLossRs']}' : 'Dynamic';
}

/// "Target" cell of a strategy card (web StrategyCard).
String targetText(String? type, Map<String, dynamic> cfg) {
  if (type == 'STOCKS_IN_PLAY') return 'Hold to 15:05';
  if (cfg['exitExactAtTarget'] == true) return 'Fixed ₹${cfg['targetRs'] ?? 500}';
  if (type == 'BREAKOUT_15MIN') return '1:2 RR + trail';
  if (type == 'EMA_VWAP_CROSSOVER') {
    return switch (cfg['targetMode']) {
      'PARTIAL' => 'Book half + trail',
      'QUICK' => 'Quick 0.5R + trail',
      'EMA' => '15-EMA trail',
      _ => '0.5x daily ATR',
    };
  }
  return cfg['targetRs'] != null ? '₹${cfg['targetRs']}' : 'Dynamic';
}
