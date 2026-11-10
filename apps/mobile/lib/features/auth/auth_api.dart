import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';
import 'auth_models.dart';

/// Endpoints under /auth. Same calls as `authApi` in apps/web/src/lib/api.ts.
class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  Future<LoginResult> login({required String email, required String password, String? totpCode}) async {
    final res = await _dio.post<dynamic>(
      '/auth/login',
      data: {'email': email, 'password': password, if (totpCode != null && totpCode.isNotEmpty) 'totpCode': totpCode},
    );
    final data = unwrapData<Map<String, dynamic>>(res);
    if (data['requireTotp'] == true) return const LoginResult.requireTotp();
    final user = data['user'];
    final access = data['accessToken'];
    final refresh = data['refreshToken'];
    if (user is! Map<String, dynamic> || access is! String || refresh is! String) {
      throw const ApiException('Unexpected login response');
    }
    return LoginResult.session(user: AppUser.fromJson(user), accessToken: access, refreshToken: refresh);
  }

  Future<AppUser> me() async {
    final res = await _dio.get<dynamic>('/auth/me');
    return AppUser.fromJson(unwrapData<Map<String, dynamic>>(res));
  }

  /// Always answers success (the server never reveals whether an account exists).
  Future<void> forgotPassword(String email) async =>
      unwrapData<dynamic>(await _dio.post<dynamic>('/auth/forgot-password', data: {'email': email}));

  Future<void> resetPassword({required String token, required String newPassword}) async => unwrapData<dynamic>(
    await _dio.post<dynamic>('/auth/reset-password', data: {'token': token, 'newPassword': newPassword}),
  );

  /// Starts 2FA enrolment: a QR code (PNG data URL) for the authenticator app.
  Future<TwoFaSetup> setup2fa() async =>
      TwoFaSetup.fromJson(unwrapData<Map<String, dynamic>>(await _dio.post<dynamic>('/auth/2fa/setup')));

  Future<void> verify2fa(String code) async =>
      unwrapData<dynamic>(await _dio.post<dynamic>('/auth/2fa/verify', data: {'code': code}));

  Future<void> disable2fa() async => unwrapData<dynamic>(await _dio.post<dynamic>('/auth/2fa/disable'));

  Future<void> logout(String? refreshToken) => _dio.post<dynamic>('/auth/logout', data: {'refreshToken': refreshToken});
}

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider).dio));
