import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/ui.dart';
import '../brokers_providers.dart';

/// The web's "Select Broker Account" dropdown: which linked account the page shows.
class BrokerPicker extends ConsumerWidget {
  const BrokerPicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final accounts = ref.watch(brokersProvider).value ?? const [];
    final active = ref.watch(activeBrokerProvider).value;
    if (active == null) return const SizedBox.shrink();
    final label = '${active.label}${active.clientId == null ? '' : ' (${active.clientId})'}';
    final content = Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(AppRadius.control),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Dot(active.isActive && !active.sessionExpired ? c.profit : c.warn, size: 7),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
            ),
          ),
          if (accounts.length > 1) Icon(Icons.expand_more_rounded, size: 18, color: c.mutedForeground),
        ],
      ),
    );
    if (accounts.length < 2) return content;
    return PopupMenuButton<String>(
      tooltip: 'Choose broker account',
      onSelected: (id) => ref.read(selectedBrokerProvider.notifier).select(id),
      itemBuilder:
          (_) => [
            for (final b in accounts)
              PopupMenuItem(
                value: b.id,
                child: Text('${b.label} (${b.clientId ?? '—'})${b.isActive ? ' · Active' : ''}'),
              ),
          ],
      child: content,
    );
  }
}
