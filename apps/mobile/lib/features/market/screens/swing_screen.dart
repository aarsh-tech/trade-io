import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../core/utils/market_time.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../orders/order_ticket.dart';
import '../market_api.dart';
import '../scanner_models.dart';
import '../scanner_providers.dart';

const _patterns = [
  'ALL',
  'VCP',
  'ROCKET_BASE',
  'TIGHT_AREA',
  'INTRADAY_MOMENTUM',
  'DAILY_INSIDE',
  'WEEKLY_INSIDE',
  'MONTHLY_INSIDE',
  'EMA_PULLBACK',
];

/// Web /swing-scanner: price and volume setups across NIFTY 500 + F&O, ranked.
class SwingScreen extends ConsumerStatefulWidget {
  const SwingScreen({super.key});
  @override
  ConsumerState<SwingScreen> createState() => _SwingScreenState();
}

class _SwingScreenState extends ConsumerState<SwingScreen> {
  int _page = 1;
  String _pattern = 'ALL', _sort = 'score';
  bool _running = false;

  Future<void> _run() async {
    setState(() => _running = true);
    try {
      await ref.read(marketApiProvider).runSwing();
      setState(() => _page = 1);
      ref.invalidate(swingProvider);
      if (mounted) toast(context, 'Scan started. Results refresh automatically.');
    } catch (e) {
      if (mounted) toast(context, apiErrorMessage(e, 'Scan failed'), error: true);
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final query = (page: _page, pattern: _pattern, sortBy: _sort);
    ref.watch(swingSubscriptionProvider(query));
    final scan = ref.watch(swingProvider(query));
    final scanning = scan.value?.isScanning ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Swing Scanner')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(swingProvider(query).future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: AppSpace.pageInsets,
          children: [
            PageHeader(
              'Swing scanner',
              subtitle: 'Price and volume setups across NIFTY 500 + F&O. Do your own research before trading.',
              actions: [
                ToneButton(
                  label: scanning ? 'Scanning…' : 'Run scan',
                  icon: Icons.radar_rounded,
                  filled: true,
                  height: 34,
                  busy: _running || scanning,
                  onPressed: _run,
                ),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final p in _patterns) ...[
                    ChoiceChip(
                      label: Text(p == 'ALL' ? 'All patterns' : p.replaceAll('_', ' ')),
                      selected: _pattern == p,
                      onSelected:
                          (_) => setState(() {
                            _pattern = p;
                            _page = 1;
                          }),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),
            SegmentTabs<String>(
              options: const [
                (value: 'score', label: 'Top score', tone: null),
                (value: 'riskPct', label: 'Lowest risk', tone: null),
                (value: 'riskReward', label: 'Best R:R', tone: null),
              ],
              value: _sort,
              onChanged:
                  (v) => setState(() {
                    _sort = v;
                    _page = 1;
                  }),
            ),
            const SizedBox(height: AppSpace.gap),
            if (scanning) ...[const LinearProgressIndicator(), const SizedBox(height: 8)],
            AsyncView(
              value: scan,
              loading: const Loading(label: 'Loading scan…'),
              onRetry: () => ref.invalidate(swingProvider(query)),
              data: (data) {
                final rows = data?.results ?? const <SwingResult>[];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (data?.scannedAt != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Scanned ${formatMarketTimestamp(data!.scannedAt!)} · ${data.totalScanned} stocks · ${data.totalResults} setups',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    if (rows.isEmpty)
                      const Card(
                        child: EmptyPanel(
                          icon: Icons.radar_rounded,
                          title: 'No scan results',
                          message: 'Run a scan with an active broker session, or choose another pattern.',
                        ),
                      )
                    else
                      Card(
                        child: Column(
                          children: [
                            for (final (i, s) in rows.indexed) ...[
                              if (i > 0) Divider(color: c.border),
                              _SwingRow(result: s),
                            ],
                          ],
                        ),
                      ),
                    if ((data?.totalPages ?? 0) > 1)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            TextButton(
                              onPressed: _page > 1 ? () => setState(() => _page--) : null,
                              child: const Text('Previous'),
                            ),
                            Text('Page $_page / ${data!.totalPages}', style: Theme.of(context).textTheme.bodySmall),
                            TextButton(
                              onPressed: _page < data.totalPages ? () => setState(() => _page++) : null,
                              child: const Text('Next'),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SwingRow extends ConsumerStatefulWidget {
  const _SwingRow({required this.result});
  final SwingResult result;
  @override
  ConsumerState<_SwingRow> createState() => _SwingRowState();
}

class _SwingRowState extends ConsumerState<_SwingRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = widget.result;
    final ltp =
        ref.watch(marketSocketProvider.select((m) => m.find('${s.exchange}:${s.symbol}')?.ltp)) ?? s.currentPrice;
    final short = (s.direction ?? (s.target1 >= s.entryPrice ? 'LONG' : 'SHORT')) == 'SHORT';
    final tone = switch (s.confidence) {
      'HIGH' => Tone.profit,
      'MEDIUM' => Tone.warn,
      _ => Tone.neutral,
    };
    return InkWell(
      onTap: () => setState(() => _open = !_open),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(s.symbol, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                Pill(s.confidence.isEmpty ? '—' : s.confidence, tone: tone),
                const Spacer(),
                Text(formatPrice(ltp), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              '${s.pattern.replaceAll('_', ' ')} · Score ${s.score.toStringAsFixed(0)} · Risk ${s.riskPct.toStringAsFixed(1)}% · R:R ${s.riskReward.toStringAsFixed(1)}',
              style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
            ),
            Text(
              'Entry ${formatPrice(s.entryPrice)} · SL ${formatPrice(s.stopLoss)} · T1 ${formatPrice(s.target1)} · T2 ${formatPrice(s.target2)}',
              style: TextStyle(fontSize: 11.5, color: c.foreground),
            ),
            if (_open) ...[
              for (final n in s.notes)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('• $n', style: TextStyle(fontSize: 11.5, color: c.mutedForeground)),
                ),
              const SizedBox(height: 8),
              ToneButton(
                label: 'Trade ${s.symbol}',
                icon: Icons.shopping_cart_outlined,
                tone: short ? Tone.loss : Tone.brand,
                expand: true,
                onPressed:
                    () => context.push(
                      Routes.trade,
                      extra: TicketPrefill(
                        symbol: s.symbol,
                        exchange: s.exchange,
                        side: short ? 'SELL' : 'BUY',
                        ltp: ltp,
                        price: s.entryPrice > 0 ? s.entryPrice : null,
                        product: 'CNC',
                        note:
                            'Entry ${formatPrice(s.entryPrice)} · Stop ${formatPrice(s.stopLoss)} · T1 ${formatPrice(s.target1)} · T2 ${formatPrice(s.target2)}',
                      ),
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
