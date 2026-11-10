import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
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
        title: const Text('Move alerts'),
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
                padding: const EdgeInsets.all(16),
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  Text('${data.day ?? ''} · ${data.status ?? ''}'),
                  const Text('Alerts refresh every 15 seconds while this screen is open.'),
                  if (data.alerts.isEmpty)
                    const EmptyState(icon: Icons.notifications_none, title: 'No move alerts yet'),
                  // The server sends the newest alert first.
                  for (final a in data.alerts)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${a.symbol} · ${a.hhmm} IST', style: Theme.of(context).textTheme.titleMedium),
                            // `level` is the drop threshold (2 or 4 %) of an open-drive alert, else 0.
                            Text(
                              '${a.type.replaceAll('_', ' ')}${a.type == 'OPEN_DRIVE' && a.level > 0 ? ' ${formatPrice(a.level, decimals: 0)}%' : ''}',
                            ),
                            const SizedBox(height: 8),
                            Text(a.text),
                            const SizedBox(height: 8),
                            Text(
                              'Alert price ${formatPrice(a.ltp)} · Change ${formatPct(a.changePct)}\nStop reference ${formatPrice(a.stopRef)} · Volume pace ${a.volPace.toStringAsFixed(1)}×',
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
      ),
    );
  }
}
