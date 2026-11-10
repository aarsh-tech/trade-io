import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';
import 'strategies_models.dart';

/// Endpoints under /strategies used so far. Same calls as `strategyApi` in apps/web/src/lib/api.ts.
class StrategiesApi {
  StrategiesApi(this._dio);

  final Dio _dio;

  Future<StrategyRow> get(String id) async =>
      StrategyRow.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/strategies/$id')));
  Future<StrategyStatus> status(String id) async =>
      StrategyStatus.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/strategies/$id/status')));
  Future<void> start(String id) async => unwrapData<dynamic>(await _dio.post<dynamic>('/strategies/$id/start'));
  Future<void> stop(String id) async => unwrapData<dynamic>(await _dio.post<dynamic>('/strategies/$id/stop'));
  Future<void> squareOff(String id) async =>
      unwrapData<dynamic>(await _dio.post<dynamic>('/strategies/$id/square-off'));
  Future<void> setAutoStart(String id, bool value) async =>
      unwrapData<dynamic>(await _dio.patch<dynamic>('/strategies/$id/auto-start', data: {'autoStart': value}));
  Future<void> delete(String id) async => unwrapData<dynamic>(await _dio.delete<dynamic>('/strategies/$id'));

  /// Creates (no [id]) or updates a strategy; returns its id.
  Future<String?> save(String? id, Map<String, dynamic> body) async {
    final data = unwrapData<dynamic>(
      id == null
          ? await _dio.post<dynamic>('/strategies', data: body)
          : await _dio.patch<dynamic>('/strategies/$id', data: body),
    );
    return data is Map && data['id'] is String ? data['id'] as String : id;
  }

  /// Past runs of a strategy (`GET /strategies/:id/executions`).
  Future<List<Map<String, dynamic>>> executions(String id) async {
    final data = unwrapData<dynamic>(await _dio.get<dynamic>('/strategies/$id/executions'));
    return data is List ? data.whereType<Map<String, dynamic>>().toList() : const [];
  }

  Future<List<StrategyRow>> list() async {
    final data = unwrapData<List<dynamic>>(await _dio.get<dynamic>('/strategies'));
    return data.map((e) => StrategyRow.fromJson(e as Map<String, dynamic>)).toList();
  }
}

final strategiesApiProvider = Provider<StrategiesApi>((ref) => StrategiesApi(ref.watch(apiClientProvider).dio));
