import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/auth_controller.dart';
import 'package:tradeio_mobile/core/socket/market_socket.dart';
import 'package:tradeio_mobile/core/theme/app_theme.dart';
import 'package:tradeio_mobile/features/auth/auth_models.dart';
import 'package:tradeio_mobile/features/brokers/brokers_models.dart';
import 'package:tradeio_mobile/features/brokers/brokers_providers.dart';
import 'package:tradeio_mobile/features/brokers/screens/brokers_screen.dart';
import 'package:tradeio_mobile/features/dashboard/screens/dashboard_screen.dart';
import 'package:tradeio_mobile/features/market/market_models.dart';
import 'package:tradeio_mobile/features/market/market_providers.dart';
import 'package:tradeio_mobile/features/market/scanner_models.dart';
import 'package:tradeio_mobile/features/market/scanner_providers.dart';
import 'package:tradeio_mobile/features/market/screens/move_alerts_screen.dart';
import 'package:tradeio_mobile/features/market/screens/screener_screen.dart';
import 'package:tradeio_mobile/features/market/screens/swing_screen.dart';
import 'package:tradeio_mobile/features/orders/ledger_models.dart';
import 'package:tradeio_mobile/features/orders/ledger_providers.dart';
import 'package:tradeio_mobile/features/orders/orders_models.dart';
import 'package:tradeio_mobile/features/orders/orders_providers.dart';
import 'package:tradeio_mobile/features/orders/screens/ledger_screen.dart';
import 'package:tradeio_mobile/features/orders/screens/order_ticket_screen.dart';
import 'package:tradeio_mobile/features/orders/screens/orders_screen.dart';
import 'package:tradeio_mobile/features/portfolio/portfolio_models.dart';
import 'package:tradeio_mobile/features/portfolio/portfolio_providers.dart';
import 'package:tradeio_mobile/features/positions/screens/positions_screen.dart';
import 'package:tradeio_mobile/features/risk/risk_models.dart';
import 'package:tradeio_mobile/features/risk/risk_providers.dart';
import 'package:tradeio_mobile/features/risk/screens/risk_screen.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategies_screen.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategy_detail_screen.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategy_editor_screen.dart';
import 'package:tradeio_mobile/features/strategies/strategies_models.dart';
import 'package:tradeio_mobile/features/strategies/strategies_providers.dart';

class _SignedIn extends AuthController {
  @override
  AuthState build() => const AuthSignedIn(AppUser(id: 'user', name: 'Trader', email: 'trader@example.com'));
}

class _Market extends MarketSocket {
  @override
  MarketState build() => const MarketState();
}

void main() {
  const broker = BrokerAccount(id: 'broker', clientId: 'AB1234', isActive: true);
  const strategy = StrategyRow(id: 'strategy', name: 'EMA trend', isPaperTrade: true);
  final screens = <String, Widget>{
    'dashboard': const DashboardScreen(),
    'positions': const PositionsScreen(),
    'order ticket': const OrderTicketScreen(),
    'orders': const OrdersScreen(),
    'strategies': const StrategiesScreen(),
    'strategy detail': const StrategyDetailScreen(id: 'strategy'),
    'strategy editor': const StrategyEditorScreen(),
    'brokers': const BrokersScreen(),
    'risk': const RiskScreen(),
    'screener': const ScreenerScreen(),
    'alerts': const MoveAlertsScreen(),
    'swing': const SwingScreen(),
    'ledger': const LedgerScreen(),
  };
  for (final entry in screens.entries) {
    testWidgets('${entry.key} fits a narrow phone with enlarged text', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(_SignedIn.new),
            marketSocketProvider.overrideWith(_Market.new),
            orderUpdateStreamProvider.overrideWith((ref) => const Stream.empty()),
            brokersProvider.overrideWith((ref) async => [broker]),
            activeBrokerProvider.overrideWith((ref) => const AsyncData(broker)),
            marketOverviewProvider.overrideWith(
              (ref) async => const MarketOverview(indices: [IndexQuote(symbol: 'NIFTY 50', price: 25000, change: 1.2)]),
            ),
            moversProvider.overrideWith((ref) async => const Movers()),
            sessionProvider.overrideWith((ref) async => const SessionInfo(state: SessionState.open)),
            riskStatusProvider.overrideWith(
              (ref) async => const RiskStatus(maxDailyLoss: 5000, totalDailyPnl: 1234, lossUsagePct: 85),
            ),
            dayPnlProvider.overrideWith((ref) async => const DayPnl(date: '2026-11-10', realizedPnl: 1234)),
            ordersProvider.overrideWith((ref) async => []),
            marginsProvider.overrideWith((ref, id) async => const Margins(equity: MarginSegment(net: 1234567))),
            positionsProvider.overrideWith(
              (ref, id) async => const [
                BrokerPosition(symbol: 'RELIANCE', qty: 100, avgPrice: 2400, ltp: 2500, pnl: 10000),
              ],
            ),
            strategiesProvider.overrideWith((ref) async => [strategy]),
            strategyProvider.overrideWith((ref, id) async => strategy),
            liveStrategyProvider.overrideWith(
              (ref, id) => const AsyncData(StrategyStatus(logs: ['Waiting for next candle'])),
            ),
            screenerProvider.overrideWith(
              (ref, query) async =>
                  const ScreenerData(stocks: [ScreenerStock(symbol: 'RELIANCE', ltp: 2500, signal: 'OPEN_LOW')]),
            ),
            moveAlertsProvider.overrideWith(
              (ref) async => const MoveAlertsData(
                alerts: [MoveAlert(id: 'alert', symbol: 'RELIANCE', type: 'BREAKOUT', text: 'Range breakout detected')],
              ),
            ),
            swingProvider.overrideWith(
              (ref, query) async => const SwingScan(
                results: [SwingResult(symbol: 'RELIANCE', pattern: 'VCP', confidence: 'HIGH', score: 85)],
              ),
            ),
            ledgerProvider.overrideWith(
              (ref, query) async => const LedgerData(
                summary: LedgerSummary(totalRealizedPnl: 1234),
                pagination: LedgerPagination(),
                closedTrades: [ClosedTrade(id: 'trade', symbol: 'RELIANCE', date: '2026-11-10', realizedPnl: 1234)],
              ),
            ),
          ],
          child: MaterialApp(
            theme: lightTheme(),
            builder:
                (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.2)),
                  child: child!,
                ),
            home: entry.value,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
