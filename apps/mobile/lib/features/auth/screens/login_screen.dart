import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_config.dart';
import '../../../core/network/api_envelope.dart';
import '../auth_models.dart';

/// Email + password, then the 6-digit code when the account has 2FA on.
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
  bool _showPassword = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _totp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e, 'Login failed'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Tradeio', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('Sign in to your account', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                      if (AppConfig.isLocalBackend) ...[
                        const SizedBox(height: 8),
                        Text('Server: ${AppConfig.apiOrigin}', style: theme.textTheme.bodySmall),
                      ],
                      const SizedBox(height: 28),
                      TextFormField(
                        controller: _email,
                        enabled: !_busy && !_needTotp,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.username, AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(labelText: 'Email'),
                        validator: (v) => (v == null || !v.contains('@')) ? 'Enter your email' : null,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _password,
                        enabled: !_busy && !_needTotp,
                        obscureText: !_showPassword,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: _needTotp ? TextInputAction.next : TextInputAction.done,
                        onFieldSubmitted: (_) => _needTotp ? null : _submit(),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          suffixIcon: IconButton(
                            tooltip: _showPassword ? 'Hide password' : 'Show password',
                            icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                            onPressed: () => setState(() => _showPassword = !_showPassword),
                          ),
                        ),
                        validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                      ),
                      if (_needTotp) ...[
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _totp,
                          enabled: !_busy,
                          autofocus: true,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(6),
                          ],
                          autofillHints: const [AutofillHints.oneTimeCode],
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: const InputDecoration(
                            labelText: '2FA code',
                            helperText: 'The 6-digit code from your authenticator app',
                          ),
                          validator: (v) => (v == null || v.length != 6) ? 'Enter the 6-digit code' : null,
                        ),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child:
                            _busy
                                ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                : Text(_needTotp ? 'Verify and sign in' : 'Sign in'),
                      ),
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
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
