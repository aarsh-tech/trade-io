import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/utils/format.dart';
import '../../../core/utils/market_time.dart';
import '../../../shared/widgets/action_button.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../ledger_providers.dart';
import '../orders_api.dart';

class LedgerScreen extends ConsumerStatefulWidget {
  const LedgerScreen({super.key});
  @override
  ConsumerState<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends ConsumerState<LedgerScreen> {
  late DateTime _month;
  int _page = 1;
  String _status = 'ALL', _segment = 'ALL', _search = '';
  String? _date;
  @override
  void initState() {
    super.initState();
    final now = marketTime(DateTime.now());
    _month = DateTime(now.year, now.month);
  }

  void _moveMonth(int delta) => setState(() {
    _month = DateTime(_month.year, _month.month + delta);
    _page = 1;
    _date = null;
  });
  @override
  Widget build(BuildContext context) {
    final query = (
      month: _month.month,
      year: _month.year,
      page: _page,
      status: _status,
      segment: _segment,
      q: _search,
      date: _date,
    );
    return Scaffold(
      appBar: AppBar(title: const Text('P&L ledger')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      tooltip: 'Previous month',
                      onPressed: () => _moveMonth(-1),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text(DateFormat('MMMM yyyy').format(_month)),
                    IconButton(
                      tooltip: 'Next month',
                      onPressed: () => _moveMonth(1),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: _status,
                        decoration: const InputDecoration(labelText: 'Result'),
                        items: [
                          for (final s in ['ALL', 'PROFIT', 'LOSS']) DropdownMenuItem(value: s, child: Text(s)),
                        ],
                        onChanged:
                            (v) => setState(() {
                              _status = v!;
                              _page = 1;
                            }),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: _segment,
                        decoration: const InputDecoration(labelText: 'Segment'),
                        items: [
                          for (final s in ['ALL', 'EQUITY', 'FNO']) DropdownMenuItem(value: s, child: Text(s)),
                        ],
                        onChanged:
                            (v) => setState(() {
                              _segment = v!;
                              _page = 1;
                            }),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Symbol / strategy — press search',
                    suffixIcon: Icon(Icons.keyboard_return),
                  ),
                  textInputAction: TextInputAction.search,
                  onSubmitted:
                      (v) => setState(() {
                        _search = v.trim();
                        _page = 1;
                      }),
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView(
              value: ref.watch(ledgerProvider(query)),
              onRetry: () => ref.invalidate(ledgerProvider(query)),
              data:
                  (data) => RefreshIndicator(
                    onRefresh: () => ref.refresh(ledgerProvider(query).future),
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const Text('Algo trades · net of charges · IST dates'),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Monthly realised P&L'),
                                PnlText(
                                  data.summary.totalRealizedPnl,
                                  style: Theme.of(context).textTheme.headlineMedium,
                                ),
                                Text(
                                  '${data.summary.totalTrades} trades · ${data.summary.winRate.toStringAsFixed(1)}% win rate\nGross ${formatInr(data.summary.totalGrossPnl)} · Charges ${formatInr(data.summary.totalCharges)}',
                                ),
                                if (data.summary.estimatedChargeTrades > 0)
                                  Text('Charges estimated for ${data.summary.estimatedChargeTrades} trades.'),
                              ],
                            ),
                          ),
                        ),
                        ActionButton(
                          label: 'Sync broker fills',
                          action: () async {
                            await ref.read(ordersApiProvider).sync();
                          },
                          onSuccess: () => ref.invalidate(ledgerProvider),
                        ),
                        ExpansionTile(
                          title: const Text('Daily totals'),
                          children: [
                            for (final day in data.dailyLedger)
                              ListTile(
                                title: Text(day.formattedDate),
                                subtitle: Text('${day.tradesCount} trades'),
                                trailing: PnlText(day.pnl),
                                onTap:
                                    () => setState(() {
                                      _date = day.date;
                                      _page = 1;
                                    }),
                              ),
                          ],
                        ),
                        if (_date != null)
                          InputChip(
                            label: Text(_date!),
                            onDeleted:
                                () => setState(() {
                                  _date = null;
                                  _page = 1;
                                }),
                          ),
                        if (data.closedTrades.isEmpty)
                          const EmptyState(icon: Icons.book_outlined, title: 'No closed trades for these filters'),
                        for (final t in data.closedTrades)
                          Card(
                            child: ExpansionTile(
                              title: Text('${t.symbol} · ${t.side} ${t.qty}'),
                              subtitle: Text('${t.date} · ${t.strategyName ?? 'Algo'}'),
                              trailing: PnlText(t.realizedPnl),
                              children: [
                                ListTile(
                                  title: Text('${formatPrice(t.entryPrice)} → ${formatPrice(t.exitPrice)}'),
                                  subtitle: Text(
                                    'Gross ${formatInr(t.grossPnl)}\nCharges ${formatInr(t.charges)} (${t.chargesExact ? 'broker' : 'estimated'})',
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
                            Text('Page $_page / ${data.pagination.totalPages < 1 ? 1 : data.pagination.totalPages}'),
                            TextButton(
                              onPressed: _page < data.pagination.totalPages ? () => setState(() => _page++) : null,
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
