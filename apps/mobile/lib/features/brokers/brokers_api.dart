import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';
import '../orders/ticket_models.dart';
import '../portfolio/portfolio_models.dart';
import 'brokers_models.dart';

/// Endpoints under /brokers. Same calls as `brokerApi` in apps/web/src/lib/api.ts.
class BrokersApi {
  BrokersApi(this._dio);

  final Dio _dio;

  Future<TickSize> tickSize(String id, String symbol, String exchange) async => TickSize.fromJson(
    unwrapData<Map<String, dynamic>>(
      await _dio.get<dynamic>('/brokers/$id/tick-size', queryParameters: {'symbol': symbol, 'exchange': exchange}),
    ),
  );

  Future<void> connect(Map<String, dynamic> body) async =>
      unwrapData<dynamic>(await _dio.post<dynamic>('/brokers/connect', data: body));
  Future<void> disconnect(String id) async => unwrapData<dynamic>(await _dio.delete<dynamic>('/brokers/$id'));
  Future<BrokerLogin> loginUrl(String id) async =>
      BrokerLogin.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/brokers/$id/login-url')));
  Future<void> setSession(String id, String token, String state) async => unwrapData<dynamic>(
    await _dio.post<dynamic>('/brokers/$id/session', data: {'requestToken': token, 'state': state}),
  );

  Future<List<BrokerAccount>> list() async {
    final data = unwrapData<List<dynamic>>(await _dio.get<dynamic>('/brokers'));
    return data.map((e) => BrokerAccount.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<BrokerPosition>> positions(String accountId) async {
    final data = unwrapData<List<dynamic>>(await _dio.get<dynamic>('/brokers/$accountId/positions'));
    return data.map((e) => BrokerPosition.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Holding>> holdings(String accountId) async {
    final data = unwrapData<List<dynamic>>(await _dio.get<dynamic>('/brokers/$accountId/holdings'));
    return data.map((e) => Holding.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Null when the broker session is not live (the server returns `data: null`).
  Future<Margins?> margins(String accountId) async {
    final data = unwrapData<dynamic>(await _dio.get<dynamic>('/brokers/$accountId/margins'));
    return data is Map<String, dynamic> ? Margins.fromJson(data) : null;
  }

  /// Places a manual order. The body is what the web order ticket sends
  /// ({symbol, exchange, side, product, orderType, qty, price, triggerPrice?}).
  Future<Map<String, dynamic>> placeOrder(
    String accountId,
    Map<String, dynamic> body, {
    String? idempotencyKey,
  }) async => unwrapData<Map<String, dynamic>>(
    await _dio.post<dynamic>(
      '/brokers/$accountId/orders',
      data: body,
      options: Options(headers: {if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey}),
    ),
  );

  /// Acknowledges a cancellation request; order_update carries the final status.
  Future<void> cancelOrder(String accountId, String brokerOrderId) async =>
      unwrapData<dynamic>(await _dio.delete<dynamic>('/brokers/$accountId/orders/$brokerOrderId'));
}

final brokersApiProvider = Provider<BrokersApi>((ref) => BrokersApi(ref.watch(apiClientProvider).dio));
