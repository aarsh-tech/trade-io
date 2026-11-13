// Bounds ported from apps/web/src/lib/strategy-config.ts; backend remains authoritative.
class ConfigBound {
  const ConfigBound(this.label, this.min, this.max, this.integer);
  final String label;
  final num min, max;
  final bool integer;
}

const configBounds = <String, ConfigBound>{
  'lots': ConfigBound('Lots', 1, 500, true),
  'qty': ConfigBound('Quantity', 1, 1000000, true),
  'maxTradesPerDay': ConfigBound('Max trades per day', 1, 100, true),
  'maxLossesPerDay': ConfigBound('Max losses per day', 1, 50, true),
  'maxWinsPerDay': ConfigBound('Max wins per day', 1, 50, true),
  'maxConvictionLots': ConfigBound('Max conviction lots', 1, 500, true),
  'maxLots': ConfigBound('Max lots', 1, 500, true),
  'emaPeriod': ConfigBound('EMA period', 2, 500, true),
  'emaFast': ConfigBound('Fast EMA', 2, 500, true),
  'emaSlow': ConfigBound('Slow EMA', 2, 500, true),
  'rsiPeriod': ConfigBound('RSI period', 2, 200, true),
  'stopLossRs': ConfigBound('Stop-loss (₹)', 0.01, 100000000, false),
  'targetRs': ConfigBound('Target (₹)', 0.01, 100000000, false),
  'dailyTargetRs': ConfigBound('Daily target (₹)', 0.01, 100000000, false),
  'dailyMaxLossRs': ConfigBound('Daily max loss (₹)', 0.01, 100000000, false),
  'maxCapital': ConfigBound('Max capital (₹)', 1, 1000000000, false),
  'riskRewardRatio': ConfigBound('Risk:reward ratio', 0.1, 50, false),
  'target1RR': ConfigBound('Target 1 R-multiple', 0.1, 50, false),
  'target2RR': ConfigBound('Target 2 R-multiple', 0.1, 50, false),
  'partialBookingPct': ConfigBound('Partial booking %', 1, 99, false),
  'initialSlPct': ConfigBound('Initial SL %', 1, 99, false),
  'protectionBufferPct': ConfigBound('Protection buffer %', 0, 50, false),
  'minPremium': ConfigBound('Min premium', 0, 1000000, false),
  'maxPremium': ConfigBound('Max premium', 0, 1000000, false),
  'trapSweepBufferPts': ConfigBound('Trap sniper invalidation buffer (pts)', 0.5, 200, false),
  'slBufferPct': ConfigBound('SL buffer %', 0.1, 20, false),
  'minSlBufferRs': ConfigBound('Minimum SL buffer (₹)', 0, 1000, false),
  'partialTargetR': ConfigBound('Partial booking R-multiple', 0.5, 20, false),
  'partialBookFraction': ConfigBound('Partial booking fraction', 0.1, 1, false),
  'maxPositions': ConfigBound('Max positions', 1, 5, true),
  'minRvol': ConfigBound('Volume multiple (RVOL)', 0.5, 100, false),
  'stopAtrFraction': ConfigBound('Stop (x ATR)', 0.05, 1, false),
  'stopPct': ConfigBound('Stop distance (%)', 0.3, 5, false),
  'targetR': ConfigBound('Target (x stop)', 0, 20, false),
  'breakevenAtR': ConfigBound('Stop to entry at (x stop)', 0, 20, false),
  'breakevenLockR': ConfigBound('Profit locked at that step (x stop)', 0, 20, false),
  'skipNearPdlR': ConfigBound("Skip if yesterday's low/high is closer than (x stop)", 0, 10, false),
  'minAvgValueCr': ConfigBound('Min avg daily value (₹ Cr)', 0, 100000, false),
  'minPrice': ConfigBound('Min stock price (₹)', 1, 1000000, false),
  'leverage': ConfigBound('Leverage', 1, 5, false),
  'watchCount': ConfigBound('Stocks watched', 1, 10, true),
  'scanDepth': ConfigBound('Stocks checked per scan', 1, 25, true),
  'maxArmedSetups': ConfigBound('Setups watched at once', 1, 5, true),
  'stagnationMinutes': ConfigBound('Stagnation exit (minutes)', 0, 360, true),
  'maxStopPct': ConfigBound('Max stop-loss distance (%)', 0.85, 5, false),
  'minDayMovePct': ConfigBound('Min move from previous close (%)', 0, 5, false),
  'minVolumeMultiple': ConfigBound('Crossover volume multiple', 0, 10, false),
};
const configTimes = {
  'startTime': 'Start time',
  'endTime': 'End time',
  'primeWindowEndTime': 'Prime window end',
  'middayDeadZoneStart': 'Midday dead-zone start',
  'middayDeadZoneEnd': 'Midday dead-zone end',
  'entryCutoffTime': 'Entry cutoff',
};

/// The strategy types that can be created, with the web wizard's names
/// (STRATEGY_TYPES in apps/web/.../strategies/_components/strategy-types.ts).
const creatableStrategyTypes = <String, String>{
  'EMA_VWAP_CROSSOVER': 'Intraday Stock Picker',
  'STOCKS_IN_PLAY': 'Stocks-in-Play',
  'BREAKOUT_15MIN': '15-Min Breakout',
};

/// The config the web wizard saves for an untouched form of [type]: `buildStrategyConfig`
/// over `createDefaultForm()` plus the type's defaults (apps/web/.../strategies/new/build-config.ts,
/// _components/form-defaults.ts). A strategy created here therefore starts from the same
/// backtested rule set as one created on the web. Keep the three in sync.
Map<String, dynamic> defaultStrategyConfig(String type) => switch (type) {
  'STOCKS_IN_PLAY' => {
    'symbol': 'AUTO',
    'exchange': 'NSE',
    'instrumentType': 'STOCK',
    'product': 'MIS',
    'setup': 'FADE',
    'stopPct': 1.2,
    'fixedStopPct': false,
    'targetR': 3,
    'breakevenAtR': 1,
    'breakevenLockR': 0.2,
    'skipNearPdlR': 0,
    'profitLock': true,
    'fadeLongs': false,
    'stopLossRs': 500,
    'maxPositions': 1,
    'maxTradesPerDay': 1,
    'minRvol': 10,
    'stopAtrFraction': 0.2,
    'minAvgValueCr': 10,
    'minPrice': 50,
    'allowShorts': true,
    'allowLongs': false,
    'leverage': 4,
    'entryCutoffTime': '15:00',
  },
  'BREAKOUT_15MIN' => {
    'symbol': 'NIFTY 50',
    'exchange': 'NSE',
    'instrumentType': 'INDEX',
    // 1 lot of NIFTY (65), as the web wizard computes it.
    'qty': 65,
    'lots': 1,
    'product': 'MIS',
    'stopLossRs': 1000,
    'targetRs': 1500,
    'exitExactAtTarget': false,
    'maxTradesPerDay': 2,
    'enableDynamicAtr': true,
    'riskRewardRatio': 2,
    'enableFakeoutReversal': true,
    'enableVwapFilter': true,
    'enableBreakevenTrail': true,
    'moneyness': 'ITM',
    'useStructuralCandleSl': true,
    'maxOpeningRangePts': 300,
    'primeWindowEndTime': '15:00',
    'enableRsiFilter': true,
    'breakevenTriggerR': 0.7,
    'enableTrapReversal': true,
    'enableRetestConfirmation': true,
    'enableCprFilter': true,
    'cprNarrowThresholdPct': 0.18,
    'trapSlBufferPts': 10,
    'entryTimeframe': '3min',
    'enableEmaVwapTrailing': true,
    'trailingEmaPeriod': 9,
    'trailingVwapSource': 'both',
    'maxLossesPerDay': 1,
    'enableMiddayChopFilter': true,
    'middayDeadZoneStart': '11:45',
    'middayDeadZoneEnd': '13:00',
    'enablePartialBooking': true,
    'partialBookingPct': 50,
    'partialBookingR': 1.8,
    'enableCprSupportResistance': true,
    'minPremium': 100,
    'maxPremium': 300,
  },
  _ => {
    'symbol': 'AUTO',
    'exchange': 'NSE',
    'instrumentType': 'STOCK',
    'emaPeriod': 15,
    'vwapSource': 'close',
    'entryTimeframe': '5min',
    'scanDepth': 20,
    'maxArmedSetups': 1,
    'stagnationMinutes': 0,
    'maxStopPct': 1.2,
    'minDayMovePct': 1.5,
    'profitLock': true,
    'slowTrail': true,
    'isOptionBuyingOnly': false,
    'qty': 1,
    'lots': 1,
    'product': 'MIS',
    'stopLossRs': 500,
    'targetRs': 500,
    'exitExactAtTarget': false,
    'maxTradesPerDay': 2,
    'enableProfitFloor': true,
    'targetMode': 'EMA',
    'enableRvolVolumeFilter': true,
    'enableDynamicVolume': true,
    'minVolumeZ': 1.5,
    'minRvolFloor': 1.5,
    'profitFloorBufferRs': 100,
  },
};

bool _set(dynamic v) => v != null && v != '';
double _number(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? double.nan;
List<String> validateStrategyConfig(String type, Map<String, dynamic> config) {
  final errors = <String>[];
  final required = switch (type) {
    'BREAKOUT_15MIN' || 'EMA_VWAP_CROSSOVER' || 'EMA_RSI_OPTIONS' => ['symbol', 'stopLossRs', 'targetRs'],
    'STOCKS_IN_PLAY' => ['stopLossRs'],
    'DAILY_SCALPER' => ['symbol'],
    _ => <String>[],
  };
  for (final key in required) {
    if (!_set(config[key])) errors.add('$key is required for $type');
  }
  for (final entry in configBounds.entries) {
    final raw = config[entry.key];
    if (!_set(raw)) continue;
    final n = _number(raw), b = entry.value;
    if (!n.isFinite) {
      errors.add('${b.label} must be a number');
    } else if (b.integer && n != n.truncateToDouble()) {
      errors.add('${b.label} must be a whole number');
    } else if (n < b.min || n > b.max) {
      errors.add('${b.label} must be between ${b.min} and ${b.max}');
    }
  }
  void choice(String key, List<String> allowed, String message) {
    if (_set(config[key]) && !allowed.contains('${config[key]}')) errors.add(message);
  }

  choice('product', ['MIS', 'NRML', 'CNC'], 'Product must be one of MIS, NRML, CNC');
  choice('targetMode', ['FULL', 'PARTIAL', 'QUICK', 'EMA'], 'Target mode must be one of FULL, PARTIAL, QUICK, EMA');
  if (type == 'EMA_VWAP_CROSSOVER') choice('entryTimeframe', ['1min', '5min'], 'Entry timeframe must be 1min or 5min');
  if (_set(config['symbol']) && '${config['symbol']}'.trim().isEmpty) errors.add('Symbol must not be blank');
  if (type == 'STOCKS_IN_PLAY') choice('setup', ['ORB', 'FADE', 'TREND', 'OI'], 'Setup must be ORB, FADE, TREND or OI');
  final times = <String, int>{};
  for (final entry in configTimes.entries) {
    if (!_set(config[entry.key])) continue;
    final text = '${config[entry.key]}';
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(text)) {
      errors.add('${entry.value} must be a time as HH:MM (24-hour)');
    } else {
      times[entry.key] = int.parse(text.substring(0, 2)) * 60 + int.parse(text.substring(3));
    }
  }
  void timePair(String lo, String hi, String message) {
    if (times[lo] != null && times[hi] != null && times[lo]! >= times[hi]!) errors.add(message);
  }

  timePair('startTime', 'endTime', 'Start time must be before end time');
  timePair('middayDeadZoneStart', 'middayDeadZoneEnd', 'Midday dead-zone start must be before its end');
  void pair(String lo, String hi, String message, {bool strict = false}) {
    if (_set(config[lo]) &&
        _set(config[hi]) &&
        (strict ? _number(config[lo]) >= _number(config[hi]) : _number(config[lo]) > _number(config[hi]))) {
      errors.add(message);
    }
  }

  pair('minPremium', 'maxPremium', 'Min premium must not exceed max premium');
  pair('minPremiumNifty', 'maxPremiumNifty', 'Min NIFTY premium must not exceed max NIFTY premium');
  pair('minPremiumSensex', 'maxPremiumSensex', 'Min SENSEX premium must not exceed max SENSEX premium');
  pair('target1RR', 'target2RR', 'Target 2 R-multiple must be greater than Target 1', strict: true);
  pair('emaFast', 'emaSlow', 'Fast EMA must be shorter than slow EMA', strict: true);
  pair('rsiEntryMin', 'rsiEntryMax', 'RSI entry minimum must be below the maximum', strict: true);
  return errors;
}

/// Form label for a config key: the bound's label, the time field's label, a known text field,
/// or the camelCase key in sentence case with trading acronyms kept upper case
/// (`vwapSource` -> "VWAP source").
String configLabel(String key) {
  final known = configBounds[key]?.label ?? configTimes[key] ?? _textFieldLabels[key];
  if (known != null) return known;
  final words = key.replaceAllMapped(RegExp('[A-Z]'), (m) => ' ${m[0]}').trim().split(' ');
  final text = [
    for (final (i, w) in words.indexed)
      _acronyms.contains(w.toLowerCase())
          ? w.toUpperCase()
          : i == 0
          ? '${w[0].toUpperCase()}${w.substring(1)}'
          : w.toLowerCase(),
  ].join(' ');
  return text;
}

const _acronyms = {'ema', 'vwap', 'rsi', 'sl', 'atr', 'orb', 'pdl', 'pdh', 'rr', 'oi', 'ltp', 'id'};

const _textFieldLabels = {
  'symbol': 'Symbol',
  'exchange': 'Exchange',
  'instrumentType': 'Instrument type',
  'vwapSource': 'VWAP source',
  'product': 'Product',
  'targetMode': 'Target mode',
  'entryTimeframe': 'Entry timeframe',
  'setup': 'Setup',
};
