import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../scanner_providers.dart';

class ScreenerScreen extends ConsumerStatefulWidget {
  const ScreenerScreen({super.key});
  @override
  ConsumerState<ScreenerScreen> createState() => _ScreenerScreenState();
}

class _ScreenerScreenState extends ConsumerState<ScreenerScreen> {
  String _universe = 'fno', _signal = 'ALL', _search = '';
  double _tolerance = 0.05;
  @override
  Widget build(BuildContext context) {
    final query = (universe: _universe, tolerance: _tolerance);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Live screener'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(screenerProvider(query)),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: _universe,
                        decoration: const InputDecoration(labelText: 'Universe'),
                        items: const [
                          DropdownMenuItem(value: 'fno', child: Text('F&O stocks')),
                          DropdownMenuItem(value: 'nifty50', child: Text('NIFTY 50')),
                        ],
                        onChanged: (v) => setState(() => _universe = v!),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<double>(
                        isExpanded: true,
                        value: _tolerance,
                        decoration: const InputDecoration(labelText: 'Tolerance %'),
                        items: [
                          for (final n in [0.0, 0.05, 0.1, 0.25, 0.5]) DropdownMenuItem(value: n, child: Text('$n')),
                        ],
                        onChanged: (v) => setState(() => _tolerance = v!),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search symbol'),
                  onChanged: (v) => setState(() => _search = v.toUpperCase()),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final s in ['ALL', 'OPEN_LOW', 'OPEN_HIGH', 'NEAR_OPEN_LOW', 'NEAR_OPEN_HIGH'])
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            label: Text(s.replaceAll('_', ' ')),
                            selected: _signal == s,
                            onSelected: (_) => setState(() => _signal = s),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView(
              value: ref.watch(liveScreenerProvider(query)),
              onRetry: () => ref.invalidate(screenerProvider(query)),
              data: (data) {
                final rows =
                    data.stocks
                        .where(
                          (s) => s.symbol.toUpperCase().contains(_search) && (_signal == 'ALL' || s.signal == _signal),
                        )
                        .toList();
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(screenerProvider(query).future),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      const Text('Prices update live. Signals and levels refresh every 15 seconds.'),
                      if (rows.isEmpty) const EmptyState(icon: Icons.filter_alt_outlined, title: 'No matching stocks'),
                      for (final s in rows)
                        Card(
                          child: ExpansionTile(
                            title: Text(s.symbol),
                            subtitle: Text(s.signal.replaceAll('_', ' ')),
                            trailing: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [Text(formatPrice(s.ltp)), PctText(s.changePct)],
                            ),
                            children: [
                              ListTile(
                                title: Text('${s.suggestedAction} · Stop ${formatPrice(s.suggestedSL)}'),
                                subtitle: Text(
                                  'Targets ${formatPrice(s.suggestedTarget)} / ${formatPrice(s.suggestedTarget2)} · Open ${formatPrice(s.open)}\nVolume ${formatQty(s.volume)}',
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
