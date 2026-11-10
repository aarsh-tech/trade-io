import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';
import '../orders/ticket_models.dart';
import 'market_models.dart';
import 'scanner_models.dart';

/// Endpoints under /market used so far. Same calls as `marketApi` in apps/web/src/lib/api.ts.
class MarketApi {
  MarketApi(this._dio);

  final Dio _dio;

  Future<List<Instrument>> search(String query, String accountId) async {
    final data = unwrapData<List<dynamic>>(
      await _dio.get<dynamic>('/market/search', queryParameters: {'q': query, 'accountId': accountId}),
    );
    return data.map((e) => Instrument.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<LotSize> lotSize(String symbol, String accountId) async => LotSize.fromJson(
    unwrapData<Map<String, dynamic>>(
      await _dio.get<dynamic>('/market/lot-size', queryParameters: {'symbol': symbol, 'accountId': accountId}),
    ),
  );

  Future<ScreenerData> screener(String universe, double tolerance) async => ScreenerData.fromJson(
    unwrapData<Map<String, dynamic>>(
      await _dio.get<dynamic>(
        '/market/ohl-stocks',
        queryParameters: {'universe': universe, 'tolerance': tolerance, 'filter': 'all'},
      ),
    ),
  );
  Future<MoveAlertsData> moveAlerts() async =>
      MoveAlertsData.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/market/move-alerts')));
  Future<SwingScan?> swing(int page, String pattern, String sortBy) async {
    final data = unwrapData<dynamic>(
      await _dio.get<dynamic>(
        '/swing-scanner/last',
        queryParameters: {'page': page, 'pageSize': 25, 'pattern': pattern, 'sortBy': sortBy},
      ),
    );
    return data == null ? null : SwingScan.fromJson(data as Map<String, dynamic>);
  }

  Future<void> runSwing() async => unwrapData<dynamic>(await _dio.post<dynamic>('/swing-scanner/run'));

  Future<MarketOverview> overview() async =>
      MarketOverview.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/market/overview')));

  Future<Movers> movers() async =>
      Movers.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/market/movers')));

  Future<SessionInfo> session() async =>
      SessionInfo.fromJson(unwrapData<Map<String, dynamic>>(await _dio.get<dynamic>('/market/session')));
}

final marketApiProvider = Provider<MarketApi>((ref) => MarketApi(ref.watch(apiClientProvider).dio));
