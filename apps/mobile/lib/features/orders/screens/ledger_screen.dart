import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../core/utils/market_time.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../positions/instrument_name.dart';
import '../ledger_models.dart';
import '../ledger_providers.dart';
import '../orders_api.dart';

/// Web /ledger: the algo trade journal by month, net of charges, with daily totals.
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
  bool _syncing = false;
  bool _showDays = false;

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

  Future<void> _sync() async {
    setState(() => _syncing = true);
    await runWithToast(
      context,
      () async {
        await ref.read(ordersApiProvider).sync();
        ref.invalidate(ledgerProvider);
      },
      success: 'Broker fills synced',
      failure: 'Sync failed',
    );
    if (mounted) setState(() => _syncing = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final query = (
      month: _month.month,
      year: _month.year,
      page: _page,
      status: _status,
      segment: _segment,
      q: _search,
      date: _date,
    );
    final ledger = ref.watch(ledgerProvider(query));
    return Scaffold(
      appBar: AppBar(title: const Text('P&L Ledger')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(ledgerProvider(query).future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: AppSpace.pageInsets,
          children: [
            const PageHeader('Algo P&L ledger', subtitle: 'Your algo trade journal, net of charges. Dates follow IST.'),
            const SizedBox(height: AppSpace.gap),
            Row(
              children: [
                Expanded(
                  child: Container(
                    height: 38,
                    decoration: BoxDecoration(
                      color: c.card,
                      borderRadius: BorderRadius.circular(AppRadius.control),
                      border: Border.all(color: c.border),
                    ),
                    child: Row(
                      children: [
                        IconButton(
                          tooltip: 'Previous month',
                          visualDensity: VisualDensity.compact,
                          onPressed: () => _moveMonth(-1),
                          icon: const Icon(Icons.chevron_left_rounded, size: 20),
                        ),
                        Expanded(
                          child: Text(
                            DateFormat('MMMM yyyy').format(_month),
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Next month',
                          visualDensity: VisualDensity.compact,
                          onPressed: () => _moveMonth(1),
                          icon: const Icon(Icons.chevron_right_rounded, size: 20),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ToneButton(label: 'Sync', icon: Icons.sync_rounded, height: 38, busy: _syncing, onPressed: _sync),
              ],
            ),
            const SizedBox(height: 8),
            SegmentTabs<String>(
              options: const [
                (value: 'ALL', label: 'All', tone: null),
                (value: 'EQUITY', label: 'Equity', tone: null),
                (value: 'FNO', label: 'F&O', tone: null),
              ],
              value: _segment,
              onChanged:
                  (v) => setState(() {
                    _segment = v;
                    _page = 1;
                  }),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                SegmentTabs<String>(
                  expand: false,
                  options: const [
                    (value: 'ALL', label: 'All', tone: null),
                    (value: 'PROFIT', label: 'Wins', tone: Tone.profit),
                    (value: 'LOSS', label: 'Losses', tone: Tone.loss),
                  ],
                  value: _status,
                  onChanged:
                      (v) => setState(() {
                        _status = v;
                        _page = 1;
                      }),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    textInputAction: TextInputAction.search,
                    textCapitalization: TextCapitalization.characters,
                    style: const TextStyle(fontSize: 13),
                    decoration: const InputDecoration(
                      hintText: 'Symbol / strategy',
                      prefixIcon: Icon(Icons.search_rounded, size: 18),
                      prefixIconConstraints: BoxConstraints(minWidth: 36, minHeight: 36),
                      contentPadding: EdgeInsets.symmetric(vertical: 9),
                    ),
                    onSubmitted:
                        (v) => setState(() {
                          _search = v.trim();
                          _page = 1;
                        }),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.gap),
            AsyncView(
              value: ledger,
              loading: const Loading(label: 'Loading ledger…'),
              onRetry: () => ref.invalidate(ledgerProvider(query)),
              data: (data) => _body(context, data),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, LedgerData data) {
    final c = context.colors;
    final s = data.summary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StatStrip(
          items: [
            (
              label: 'Net P&L (month)',
              value: formatInr(s.totalRealizedPnl, signed: true),
              color: c.pnl(s.totalRealizedPnl),
            ),
            (label: 'Trades · win rate', value: '${s.totalTrades} · ${s.winRate.toStringAsFixed(1)}%', color: null),
            (label: 'Gross P&L', value: formatInr(s.totalGrossPnl, signed: true), color: c.pnl(s.totalGrossPnl)),
            (label: 'Charges', value: formatInr(s.totalCharges), color: null),
          ],
        ),
        if (s.estimatedChargeTrades > 0) ...[
          const SizedBox(height: 6),
          Text(
            'Charges are estimated for ${s.estimatedChargeTrades} trade(s).',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        const SizedBox(height: AppSpace.gap),
        if (data.dailyLedger.isNotEmpty) ...[
          Panel(
            title: 'Daily totals (${data.dailyLedger.length} days)',
            icon: Icons.calendar_month_outlined,
            trailing: IconButton(
              tooltip: _showDays ? 'Hide' : 'Show',
              visualDensity: VisualDensity.compact,
              icon: Icon(_showDays ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 20),
              onPressed: () => setState(() => _showDays = !_showDays),
            ),
            padding: EdgeInsets.zero,
            child:
                !_showDays
                    ? const SizedBox.shrink()
                    : Column(
                      children: [
                        for (final (i, d) in data.dailyLedger.indexed) ...[
                          if (i > 0) Divider(color: c.border),
                          InkWell(
                            onTap:
                                () => setState(() {
                                  _date = _date == d.date ? null : d.date;
                                  _page = 1;
                                }),
                            child: Container(
                              color: _date == d.date ? c.brandSubtle : null,
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          d.formattedDate.isEmpty ? d.date : d.formattedDate,
                                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                                        ),
                                        Text(
                                          '${d.tradesCount} trades · charges ${formatInr(d.charges)} · month ${formatInr(d.cumulativePnl, signed: true)}',
                                          style: TextStyle(fontSize: 11, color: c.mutedForeground),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    formatInr(d.pnl, signed: true),
                                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.pnl(d.pnl)),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
          ),
          const SizedBox(height: AppSpace.gap),
        ],
        if (_date != null) ...[
          Align(
            alignment: Alignment.centerLeft,
            child: InputChip(
              label: Text('Day: $_date'),
              onDeleted:
                  () => setState(() {
                    _date = null;
                    _page = 1;
                  }),
            ),
          ),
          const SizedBox(height: 8),
        ],
        Panel(
          title: 'Closed trades (${data.pagination.total})',
          icon: Icons.menu_book_outlined,
          padding: EdgeInsets.zero,
          child:
              data.closedTrades.isEmpty
                  ? const EmptyPanel(
                    icon: Icons.menu_book_outlined,
                    title: 'No closed trades found',
                    message: 'Try another month or clear the filters.',
                  )
                  : Column(
                    children: [
                      for (final (i, t) in data.closedTrades.indexed) ...[
                        if (i > 0) Divider(color: c.border),
                        _TradeRow(trade: t),
                      ],
                    ],
                  ),
        ),
        if (data.pagination.totalPages > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(onPressed: _page > 1 ? () => setState(() => _page--) : null, child: const Text('Previous')),
                Text('Page $_page / ${data.pagination.totalPages}', style: Theme.of(context).textTheme.bodySmall),
                TextButton(
                  onPressed: _page < data.pagination.totalPages ? () => setState(() => _page++) : null,
                  child: const Text('Next'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _TradeRow extends StatelessWidget {
  const _TradeRow({required this.trade});
  final ClosedTrade trade;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = trade;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
      child: Column(
        children: [
          Row(
            children: [
              if (t.side.isNotEmpty) ...[
                Pill(t.side, tone: t.side == 'BUY' ? Tone.brand : Tone.loss),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: Text(
                  kiteInstrumentName(t.symbol),
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
              Text(
                formatInr(t.realizedPnl, signed: true),
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.pnl(t.realizedPnl)),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Expanded(
                child: Text(
                  [
                    t.date,
                    if (t.qty > 0) '${t.qty} qty',
                    '${formatPrice(t.entryPrice)} → ${formatPrice(t.exitPrice)}',
                  ].join(' · '),
                  style: TextStyle(fontSize: 11.5, color: c.mutedForeground),
                ),
              ),
              Text(
                'Chg ${formatInr(t.charges)}${t.chargesExact ? '' : '*'}',
                style: TextStyle(fontSize: 11, color: c.mutedForeground),
              ),
            ],
          ),
          if (t.strategyName != null)
            Align(
              alignment: Alignment.centerLeft,
              child: Text(t.strategyName!, style: TextStyle(fontSize: 11, color: c.accentForeground)),
            ),
        ],
      ),
    );
  }
}
