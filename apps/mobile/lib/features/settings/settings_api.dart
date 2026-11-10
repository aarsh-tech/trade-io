import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/network/api_envelope.dart';

/// Endpoints under /users. Same calls as `userApi` in apps/web/src/lib/api.ts.
class SettingsApi {
  SettingsApi(this._dio);

  final Dio _dio;

  /// Returns the updated user fields (`id`, `email`, `name`, `twoFaEnabled`).
  Future<Map<String, dynamic>> updateProfile({required String name}) async =>
      unwrapData<Map<String, dynamic>>(await _dio.patch<dynamic>('/users/profile', data: {'name': name}));

  Future<void> changePassword({required String currentPassword, required String newPassword}) async =>
      unwrapData<dynamic>(
        await _dio.post<dynamic>(
          '/users/change-password',
          data: {'currentPassword': currentPassword, 'newPassword': newPassword},
        ),
      );
}

final settingsApiProvider = Provider<SettingsApi>((ref) => SettingsApi(ref.watch(apiClientProvider).dio));
