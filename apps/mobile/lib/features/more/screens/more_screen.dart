import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_config.dart';

/// Account, app info and sign-out. Settings, brokers and risk controls plug in here later.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final yes = await showDialog<bool>(
      context: context,
      builder:
          (ctx) => AlertDialog(
            title: const Text('Sign out?'),
            content: const Text('Running strategies keep running on the server. You will need to sign in again.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
            ],
          ),
    );
    if (yes == true) await ref.read(authControllerProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthSignedIn ? auth.user : null;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(child: Text((user?.name.isNotEmpty ?? false) ? user!.name[0].toUpperCase() : '?')),
              title: Text(user?.name ?? '—'),
              subtitle: Text(user?.email ?? ''),
              trailing:
                  user?.role == null ? null : Chip(label: Text(user!.role!), visualDensity: VisualDensity.compact),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.verified_user_outlined),
                  title: const Text('Two-factor authentication'),
                  trailing: Text(
                    (user?.twoFaEnabled ?? false) ? 'On' : 'Off',
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.dns_outlined),
                  title: const Text('Server'),
                  subtitle: Text(AppConfig.apiOrigin),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, ref),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: scheme.error),
          ),
        ],
      ),
    );
  }
}
