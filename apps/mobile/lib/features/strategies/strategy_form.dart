/// The strategy wizard's form and its rules, ported from the web so a strategy created or edited
/// on the phone saves exactly the same config as on the web:
///   createDefaultForm / strategyToForm  ← apps/web/.../strategies/_components/form-defaults.ts
///   buildStrategyConfig                 ← apps/web/.../strategies/new/build-config.ts
///   strategyTypes / presets / estimateRisk ← apps/web/.../strategies/_components/strategy-types.ts
///   lotSizeFor                          ← getLotSize in apps/web/.../strategies/new/types.ts
/// Field names are the web's StrategyFormState keys; values are Strings and bools like the web form.
library;

typedef StrategyForm = Map<String, Object?>;

/// Every field the wizard can edit, with the values a brand-new strategy starts from.
StrategyForm createDefaultForm() => {
  'name': '',
  'type': '',
  'symbol': 'NIFTY 50',
  'exchange': 'NSE',
  'instrumentType': 'INDEX',
  'lots': '1',
  'product': 'MIS',
  'stopLossRs': '500',
  'targetRs': '500',
  'exitExactAtTarget': false,
  'targetMode': 'EMA',
  'stagnationMinutes': '0',
  'maxStopPct': '1.2',
  'minDayMovePct': '1.5',
  'profitLock': true,
  'slowTrail': true,
  'volumeFilter': true,
  'volumeStrictness': 'BALANCED',
  'maxTradesPerDay': '2',
  'minPremium': '100',
  'maxPremium': '300',
  'enableProfitFloor': true,
  'profitFloorBufferRs': '100',
  'emaPeriod': '15',
  'vwapSource': 'close',
  'entryTimeframe': '5min',
  'scanDepth': '20',
  'maxArmedSetups': '1',
  'isOptionBuyingOnly': true,
  'sipSetup': 'FADE',
  'sipWatchCount': '1',
  'sipWithGapOnly': true,
  'sipStopPct': '1.2',
  'sipFixedStopPct': false,
  'sipTargetR': '3',
  'sipBreakevenAtR': '1',
  'sipBreakevenLockR': '0.2',
  'sipSkipNearPdlR': '0',
  'sipProfitLock': true,
  'sipFadeLongs': false,
  'sipMinRvol': '10',
  'sipStopAtr': '0.2',
  'sipMinAvgValueCr': '10',
  'sipAllowLongs': false,
  'sipLeverage': '4',
  'sipEntryCutoffTime': '15:00',
  'emaFast': '9',
  'emaSlow': '21',
  'rsiPeriod': '14',
  'rsiEntryMin': '45',
  'rsiEntryMax': '65',
  'optionLots': '1',
  'targetPct': '45',
  'slPct': '25',
  'startAfterMin': '25',
  'b15EnableDynamicAtr': true,
  'b15RiskRewardRatio': '2.0',
  'b15EnableFakeoutReversal': true,
  'b15EnableVwapFilter': true,
  'b15EnableBreakevenTrail': true,
  'b15Moneyness': 'ITM',
  'b15UseStructuralCandleSl': true,
  'b15MaxOpeningRangePts': '300',
  'b15PrimeWindowEndTime': '15:00',
  'b15EnableRsiFilter': true,
  'b15BreakevenTriggerR': '0.7',
  'b15EnableTrapReversal': true,
  'b15EnableRetestConfirmation': true,
  'b15EnableCprFilter': true,
  'b15CprNarrowThresholdPct': '0.18',
  'b15TrapSlBufferPts': '10',
  'b15EntryTimeframe': '3min',
  'b15EnableEmaVwapTrailing': true,
  'b15TrailingEmaPeriod': '9',
  'b15TrailingVwapSource': 'both',
  'b15MaxLossesPerDay': '1',
  'b15EnableMiddayChopFilter': true,
  'b15MiddayDeadZoneStart': '11:45',
  'b15MiddayDeadZoneEnd': '13:00',
  'b15EnablePartialBooking': true,
  'b15PartialBookingPct': '50',
  'b15PartialBookingR': '1.8',
  'b15EnableCprSupportResistance': true,
  'brokerAccountId': '',
  'isPaperTrade': true,
  'lotSize': null,
};

// ─── Small helpers with the JS semantics the web code relies on ──────────────────────────────

/// `Number(v)`: '' → 0, unparsable → NaN.
double _jsNumber(Object? v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  final s = '$v'.trim();
  if (s.isEmpty) return 0;
  return double.tryParse(s) ?? double.nan;
}

/// A JSON number as the web would send it: whole numbers without ".0".
num _out(double v) => v.isFinite && v == v.truncateToDouble() ? v.toInt() : v;

/// `Number(v || d)`: falsy ('' / null) takes the default.
num _numOr(Object? v, num d) => (v == null || v == '') ? d : _out(_jsNumber(v));

/// A config value back in the form's text, `String(v)` with whole doubles kept as integers.
String _text(Object? v) => v is double && v == v.truncateToDouble() && v.isFinite ? '${v.toInt()}' : '$v';

bool _has(Object? v) => v != null && v != '';
String _str(Object? v, String d) => _has(v) ? _text(v) : d;
bool _bool(Object? v, bool d) => v == null ? d : (v != false && v != 0 && v != '');

String s(StrategyForm f, String k) => f[k] is String ? f[k]! as String : (f[k] == null ? '' : _text(f[k]));
bool b(StrategyForm f, String k) => f[k] == true;

// ─── Lot sizes ────────────────────────────────────────────────────────────────────────────────

const _lotSizes = {'NIFTY': 65, 'BANKNIFTY': 30, 'SENSEX': 20, 'FINNIFTY': 60, 'MIDCPNIFTY': 120};

/// The instrument's lot size: the broker's when known, else the index defaults, else 1.
int lotSizeFor(String symbol, [int? dynamicLot]) {
  if (dynamicLot != null && dynamicLot > 0) return dynamicLot;
  final sym = symbol.toUpperCase().trim();
  if (sym.contains('HYBRID')) return 65;
  if (sym.contains('BANKNIFTY')) return 30;
  if (sym.contains('NIFTY')) return 65;
  if (sym.contains('SENSEX')) return 20;
  if (sym.contains('FINNIFTY')) return 60;
  if (sym.contains('MIDCPNIFTY')) return 120;
  return _lotSizes[sym] ?? 1;
}

int formLotSize(StrategyForm f) => lotSizeFor(s(f, 'symbol'), f['lotSize'] is int ? f['lotSize']! as int : null);

bool isAutoSymbol(StrategyForm f) => s(f, 'symbol') == 'AUTO' || s(f, 'symbol') == 'AUTO_HYBRID';

// ─── Form → config ────────────────────────────────────────────────────────────────────────────

/// Turns the form into the JSON config object the engines and the API expect.
Map<String, dynamic> buildStrategyConfig(StrategyForm f) {
  final type = s(f, 'type');
  final qty = _out((_jsNumber(_has(f['lots']) ? f['lots'] : 1)) * formLotSize(f));

  if (type == 'STOCKS_IN_PLAY') {
    final setup = s(f, 'sipSetup');
    final fade = setup == 'FADE', trend = setup == 'TREND', oi = setup == 'OI';
    // "0" is a real choice (no target / no breakeven); only a blank field takes the default.
    num orZero(String k, num d) {
      final v = s(f, k);
      final n = _jsNumber(v);
      return v == '' || !(n >= 0) ? d : _out(n);
    }

    final positions = oi ? 1 : _numOr(f['maxTradesPerDay'], fade || trend ? 1 : 2);
    return {
      'symbol': 'AUTO',
      'exchange': 'NSE',
      'instrumentType': 'STOCK',
      'product': 'MIS',
      'setup': fade ? 'FADE' : (trend ? 'TREND' : (oi ? 'OI' : 'ORB')),
      if (trend) ...{'watchCount': _numOr(f['sipWatchCount'], 1), 'withGapOnly': f['sipWithGapOnly'] != false},
      if (fade) ...{
        'stopPct': _numOr(f['sipStopPct'], 1.2),
        'fixedStopPct': f['sipFixedStopPct'] == true,
        'targetR': orZero('sipTargetR', 3),
        'breakevenAtR': orZero('sipBreakevenAtR', 1),
        'breakevenLockR': orZero('sipBreakevenLockR', 0.2),
        'skipNearPdlR': orZero('sipSkipNearPdlR', 0),
        'profitLock': f['sipProfitLock'] != false,
        'fadeLongs': f['sipFadeLongs'] == true,
      },
      if (oi) ...{'stopPct': _numOr(f['sipStopPct'], 1), 'targetR': orZero('sipTargetR', 3)},
      'stopLossRs': _out(_jsNumber(f['stopLossRs'])),
      'maxPositions': positions,
      'maxTradesPerDay': positions,
      'minRvol': _numOr(f['sipMinRvol'], 10),
      'stopAtrFraction': _numOr(f['sipStopAtr'], 0.2),
      'minAvgValueCr': _numOr(f['sipMinAvgValueCr'], fade || trend ? 10 : 25),
      'minPrice': 50,
      'allowShorts': true,
      'allowLongs': trend || (!fade && !oi && f['sipAllowLongs'] == true),
      'leverage': _numOr(f['sipLeverage'], 4),
      'entryCutoffTime': _has(f['sipEntryCutoffTime']) ? s(f, 'sipEntryCutoffTime') : '15:00',
    };
  }

  if (type == 'BREAKOUT_15MIN') {
    final it = s(f, 'instrumentType');
    String t(String k, String d) => _has(f[k]) ? s(f, k) : d;
    return {
      'symbol': s(f, 'symbol').trim(),
      'exchange': s(f, 'exchange'),
      'instrumentType': it,
      'qty': qty,
      'lots': _out(_jsNumber(f['lots'])),
      'product': s(f, 'product'),
      'stopLossRs': _out(_jsNumber(f['stopLossRs'])),
      'targetRs': _out(_jsNumber(f['targetRs'])),
      'exitExactAtTarget': f['exitExactAtTarget'] == true,
      'maxTradesPerDay': _out(_jsNumber(f['maxTradesPerDay'])),
      'enableDynamicAtr': b(f, 'b15EnableDynamicAtr'),
      'riskRewardRatio': _out(_jsNumber(f['b15RiskRewardRatio'])),
      'enableFakeoutReversal': b(f, 'b15EnableFakeoutReversal'),
      'enableVwapFilter': b(f, 'b15EnableVwapFilter'),
      'enableBreakevenTrail': b(f, 'b15EnableBreakevenTrail'),
      'moneyness': s(f, 'b15Moneyness'),
      'useStructuralCandleSl': b(f, 'b15UseStructuralCandleSl'),
      'maxOpeningRangePts': _numOr(f['b15MaxOpeningRangePts'], 300),
      'primeWindowEndTime': t('b15PrimeWindowEndTime', '15:00'),
      'enableRsiFilter': b(f, 'b15EnableRsiFilter'),
      'breakevenTriggerR': _numOr(f['b15BreakevenTriggerR'], 0.7),
      'enableTrapReversal': b(f, 'b15EnableTrapReversal'),
      'enableRetestConfirmation': b(f, 'b15EnableRetestConfirmation'),
      'enableCprFilter': b(f, 'b15EnableCprFilter'),
      'cprNarrowThresholdPct': _numOr(f['b15CprNarrowThresholdPct'], 0.18),
      'trapSlBufferPts': _numOr(f['b15TrapSlBufferPts'], 10),
      'entryTimeframe': t('b15EntryTimeframe', '3min'),
      'enableEmaVwapTrailing': b(f, 'b15EnableEmaVwapTrailing'),
      'trailingEmaPeriod': _numOr(f['b15TrailingEmaPeriod'], 9),
      'trailingVwapSource': t('b15TrailingVwapSource', 'both'),
      'maxLossesPerDay': _numOr(f['b15MaxLossesPerDay'], 1),
      'enableMiddayChopFilter': b(f, 'b15EnableMiddayChopFilter'),
      'middayDeadZoneStart': t('b15MiddayDeadZoneStart', '11:45'),
      'middayDeadZoneEnd': t('b15MiddayDeadZoneEnd', '13:00'),
      'enablePartialBooking': b(f, 'b15EnablePartialBooking'),
      'partialBookingPct': _numOr(f['b15PartialBookingPct'], 50),
      'partialBookingR': _numOr(f['b15PartialBookingR'], 1.8),
      'enableCprSupportResistance': b(f, 'b15EnableCprSupportResistance'),
      if (it == 'INDEX' || it == 'OPTION') ...{
        'minPremium': _out(_jsNumber(f['minPremium'])),
        'maxPremium': _out(_jsNumber(f['maxPremium'])),
      },
    };
  }

  // EMA-VWAP crossover trades stocks only; the option switch still applies to legacy types.
  final optionMode = type != 'EMA_VWAP_CROSSOVER' && b(f, 'isOptionBuyingOnly');
  final strictness = s(f, 'volumeStrictness');
  return {
    'symbol': s(f, 'symbol').trim(),
    'exchange': s(f, 'exchange'),
    'instrumentType': s(f, 'instrumentType'),
    'emaPeriod': _out(_jsNumber(f['emaPeriod'])),
    'vwapSource': _has(f['vwapSource']) ? s(f, 'vwapSource') : 'close',
    'entryTimeframe': !optionMode && s(f, 'entryTimeframe') == '1min' ? '1min' : '5min',
    if (type == 'EMA_VWAP_CROSSOVER') ...{
      'scanDepth': _numOr(f['scanDepth'], 20),
      'maxArmedSetups': _numOr(f['maxArmedSetups'], 1),
      'stagnationMinutes': _numOr(f['stagnationMinutes'], 0),
      'maxStopPct': _numOr(f['maxStopPct'], 1.2),
      // `??` in the web: only a missing value takes the default; '' is Number('') = 0.
      'minDayMovePct': f['minDayMovePct'] == null ? 1.5 : _out(_jsNumber(f['minDayMovePct'])),
      'profitLock': f['profitLock'] != false,
      'slowTrail': f['slowTrail'] != false,
    },
    'isOptionBuyingOnly': optionMode,
    'qty': qty,
    'lots': _out(_jsNumber(f['lots'])),
    'product': s(f, 'product'),
    'stopLossRs': _out(_jsNumber(f['stopLossRs'])),
    'targetRs': _out(_jsNumber(f['targetRs'])),
    'exitExactAtTarget': f['exitExactAtTarget'] == true,
    'maxTradesPerDay': _out(_jsNumber(f['maxTradesPerDay'])),
    'enableProfitFloor': b(f, 'enableProfitFloor'),
    'targetMode': type == 'EMA_VWAP_CROSSOVER' ? (_has(f['targetMode']) ? s(f, 'targetMode') : 'EMA') : 'FULL',
    'enableRvolVolumeFilter': f['volumeFilter'] != false,
    'enableDynamicVolume': true,
    'minVolumeZ': strictness == 'STRICT' ? 2 : (strictness == 'RELAXED' ? 1 : 1.5),
    'minRvolFloor': 1.5,
    'profitFloorBufferRs': _numOr(f['profitFloorBufferRs'], 100),
    if (optionMode) ...{'minPremium': _out(_jsNumber(f['minPremium'])), 'maxPremium': _out(_jsNumber(f['maxPremium']))},
  };
}

/// Edit: the saved config merged with the form's (keys the wizard doesn't manage survive), with
/// qty / lotSize recomputed when either side carries them (web edit page `handleSubmit`).
Map<String, dynamic> mergeEditedConfig(Map<String, dynamic> saved, StrategyForm f) {
  final built = buildStrategyConfig(f);
  final merged = {...saved, ...built};
  final lot = formLotSize(f);
  if (saved.containsKey('qty') || built.containsKey('qty')) merged['qty'] = _out(_jsNumber(f['lots']) * lot);
  if (saved.containsKey('lotSize') || built.containsKey('lotSize')) merged['lotSize'] = lot;
  return merged;
}

// ─── Config → form (edit) ─────────────────────────────────────────────────────────────────────

/// Inverse of [buildStrategyConfig]: a saved strategy back into the form. Anything the saved
/// config does not mention keeps the create-time default.
StrategyForm strategyToForm({
  required String name,
  required String type,
  required Map<String, dynamic> config,
  String? brokerAccountId,
  bool isPaperTrade = true,
}) {
  final c = config;
  final base = createDefaultForm();
  final savedLot = _jsNumber(c['lotSize']);
  final lotSize = savedLot > 0 ? savedLot.toInt() : lotSizeFor('${c['symbol'] ?? ''}');
  final lots =
      _has(c['lots'])
          ? _text(c['lots'])
          : (_has(c['qty']) && lotSize > 0
              ? '${(_jsNumber(c['qty']) / lotSize).round() < 1 ? 1 : (_jsNumber(c['qty']) / lotSize).round()}'
              : '1');
  String bs(String k) => base[k]! as String;
  final setup = c['setup'];
  final z = _jsNumber(c['minVolumeZ']);
  final sip = type == 'STOCKS_IN_PLAY';
  final classicSetup = setup != 'FADE' && setup != 'TREND' && setup != 'OI';
  return {
    ...base,
    'name': name,
    'type': type,
    'symbol': _str(c['symbol'], bs('symbol')),
    'exchange': _str(c['exchange'], c['symbol'] == 'SENSEX' ? 'BFO' : bs('exchange')),
    'instrumentType': _has(c['instrumentType']) ? _text(c['instrumentType']) : bs('instrumentType'),
    'lots': lots,
    'lotSize': savedLot > 0 ? savedLot.toInt() : null,
    'product': _has(c['product']) ? _text(c['product']) : bs('product'),
    'stopLossRs': _str(c['stopLossRs'], bs('stopLossRs')),
    'targetRs': _str(c['targetRs'], bs('targetRs')),
    'exitExactAtTarget': c['exitExactAtTarget'] == true,
    'targetMode':
        const ['PARTIAL', 'QUICK', 'EMA', 'FULL'].contains(c['targetMode']) ? c['targetMode'] : bs('targetMode'),
    'stagnationMinutes': _str(c['stagnationMinutes'], bs('stagnationMinutes')),
    'maxStopPct': _str(c['maxStopPct'], bs('maxStopPct')),
    'minDayMovePct': _str(c['minDayMovePct'], bs('minDayMovePct')),
    'profitLock': c['profitLock'] != false,
    'slowTrail': c['slowTrail'] != false,
    'volumeFilter': c['enableRvolVolumeFilter'] != false,
    'volumeStrictness': z >= 2 ? 'STRICT' : (z > 0 && z <= 1.1 ? 'RELAXED' : 'BALANCED'),
    'maxTradesPerDay':
        sip ? _str(c['maxPositions'], bs('maxTradesPerDay')) : _str(c['maxTradesPerDay'], bs('maxTradesPerDay')),
    'minPremium': _str(c['minPremium'], bs('minPremium')),
    'maxPremium': _str(c['maxPremium'], bs('maxPremium')),
    'enableProfitFloor': _bool(c['enableProfitFloor'], true),
    'profitFloorBufferRs': _str(c['profitFloorBufferRs'], bs('profitFloorBufferRs')),
    'emaPeriod': _str(c['emaPeriod'], bs('emaPeriod')),
    'vwapSource': c['vwapSource'] == 'hlc3' ? 'hlc3' : 'close',
    'entryTimeframe': type == 'EMA_VWAP_CROSSOVER' && c['entryTimeframe'] == '1min' ? '1min' : '5min',
    'scanDepth': _str(c['scanDepth'], bs('scanDepth')),
    'maxArmedSetups': _str(c['maxArmedSetups'], bs('maxArmedSetups')),
    'isOptionBuyingOnly': _bool(c['isOptionBuyingOnly'], true),
    'startAfterMin': _str(c['startAfterMin'], bs('startAfterMin')),
    // A saved Stocks-in-Play strategy without a setup is the original ORB one.
    'sipSetup': !classicSetup ? setup : (sip ? 'ORB' : bs('sipSetup')),
    'sipWatchCount': _str(c['watchCount'], bs('sipWatchCount')),
    'sipWithGapOnly': c['withGapOnly'] != false,
    'sipStopPct': _str(c['stopPct'], setup == 'OI' ? '1' : bs('sipStopPct')),
    'sipFixedStopPct': c['fixedStopPct'] == true,
    'sipTargetR': _str(c['targetR'], bs('sipTargetR')),
    'sipBreakevenAtR': _str(c['breakevenAtR'], bs('sipBreakevenAtR')),
    'sipBreakevenLockR': _str(c['breakevenLockR'], bs('sipBreakevenLockR')),
    'sipSkipNearPdlR': _str(c['skipNearPdlR'], bs('sipSkipNearPdlR')),
    'sipProfitLock': c['profitLock'] != false,
    'sipFadeLongs': c['fadeLongs'] == true,
    'sipMinRvol': _str(c['minRvol'], bs('sipMinRvol')),
    'sipStopAtr': _str(c['stopAtrFraction'], bs('sipStopAtr')),
    'sipMinAvgValueCr': _str(c['minAvgValueCr'], sip && classicSetup ? '25' : bs('sipMinAvgValueCr')),
    'sipAllowLongs': c['allowLongs'] == true,
    'sipLeverage': _str(c['leverage'], bs('sipLeverage')),
    'sipEntryCutoffTime': _str(c['entryCutoffTime'], bs('sipEntryCutoffTime')),
    'b15EnableDynamicAtr': _bool(c['enableDynamicAtr'], true),
    'b15RiskRewardRatio': _str(c['riskRewardRatio'], bs('b15RiskRewardRatio')),
    'b15EnableFakeoutReversal': _bool(c['enableFakeoutReversal'], true),
    'b15EnableVwapFilter': _bool(c['enableVwapFilter'], true),
    'b15EnableBreakevenTrail': _bool(c['enableBreakevenTrail'], true),
    'b15Moneyness': c['moneyness'] == 'ATM' ? 'ATM' : 'ITM',
    'b15UseStructuralCandleSl': _bool(c['useStructuralCandleSl'], true),
    'b15MaxOpeningRangePts': _str(c['maxOpeningRangePts'], bs('b15MaxOpeningRangePts')),
    'b15PrimeWindowEndTime': _str(c['primeWindowEndTime'], bs('b15PrimeWindowEndTime')),
    'b15EnableRsiFilter': _bool(c['enableRsiFilter'], true),
    'b15BreakevenTriggerR': _str(c['breakevenTriggerR'], bs('b15BreakevenTriggerR')),
    'b15EnableTrapReversal': _bool(c['enableTrapReversal'], true),
    'b15EnableRetestConfirmation': _bool(c['enableRetestConfirmation'], true),
    'b15EnableCprFilter': _bool(c['enableCprFilter'], true),
    'b15CprNarrowThresholdPct': _str(c['cprNarrowThresholdPct'], bs('b15CprNarrowThresholdPct')),
    'b15TrapSlBufferPts': _str(c['trapSlBufferPts'], bs('b15TrapSlBufferPts')),
    'b15EntryTimeframe': _has(c['entryTimeframe']) ? _text(c['entryTimeframe']) : bs('b15EntryTimeframe'),
    'b15EnableEmaVwapTrailing': _bool(c['enableEmaVwapTrailing'], true),
    'b15TrailingEmaPeriod': _str(c['trailingEmaPeriod'], bs('b15TrailingEmaPeriod')),
    'b15TrailingVwapSource':
        _has(c['trailingVwapSource']) ? _text(c['trailingVwapSource']) : bs('b15TrailingVwapSource'),
    'b15MaxLossesPerDay': _str(c['maxLossesPerDay'], bs('b15MaxLossesPerDay')),
    'b15EnableMiddayChopFilter': _bool(c['enableMiddayChopFilter'], true),
    'b15MiddayDeadZoneStart': _str(c['middayDeadZoneStart'], bs('b15MiddayDeadZoneStart')),
    'b15MiddayDeadZoneEnd': _str(c['middayDeadZoneEnd'], bs('b15MiddayDeadZoneEnd')),
    'b15EnablePartialBooking': _bool(c['enablePartialBooking'], true),
    'b15PartialBookingPct': _str(c['partialBookingPct'], bs('b15PartialBookingPct')),
    'b15PartialBookingR': _str(c['partialBookingR'], bs('b15PartialBookingR')),
    'b15EnableCprSupportResistance': _bool(c['enableCprSupportResistance'], true),
    'brokerAccountId': brokerAccountId ?? '',
    'isPaperTrade': isPaperTrade,
  };
}

// ─── Strategy types ───────────────────────────────────────────────────────────────────────────

enum RiskLevel { low, medium, high }

extension RiskLevelLabel on RiskLevel {
  String get label => switch (this) {
    RiskLevel.low => 'Low',
    RiskLevel.medium => 'Medium',
    RiskLevel.high => 'High',
  };
}

class StrategyTypeMeta {
  const StrategyTypeMeta({
    required this.type,
    required this.label,
    required this.tagline,
    required this.risk,
    required this.riskNote,
    required this.instrument,
    required this.bestFor,
    required this.timing,
    required this.defaultName,
    required this.defaults,
  });

  final String type;
  final String label;
  final String tagline;
  final RiskLevel risk;
  final String riskNote;
  final String instrument;
  final String bestFor;
  final String timing;
  final String defaultName;
  final StrategyForm defaults;
}

const strategyTypes = [
  StrategyTypeMeta(
    type: 'EMA_VWAP_CROSSOVER',
    label: 'Intraday Stock Picker',
    tagline:
        "Picks the day's strongest F&O stock and trades it on EMA + VWAP confirmation with a fixed rupee stop-loss and target.",
    risk: RiskLevel.medium,
    riskNote: 'Loss per trade is capped at your stop-loss amount.',
    instrument: 'Stocks (intraday, MIS)',
    bestFor: 'Simple, fixed-risk daily trades',
    timing: 'From 09:15',
    defaultName: 'Intraday Stock Picker',
    defaults: {
      'symbol': 'AUTO',
      'exchange': 'NSE',
      'instrumentType': 'STOCK',
      'product': 'MIS',
      'targetRs': '500',
      'stopLossRs': '500',
      'maxTradesPerDay': '2',
    },
  ),
  StrategyTypeMeta(
    type: 'STOCKS_IN_PLAY',
    label: 'Stocks-in-Play',
    tagline:
        'At 09:20 finds the stocks trading 10x their usual opening volume. In-play Fade (default) shorts a gap-up one when MFI, Stochastic, Bollinger or CMF turns down by 09:45, with a fixed stop and target; Opening-range break shorts the break of its first candle.',
    risk: RiskLevel.high,
    riskNote:
        'Short selling with runs of losing days; about 4 in 10 fade trades win and the winners are larger. Losing weeks are normal.',
    instrument: 'Stocks (intraday, MIS, short selling)',
    bestFor: 'News and results days, with fixed rupee risk per trade',
    timing: 'Fade: 09:20 to 09:45 entries; ORB: until 15:00. Square-off 15:05',
    defaultName: 'In-play Fade',
    defaults: {
      'symbol': 'AUTO',
      'exchange': 'NSE',
      'instrumentType': 'STOCK',
      'product': 'MIS',
      'stopLossRs': '500',
      'maxTradesPerDay': '1',
    },
  ),
  StrategyTypeMeta(
    type: 'BREAKOUT_15MIN',
    label: '15-Min Breakout',
    tagline: 'Trades the break of the first 15-minute range, and reverses when a breakout turns out to be a trap.',
    risk: RiskLevel.medium,
    riskNote: 'Stops for the day after the loss limit you set (1 by default).',
    instrument: 'Index options (NIFTY, BANKNIFTY)',
    bestFor: 'Trending mornings, disciplined loss limits',
    timing: 'From 09:30',
    defaultName: '15-Min Breakout',
    defaults: {
      'symbol': 'NIFTY 50',
      'exchange': 'NSE',
      'instrumentType': 'INDEX',
      'product': 'MIS',
      'lots': '1',
      'targetRs': '1500',
      'stopLossRs': '1000',
      'maxTradesPerDay': '2',
    },
  ),
];

StrategyTypeMeta typeMeta(String? type) {
  for (final t in strategyTypes) {
    if (t.type == type) return t;
  }
  final label =
      (type == null || type.isEmpty)
          ? 'Strategy'
          : () {
            final words = type.replaceAll('_', ' ').toLowerCase();
            return '${words[0].toUpperCase()}${words.substring(1)}';
          }();
  return StrategyTypeMeta(
    type: type ?? '',
    label: label,
    tagline: 'Custom strategy configuration.',
    risk: RiskLevel.medium,
    riskNote: '',
    instrument: 'Varies',
    bestFor: '',
    timing: '',
    defaultName: '',
    defaults: const {},
  );
}

/// Picking a type on create: that type's defaults over a fresh form, keeping a name the user
/// typed (not an auto name), the broker and the paper/live choice.
StrategyForm withType(StrategyForm f, String type) {
  final meta = typeMeta(type);
  final autoNames = strategyTypes.map((t) => t.defaultName);
  final name = s(f, 'name');
  return {
    ...createDefaultForm(),
    ...meta.defaults,
    'type': type,
    'name': name.trim().isNotEmpty && !autoNames.contains(name) ? name : meta.defaultName,
    'brokerAccountId': f['brokerAccountId'],
    'isPaperTrade': f['isPaperTrade'],
  };
}

// ─── Presets ──────────────────────────────────────────────────────────────────────────────────

const presetLevels = ['Conservative', 'Balanced', 'Aggressive'];

const presetHints = {
  'Conservative': 'Smaller losses, fewer trades',
  'Balanced': 'Recommended starting point',
  'Aggressive': 'Bigger swings, more trades',
};

const _stockPickerPresets = {
  'Conservative': {'stopLossRs': '300', 'targetRs': '300', 'maxTradesPerDay': '1'},
  'Balanced': {'stopLossRs': '500', 'targetRs': '500', 'maxTradesPerDay': '2'},
  'Aggressive': {'stopLossRs': '800', 'targetRs': '1200', 'maxTradesPerDay': '3'},
};

const _presets = <String, Map<String, Map<String, String>>>{
  'BREAKOUT_15MIN': {
    'Conservative': {'stopLossRs': '500', 'targetRs': '1000', 'maxTradesPerDay': '1', 'b15MaxLossesPerDay': '1'},
    'Balanced': {'stopLossRs': '1000', 'targetRs': '1500', 'maxTradesPerDay': '2', 'b15MaxLossesPerDay': '1'},
    'Aggressive': {'stopLossRs': '1500', 'targetRs': '3000', 'maxTradesPerDay': '3', 'b15MaxLossesPerDay': '2'},
  },
  'EMA_VWAP_CROSSOVER': _stockPickerPresets,
  'EMA_RSI_OPTIONS': _stockPickerPresets,
  'STOCKS_IN_PLAY': {
    'Conservative': {'stopLossRs': '250', 'maxTradesPerDay': '1'},
    'Balanced': {'stopLossRs': '400', 'maxTradesPerDay': '2'},
    'Aggressive': {'stopLossRs': '600', 'maxTradesPerDay': '3'},
  },
};

Map<String, Map<String, String>>? presetsFor(String type) => _presets[type];

/// The preset the form matches exactly, or null when it has been customised.
String? activePreset(StrategyForm f) {
  final presets = presetsFor(s(f, 'type'));
  if (presets == null) return null;
  for (final level in presetLevels) {
    if (presets[level]!.entries.every((e) => s(f, e.key) == e.value)) return level;
  }
  return null;
}

// ─── Risk estimate ────────────────────────────────────────────────────────────────────────────

class RiskEstimate {
  const RiskEstimate({this.perTrade, this.perDay, this.targetPerTrade, required this.basis});
  final double? perTrade;
  final double? perDay;
  final double? targetPerTrade;
  final String basis;
}

double _n(Object? v) {
  final x = _jsNumber(v);
  return x.isFinite ? x : 0;
}

String _fmt(Object? v) => _text(v);

RiskEstimate estimateRisk(StrategyForm f) {
  final trades = _n(f['maxTradesPerDay']).floor().clamp(0, 1 << 30);
  final perTrade = _n(f['stopLossRs']);
  double? orNull(double v) => v == 0 ? null : v;
  switch (s(f, 'type')) {
    case 'STOCKS_IN_PLAY':
      final lev = _has(f['sipLeverage']) ? _fmt(f['sipLeverage']) : '4';
      switch (s(f, 'sipSetup')) {
        case 'FADE':
          final tr = _n(f['sipTargetR']);
          final beAt = _n(f['sipBreakevenAtR']), beLock = _n(f['sipBreakevenLockR']);
          final stop = _has(f['sipStopPct']) ? _fmt(f['sipStopPct']) : '1.2';
          final fixed = f['sipFixedStopPct'] == true;
          final stopText = fixed
              ? '$stop% from the entry'
              : "0.8–1.5% past the day's high for a short, or low for a long; the buffer is set by each stock's ATR";
          final tgtText = fixed
              ? '${_fmt(f['sipTargetR'])}x the stop'
              : '${_fmt(f['sipTargetR'])}x $stop% (${(tr * (double.tryParse(stop) ?? 1.2)).toStringAsFixed(1)}% from the entry)';
          return RiskEstimate(
            perTrade: orNull(perTrade),
            perDay: orNull(perTrade * trades),
            // Structural stop: the target is a fixed % while the stop distance varies, so the ₹ target is not known in advance.
            targetPerTrade: perTrade > 0 && tr > 0 && fixed ? perTrade * tr : null,
            basis:
                "Shares are sized so the stop ($stopText) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${lev}x). A jump through the stop can lose a little more. Target ${tr > 0 ? tgtText : 'off'}"
                "${beAt > 0 ? '; the stop moves to ${beLock > 0 ? 'entry +${_fmt(f['sipBreakevenLockR'])}x' : 'the entry'} at +${_fmt(f['sipBreakevenAtR'])}x' : ''}"
                "${f['sipProfitLock'] != false ? ', then locks +0.5x at +1.5x and +1.5x at +2.5x' : ''}; otherwise 15:05.",
          );
        case 'OI':
          final tr = _n(f['sipTargetR']);
          final stop = _has(f['sipStopPct']) ? _fmt(f['sipStopPct']) : '1';
          return RiskEstimate(
            perTrade: orNull(perTrade),
            perDay: orNull(perTrade),
            targetPerTrade: perTrade > 0 && tr > 0 ? perTrade * tr : null,
            basis:
                "Shares are sized on yesterday's close so the stop ($stop% from the auction fill) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${lev}x). A jump through the stop can lose a little more. Target ${tr > 0 ? '${_fmt(f['sipTargetR'])}x the stop' : 'off'}; otherwise 15:05. 1 trade a day.",
          );
        case 'TREND':
          return RiskEstimate(
            perTrade: orNull(perTrade),
            perDay: orNull(perTrade * trades),
            basis:
                "Shares are sized so the stop at the day low (long) or high (short) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${lev}x); a far stop means fewer shares. A jump through the stop can lose a little more. No target: the trade rides until the 15-EMA crosses back over the 40-EMA, else 15:05.",
          );
        default:
          final atr = _has(f['sipStopAtr']) ? _fmt(f['sipStopAtr']) : '0.2';
          return RiskEstimate(
            perTrade: orNull(perTrade),
            perDay: orNull(perTrade * trades),
            basis:
                "Shares are sized so the stop ($atr x the stock's daily ATR) loses at most your max loss, and your free Zerodha funds allow at Zerodha's leverage for the stock (fallback ${lev}x, split over ${trades == 0 ? 2 : trades} positions), so most trades risk less. A gap through the stop can lose a little more. No target: winners run to 15:05.",
          );
      }
    case 'BREAKOUT_15MIN':
      final capRaw = _n(f['b15MaxLossesPerDay']);
      final cap = (capRaw == 0 ? 1 : capRaw).floor().clamp(0, 1 << 30);
      return RiskEstimate(
        perTrade: orNull(perTrade),
        perDay: orNull(perTrade * (trades < cap ? trades : cap)),
        targetPerTrade: orNull(_n(f['targetRs'])),
        basis: 'Stop-loss per trade, times the trades allowed before the daily loss limit.',
      );
    default:
      return RiskEstimate(
        perTrade: orNull(perTrade),
        perDay: orNull(perTrade * trades),
        targetPerTrade: orNull(_n(f['targetRs'])),
        basis: 'Stop-loss per trade, times the maximum trades per day.',
      );
  }
}

/// `₹1,500` or "n/a" (web `inr`).
String inr(double? v) {
  if (v == null) return 'n/a';
  final r = v.round();
  final digits = r.abs().toString();
  final buf = StringBuffer();
  if (digits.length <= 3) {
    buf.write(digits);
  } else {
    final head = digits.substring(0, digits.length - 3);
    final parts = <String>[];
    for (var i = head.length; i > 0; i -= 2) {
      parts.insert(0, head.substring(i - 2 < 0 ? 0 : i - 2, i));
    }
    buf
      ..write(parts.join(','))
      ..write(',')
      ..write(digits.substring(digits.length - 3));
  }
  return '${r < 0 ? '-' : ''}₹$buf';
}

/// Which wizard step a validator message belongs to (web `stepOfError`): 1 = instrument, 2 = risk.
int stepOfError(String message) =>
    RegExp(
          r'^(Lots|Quantity|Symbol|Product|Max lots|EMA period|Fast EMA|Slow EMA|RSI period|Start time|End time|Entry cutoff|Prime window|symbol is required|Min .*premium|Max premium)',
          caseSensitive: false,
        ).hasMatch(message)
        ? 1
        : 2;
