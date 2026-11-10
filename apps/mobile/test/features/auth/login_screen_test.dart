import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/theme/app_theme.dart';
import 'package:tradeio_mobile/features/auth/screens/login_screen.dart';

void main() {
  Future<void> pumpLogin(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(child: MaterialApp(theme: lightTheme(), darkTheme: darkTheme(), home: const LoginScreen())),
    );
  }

  testWidgets('shows email, password and the sign-in button', (tester) async {
    await pumpLogin(tester);
    expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Password'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
    expect(find.text('2FA code'), findsNothing);
  });

  testWidgets('validates before calling the server', (tester) async {
    await pumpLogin(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'not-an-email');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    expect(find.text('Enter your email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });
}
