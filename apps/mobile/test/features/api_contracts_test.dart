import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/network/api_envelope.dart';
import 'package:tradeio_mobile/features/brokers/brokers_api.dart';
import 'package:tradeio_mobile/features/market/market_api.dart';
import 'package:tradeio_mobile/features/orders/orders_api.dart';
import 'package:tradeio_mobile/features/risk/risk_api.dart';
import 'package:tradeio_mobile/features/strategies/strategies_api.dart';

void main() {
  late Dio dio;
  late List<RequestOptions> requests;
  dynamic body;
  setUp(() {
    requests = [];
    dio =
        Dio()
          ..interceptors.add(
            InterceptorsWrapper(
              onRequest: (options, handler) {
                requests.add(options);
                handler.resolve(Response<dynamic>(requestOptions: options, statusCode: 200, data: body));
              },
            ),
          );
  });
  tearDown(() => dio.close(force: true));
  test('broker login accepts the unwrapped URL endpoint and forwards signed callback state', () async {
    final api = BrokersApi(dio);
    body = {'url': 'https://kite.zerodha.com/connect/login?redirect_params=state%3Ds'};
    expect((await api.loginUrl('b')).url, contains('redirect_params'));
    body = {'success': true};
    await api.setSession('b', 'request-token', 'signed-state');
    expect(requests.last.path, '/brokers/b/session');
    expect(requests.last.data, {'requestToken': 'request-token', 'state': 'signed-state'});
  });
  test('order retries forward the same idempotency key and broker account', () async {
    body = {
      'success': true,
      'data': {'orderId': 'o'},
    };
    final api = BrokersApi(dio);
    await api.placeOrder('b', {'qty': 75, 'symbol': 'NIFTY'}, idempotencyKey: 'intent-1');
    await api.placeOrder('b', {'qty': 75, 'symbol': 'NIFTY'}, idempotencyKey: 'intent-1');
    expect(requests.every((r) => r.path == '/brokers/b/orders' && r.headers['Idempotency-Key'] == 'intent-1'), isTrue);
  });
  test('a 2xx server refusal fails the strategy action', () async {
    body = {'success': false, 'message': 'Square-off not supported'};
    await expectLater(StrategiesApi(dio).squareOff('s'), throwsA(isA<ApiException>()));
  });
  test('an engine refusal inside a successful controller envelope is surfaced', () async {
    body = {
      'success': true,
      'data': {'success': false, 'message': 'Exit not confirmed for every position'},
    };
    await expectLater(
      StrategiesApi(dio).squareOff('s'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('Exit not confirmed'))),
    );
  });
  test('kill-switch results retain broker close-failure warnings', () async {
    body = {'success': true, 'message': 'Trading suspended. WARNING: could not confirm close of RELIANCE'};
    expect((await RiskApi(dio).triggerKillSwitch()).message, contains('could not confirm close'));
  });
  test('screener uses the two target names returned by the backend', () async {
    body = {
      'success': true,
      'data': {
        'stocks': [
          {'symbol': 'RELIANCE', 'suggestedTarget1': 2500, 'suggestedTarget2': 2600},
        ],
      },
    };
    final row = (await MarketApi(dio).screener('fno', 0.05)).stocks.single;
    expect(row.suggestedTarget, 2500);
    expect(row.suggestedTarget2, 2600);
  });
  test('scanner accepts the no-results response with a null scan ID', () async {
    body = {
      'success': true,
      'data': {'id': null, 'scannedAt': null, 'results': <dynamic>[], 'totalPages': 0, 'isScanning': true},
    };
    final scan = await MarketApi(dio).swing(1, 'ALL', 'score');
    expect(scan!.isScanning, isTrue);
    expect(scan.results, isEmpty);
    expect(requests.single.queryParameters['pageSize'], 25);
    body = {'success': true, 'symbol': 'NIFTY', 'lotSize': 75};
    expect((await MarketApi(dio).lotSize('NIFTY', 'b')).lotSize, 75);
  });
  test('ledger forwards server pagination and filters and retains exact-charge flags', () async {
    body = {
      'success': true,
      'data': {
        'summary': {'totalRealizedPnl': 500, 'totalCharges': 20},
        'pagination': {'page': 2, 'totalPages': 3},
        'closedTrades': [
          {'id': 't', 'symbol': 'RELIANCE', 'date': '2026-11-10', 'chargesExact': true},
        ],
      },
    };
    final data = await OrdersApi(
      dio,
    ).ledger({'month': 11, 'year': 2026, 'page': 2, 'status': 'PROFIT', 'segment': 'EQUITY'});
    expect(data.pagination.page, 2);
    expect(data.closedTrades.single.chargesExact, isTrue);
    expect(requests.single.queryParameters['segment'], 'EQUITY');
  });
}
