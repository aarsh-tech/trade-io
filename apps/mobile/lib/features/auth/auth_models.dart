import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_models.freezed.dart';
part 'auth_models.g.dart';

/// The user object the backend returns from login, refresh and /auth/me.
/// Mirrors `User` in apps/web/src/store/index.ts.
@freezed
abstract class AppUser with _$AppUser {
  const factory AppUser({
    required String id,
    required String email,
    required String name,
    String? role,
    bool? isActive,
    @Default(false) bool twoFaEnabled,
  }) = _AppUser;

  factory AppUser.fromJson(Map<String, dynamic> json) => _$AppUserFromJson(json);
}

/// POST /auth/login either asks for the 2FA code or returns a full session.
@freezed
sealed class LoginResult with _$LoginResult {
  const factory LoginResult.requireTotp() = LoginRequireTotp;

  const factory LoginResult.session({
    required AppUser user,
    required String accessToken,
    required String refreshToken,
  }) = LoginSession;
}

/// POST /auth/2fa/setup
@freezed
abstract class TwoFaSetup with _$TwoFaSetup {
  const factory TwoFaSetup({required String secret, required String qrCode}) = _TwoFaSetup;

  factory TwoFaSetup.fromJson(Map<String, dynamic> json) => _$TwoFaSetupFromJson(json);
}
