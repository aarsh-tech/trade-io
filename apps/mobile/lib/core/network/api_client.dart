import 'dart:async';

import 'package:dio/dio.dart';

import '../auth/token_store.dart';
import '../config/app_config.dart';
import 'api_envelope.dart';

/// The one HTTP client every feature API uses. Port of apps/web/src/lib/api.ts:
///
/// * attaches `Authorization: Bearer <access>` to every request;
/// * on a 401 (other than the auth endpoints themselves) refreshes the token once and
///   retries the request;
/// * refreshes are single-flight: concurrent 401s wait for the same refresh call;
/// * a refresh the server rejects (401/403) signs the user out; a refresh that merely
///   failed (offline, server restarting) does not.
class ApiClient {
  ApiClient(this._tokens, {required this.onForceLogout, this.onUserRefreshed}) {
    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.restBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {'Content-Type': 'application/json'},
      ),
    )..interceptors.add(_AuthInterceptor(this));
  }

  final TokenStore _tokens;

  /// Called when the server has rejected the refresh token: the session is over.
  final Future<void> Function() onForceLogout;

  /// Called with the `user` object the refresh endpoint returns, when it returns one.
  final void Function(Map<String, dynamic> user)? onUserRefreshed;

  late final Dio dio;

  Future<String?>? _inFlightRefresh;

  static const _noRefreshPaths = ['/auth/refresh', '/auth/login', '/auth/register'];

  /// Exchanges the refresh token for a new access token. Safe to call from anywhere;
  /// callers racing each other share one request.
  Future<String?> refreshAccessToken() {
    final pending = _inFlightRefresh;
    if (pending != null) return pending;
    final run = _refresh();
    _inFlightRefresh = run;
    return run.whenComplete(() => _inFlightRefresh = null);
  }

  Future<String?> _refresh() async {
    final refreshToken = await _tokens.readRefresh();
    if (refreshToken == null) {
      await onForceLogout();
      return null;
    }
    // A bare client: the interceptor must not try to refresh the refresh call.
    final bare = Dio(BaseOptions(baseUrl: AppConfig.restBaseUrl, connectTimeout: const Duration(seconds: 15)));
    try {
      final res = await bare.post<dynamic>('/auth/refresh', data: {'refreshToken': refreshToken});
      final data = unwrapData<Map<String, dynamic>>(res);
      final newAccess = data['accessToken'] as String?;
      if (newAccess == null) throw const ApiException('No access token returned from refresh');
      await _tokens.saveTokens(access: newAccess, refresh: data['refreshToken'] as String? ?? refreshToken);
      final user = data['user'];
      if (user is Map<String, dynamic>) onUserRefreshed?.call(user);
      return newAccess;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) await onForceLogout();
      rethrow;
    }
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._client);

  final ApiClient _client;

  static const _retriedFlag = 'retried-after-refresh';

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _client._tokens.readAccess();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final isAuthPath = ApiClient._noRefreshPaths.any(options.path.contains);
    final alreadyRetried = options.extra[_retriedFlag] == true;
    if (err.response?.statusCode != 401 || isAuthPath || alreadyRetried) {
      return handler.next(err);
    }
    try {
      final newAccess = await _client.refreshAccessToken();
      if (newAccess == null) return handler.next(err);
      options.headers['Authorization'] = 'Bearer $newAccess';
      options.extra[_retriedFlag] = true;
      final retried = await _client.dio.fetch<dynamic>(options);
      return handler.resolve(retried);
    } on DioException catch (e) {
      return handler.next(e);
    } catch (_) {
      return handler.next(err);
    }
  }
}
