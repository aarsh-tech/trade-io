import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/auth/auth_controller.dart';
import 'package:tradeio_mobile/core/socket/market_socket.dart';
import 'package:tradeio_mobile/core/theme/app_theme.dart';
import 'package:tradeio_mobile/core/theme/appearance_controller.dart';
import 'package:tradeio_mobile/features/auth/auth_models.dart';
import 'package:tradeio_mobile/features/auth/screens/forgot_password_screen.dart';
import 'package:tradeio_mobile/features/auth/screens/login_screen.dart';
import 'package:tradeio_mobile/features/auth/screens/register_screen.dart';
import 'package:tradeio_mobile/features/auth/screens/splash_screen.dart';
import 'package:tradeio_mobile/features/brokers/brokers_models.dart';
import 'package:tradeio_mobile/features/brokers/brokers_providers.dart';
import 'package:tradeio_mobile/features/brokers/screens/brokers_screen.dart';
import 'package:tradeio_mobile/features/dashboard/dashboard_providers.dart';
import 'package:tradeio_mobile/features/dashboard/screens/dashboard_screen.dart';
import 'package:tradeio_mobile/features/home/home_shell.dart';
import 'package:tradeio_mobile/features/market/market_models.dart';
import 'package:tradeio_mobile/features/market/market_providers.dart';
import 'package:tradeio_mobile/features/market/picks.dart';
import 'package:tradeio_mobile/features/market/scanner_models.dart';
import 'package:tradeio_mobile/features/market/scanner_providers.dart';
import 'package:tradeio_mobile/features/market/screens/move_alerts_screen.dart';
import 'package:tradeio_mobile/features/market/screens/picks_screen.dart';
import 'package:tradeio_mobile/features/market/screens/screener_screen.dart';
import 'package:tradeio_mobile/features/market/screens/swing_screen.dart';
import 'package:tradeio_mobile/features/more/screens/more_screen.dart';
import 'package:tradeio_mobile/features/orders/ledger_models.dart';
import 'package:tradeio_mobile/features/orders/ledger_providers.dart';
import 'package:tradeio_mobile/features/orders/orders_models.dart';
import 'package:tradeio_mobile/features/orders/orders_providers.dart';
import 'package:tradeio_mobile/features/orders/screens/ledger_screen.dart';
import 'package:tradeio_mobile/features/orders/screens/order_ticket_screen.dart';
import 'package:tradeio_mobile/features/orders/screens/orders_screen.dart';
import 'package:tradeio_mobile/features/portfolio/portfolio_models.dart';
import 'package:tradeio_mobile/features/portfolio/portfolio_providers.dart';
import 'package:tradeio_mobile/features/portfolio/screens/portfolio_screen.dart';
import 'package:tradeio_mobile/features/positions/screens/positions_screen.dart';
import 'package:tradeio_mobile/features/risk/risk_models.dart';
import 'package:tradeio_mobile/features/risk/risk_providers.dart';
import 'package:tradeio_mobile/features/risk/screens/risk_screen.dart';
import 'package:tradeio_mobile/features/settings/screens/settings_screen.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategies_screen.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategy_detail_screen.dart';
import 'package:tradeio_mobile/features/strategies/screens/strategy_wizard_screen.dart';
import 'package:tradeio_mobile/features/strategies/strategies_models.dart';
import 'package:tradeio_mobile/features/strategies/strategies_providers.dart';
import 'package:tradeio_mobile/shared/enums.dart';

class _SignedIn extends AuthController {
  @override
  AuthState build() => const AuthSignedIn(AppUser(id: 'user', name: 'Trader', email: 'trader@example.com'));
}

class _Market extends MarketSocket {
  @override
  MarketState build() => const MarketState();
}

final broker = BrokerAccount(
  id: 'broker',
  clientId: 'AB1234',
  broker: BrokerType.zerodha,
  isActive: true,
  tokenExpiry: DateTime.now().add(const Duration(hours: 5)),
);
const strategy = StrategyRow(
  id: 'strategy',
  name: 'EMA trend follower',
  type: StrategyType.emaVwapCrossover,
  isActive: true,
  isPaperTrade: true,
);

class _PreviewAppearance extends AppearanceController {
  _PreviewAppearance(this.mode);
  final ThemeMode mode;
  @override
  ThemeMode build() => mode;
}

Widget _fixture(
  Widget screen,
  ThemeMode mode, {
  double textScale = 1.2,
  GlobalKey? captureKey,
  int? navigation,
}) => RepaintBoundary(
  key: captureKey,
  child: ProviderScope(
    overrides: [
      appearanceProvider.overrideWith(() => _PreviewAppearance(mode)),
      authControllerProvider.overrideWith(_SignedIn.new),
      marketSocketProvider.overrideWith(_Market.new),
      orderUpdateStreamProvider.overrideWith((ref) => const Stream.empty()),
      brokersProvider.overrideWith((ref) async => [broker]),
      activeBrokerProvider.overrideWith((ref) => AsyncData(broker)),
      clockProvider.overrideWith((ref) => Stream.value(DateTime.now())),
      holdingsProvider.overrideWith(
        (ref, id) async => const [
          Holding(symbol: 'ITC', exchange: 'NSE', qty: 120, avgPrice: 410.5, ltp: 432.1, pnl: 2592),
          Holding(symbol: 'TATASTEEL', exchange: 'NSE', qty: 200, avgPrice: 152.3, ltp: 147.9, pnl: -880),
        ],
      ),
      picksProvider.overrideWith(
        (ref) async => const SwingScan(
          totalScanned: 412,
          results: [
            SwingResult(
              symbol: 'TATAPOWER',
              pattern: 'INTRADAY_MOMENTUM',
              confidence: 'HIGH',
              score: 82,
              currentPrice: 412.4,
              entryPrice: 414,
              stopLoss: 409.2,
              target1: 421.5,
              target2: 427,
              riskPct: 1.2,
              notes: ['Opening range breakout with 3.1x volume'],
            ),
          ],
        ),
      ),
      marketOverviewProvider.overrideWith(
        (ref) async => const MarketOverview(
          indices: [
            IndexQuote(symbol: 'NIFTY 50', price: 24572.65, change: 0.84, changeAbs: 204.3),
            IndexQuote(symbol: 'SENSEX', price: 80945.4, change: 0.62, changeAbs: 498.75),
            IndexQuote(symbol: 'NIFTY BANK', price: 52320.8, change: -0.31, changeAbs: -162.45),
          ],
          stocks: [
            WatchStock(symbol: 'RELIANCE', exchange: 'NSE', key: 'NSE:RELIANCE', price: 2502.5, change: 1.25),
            WatchStock(symbol: 'HDFCBANK', exchange: 'NSE', key: 'NSE:HDFCBANK', price: 1720.8, change: -0.42),
          ],
        ),
      ),
      moversProvider.overrideWith(
        (ref) async => const Movers(
          topGainers: [Mover(symbol: 'TATAMOTORS', ltp: 825.4, changePercent: 2.75)],
          topLosers: [Mover(symbol: 'INFY', ltp: 1845.25, changePercent: -1.24)],
        ),
      ),
      sessionProvider.overrideWith((ref) async => const SessionInfo(state: SessionState.open)),
      riskStatusProvider.overrideWith(
        (ref) async => const RiskStatus(
          maxDailyLoss: 5000,
          totalDailyPnl: 8475.25,
          unrealizedPnl: 1495.25,
          realizedPnl: 6980,
          lossUsagePct: 0,
        ),
      ),
      dayPnlProvider.overrideWith((ref) async => const DayPnl(date: '2026-11-10', realizedPnl: 6980)),
      ordersProvider.overrideWith(
        (ref) async => [
          Order(
            id: 'o',
            symbol: 'RELIANCE',
            qty: 50,
            filledQty: 50,
            price: 2450,
            avgPrice: 2450,
            side: OrderSide.buy,
            orderType: OrderType.limit,
            productType: ProductType.mis,
            status: OrderStatus.complete,
            createdAt: DateTime.now().toUtc(),
          ),
          Order(
            id: 'o2',
            symbol: 'HDFCBANK',
            qty: 20,
            side: OrderSide.sell,
            orderType: OrderType.market,
            productType: ProductType.mis,
            status: OrderStatus.open,
            createdAt: DateTime.now().toUtc(),
          ),
        ],
      ),
      marginsProvider.overrideWith(
        (ref, id) async => const Margins(equity: MarginSegment(net: 175250, utilised: MarginUtilised(debits: 56820))),
      ),
      positionsProvider.overrideWith(
        (ref, id) async => const [
          BrokerPosition(symbol: 'RELIANCE', exchange: 'NSE', qty: 100, avgPrice: 2400, ltp: 2500, pnl: 10000),
        ],
      ),
      strategiesProvider.overrideWith(
        (ref) async => [
          strategy,
          const StrategyRow(
            id: 's2',
            name: 'Opening range breakout',
            type: StrategyType.breakout15min,
            isPaperTrade: true,
            autoStart: true,
          ),
          const StrategyRow(id: 's3', name: 'Stocks in play', type: StrategyType.stocksInPlay, isPaperTrade: true),
        ],
      ),
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
        (ref, query) async =>
            const SwingScan(results: [SwingResult(symbol: 'RELIANCE', pattern: 'VCP', confidence: 'HIGH', score: 85)]),
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
      debugShowCheckedModeBanner: false,
      theme: lightTheme(),
      darkTheme: darkTheme(),
      themeMode: mode,
      builder:
          (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
      home: navigation == null ? screen : _PreviewShell(index: navigation, child: screen),
    ),
  ),
);

class _PreviewShell extends StatelessWidget {
  const _PreviewShell({required this.child, required this.index});
  final Widget child;
  final int index;
  @override
  Widget build(BuildContext context) =>
      Scaffold(body: child, bottomNavigationBar: BottomBar(index: index, onTab: (_) {}, onMore: () {}));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final sans = FontLoader('IBMPlexSans');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      sans.addFont(rootBundle.load('assets/fonts/IBMPlexSans-$weight.ttf'));
    }
    await sans.load();
    final mono = FontLoader('IBMPlexMono');
    for (final weight in ['Regular', 'Medium']) {
      mono.addFont(rootBundle.load('assets/fonts/IBMPlexMono-$weight.ttf'));
    }
    await mono.load();
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  final screens = <String, Widget>{
    'dashboard': const DashboardScreen(),
    'positions': const PositionsScreen(),
    'order ticket': const OrderTicketScreen(),
    'orders': const OrdersScreen(),
    'strategies': const StrategiesScreen(),
    'strategy detail': const StrategyDetailScreen(id: 'strategy'),
    'strategy wizard': const StrategyWizardScreen(),
    'portfolio': const PortfolioScreen(),
    'picks': const PicksScreen(),
    'settings': const SettingsScreen(),
    'register': const RegisterScreen(),
    'forgot password': const ForgotPasswordScreen(),
    'more menu': const Scaffold(body: SafeArea(child: MoreMenu())),
    'brokers': const BrokersScreen(),
    'risk': const RiskScreen(),
    'screener': const ScreenerScreen(),
    'alerts': const MoveAlertsScreen(),
    'swing': const SwingScreen(),
    'ledger': const LedgerScreen(),
    'more': const MoreScreen(),
    'login': const LoginScreen(),
    'splash': const SplashScreen(),
  };
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    for (final entry in screens.entries) {
      testWidgets('${entry.key} fits a narrow phone with enlarged text (${mode.name})', (tester) async {
        tester.view.physicalSize = const Size(360, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(_fixture(entry.value, mode));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      });
    }
    if (const bool.fromEnvironment('UI_PREVIEWS')) {
      for (final name in screens.keys) {
        testWidgets('preview $name ${mode.name}', (tester) async {
          final previousShadows = debugDisableShadows;
          debugDisableShadows = false;
          addTearDown(() => debugDisableShadows = previousShadows);
          tester.view.physicalSize = const Size(390, 844);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final key = GlobalKey();
          final nav = ['dashboard', 'strategies', 'positions', 'orders', 'more'].indexOf(name);
          await tester.pumpWidget(
            _fixture(screens[name]!, mode, textScale: 1, captureKey: key, navigation: nav < 0 ? null : nav),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.runAsync(() async {
            final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
            final image = await boundary.toImage(pixelRatio: 2);
            final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
            final file = File('build/ui-previews/$name-${mode.name}.png');
            await file.parent.create(recursive: true);
            await file.writeAsBytes(bytes!.buffer.asUint8List());
            image.dispose();
          });
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          debugDisableShadows = previousShadows;
        });
      }
    }
  }
}
