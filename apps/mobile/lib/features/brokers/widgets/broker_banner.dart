import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../router.dart';
import '../brokers_providers.dart';

/// Tells the user why broker data is missing: no account linked, or the Zerodha session has
/// expired. Links to account management and the in-app Zerodha login.
class BrokerBanner extends ConsumerWidget {
  const BrokerBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final broker = ref.watch(activeBrokerProvider).value;
    final loaded = ref.watch(activeBrokerProvider).hasValue;
    if (!loaded) return const SizedBox.shrink();

    final colors = context.colors;
    String? text;
    IconData icon = Icons.info_outline;
    Color tone = colors.info;
    if (broker == null) {
      text = 'Link a Zerodha account to see live data.';
    } else if (broker.sessionExpired) {
      text = 'Zerodha session expired. Sign in again to resume live data.';
      icon = Icons.key_off_outlined;
      tone = colors.warn;
    }
    if (text == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tone.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: tone),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: colors.foreground, fontSize: 13))),
          TextButton(onPressed: () => context.push(Routes.brokers), child: const Text('Manage')),
        ],
      ),
    );
  }
}
