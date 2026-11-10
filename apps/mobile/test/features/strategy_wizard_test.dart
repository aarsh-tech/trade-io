import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/auth_controller.dart';
import 'package:tradeio_mobile/core/theme/app_theme.dart';
import 'package:tradeio_mobile/features/auth/auth_models.dart';
import 'package:tradeio_mobile/features/brokers/brokers_models.dart';
import 'package:tradeio_mobile/features/brokers/brokers_providers.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategy_wizard_screen.dart';
import 'package:tradeio_mobile/features/strategies/strategy_form.dart';
import 'package:tradeio_mobile/shared/enums.dart';

class _SignedIn extends AuthController {
  @override
  AuthState build() => const AuthSignedIn(AppUser(id: 'u', name: 'Trader', email: 't@example.com'));
}

Future<void> _pump(WidgetTester tester, {ThemeMode mode = ThemeMode.light}) async {
  tester.view.physicalSize = const Size(360, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(_SignedIn.new),
        brokersProvider.overrideWith(
          (ref) async => const [
            BrokerAccount(id: 'b1', clientId: 'AB1234', broker: BrokerType.zerodha, isActive: true),
          ],
        ),
      ],
      child: MaterialApp(
        theme: lightTheme(),
        darkTheme: darkTheme(),
        themeMode: mode,
        home: const StrategyWizardScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _next(WidgetTester tester, String label) async {
  expect(tester.takeException(), isNull);
  final button = find.widgetWithText(FilledButton, label);
  expect(button, findsOneWidget);
  expect(tester.widget<FilledButton>(button).onPressed, isNotNull, reason: '$label should be enabled');
  await tester.tap(button);
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

/// The FilledButton (or FilledButton.icon subclass) around [label].
FilledButton _button(WidgetTester tester, String label) => tester.widget<FilledButton>(
  find.ancestor(of: find.text(label), matching: find.byWidgetPredicate((w) => w is FilledButton)),
);

void main() {
  testWidgets('Next stays disabled until a type is chosen', (tester) async {
    await _pump(tester);
    expect(find.text('Choose a strategy type to continue'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Next: Instrument')).onPressed, isNull);
  });

  for (final t in strategyTypes) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      testWidgets('${t.label}: all four steps fit a narrow phone (${mode.name})', (tester) async {
        await _pump(tester, mode: mode);
        await tester.ensureVisible(find.text(t.label));
        await tester.pumpAndSettle();
        await tester.tap(find.text(t.label));
        await tester.pumpAndSettle();
        expect(find.text(t.defaultName), findsWidgets, reason: 'the type fills a default name');

        await _next(tester, 'Next: Instrument');
        await _next(tester, 'Next: Risk');

        // Open the advanced options and let every control render.
        await tester.ensureVisible(find.text('Advanced risk options'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Advanced risk options'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        await _next(tester, 'Next: Review');
        expect(_button(tester, 'Create paper strategy').onPressed, isNotNull);
        expect(find.text('Paper or live?'), findsOneWidget);
      });
    }
  }

  testWidgets('choosing live trading asks for the acknowledgement before saving', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Intraday Stock Picker'));
    await tester.pumpAndSettle();
    await _next(tester, 'Next: Instrument');
    await _next(tester, 'Next: Risk');
    await _next(tester, 'Next: Review');
    await tester.tap(find.text('Live trading'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm you understand live trading'), findsOneWidget);
    expect(_button(tester, 'Create live strategy').onPressed, isNull);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    expect(_button(tester, 'Create live strategy').onPressed, isNotNull);
  });
}
