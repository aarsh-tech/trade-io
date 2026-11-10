import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../router.dart';
import '../auth_api.dart';
import '../widgets/auth_layout.dart';

/// Web /forgot-password: asks the server to issue a reset link for the email.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authApiProvider).forgotPassword(_email.text.trim());
      if (mounted) setState(() => _sent = true);
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e, 'Could not send the reset link'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _back() => context.canPop() ? context.pop() : context.go(Routes.login);

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_sent) {
      return AuthLayout(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
                child: Icon(Icons.mark_email_read_outlined, color: c.accentForeground),
              ),
            ),
            const SizedBox(height: 14),
            Text('Check your email', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 6),
            Text(
              'If an account exists for ${_email.text.trim()}, a password reset link has been sent. '
              'Open it, or paste its code on the next screen.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 18),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
              onPressed: () => context.pushReplacement(Routes.resetPassword),
              child: const Text('I have a reset code'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _back, child: const Text('Back to login')),
          ],
        ),
      );
    }
    return AuthLayout(
      title: 'Forgot user ID or password?',
      subtitle: 'Enter your registered email and we will send you a link to reset your password.',
      footer: TextButton(
        style: TextButton.styleFrom(foregroundColor: c.mutedForeground),
        onPressed: _back,
        child: const Text('Remembered it? Back to login', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
      ),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _email,
              enabled: !_busy,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.email],
              onFieldSubmitted: (_) => _submit(),
              decoration: const InputDecoration(labelText: 'Email'),
              validator: (v) => (v == null || !v.contains('@')) ? 'Enter your email' : null,
            ),
            if (_error != null) ...[const SizedBox(height: 12), FormError(_error!)],
            const SizedBox(height: 16),
            BusyButton(label: 'Send reset link', busy: _busy, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}

/// Web /reset-password: the token from the emailed link + a new password.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, this.token});

  final String? token;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _form = GlobalKey<FormState>();
  late final _token = TextEditingController(text: widget.token ?? '');
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _token.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  /// Accepts the bare token or the whole link (`…/reset-password?token=…`).
  String _tokenValue() {
    final raw = _token.text.trim();
    final uri = Uri.tryParse(raw);
    return uri?.queryParameters['token'] ?? raw;
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authApiProvider).resetPassword(token: _tokenValue(), newPassword: _password.text);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Password reset. Sign in with your new password.')));
      context.go(Routes.login);
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e, 'Invalid or expired reset link'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AuthLayout(
      title: 'Set new password',
      subtitle: 'Paste the code or link from the reset email, then choose a new password.',
      footer: TextButton(
        style: TextButton.styleFrom(foregroundColor: c.mutedForeground),
        onPressed: () => context.go(Routes.login),
        child: const Text('Back to login', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
      ),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _token,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Reset code or link'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Paste the code from the email' : null,
            ),
            const SizedBox(height: 14),
            PasswordField(
              controller: _password,
              label: 'New password',
              enabled: !_busy,
              autofillHints: const [AutofillHints.newPassword],
              validator: (v) => (v == null || v.length < 8) ? 'At least 8 characters' : null,
            ),
            const SizedBox(height: 14),
            PasswordField(
              controller: _confirm,
              label: 'Confirm password',
              enabled: !_busy,
              autofillHints: const [AutofillHints.newPassword],
              onSubmitted: (_) => _submit(),
              validator: (v) => v != _password.text ? 'Passwords do not match' : null,
            ),
            if (_error != null) ...[const SizedBox(height: 12), FormError(_error!)],
            const SizedBox(height: 16),
            BusyButton(label: 'Reset password', busy: _busy, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
