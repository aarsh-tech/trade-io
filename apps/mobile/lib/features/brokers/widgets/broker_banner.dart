import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router.dart';
import '../../../shared/widgets/ui.dart';
import '../../home/app_chrome.dart';
import '../brokers_providers.dart';

/// Tells the user why broker data is missing: no account linked, or the Zerodha session has
/// expired. Offers the daily login or account management. Adds its own bottom gap when shown.
class BrokerBanner extends ConsumerWidget {
  const BrokerBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(activeBrokerProvider);
    if (!state.hasValue) return const SizedBox.shrink();
    final broker = state.value;
    if (broker != null && !broker.sessionExpired) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Notice(
        broker == null
            ? 'Link a Zerodha account to see live funds, positions and holdings.'
            : 'Zerodha needs a fresh login every day. Log in to resume live data and orders.',
        title: broker == null ? 'No broker connected' : 'Kite session expired',
        tone: Tone.warn,
        icon: broker == null ? Icons.power_off_outlined : Icons.key_off_outlined,
        action: ToneButton(
          label: broker == null ? 'Manage brokers' : 'Daily login',
          icon: broker == null ? Icons.power_outlined : Icons.login_rounded,
          tone: Tone.warn,
          onPressed: () => broker == null ? context.go(Routes.brokers) : showKiteSheet(context),
        ),
      ),
    );
  }
}
