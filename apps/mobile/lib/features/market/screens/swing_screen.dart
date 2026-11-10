import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/socket/market_socket.dart';
import '../../../core/utils/format.dart';
import '../../../core/utils/market_time.dart';
import '../../../shared/widgets/action_button.dart';
import '../../../shared/widgets/async_view.dart';
import '../market_api.dart';
import '../scanner_models.dart';
import '../scanner_providers.dart';

class SwingScreen extends ConsumerStatefulWidget {
  const SwingScreen({super.key});
  @override
  ConsumerState<SwingScreen> createState() => _SwingScreenState();
}

class _SwingScreenState extends ConsumerState<SwingScreen> {
  int _page = 1;
  String _pattern = 'ALL', _sort = 'score';
  @override
  Widget build(BuildContext context) {
    final query = (page: _page, pattern: _pattern, sortBy: _sort);
    ref.watch(swingSubscriptionProvider(query));
    final scan = ref.watch(swingProvider(query));
    return Scaffold(
      appBar: AppBar(title: const Text('Swing scanner')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                ActionButton(
                  label: 'Run scan',
                  enabled: !(scan.value?.isScanning ?? false),
                  action: () => ref.read(marketApiProvider).runSwing(),
                  onSuccess: () {
                    setState(() => _page = 1);
                    ref.invalidate(swingProvider);
                  },
                ),
                const Text('Scans run on the server. Results refresh every 30 seconds.'),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: _pattern,
                        decoration: const InputDecoration(labelText: 'Pattern'),
                        items: [
                          for (final p in [
                            'ALL',
                            'VCP',
                            'ROCKET_BASE',
                            'TIGHT_AREA',
                            'INTRADAY_MOMENTUM',
                            'DAILY_INSIDE',
                            'WEEKLY_INSIDE',
                            'MONTHLY_INSIDE',
                            'EMA_PULLBACK',
                          ])
                            DropdownMenuItem(value: p, child: Text(p.replaceAll('_', ' '))),
                        ],
                        onChanged:
                            (v) => setState(() {
                              _pattern = v!;
                              _page = 1;
                            }),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: _sort,
                        decoration: const InputDecoration(labelText: 'Sort'),
                        items: const [
                          DropdownMenuItem(value: 'score', child: Text('Score')),
                          DropdownMenuItem(value: 'riskPct', child: Text('Lowest risk')),
                          DropdownMenuItem(value: 'riskReward', child: Text('Risk/reward')),
                        ],
                        onChanged:
                            (v) => setState(() {
                              _sort = v!;
                              _page = 1;
                            }),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView(
              value: scan,
              onRetry: () => ref.invalidate(swingProvider(query)),
              data:
                  (data) => RefreshIndicator(
                    onRefresh: () => ref.refresh(swingProvider(query).future),
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        if (data?.isScanning ?? false) const LinearProgressIndicator(),
                        if (data?.scannedAt != null)
                          Text('Scanned ${formatMarketTimestamp(data!.scannedAt!)} · ${data.totalResults} results'),
                        if (data == null || data.results.isEmpty)
                          const EmptyState(
                            icon: Icons.radar,
                            title: 'No scan results',
                            message: 'Run a scan with an active broker session, or choose another pattern.',
                          ),
                        for (final s in data?.results ?? const <SwingResult>[])
                          Card(
                            child: ExpansionTile(
                              title: Text('${s.symbol} · ${s.confidence}'),
                              subtitle: Text('${s.pattern.replaceAll('_', ' ')} · Score ${s.score}'),
                              children: [
                                ListTile(
                                  title: Text(
                                    'LTP ${formatPrice(ref.watch(marketSocketProvider.select((m) => m.find('${s.exchange}:${s.symbol}')?.ltp)) ?? s.currentPrice)}',
                                  ),
                                  subtitle: Text(
                                    'Entry ${formatPrice(s.entryPrice)} · Stop ${formatPrice(s.stopLoss)}\nTargets ${formatPrice(s.target1)} / ${formatPrice(s.target2)}\nRisk ${s.riskPct.toStringAsFixed(2)}% · R:R ${s.riskReward.toStringAsFixed(2)}\n${s.notes.join('\n')}',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            TextButton(
                              onPressed: _page > 1 ? () => setState(() => _page--) : null,
                              child: const Text('Previous'),
                            ),
                            Text('Page $_page / ${data == null || data.totalPages == 0 ? 1 : data.totalPages}'),
                            TextButton(
                              onPressed: _page < (data?.totalPages ?? 0) ? () => setState(() => _page++) : null,
                              child: const Text('Next'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
