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

  /// The session calls (login, /auth/me, logout) go through [sessionApiClientProvider], never
  /// [authApiProvider]: that one is built on [apiClientProvider], which watches this controller,
  /// and Riverpod 3 rejects a provider reading anything that depends on it
  /// (`CircularDependencyError ... Provider<AuthApi>`), which broke sign-in on the phone.
  AuthApi get _api => AuthApi(ref.read(sessionApiClientProvider).dio);

  /// Reads the saved session. Online, /auth/me confirms it (and the interceptor refreshes
  /// an expired access token on the way). Offline, the last saved user is trusted so the
  /// app still opens; the first real request will sort out the session.
  ///
  /// Whatever goes wrong, this ends in signed-in or signed-out: the splash screen must never
  /// be left waiting. A slow server gets [restoreTimeout] before the cached user is trusted.
  Future<void> _restore() async {
    try {
      final access = await _tokens.readAccess();
      final refresh = await _tokens.readRefresh();
      if (access == null || refresh == null) {
        state = const AuthSignedOut();
        return;
      }
      final user = await _api.me().timeout(restoreTimeout);
      await _tokens.saveUser(user.toJson());
      state = AuthSignedIn(user);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        await handleForcedLogout();
        return;
      }
      await _useCachedUser();
    } catch (_) {
      // Timeout, or a reply that didn't parse: open with the last saved user if there is one.
      await _useCachedUser();
    }
  }

  static const restoreTimeout = Duration(seconds: 8);

  Future<void> _useCachedUser() async {
    try {
      final cached = await _tokens.readUser();
      state = cached != null ? AuthSignedIn(AppUser.fromJson(cached)) : const AuthSignedOut();
    } catch (_) {
      state = const AuthSignedOut();
    }
  }

  /// Returns the server's answer so the login screen can ask for the 2FA code when needed.
  Future<LoginResult> login({required String email, required String password, String? totpCode}) async {
    final result = await _api.login(email: email, password: password, totpCode: totpCode);
    if (result is LoginSession) {
      await _tokens.saveTokens(access: result.accessToken, refresh: result.refreshToken);
      await _tokens.saveUser(result.user.toJson());
      state = AuthSignedIn(result.user);
    }
    return result;
  }

  Future<void> signOut() async {
    try {
      await _api.logout(await _tokens.readRefresh());
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

/// The client [AuthController] uses for its own calls. Unlike [apiClientProvider] it does not
/// watch the signed-in user, so the controller can use it without depending on itself.
/// Its callbacks read the controller only when they run, which adds no dependency.
final sessionApiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    ref.watch(tokenStoreProvider),
    onForceLogout: () => ref.read(authControllerProvider.notifier).handleForcedLogout(),
    onUserRefreshed: (user) => ref.read(authControllerProvider.notifier).updateUser(user),
  );
  ref.onDispose(() => client.dio.close(force: true));
  return client;
});

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
