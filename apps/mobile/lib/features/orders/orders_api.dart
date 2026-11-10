import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';
import 'ledger_models.dart';
import 'orders_models.dart';

/// Endpoints under /orders. Same calls as `orderApi` in apps/web/src/lib/api.ts.
/// Cancelling goes through the broker account: `BrokersApi.cancelOrder`.
class OrdersApi {
  OrdersApi(this._dio);

  final Dio _dio;

  Future<LedgerData> ledger(Map<String, dynamic> query) async => LedgerData.fromJson(
    unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/orders/ledger', queryParameters: query)),
  );

  Future<List<Order>> list() async {
    final data = unwrapData<List<dynamic>>(await _dio.get<dynamic>('/orders'));
    return data.map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SyncResult> sync() async =>
      SyncResult.fromJson(unwrapData<Map<String, dynamic>>(await _dio.post<dynamic>('/orders/sync')));

  Future<DayPnl> dayPnl() async =>
      DayPnl.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/orders/day-pnl')));
}

final ordersApiProvider = Provider<OrdersApi>((ref) => OrdersApi(ref.watch(apiClientProvider).dio));
