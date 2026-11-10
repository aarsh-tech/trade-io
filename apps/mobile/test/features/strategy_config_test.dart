import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/features/strategies/strategies_models.dart';
import 'package:tradeio_mobile/features/strategies/strategy_config.dart';

void main() {
  test('accepts inclusive numeric bounds and rejects invalid numeric inputs', () {
    for (final entry in configBounds.entries) {
      expect(validateStrategyConfig('CUSTOM', {entry.key: entry.value.min}), isEmpty, reason: entry.key);
      expect(validateStrategyConfig('CUSTOM', {entry.key: entry.value.max}), isEmpty, reason: entry.key);
      expect(validateStrategyConfig('CUSTOM', {entry.key: entry.value.max + 1}), isNotEmpty, reason: entry.key);
      expect(validateStrategyConfig('CUSTOM', {entry.key: double.nan}), isNotEmpty);
      expect(validateStrategyConfig('CUSTOM', {entry.key: 'invalid'}), isNotEmpty);
      if (entry.value.integer) expect(validateStrategyConfig('CUSTOM', {entry.key: 2.5}), isNotEmpty);
    }
  });
  test('requires strategy fields and enforces paired limits, times, and enums', () {
    expect(validateStrategyConfig('EMA_VWAP_CROSSOVER', {}), hasLength(3));
    expect(validateStrategyConfig('STOCKS_IN_PLAY', {'stopLossRs': 500}), isEmpty);
    expect(validateStrategyConfig('CUSTOM', {'startTime': '09:15', 'endTime': '15:05'}), isEmpty);
    for (final config in [
      {'startTime': '24:00'},
      {'startTime': '9:15'},
      {'startTime': '15:05', 'endTime': '09:15'},
      {'minPremium': 100, 'maxPremium': 50},
      {'emaFast': 40, 'emaSlow': 15},
      {'target1RR': 2, 'target2RR': 2},
      {'rsiEntryMin': 70, 'rsiEntryMax': 30},
      {'targetMode': 'UNKNOWN'},
      {'product': 'INVALID'},
      {'symbol': '   '},
    ]) {
      expect(validateStrategyConfig('CUSTOM', config), isNotEmpty, reason: '$config');
    }
    expect(
      validateStrategyConfig('EMA_VWAP_CROSSOVER', {
        'symbol': 'AUTO',
        'stopLossRs': 500,
        'targetRs': 1000,
        'entryTimeframe': '3min',
      }),
      isNotEmpty,
    );
  });
  test('every creatable type starts from a valid config with the web wizard defaults', () {
    for (final type in creatableStrategyTypes.keys) {
      expect(validateStrategyConfig(type, defaultStrategyConfig(type)), isEmpty, reason: type);
    }
    final fade = defaultStrategyConfig('STOCKS_IN_PLAY');
    expect(fade['setup'], 'FADE');
    expect((fade['stopPct'], fade['targetR'], fade['breakevenAtR'], fade['breakevenLockR']), (1.2, 3, 1, 0.2));
    expect((fade['maxPositions'], fade['allowLongs'], fade['fadeLongs']), (1, false, false));
    final picker = defaultStrategyConfig('EMA_VWAP_CROSSOVER');
    expect((picker['symbol'], picker['targetMode'], picker['isOptionBuyingOnly']), ('AUTO', 'EMA', false));
    expect((picker['stopLossRs'], picker['targetRs'], picker['maxStopPct']), (500, 500, 1.2));
    final breakout = defaultStrategyConfig('BREAKOUT_15MIN');
    expect((breakout['symbol'], breakout['lots'], breakout['qty']), ('NIFTY 50', 1, 65));
  });
  test('decodes server JSON-string configs while preserving unknown settings', () {
    final row = StrategyRow.fromJson({'id': 's', 'name': 'Trend', 'config': '{"stopLossRs":500,"newSetting":true}'});
    expect(row.config, {'stopLossRs': 500, 'newSetting': true});
    expect(StrategyRow.fromJson({'id': 's', 'name': 'Empty'}).config, isEmpty);
  });

  group('configLabel', () {
    test('uses the known label for bounded, time and text fields', () {
      expect(configLabel('emaPeriod'), 'EMA period');
      expect(configLabel('vwapSource'), 'VWAP source');
      expect(configLabel('instrumentType'), 'Instrument type');
    });
    test('turns an unknown camelCase key into sentence case, keeping acronyms', () {
      expect(configLabel('trailEmaAfterOrb'), 'Trail EMA after ORB');
      expect(configLabel('cooldown'), 'Cooldown');
    });
  });
}
