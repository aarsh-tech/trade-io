import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/design.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../../../shared/widgets/status_chip.dart';
import '../scanner_models.dart';
import '../scanner_providers.dart';

class MoveAlertsScreen extends ConsumerStatefulWidget {
  const MoveAlertsScreen({super.key});
  @override
  ConsumerState<MoveAlertsScreen> createState() => _MoveAlertsScreenState();
}

class _MoveAlertsScreenState extends ConsumerState<MoveAlertsScreen> {
  Set<String>? _seen;
  bool _sound = true;
  @override
  Widget build(BuildContext context) {
    ref.listen(moveAlertsProvider, (_, next) {
      next.whenData((data) {
        final ids = data.alerts.map((a) => a.id).toSet();
        if (_seen != null && ids.difference(_seen!).isNotEmpty && _sound) SystemSound.play(SystemSoundType.alert);
        _seen = ids;
      });
    });
    return Scaffold(
      appBar: AppBar(
        title: const Text('Move Alerts'),
        actions: [
          IconButton(
            tooltip: _sound ? 'Mute alert sound' : 'Enable alert sound',
            onPressed: () => setState(() => _sound = !_sound),
            icon: Icon(_sound ? Icons.volume_up : Icons.volume_off),
          ),
        ],
      ),
      body: AsyncView(
        value: ref.watch(moveAlertsProvider),
        onRetry: () => ref.invalidate(moveAlertsProvider),
        data:
            (data) => RefreshIndicator(
              onRefresh: () => ref.refresh(moveAlertsProvider.future),
              child: ListView(
                padding: AppSpace.pageInsets,
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  if ((data.day ?? '').isNotEmpty || (data.status ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        [data.day, data.status].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  const InfoNote('New moves appear automatically while you’re here.', icon: Icons.bolt_rounded),
                  if (data.alerts.isEmpty)
                    const EmptyState(icon: Icons.notifications_none, title: 'No move alerts yet'),
                  // The server sends the newest alert first.
                  for (final a in data.alerts) _AlertCard(alert: a),
                ],
              ),
            ),
      ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert});

  final MoveAlert alert;

  @override
  Widget build(BuildContext context) {
    final a = alert;
    final theme = Theme.of(context);
    final colors = context.colors;
    final up = a.changePct >= 0;
    // `level` is the drop threshold (2 or 4 %) of an open-drive alert, else 0.
    final kind =
        '${a.type.replaceAll('_', ' ')}${a.type == 'OPEN_DRIVE' && a.level > 0 ? ' ${formatPrice(a.level, decimals: 0)}%' : ''}';
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpace.gap),
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.card),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(a.symbol, style: theme.textTheme.titleSmall?.copyWith(fontSize: 14))),
                if (a.hhmm.isNotEmpty) Text('${a.hhmm} IST', style: theme.textTheme.labelMedium),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusChip(kind, color: colors.signal),
                if (a.changePct != 0) StatusChip(formatPct(a.changePct), color: up ? colors.profit : colors.loss),
              ],
            ),
            if (a.text.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(a.text, style: theme.textTheme.bodySmall?.copyWith(color: colors.foreground)),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                _Metric('Price', formatPrice(a.ltp)),
                _Metric('Stop ref', a.stopRef > 0 ? formatPrice(a.stopRef) : '—'),
                _Metric('Volume pace', a.volPace > 0 ? '${a.volPace.toStringAsFixed(1)}×' : '—'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelSmall),
        const SizedBox(height: 2),
        Text(value, style: tabular(Theme.of(context).textTheme.titleSmall)),
      ],
    ),
  );
}
