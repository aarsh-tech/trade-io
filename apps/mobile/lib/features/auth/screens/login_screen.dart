import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_config.dart';
import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../router.dart';
import '../auth_models.dart';
import '../widgets/auth_layout.dart';

/// Email + password, then the 6-digit code when the account has 2FA on (web /login).
/// On success the router redirects to the dashboard by itself.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _totp = TextEditingController();
  bool _needTotp = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _totp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(authControllerProvider.notifier)
          .login(email: _email.text.trim(), password: _password.text, totpCode: _needTotp ? _totp.text.trim() : null);
      if (!mounted) return;
      switch (result) {
        case LoginRequireTotp():
          setState(() => _needTotp = true);
        case LoginSession():
          break; // the router takes over
      }
    } catch (e) {
      if (!mounted) return;
      // An error that isn't from the server (Keystore, parsing, a bug) is shown with its cause,
      // so a failure on a real phone can be reported and traced instead of reading "Login failed".
      final message =
          e is ApiException || e is DioException
              ? apiErrorMessage(e, 'Sign-in failed')
              : 'Sign-in failed on this phone: $e';
      setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AuthLayout(
      title: _needTotp ? 'Two-factor authentication' : 'Login to Tradeio.site',
      subtitle:
          'Authorized access only. Algorithmic trading terminal.'
          '${AppConfig.isLocalBackend ? '\nServer: ${AppConfig.apiOrigin}' : ''}',
      footer: TextButton(
        style: TextButton.styleFrom(foregroundColor: c.mutedForeground),
        onPressed: () => context.push(Routes.register),
        child: const Text(
          "Don't have an account? Request access",
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
        ),
      ),
      child: Form(
        key: _formKey,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!_needTotp) ...[
                TextFormField(
                  controller: _email,
                  enabled: !_busy,
                  keyboardType: TextInputType.emailAddress,
                  // Phone keyboards must not "fix" an email: the server matches it exactly.
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.none,
                  autofillHints: const [AutofillHints.username, AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'Email'),
                  validator: (v) => (v == null || !v.contains('@')) ? 'Enter your email' : null,
                ),
                const SizedBox(height: 14),
                PasswordField(
                  controller: _password,
                  label: 'Password',
                  enabled: !_busy,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                ),
              ] else ...[
                Text(
                  'Enter the 6-digit code from your authenticator app for ${_email.text.trim()}.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _totp,
                  enabled: !_busy,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(fontSize: 20, letterSpacing: 8, fontWeight: FontWeight.w600),
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                  autofillHints: const [AutofillHints.oneTimeCode],
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(labelText: '2FA code', hintText: '000000'),
                  validator: (v) => (v == null || v.length != 6) ? 'Enter the 6-digit code' : null,
                ),
              ],
              if (_error != null) ...[const SizedBox(height: 14), FormError(_error!)],
              const SizedBox(height: 18),
              BusyButton(label: _needTotp ? 'Verify and sign in' : 'Sign in', busy: _busy, onPressed: _submit),
              const SizedBox(height: 10),
              if (_needTotp)
                TextButton(
                  onPressed:
                      _busy
                          ? null
                          : () => setState(() {
                            _needTotp = false;
                            _totp.clear();
                          }),
                  child: const Text('Use a different account'),
                )
              else
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: c.mutedForeground),
                  onPressed: _busy ? null : () => context.push(Routes.forgotPassword),
                  child: const Text('Forgot user ID or password?', style: TextStyle(fontWeight: FontWeight.w400)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
