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

  Future<void> logout(String? refreshToken) => _dio.post<dynamic>('/auth/logout', data: {'refreshToken': refreshToken});
}

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider).dio));
