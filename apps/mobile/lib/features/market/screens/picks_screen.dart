import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/socket/market_socket.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../orders/order_ticket.dart';
import '../market_api.dart';
import '../picks.dart';
import '../scanner_models.dart';

/// Web /intraday-picks: breakout and breakdown setups from the latest scan, sized to a profit
/// goal, with one tap into a pre-filled MIS order.
class PicksScreen extends ConsumerStatefulWidget {
  const PicksScreen({super.key});
  @override
  ConsumerState<PicksScreen> createState() => _PicksScreenState();
}

class _PicksScreenState extends ConsumerState<PicksScreen> {
  String _dir = 'ALL';
  String _query = '';
  double _targetRs = 500;
  bool _scanning = false;
  late final _target = TextEditingController(text: '500');

  @override
  void dispose() {
    _target.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    setState(() => _scanning = true);
    toast(context, 'Scanning market for breakout & breakdown candidates…');
    try {
      await ref.read(marketApiProvider).runSwing();
      await Future<void>.delayed(const Duration(seconds: 3));
      ref.invalidate(picksProvider);
      if (mounted) toast(context, 'Scan completed');
    } catch (e) {
      if (mounted) toast(context, apiErrorMessage(e, 'Scan failed. Please check broker connection.'), error: true);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    ref.watch(picksSubscriptionProvider);
    final scan = ref.watch(picksProvider);
    final all = scan.value?.results ?? const <SwingResult>[];
    final longs = all.where((r) => pickDirection(r) == 'LONG').length;
    final shorts = all.length - longs;
    final q = _query.toLowerCase();
    final shown =
        all
            .where((r) => _dir == 'ALL' || pickDirection(r) == _dir)
            .where(
              (r) =>
                  q.isEmpty ||
                  r.symbol.toLowerCase().contains(q) ||
                  r.pattern.toLowerCase().replaceAll('_', ' ').contains(q),
            )
            .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Intraday Picks')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(picksProvider.future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: AppSpace.pageInsets,
          children: [
            PageHeader(
              'Smart intraday momentum picks',
              subtitle: 'Breakout & breakdown setups with stop-loss, targets and risk sized to your profit goal',
              actions: [
                ToneButton(
                  label: _scanning ? 'Scanning market…' : 'Run market scan',
                  icon: Icons.refresh_rounded,
                  filled: true,
                  busy: _scanning,
                  height: 34,
                  onPressed: _scan,
                ),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            StatStrip(
              items: [
                (label: 'Scanned universe', value: '${scan.value?.totalScanned ?? 0}', color: null),
                (label: 'Total setups', value: '${all.length}', color: null),
                (label: 'Long breakouts', value: '$longs', color: c.profit),
                (label: 'Short breakdowns', value: '$shorts', color: c.loss),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            SegmentTabs<String>(
              options: [
                (value: 'ALL', label: 'All (${all.length})', tone: null),
                (value: 'LONG', label: 'Long ($longs)', tone: Tone.profit),
                (value: 'SHORT', label: 'Short ($shorts)', tone: Tone.loss),
              ],
              value: _dir,
              onChanged: (v) => setState(() => _dir = v),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(
                  width: 130,
                  child: TextField(
                    controller: _target,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    onChanged: (v) => setState(() => _targetRs = double.tryParse(v) ?? 0),
                    decoration: const InputDecoration(labelText: 'Target profit', prefixText: '₹ '),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(child: SearchField(onChanged: (v) => setState(() => _query = v.trim()))),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            AsyncView(
              value: scan,
              loading: const Loading(label: 'Loading intraday setups…'),
              onRetry: () => ref.invalidate(picksProvider),
              data:
                  (_) =>
                      shown.isEmpty
                          ? Card(
                            child: EmptyPanel(
                              icon: Icons.bolt_outlined,
                              title: 'No active intraday picks found',
                              message: 'Run a fresh market scan or adjust your filters.',
                              actions: [
                                ToneButton(
                                  label: 'Start new scan',
                                  icon: Icons.refresh_rounded,
                                  filled: true,
                                  onPressed: _scanning ? null : _scan,
                                ),
                              ],
                            ),
                          )
                          : Column(
                            children: [
                              for (final r in shown) ...[
                                _PickCard(pick: r, targetRs: _targetRs),
                                const SizedBox(height: AppSpace.gap),
                              ],
                            ],
                          ),
            ),
            const Notice(
              'Tapping Buy / Short opens a pre-filled MIS LIMIT order at the entry price, with the stop-loss and targets shown on the ticket. Place your stop-loss order after the entry fills.',
              title: 'Risk & execution',
              icon: Icons.info_outline_rounded,
            ),
          ],
        ),
      ),
    );
  }
}

class _PickCard extends ConsumerStatefulWidget {
  const _PickCard({required this.pick, required this.targetRs});
  final SwingResult pick;
  final double targetRs;
  @override
  ConsumerState<_PickCard> createState() => _PickCardState();
}

class _PickCardState extends ConsumerState<_PickCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = widget.pick;
    final long = pickDirection(r) == 'LONG';
    final tick = ref.watch(marketSocketProvider.select((s) => s.find('${r.exchange}:${r.symbol}')?.ltp));
    final live = tick != null && tick > 0;
    final price = live ? tick : r.currentPrice;
    final plan = PickPlan.of(r, widget.targetRs);
    final sideColor = long ? c.profit : c.loss;

    Widget level(String label, double v, Color color) => Expanded(
      child: Column(
        children: [
          Text(label, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w500, color: c.mutedForeground)),
          Text(formatPrice(v), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );

    final setup =
        '${long ? 'BUY (long)' : 'SELL (short)'} ${r.symbol} (${r.exchange})\n'
        'Entry ₹${formatPrice(r.entryPrice)} · SL ₹${formatPrice(r.stopLoss)} (${r.riskPct.toStringAsFixed(1)}%)\n'
        'T1 ₹${formatPrice(r.target1)} · T2 ₹${formatPrice(r.target2)}\n'
        'Qty ${plan.qty} · Capital ${formatInr(plan.capital, decimals: 0)}';

    return Panel(
      accent: r.confidence == 'HIGH' ? c.profit : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(r.symbol, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(width: 4),
              Text(r.exchange, style: TextStyle(fontSize: 10, color: c.mutedForeground)),
              const SizedBox(width: 6),
              Text(
                long ? 'LONG' : 'SHORT',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: sideColor),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Copy trade setup',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.copy_rounded, size: 16),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: setup));
                  toast(context, 'Setup copied');
                },
              ),
            ],
          ),
          Row(
            children: [
              Dot(live ? c.profit : c.mutedForeground.withValues(alpha: 0.4), size: 6),
              const SizedBox(width: 5),
              Text(
                '₹${formatPrice(price)}',
                style: const TextStyle(fontFamily: fontMono, fontSize: 12, fontWeight: FontWeight.w500),
              ),
              const Spacer(),
              Text(
                '${r.confidence} conf. · Score ${r.score.toStringAsFixed(0)}',
                style: TextStyle(
                  fontSize: 11,
                  color: r.confidence == 'HIGH' ? c.profit : (r.confidence == 'MEDIUM' ? c.warn : c.mutedForeground),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(border: Border.symmetric(horizontal: BorderSide(color: c.border))),
            child: Row(
              children: [
                level(long ? 'BUY ABOVE' : 'SELL BELOW', r.entryPrice, sideColor),
                level('SL (${r.riskPct.toStringAsFixed(1)}%)', r.stopLoss, c.loss),
                level('T1', r.target1, c.profit),
                level('T2', r.target2, c.profit),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _kv(context, 'Qty', '${plan.qty}', c.foreground),
              _kv(context, 'Capital', formatInr(plan.capital, decimals: 0), c.foreground),
              _kv(context, 'Max risk', formatInr(plan.maxRisk, decimals: 0), c.loss),
            ],
          ),
          const SizedBox(height: 10),
          ToneButton(
            label: '${long ? 'Buy' : 'Short'} ${r.symbol} (MIS)',
            icon: Icons.bolt_rounded,
            tone: long ? Tone.profit : Tone.loss,
            filled: true,
            expand: true,
            height: 36,
            onPressed:
                () => context.push(
                  Routes.trade,
                  extra: TicketPrefill(
                    symbol: r.symbol,
                    exchange: r.exchange,
                    side: long ? 'BUY' : 'SELL',
                    ltp: price,
                    qty: plan.qty,
                    price: r.entryPrice,
                    product: 'MIS',
                    orderType: 'LIMIT',
                    note:
                        'Entry ${formatPrice(r.entryPrice)} · Stop ${formatPrice(r.stopLoss)} · T1 ${formatPrice(r.target1)} · T2 ${formatPrice(r.target2)}. Max risk ${formatInr(plan.maxRisk, decimals: 0)}.',
                  ),
                ),
          ),
          if (r.notes.isNotEmpty)
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: c.mutedForeground),
              onPressed: () => setState(() => _expanded = !_expanded),
              icon: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 16),
              label: Text(_expanded ? 'Hide details' : 'View analysis notes', style: const TextStyle(fontSize: 11.5)),
            ),
          if (_expanded)
            for (final n in r.notes)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text('• $n', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ),
        ],
      ),
    );
  }

  Widget _kv(BuildContext context, String k, String v, Color color) => Text.rich(
    TextSpan(
      style: TextStyle(fontSize: 11.5, color: context.colors.mutedForeground),
      children: [TextSpan(text: '$k '), TextSpan(text: v, style: TextStyle(fontWeight: FontWeight.w600, color: color))],
    ),
  );
}
