import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';
import '../orders/ticket_models.dart';
import 'risk_models.dart';

/// Endpoints under /risk used so far. Same calls as `riskApi` in apps/web/src/lib/api.ts.
class RiskApi {
  RiskApi(this._dio);

  final Dio _dio;

  Future<OrderLimits> orderLimits(String symbol, String exchange) async => OrderLimits.fromJson(
    unwrapData<Map<String, dynamic>>(
      await _dio.get<dynamic>('/risk/order-limits', queryParameters: {'symbol': symbol, 'exchange': exchange}),
    ),
  );

  Future<RiskActionResult> triggerKillSwitch() async => RiskActionResult.fromJson(
    unwrapData<Map<String, dynamic>>(
      await _dio.post<dynamic>('/risk/kill-switch', data: {'reason': 'Manual emergency stop from Android'}),
    ),
  );
  Future<RiskActionResult> resetKillSwitch() async =>
      RiskActionResult.fromJson(unwrapData<Map<String, dynamic>>(await _dio.post<dynamic>('/risk/reset-kill-switch')));
  Future<void> updateSettings(Map<String, dynamic> body) async =>
      unwrapData<dynamic>(await _dio.patch<dynamic>('/risk/settings', data: body));

  Future<RiskStatus> status() async =>
      RiskStatus.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/risk/status')));
}

final riskApiProvider = Provider<RiskApi>((ref) => RiskApi(ref.watch(apiClientProvider).dio));
