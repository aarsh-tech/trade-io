import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/features/strategies/strategy_config.dart';
import 'package:tradeio_mobile/features/strategies/strategy_form.dart';

void main() {
  group('buildStrategyConfig (port of the web wizard)', () {
    for (final t in strategyTypes) {
      test('an untouched ${t.type} form saves the same config as the web', () {
        final form = withType(createDefaultForm(), t.type);
        expect(buildStrategyConfig(form), defaultStrategyConfig(t.type));
        expect(validateStrategyConfig(t.type, buildStrategyConfig(form)), isEmpty);
      });

      test('${t.type}: config → form → config is stable', () {
        final first = buildStrategyConfig(withType(createDefaultForm(), t.type));
        final form = strategyToForm(name: 'x', type: t.type, config: first);
        expect(buildStrategyConfig(form), first);
      });
    }

    test('Stocks-in-Play OI forces one trade a day and its own stop', () {
      final form =
          withType(createDefaultForm(), 'STOCKS_IN_PLAY')
            ..['sipSetup'] = 'OI'
            ..['sipStopPct'] = '1'
            ..['maxTradesPerDay'] = '3';
      final config = buildStrategyConfig(form);
      expect(config['setup'], 'OI');
      expect(config['maxPositions'], 1);
      expect(config['stopPct'], 1);
      expect(config.containsKey('breakevenAtR'), isFalse);
    });

    test('a "0" target is kept (no target), a blank one takes the default', () {
      final form = withType(createDefaultForm(), 'STOCKS_IN_PLAY')..['sipTargetR'] = '0';
      expect(buildStrategyConfig(form)['targetR'], 0);
      form['sipTargetR'] = '';
      expect(buildStrategyConfig(form)['targetR'], 3);
    });

    test('lots × lot size gives qty for an index', () {
      final form =
          withType(createDefaultForm(), 'BREAKOUT_15MIN')
            ..['symbol'] = 'BANKNIFTY'
            ..['lots'] = '3';
      expect(buildStrategyConfig(form)['qty'], 90);
    });

    test('volume strictness maps to the backtested z-score', () {
      final form = withType(createDefaultForm(), 'EMA_VWAP_CROSSOVER')..['volumeStrictness'] = 'STRICT';
      expect(buildStrategyConfig(form)['minVolumeZ'], 2);
      final back = strategyToForm(name: 'x', type: 'EMA_VWAP_CROSSOVER', config: buildStrategyConfig(form));
      expect(back['volumeStrictness'], 'STRICT');
    });
  });

  test('editing keeps config keys the wizard does not manage', () {
    final saved = {...defaultStrategyConfig('EMA_VWAP_CROSSOVER'), 'legacyKey': 7};
    final form = strategyToForm(name: 'x', type: 'EMA_VWAP_CROSSOVER', config: saved)..['stopLossRs'] = '700';
    final merged = mergeEditedConfig(saved, form);
    expect(merged['legacyKey'], 7);
    expect(merged['stopLossRs'], 700);
  });

  test('picking a type keeps a typed name but replaces an auto name', () {
    var form = withType(createDefaultForm(), 'EMA_VWAP_CROSSOVER');
    expect(form['name'], 'Intraday Stock Picker');
    form = withType(form, 'BREAKOUT_15MIN');
    expect(form['name'], '15-Min Breakout');
    form['name'] = 'My breakout';
    expect(withType(form, 'STOCKS_IN_PLAY')['name'], 'My breakout');
  });

  test('presets are detected and risk is estimated like the web', () {
    final form = withType(createDefaultForm(), 'BREAKOUT_15MIN');
    expect(activePreset(form), 'Balanced');
    final risk = estimateRisk(form);
    expect(risk.perTrade, 1000);
    expect(risk.perDay, 1000); // 2 trades, but the day stops after 1 loss
    expect(risk.targetPerTrade, 1500);
    form['stopLossRs'] = '999';
    expect(activePreset(form), isNull);
  });

  test('inr and lot sizes', () {
    expect(inr(123456.4), '₹1,23,456');
    expect(inr(null), 'n/a');
    expect(lotSizeFor('NIFTY 50'), 65);
    expect(lotSizeFor('BANKNIFTY'), 30);
    expect(lotSizeFor('RELIANCE'), 1);
    expect(lotSizeFor('RELIANCE', 250), 250);
    expect(stepOfError('Lots must be between 1 and 500'), 1);
    expect(stepOfError('Stop-loss (₹) must be a number'), 2);
  });
}
