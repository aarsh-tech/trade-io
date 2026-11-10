import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../router.dart';
import '../widgets/auth_layout.dart';

/// Public sign-up is closed on the server (POST /auth/register is forbidden); accounts are
/// provisioned by the administrator. Same notice as the web's /register.
class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AuthLayout(
      title: 'Registration Closed',
      subtitle: 'Tradeio.site is an exclusive, private algorithmic trading terminal.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: c.warnSubtle,
                shape: BoxShape.circle,
                border: Border.all(color: c.warn.withValues(alpha: 0.6)),
              ),
              child: Icon(Icons.lock_outline_rounded, color: c.warn),
            ),
          ),
          const SizedBox(height: 14),
          Text('Invite-Only Platform', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          Text(
            'Public signups are currently disabled. Accounts can only be provisioned directly by the platform administrator.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 20),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
            onPressed: () => context.canPop() ? context.pop() : context.go(Routes.login),
            child: const Text('Return to Login'),
          ),
        ],
      ),
    );
  }
}
