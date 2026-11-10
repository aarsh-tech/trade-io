import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/auth_api.dart';
import '../../features/auth/auth_models.dart';
import '../network/api_client.dart';
import 'token_store.dart';

/// Who is signed in. [AuthUnknown] only while the stored session is being restored at
/// start-up; the router shows the splash screen for it.
sealed class AuthState {
  const AuthState();
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut();
}

class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user);

  final AppUser user;
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_restore);
    return const AuthUnknown();
  }

  TokenStore get _tokens => ref.read(tokenStoreProvider);

  /// Reads the saved session. Online, /auth/me confirms it (and the interceptor refreshes
  /// an expired access token on the way). Offline, the last saved user is trusted so the
  /// app still opens; the first real request will sort out the session.
  Future<void> _restore() async {
    final access = await _tokens.readAccess();
    final refresh = await _tokens.readRefresh();
    if (access == null || refresh == null) {
      state = const AuthSignedOut();
      return;
    }
    try {
      final user = await ref.read(authApiProvider).me();
      await _tokens.saveUser(user.toJson());
      state = AuthSignedIn(user);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        await handleForcedLogout();
        return;
      }
      final cached = await _tokens.readUser();
      state = cached != null ? AuthSignedIn(AppUser.fromJson(cached)) : const AuthSignedOut();
    }
  }

  /// Returns the server's answer so the login screen can ask for the 2FA code when needed.
  Future<LoginResult> login({required String email, required String password, String? totpCode}) async {
    final result = await ref.read(authApiProvider).login(email: email, password: password, totpCode: totpCode);
    if (result is LoginSession) {
      await _tokens.saveTokens(access: result.accessToken, refresh: result.refreshToken);
      await _tokens.saveUser(result.user.toJson());
      state = AuthSignedIn(result.user);
    }
    return result;
  }

  Future<void> signOut() async {
    try {
      await ref.read(authApiProvider).logout(await _tokens.readRefresh());
    } catch (_) {
      // Signing out must always work locally, even offline.
    }
    await handleForcedLogout();
  }

  /// The session is gone (refresh token rejected, or the user signed out): forget it.
  Future<void> handleForcedLogout() async {
    await _tokens.clear();
    state = const AuthSignedOut();
  }

  void updateUser(Map<String, dynamic> json) {
    final user = AppUser.fromJson(json);
    state = AuthSignedIn(user);
    _tokens.saveUser(json);
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Created here rather than in api_client.dart so the client can reach the controller
/// without a circular import: the callbacks run later, never while providers are building.
final apiClientProvider = Provider<ApiClient>((ref) {
  // Recreate feature caches when the signed-in account changes.
  ref.watch(authControllerProvider.select((s) => s is AuthSignedIn ? s.user.id : null));
  return ApiClient(
    ref.watch(tokenStoreProvider),
    onForceLogout: () => ref.read(authControllerProvider.notifier).handleForcedLogout(),
    onUserRefreshed: (user) => ref.read(authControllerProvider.notifier).updateUser(user),
  );
});
