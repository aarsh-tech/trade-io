import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_models.dart';
import '../../orders/ticket_models.dart';
import '../../orders/ticket_providers.dart';
import '../strategy_form.dart';
import 'form_controls.dart';

/// The wizard's four steps, ported from apps/web/.../strategies/new/components/Step*.tsx.

IconData typeIcon(String type) => switch (type) {
  'EMA_VWAP_CROSSOVER' => Icons.trending_up_rounded,
  'STOCKS_IN_PLAY' => Icons.local_fire_department_outlined,
  'BREAKOUT_15MIN' => Icons.bar_chart_rounded,
  _ => Icons.auto_awesome_outlined,
};

Tone typeTone(String type) => switch (type) {
  'EMA_VWAP_CROSSOVER' => Tone.profit,
  'STOCKS_IN_PLAY' => Tone.loss,
  'BREAKOUT_15MIN' => Tone.brand,
  _ => Tone.neutral,
};

Tone riskTone(RiskLevel r) => switch (r) {
  RiskLevel.low => Tone.profit,
  RiskLevel.medium => Tone.warn,
  RiskLevel.high => Tone.loss,
};

String? _errorFor(List<String> errors, List<String> prefixes) {
  for (final e in errors) {
    if (prefixes.any(e.startsWith)) return e;
  }
  return null;
}

// ─── Step 1: name and type ────────────────────────────────────────────────────────────────────

class StepType extends StatelessWidget {
  const StepType({super.key, required this.form, required this.set, required this.onSelectType, this.locked = false});

  final StrategyForm form;
  final SetField set;
  final ValueChanged<String> onSelectType;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final current = s(form, 'type');
    final cards = locked ? [typeMeta(current)] : strategyTypes;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FormSection(
          title: 'Name',
          description: 'Shown in your strategies list. You can change it any time.',
          child: BoundField(
            label: 'Strategy name',
            kind: FieldKind.text,
            placeholder: 'e.g. Nifty morning breakout',
            value: s(form, 'name'),
            onChanged: (v) => set('name', v),
          ),
        ),
        const SizedBox(height: AppSpace.gap),
        FormSection(
          title: locked ? 'Strategy type' : 'Choose a strategy type',
          description:
              locked
                  ? 'The type cannot be changed once a strategy is created. Create a new strategy to use a different type.'
                  : 'Each type comes with sensible defaults, so you can adjust only what you need on the next steps.',
          child: Column(
            children: [
              for (final (i, t) in cards.indexed) ...[
                if (i > 0) const SizedBox(height: 10),
                _TypeCard(meta: t, selected: current == t.type, locked: locked, onTap: () => onSelectType(t.type)),
              ],
              if (cards.isEmpty) Text('No type', style: TextStyle(color: c.mutedForeground)),
            ],
          ),
        ),
      ],
    );
  }
}

class _TypeCard extends StatelessWidget {
  const _TypeCard({required this.meta, required this.selected, required this.locked, required this.onTap});
  final StrategyTypeMeta meta;
  final bool selected, locked;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tone = typeTone(meta.type);
    Widget fact(String k, String v) => Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Text.rich(
        TextSpan(
          style: TextStyle(fontSize: 12, color: c.mutedForeground),
          children: [
            TextSpan(text: '$k: '),
            TextSpan(text: v, style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground)),
          ],
        ),
      ),
    );
    return Material(
      color: selected ? c.brandSubtle : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: selected ? c.primary : c.border, width: selected ? 1.5 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: locked ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: tone.bg(c),
                      borderRadius: BorderRadius.circular(AppRadius.card),
                      border: Border.all(color: tone.line(c)),
                    ),
                    child: Icon(typeIcon(meta.type), size: 18, color: tone.fg(c)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(meta.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                            Pill('${meta.risk.label} risk', tone: riskTone(meta.risk)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(meta.tagline, style: TextStyle(fontSize: 12, height: 1.45, color: c.mutedForeground)),
                      ],
                    ),
                  ),
                  if (selected)
                    Container(
                      width: 22,
                      height: 22,
                      margin: const EdgeInsets.only(left: 6),
                      decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
                      child: Icon(locked ? Icons.lock_rounded : Icons.check_rounded, size: 14, color: c.onPrimary),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Divider(color: c.border),
              const SizedBox(height: 6),
              fact('Trades', meta.instrument),
              fact('Runs', meta.timing),
              if (meta.bestFor.isNotEmpty) fact('Best for', meta.bestFor),
              if (meta.riskNote.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(meta.riskNote, style: TextStyle(fontSize: 11.5, color: c.mutedForeground)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Step 2: broker, instrument and size ──────────────────────────────────────────────────────

class StepInstrument extends StatelessWidget {
  const StepInstrument({
    super.key,
    required this.form,
    required this.set,
    required this.brokers,
    required this.onInstrument,
  });

  final StrategyForm form;
  final SetField set;
  final AsyncValue<List<BrokerAccount>> brokers;
  final ValueChanged<Instrument> onInstrument;

  @override
  Widget build(BuildContext context) {
    final type = s(form, 'type');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FormSection(
          title: 'Broker account',
          description: 'Used for live prices and lot sizes, and for orders when you trade live.',
          child: _BrokerChoice(form: form, set: set, brokers: brokers),
        ),
        const SizedBox(height: AppSpace.gap),
        if (type == 'STOCKS_IN_PLAY') ..._stocksInPlay(context) else ..._instrument(context, type),
      ],
    );
  }

  List<Widget> _stocksInPlay(BuildContext context) {
    final setup = s(form, 'sipSetup');
    final fadeLongs = b(form, 'sipFadeLongs');
    void pickSetup(String v) {
      final prev = setup;
      set('sipSetup', v);
      // Each setup's backtested defaults for the fields they share.
      set('maxTradesPerDay', v == 'ORB' ? '2' : '1');
      set('sipMinAvgValueCr', v == 'ORB' ? '25' : '10');
      if (v == 'OI') {
        set('sipStopPct', '1');
        set('sipTargetR', '3');
      }
      if (v == 'FADE' && prev == 'OI') set('sipStopPct', '1.2');
    }

    return [
      FormSection(
        title: 'Setup',
        description:
            "The fade, trend and opening-range setups use the same 09:20 opening-volume scan. The OI setup instead trades yesterday's NSE futures data in the pre-open auction.",
        child: ChoiceCards<String>(
          value: setup,
          onChanged: pickSetup,
          options: const [
            (
              value: 'TREND',
              title: '15/40 EMA trend',
              body:
                  'Watches the stock with the biggest opening volume and takes its first 15/40 EMA crossover on the 5m chart (long above VWAP, short below), only in the direction of the gap. Stop at the day low/high, rides until the EMAs cross back. 2-year backtest: +₹5.0k at ₹500 risk on 94 trades, about breakeven.',
            ),
            (
              value: 'FADE',
              title: 'In-play Fade',
              body:
                  'Stock gapped up on 10x opening volume, then MFI, Stochastic, Bollinger or CMF turns down from overbought by 09:45: short it. Optional long side on gap-down stocks. Fixed stop and target. 2-year backtest: +₹70k at ₹500 risk, both years positive.',
            ),
            (
              value: 'OI',
              title: 'OI short build-up (pre-open)',
              body:
                  'Shorts the stock that fell 3% or more yesterday while its futures open interest rose the most (5–80%), in the 09:00–09:07 pre-open auction, so it fills at the 09:15 opening price. 1% stop, 3x target, else 15:05. 1 trade a day. 2-year backtest: +₹41k at ₹500 risk, both years positive; entered at 09:16 instead it earned only ₹3.5k, so the auction fill is the edge. Runs alongside the In-play Fade as a separate strategy.',
            ),
            (
              value: 'ORB',
              title: 'Opening-range break',
              body:
                  "Shorts the break of a red first candle's low. ATR stop, no target: held to 15:05. Fat-tailed: about 1 trade in 3 wins.",
            ),
          ],
        ),
      ),
      const SizedBox(height: AppSpace.gap),
      FormSection(
        title: 'Which stocks it trades',
        description: switch (setup) {
          'OI' =>
            "No symbol to pick. Before the open the strategy reads NSE's end-of-day F&O and cash-market files for the previous trading day and keeps the stocks that fell 3% or more (less than 25%) while their total stock-futures open interest rose 5% to 80% (fresh shorts), skipping expiry days and stocks that traded under ₹25 Cr. It shorts only the one with the biggest OI rise.",
          'TREND' =>
            'No symbol to pick. At 09:20 the strategy ranks every NIFTY 500 and F&O stock by its first 5-minute candle volume against its usual opening volume and watches the top one(s) for the rest of the session.',
          'FADE' =>
            "No symbol to pick. At 09:20 the strategy checks every NIFTY 500 and F&O stock and keeps the ones that opened above yesterday's close${fadeLongs ? ' (short side) or below it (long side)' : ''} with a first 5-minute candle far above their usual opening volume. Stocks within 2.5% of the circuit they would have to exit into are skipped.",
          _ =>
            'No symbol to pick. At 09:20 the strategy checks every NIFTY 500 and F&O stock and keeps the ones whose first 5-minute candle traded far above their usual opening volume (news, results, block deals).',
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (setup == 'TREND') ...[
              BoundField(
                label: 'Stocks watched',
                value: s(form, 'sipWatchCount'),
                onChanged: (v) => set('sipWatchCount', v),
                hint: 'Highest opening volume first. Backtest: 1 stock +₹5.0k, 3 stocks +₹2.0k, 5 or more lost.',
              ),
              const SizedBox(height: 12),
            ],
            if (setup != 'TREND' && setup != 'OI') ...[
              BoundField(
                label: 'Opening volume multiple',
                kind: FieldKind.decimal,
                value: s(form, 'sipMinRvol'),
                onChanged: (v) => set('sipMinRvol', v),
                hint:
                    'First candle volume vs its 10-day average. The backtest edge was in stocks at 10x or more; lower values trade more and earned less.',
              ),
              const SizedBox(height: 12),
            ],
            if (setup == 'OI')
              const Notice(
                '1 trade a day: the top pick only, as backtested. A later pick is used only when the top one cannot be sized with your capital or another strategy already holds it.',
              )
            else
              BoundField(
                label:
                    setup == 'FADE' && fadeLongs
                        ? 'Trades per day (short + long together)'
                        : 'Max positions (= trades per day)',
                value: s(form, 'maxTradesPerDay'),
                onChanged: (v) => set('maxTradesPerDay', v),
                hint: switch (setup) {
                  'TREND' => '1 is what was backtested: the first crossover that passes the rules takes the day.',
                  'FADE' =>
                    '1 is what was backtested (the earliest signal of the day). 2 earned less per trade with a bigger drawdown.',
                  _ => 'Positions can be open together; capital is split between them. 2 had the steadiest backtest.',
                },
              ),
            if (setup == 'TREND') ...[
              const SizedBox(height: 12),
              ToggleCard(
                title: 'Only trade with the gap',
                body:
                    "A stock that opened above yesterday's close is only bought, one that opened below it only shorted. Backtest with 1 stock watched: +₹5.0k with this on, +₹3.7k with it off.",
                value: form['sipWithGapOnly'] != false,
                onChanged: (v) => set('sipWithGapOnly', v),
              ),
            ],
            if (setup == 'FADE') ...[
              const SizedBox(height: 12),
              ToggleCard(
                title: 'Also trade the long side (gap-down stocks)',
                body:
                    "On a gap-down stock in play, an oversold turn-up (MFI, Stochastic, Bollinger or CMF) by 09:45 arms a long, bought only if price then breaks the first 5-minute candle's high within 30 minutes. Same stop, target and stop ladder. The trades per day cover both sides: the first signal of the day, short or long, takes it (a short wins a tie). Backtest (1 a day, Recommended exits): +₹77.8k, 64% wins, worst month −₹1.3k vs short only +₹69.6k, worst month −₹2.5k. The long side alone is weak (+₹8.1k, about ₹0 in year 1).",
                value: fadeLongs,
                onChanged: (v) => set('sipFadeLongs', v),
              ),
            ],
            if (setup == 'ORB') ...[
              const SizedBox(height: 12),
              ToggleCard(
                title: 'Also buy stocks whose first candle is green',
                body:
                    'Off by default: in 2 years of NSE data the long side earned about nothing after costs; the edge came from shorting red first candles.',
                value: b(form, 'sipAllowLongs'),
                onChanged: (v) => set('sipAllowLongs', v),
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: AppSpace.gap),
      FormSection(
        title: 'Timing',
        description: switch (setup) {
          'OI' =>
            "Starts by itself at 08:50 (log in to Kite before 09:00). The SELL LIMIT, 5% under yesterday's close, goes in at 09:00; the exchange's pre-open auction fills it at the 09:15 opening price. If the stock opens more than 5% lower there is no fill and no trade that day. The exchange stop goes in at 09:15, then the position is held until its target, its stop or the 15:05 square-off.",
          'TREND' =>
            "Crossovers are checked on every 5-minute close from 09:25 to 14:30; only each side's first one of the day counts, and the order goes in within seconds of that close. The trade exits on the 5-minute close where the 15-EMA crosses back, at its stop, or at the 15:05 square-off.",
          'FADE' =>
            'Signals are checked on the 5-minute closes from 09:20 to 09:45, and the short is placed within seconds of that close.${fadeLongs ? ' A long waits up to 30 minutes for the first-candle high to break (until 10:15 at the latest).' : ' No new entries after the 09:45 close.'} A position is held until its target, its stop or the 15:05 square-off.',
          _ =>
            'Entries happen the moment price breaks the first candle (shorts: its low). Every position is held until its stop or the 15:05 square-off.',
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (setup == 'ORB') ...[
              BoundField(
                label: 'No new entries from',
                kind: FieldKind.time,
                value: s(form, 'sipEntryCutoffTime'),
                onChanged: (v) => set('sipEntryCutoffTime', v),
                hint: 'IST. Open positions are still managed until 15:05.',
              ),
              const SizedBox(height: 12),
            ],
            const Notice(
              'Short selling needs MIS. Stocks where Zerodha blocks MIS are skipped.',
              title: 'Product: MIS (intraday)',
            ),
          ],
        ),
      ),
    ];
  }

  List<Widget> _instrument(BuildContext context, String type) {
    final c = context.colors;
    final lot = formLotSize(form);
    final auto = isAutoSymbol(form);
    final b15 = type == 'BREAKOUT_15MIN';
    return [
      FormSection(
        title: 'Instrument',
        description: 'Search a stock, option or future, or keep the current selection.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _InstrumentSearch(accountId: s(form, 'brokerAccountId'), onSelect: onInstrument),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: c.muted.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(AppRadius.card),
                border: Border.all(color: c.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('CURRENT SELECTION', style: Theme.of(context).textTheme.labelSmall),
                        const SizedBox(height: 2),
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: s(form, 'symbol'),
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                              ),
                              TextSpan(
                                text: '  (${s(form, 'exchange')})',
                                style: TextStyle(fontSize: 12, color: c.mutedForeground),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (lot > 1) ...[Pill('1 lot = $lot qty', tone: Tone.warn), const SizedBox(width: 6)],
                  Pill(s(form, 'instrumentType')),
                ],
              ),
            ),
            if (b15) ...[
              const SizedBox(height: 12),
              Text('Quick instrument presets', style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final p in const [
                    (label: 'NIFTY 50 (index option)', sym: 'NIFTY 50', type: 'INDEX'),
                    (label: 'BANKNIFTY (index option)', sym: 'BANKNIFTY', type: 'INDEX'),
                    (label: 'AUTO stock picker', sym: 'AUTO', type: 'STOCK'),
                  ])
                    ChoiceChip(
                      label: Text(p.label),
                      selected: s(form, 'symbol') == p.sym,
                      onSelected: (_) {
                        set('symbol', p.sym);
                        set('exchange', 'NSE');
                        set('instrumentType', p.type);
                        set('lotSize', null);
                      },
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: AppSpace.gap),
      FormSection(
        title: 'Size',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FieldPair(
              BoundField(
                label: b15 ? 'Minimum / base lots' : 'Number of lots',
                value: s(form, 'lots'),
                onChanged: (v) => set('lots', v),
              ),
              DropdownButtonFormField<String>(
                value: s(form, 'product'),
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Product'),
                items: const [
                  DropdownMenuItem(value: 'MIS', child: Text('MIS (intraday)')),
                  DropdownMenuItem(value: 'NRML', child: Text('NRML (overnight)')),
                ],
                onChanged: (v) => set('product', v),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              b15
                  ? 'Dynamic margin allocation: auto-scales lots from Zerodha cash (85% deployed, 15% buffer).'
                  : auto
                  ? 'Quantity will be dynamically calculated to achieve target.'
                  : 'Total quantity: ${(double.tryParse(s(form, 'lots')) ?? 0).toInt() * lot} shares',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      if (b15) ...[
        const SizedBox(height: AppSpace.gap),
        const Notice(
          'Monitors the first 15-minute candle (09:15–09:30). Enters when a candle closes beyond the high or low with volume and VWAP alignment. If a false breakout occurs, it detects the liquidity trap and reverses. Sizes quantity by your stop-loss ₹ from live Zerodha cash and arms a server-side SL-L order on entry.',
          title: '15-minute opening range breakout',
          tone: Tone.brand,
          icon: Icons.auto_awesome_outlined,
        ),
        const SizedBox(height: AppSpace.gap),
        FormSection(
          title: 'Entry & trap timeframe',
          description:
              'Establishes the 15m range (09:15–09:30), then monitors this lower timeframe for liquidity sweep traps and reclaim entries.',
          child: ChoiceCards<String>(
            value: s(form, 'b15EntryTimeframe').isEmpty ? '3min' : s(form, 'b15EntryTimeframe'),
            onChanged: (v) => set('b15EntryTimeframe', v),
            options: const [
              (value: '3min', title: '3-minute candles', body: 'Recommended. Best trap detection.'),
              (value: '1min', title: '1-minute candles', body: 'Highest sensitivity, fastest reversal entry.'),
              (value: '5min', title: '5-minute candles', body: 'Standard breakout timeframe.'),
            ],
          ),
        ),
      ],
      if (type == 'EMA_VWAP_CROSSOVER') ...[
        const SizedBox(height: AppSpace.gap),
        FormSection(
          title: 'Entries',
          description:
              'Trades the stock itself (intraday). For NIFTY, BANKNIFTY or SENSEX options, use the 15-Min Breakout.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BoundField(label: 'EMA period', value: s(form, 'emaPeriod'), onChanged: (v) => set('emaPeriod', v)),
              const SizedBox(height: 12),
              Text('Entry timeframe', style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 6),
              ChoiceCards<String>(
                value: s(form, 'entryTimeframe').isEmpty ? '5min' : s(form, 'entryTimeframe'),
                onChanged: (v) => set('entryTimeframe', v),
                options: const [
                  (value: '5min', title: '5-minute candles', body: 'Standard. Trading starts 09:20.'),
                  (
                    value: '1min',
                    title: '1-minute candles',
                    body:
                        'Earlier entries from 09:16, more signals. 2-year backtest: ₹22.5k (second year negative) against ₹35.5k for 5-minute.',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              BoundField(
                label: 'Stocks checked per scan',
                value: s(form, 'scanDepth'),
                onChanged: (v) => set('scanDepth', v),
                hint:
                    'AUTO stock selection only. The top-ranked momentum stocks checked for a setup on every scan (1 to 25); the best-scoring setup is traded.',
              ),
              const SizedBox(height: 12),
              BoundField(
                label: 'Setups watched at once',
                value: s(form, 'maxArmedSetups'),
                onChanged: (v) => set('maxArmedSetups', v),
                hint:
                    'AUTO only (1 to 5). The first setup to break its trigger is entered. 1 = only the top-scored setup (recommended). 2-year backtest: 1 made ₹47.6k, 2 made ₹43.6k, 3 made ₹44.7k.',
              ),
            ],
          ),
        ),
      ],
    ];
  }
}

class _BrokerChoice extends StatelessWidget {
  const _BrokerChoice({required this.form, required this.set, required this.brokers});
  final StrategyForm form;
  final SetField set;
  final AsyncValue<List<BrokerAccount>> brokers;
  @override
  Widget build(BuildContext context) => AsyncView(
    value: brokers,
    loading: const LinearProgressIndicator(),
    data:
        (list) =>
            list.isEmpty
                ? const Notice(
                  'No broker account linked. You can still create a paper strategy; link Zerodha under More → Brokers to trade live.',
                  tone: Tone.warn,
                )
                : ChoiceCards<String>(
                  value: s(form, 'brokerAccountId'),
                  onChanged: (id) => set('brokerAccountId', id),
                  options: [
                    for (final a in list)
                      (
                        value: a.id,
                        title: '${a.label} · ${a.clientId ?? 'connected'}',
                        body:
                            a.sessionExpired
                                ? 'Session expired: daily login needed'
                                : (a.isActive ? 'Active' : 'Inactive'),
                      ),
                  ],
                ),
  );
}

class _InstrumentSearch extends ConsumerStatefulWidget {
  const _InstrumentSearch({required this.accountId, required this.onSelect});
  final String accountId;
  final ValueChanged<Instrument> onSelect;
  @override
  ConsumerState<_InstrumentSearch> createState() => _InstrumentSearchState();
}

class _InstrumentSearchState extends ConsumerState<_InstrumentSearch> {
  String _query = '';
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final noBroker = widget.accountId.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _c,
          enabled: !noBroker,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          textInputAction: TextInputAction.search,
          onSubmitted: (v) => setState(() => _query = v.trim()),
          decoration: InputDecoration(
            labelText: 'Search symbol (stock, option or future)',
            hintText: 'e.g. RELIANCE, NIFTY 22000 CE',
            helperText: noBroker ? 'Pick a broker account above to search instruments.' : null,
            prefixIcon: const Icon(Icons.search_rounded, size: 18),
            suffixIcon: IconButton(
              tooltip: 'Search',
              icon: const Icon(Icons.arrow_forward_rounded, size: 18),
              onPressed: noBroker ? null : () => setState(() => _query = _c.text.trim()),
            ),
          ),
        ),
        if (_query.isNotEmpty && !noBroker)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: AsyncView(
              value: ref.watch(instrumentSearchProvider((query: _query, accountId: widget.accountId))),
              loading: const LinearProgressIndicator(),
              onRetry: () => ref.invalidate(instrumentSearchProvider),
              data:
                  (rows) =>
                      rows.isEmpty
                          ? Text(
                            'No results. Check the symbol and your broker session.',
                            style: Theme.of(context).textTheme.bodySmall,
                          )
                          : Container(
                            constraints: const BoxConstraints(maxHeight: 260),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(AppRadius.card),
                              border: Border.all(color: c.border),
                            ),
                            child: ListView.separated(
                              shrinkWrap: true,
                              itemCount: rows.length > 20 ? 20 : rows.length,
                              separatorBuilder: (_, __) => Divider(color: c.border),
                              itemBuilder: (_, i) {
                                final r = rows[i];
                                return ListTile(
                                  title: Text(r.symbol),
                                  subtitle: Text(
                                    [
                                      r.exchange,
                                      if (r.segment != null) r.segment!,
                                      if (r.name != null) r.name!,
                                    ].join(' · '),
                                  ),
                                  trailing: r.lotSize > 1 ? Pill('Lot ${r.lotSize}') : null,
                                  onTap: () {
                                    widget.onSelect(r);
                                    _c.clear();
                                    setState(() => _query = '');
                                  },
                                );
                              },
                            ),
                          ),
            ),
          ),
      ],
    );
  }
}

// ─── Step 3: risk ─────────────────────────────────────────────────────────────────────────────

class StepRisk extends StatelessWidget {
  const StepRisk({super.key, required this.form, required this.set, required this.errors});

  final StrategyForm form;
  final SetField set;
  final List<String> errors;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final type = s(form, 'type');
    final presets = presetsFor(type);
    final current = activePreset(form);
    final risk = estimateRisk(form);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (presets != null) ...[
          FormSection(
            title: 'Risk preset',
            description: 'Pick a starting point. It fills the fields below, and you can still edit any of them.',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ChoiceCards<String>(
                  value: current,
                  onChanged: (level) => presets[level]!.forEach(set),
                  options: [for (final l in presetLevels) (value: l, title: l, body: presetHints[l]!)],
                ),
                if (current == null) ...[
                  const SizedBox(height: 6),
                  Text('Custom values: you have changed the preset.', style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpace.gap),
        ],
        FormSection(
          title: 'Risk and sizing',
          description: 'The limits that protect your capital. Every trade follows these.',
          child:
              type == 'STOCKS_IN_PLAY'
                  ? BoundField(
                    label: 'Max loss per trade',
                    prefix: '₹ ',
                    kind: FieldKind.decimal,
                    value: s(form, 'stopLossRs'),
                    onChanged: (v) => set('stopLossRs', v),
                    hint:
                        'Shares are sized so the stop loses at most this, within your free Zerodha funds (read at each entry, nothing to enter).',
                    error:
                        _errorFor(errors, ['Stop-loss']) ??
                        ((double.tryParse(s(form, 'stopLossRs')) ?? 0) > 0 ? null : 'Enter an amount above 0.'),
                  )
                  : Column(
                    children: [
                      FieldPair(
                        BoundField(
                          label: 'Stop-loss / trade',
                          prefix: '₹ ',
                          kind: FieldKind.decimal,
                          value: s(form, 'stopLossRs'),
                          onChanged: (v) => set('stopLossRs', v),
                          hint: 'Exits if the loss reaches this.',
                          error: _errorFor(errors, ['Stop-loss']),
                        ),
                        BoundField(
                          label: 'Target / trade',
                          prefix: '₹ ',
                          kind: FieldKind.decimal,
                          value: s(form, 'targetRs'),
                          onChanged: (v) => set('targetRs', v),
                          hint: 'Exits, or starts trailing, here.',
                          error: _errorFor(errors, ['Target (']),
                        ),
                      ),
                      const SizedBox(height: 12),
                      FieldPair(
                        BoundField(
                          label: 'Max trades / day',
                          value: s(form, 'maxTradesPerDay'),
                          onChanged: (v) => set('maxTradesPerDay', v),
                          hint: 'No new trades after this many.',
                          error: _errorFor(errors, ['Max trades per day']),
                        ),
                        type == 'BREAKOUT_15MIN'
                            ? BoundField(
                              label: 'Stop after losses',
                              value: s(form, 'b15MaxLossesPerDay'),
                              onChanged: (v) => set('b15MaxLossesPerDay', v),
                              hint: '1 = no more trades after one stop-loss today.',
                              error: _errorFor(errors, ['Max losses per day']),
                            )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
        ),
        const SizedBox(height: AppSpace.gap),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: c.lossSubtle,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: c.loss.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.gpp_maybe_outlined, size: 16, color: c.loss),
                  const SizedBox(width: 6),
                  Text('What you can lose', style: Theme.of(context).textTheme.titleSmall),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: _LossBox(label: 'Max loss per trade', value: inr(risk.perTrade))),
                  const SizedBox(width: 8),
                  Expanded(child: _LossBox(label: 'Max loss per day', value: inr(risk.perDay))),
                ],
              ),
              if (risk.targetPerTrade != null) ...[
                const SizedBox(height: 8),
                Text.rich(
                  TextSpan(
                    style: const TextStyle(fontSize: 12),
                    children: [
                      const TextSpan(text: 'Target per trade: '),
                      TextSpan(
                        text: inr(risk.targetPerTrade),
                        style: TextStyle(fontWeight: FontWeight.w600, color: c.profit),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 4),
              Text(risk.basis, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.gap),
        Card(
          child: ExpansionTile(
            title: const Text('Advanced risk options', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            subtitle: Text(
              'Trailing, partial booking, filters and time windows. Defaults are already set.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            children: [AdvancedRisk(form: form, set: set)],
          ),
        ),
      ],
    );
  }
}

class _LossBox extends StatelessWidget {
  const _LossBox({required this.label, required this.value});
  final String label, value;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: context.colors.card,
      borderRadius: BorderRadius.circular(AppRadius.control),
      border: Border.all(color: context.colors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Caption(label),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: context.colors.loss)),
      ],
    ),
  );
}

/// Web Step3RiskAdvanced: per-type advanced controls.
class AdvancedRisk extends StatelessWidget {
  const AdvancedRisk({super.key, required this.form, required this.set});
  final StrategyForm form;
  final SetField set;

  @override
  Widget build(BuildContext context) {
    final type = s(form, 'type');
    final setup = s(form, 'sipSetup');
    final children = switch (type) {
      'BREAKOUT_15MIN' => _breakout(context),
      'STOCKS_IN_PLAY' =>
        setup == 'FADE' ? _fade(context) : (setup == 'OI' ? _oi() : (setup == 'ORB' ? _orb() : _trend())),
      'EMA_VWAP_CROSSOVER' => _stockPicker(context),
      _ => <Widget>[const Text('No advanced options for this type.')],
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, w) in children.indexed) ...[if (i > 0) const SizedBox(height: 10), w],
      ],
    );
  }

  bool _on(String k) => form[k] != false;

  List<Widget> _breakout(BuildContext context) => [
    const Bullets([
      'Live Zerodha CPR engine: blocks breakouts running into CPR walls; wide-CPR days restrict to trap reversals only.',
      '1-loss & done: halts the strategy after the day\'s loss limit.',
      'Banker & runner: locks 50% at +1.8R, moves the stop to cost, lets the rest ride on EMA/VWAP.',
      'Midday dead-zone (11:45–13:00 IST): skips entries in the low-liquidity chop.',
      'Structural candle stop: at the entry candle extreme instead of the far 15m range extreme.',
      'Early breakeven (+0.7R): stop to cost before pullback retests.',
    ]),
    ToggleCard(
      title: 'Live CPR support / resistance & regime gate',
      badge: 'Live Kite data',
      tone: Tone.brand,
      body:
          'Computes Pivot, TC, BC, R1, S1, R2, S2 from the previous day. Restricts wide-CPR days to trap reversals and skips breakouts into CPR hurdles (< 0.35% away).',
      value: _on('b15EnableCprSupportResistance'),
      onChanged: (v) => set('b15EnableCprSupportResistance', v),
    ),
    ToggleCard(
      title: 'Partial profit booking ("Banker & Runner")',
      badge: 'Multi-lot',
      tone: Tone.warn,
      body: 'Books part of the position at the target R, moves the stop to cost and lets the runner trend.',
      value: _on('b15EnablePartialBooking'),
      onChanged: (v) => set('b15EnablePartialBooking', v),
      child: FieldPair(
        BoundField(
          label: 'Booking target (R)',
          kind: FieldKind.decimal,
          value: s(form, 'b15PartialBookingR'),
          onChanged: (v) => set('b15PartialBookingR', v),
          hint: 'Default +1.8R',
        ),
        BoundField(
          label: 'Booked (%)',
          value: s(form, 'b15PartialBookingPct'),
          onChanged: (v) => set('b15PartialBookingPct', v),
          hint: 'Default 50%',
        ),
      ),
    ),
    ToggleCard(
      title: 'Midday dead-zone chop shield',
      badge: 'Anti-whipsaw',
      body: 'Blocks new breakout entries in the midday chop. Running trades continue.',
      value: _on('b15EnableMiddayChopFilter'),
      onChanged: (v) => set('b15EnableMiddayChopFilter', v),
      child: FieldPair(
        BoundField(
          label: 'Start (IST)',
          kind: FieldKind.time,
          value: s(form, 'b15MiddayDeadZoneStart'),
          onChanged: (v) => set('b15MiddayDeadZoneStart', v),
        ),
        BoundField(
          label: 'End (IST)',
          kind: FieldKind.time,
          value: s(form, 'b15MiddayDeadZoneEnd'),
          onChanged: (v) => set('b15MiddayDeadZoneEnd', v),
        ),
      ),
    ),
    ToggleCard(
      title: 'Structural candle stop-loss',
      body: 'Stop at the breakout candle extreme (45–80 pts) instead of the opposite 15m range (200–350 pts).',
      value: _on('b15UseStructuralCandleSl'),
      onChanged: (v) => set('b15UseStructuralCandleSl', v),
    ),
    ToggleCard(
      title: 'RSI(14) momentum alignment',
      body: 'Confirms momentum (RSI > 55 for long, < 45 for short).',
      value: _on('b15EnableRsiFilter'),
      onChanged: (v) => set('b15EnableRsiFilter', v),
    ),
    ToggleCard(
      title: 'Early breakeven trailing',
      body: 'Moves the stop to cost once the trade reaches the breakeven trigger.',
      value: _on('b15EnableBreakevenTrail'),
      onChanged: (v) => set('b15EnableBreakevenTrail', v),
    ),
    ToggleCard(
      title: 'EMA & VWAP trend trailing',
      badge: 'Runner',
      body: 'Once in profit, trails the stop along EMA/VWAP and rides the trend until exhaustion.',
      value: _on('b15EnableEmaVwapTrailing'),
      onChanged: (v) => set('b15EnableEmaVwapTrailing', v),
      child: FieldPair(
        DropdownButtonFormField<String>(
          value:
              const ['9', '15', '21'].contains(s(form, 'b15TrailingEmaPeriod')) ? s(form, 'b15TrailingEmaPeriod') : '9',
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Trailing EMA'),
          items: const [
            DropdownMenuItem(value: '9', child: Text('9 EMA (fast)')),
            DropdownMenuItem(value: '15', child: Text('15 EMA (smooth)')),
            DropdownMenuItem(value: '21', child: Text('21 EMA (macro)')),
          ],
          onChanged: (v) => set('b15TrailingEmaPeriod', v),
        ),
        DropdownButtonFormField<String>(
          value:
              const ['both', 'ema', 'vwap'].contains(s(form, 'b15TrailingVwapSource'))
                  ? s(form, 'b15TrailingVwapSource')
                  : 'both',
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Baseline'),
          items: const [
            DropdownMenuItem(value: 'both', child: Text('EMA & VWAP')),
            DropdownMenuItem(value: 'ema', child: Text('EMA only')),
            DropdownMenuItem(value: 'vwap', child: Text('VWAP only')),
          ],
          onChanged: (v) => set('b15TrailingVwapSource', v),
        ),
      ),
    ),
    ToggleCard(
      title: 'Liquidity sweep trap trading',
      badge: 'High win-rate',
      body: 'Fades false breakouts: buys bear traps at the range bottom, sells bull traps at the range top.',
      value: _on('b15EnableTrapReversal'),
      onChanged: (v) => set('b15EnableTrapReversal', v),
    ),
    ToggleCard(
      title: 'Breakout retest & body conviction',
      body: 'Requires a candle body ≥ 40% and a confirmed retest bounce.',
      value: _on('b15EnableRetestConfirmation'),
      onChanged: (v) => set('b15EnableRetestConfirmation', v),
    ),
    ToggleCard(
      title: 'CPR narrow trend filter',
      body: 'Identifies trending sessions from the CPR bandwidth.',
      value: _on('b15EnableCprFilter'),
      onChanged: (v) => set('b15EnableCprFilter', v),
    ),
    FieldPair(
      BoundField(
        label: 'Max range (pts)',
        value: s(form, 'b15MaxOpeningRangePts'),
        onChanged: (v) => set('b15MaxOpeningRangePts', v),
        hint: 'Skip the day if the 15m bar is bigger.',
      ),
      BoundField(
        label: 'Entry cutoff',
        kind: FieldKind.time,
        value: s(form, 'b15PrimeWindowEndTime'),
        onChanged: (v) => set('b15PrimeWindowEndTime', v),
        hint: 'No new entries after (IST).',
      ),
    ),
    FieldPair(
      BoundField(
        label: 'Breakeven trigger (R)',
        kind: FieldKind.decimal,
        value: s(form, 'b15BreakevenTriggerR'),
        onChanged: (v) => set('b15BreakevenTriggerR', v),
        hint: 'R-multiple to trail to cost.',
      ),
      BoundField(
        label: 'CPR narrow (%)',
        kind: FieldKind.decimal,
        value: s(form, 'b15CprNarrowThresholdPct'),
        onChanged: (v) => set('b15CprNarrowThresholdPct', v),
        hint: 'Narrower = trend-day candidate.',
      ),
    ),
    BoundField(
      label: 'Trap stop buffer (pts)',
      kind: FieldKind.decimal,
      value: s(form, 'b15TrapSlBufferPts'),
      onChanged: (v) => set('b15TrapSlBufferPts', v),
      hint: 'Buffer beyond the sweep extreme for the tight trap stop.',
    ),
  ];

  List<Widget> _fade(BuildContext context) {
    final stop = double.tryParse(s(form, 'sipStopPct')) ?? 1.2;
    final lock = s(form, 'sipBreakevenLockR').isEmpty ? '0' : s(form, 'sipBreakevenLockR');
    final presets = const [
      (
        label: 'Recommended (≈62% wins)',
        stop: '1.2',
        tgt: '3',
        at: '1',
        lock: '0.2',
        text: 'Backtest +₹77.6k / 2 years, worst month −₹3.0k',
      ),
      (
        label: 'Highest win rate (≈73% wins)',
        stop: '1.8',
        tgt: '3',
        at: '0.5',
        lock: '0.2',
        text: 'Backtest +₹39.3k / 2 years (half the profit), worst month −₹1.7k',
      ),
    ];
    String? active;
    for (final p in presets) {
      if (s(form, 'sipStopPct') == p.stop &&
          s(form, 'sipTargetR') == p.tgt &&
          s(form, 'sipBreakevenAtR') == p.at &&
          lock == p.lock) {
        active = p.label;
      }
    }
    return [
      const Text('How a trade is managed', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      Bullets([
        'Entry is a market SHORT right after the 5-minute close that gave the signal.',
        if (form['sipFixedStopPct'] == true)
          'The stop-loss is placed on the exchange at once, the stop distance above the fill.'
        else
          "The stop-loss is placed on the exchange at once, past the day's high so far (longs: below the low), with a 0.8–1.5% buffer set by the stock's ATR. A wider stop means fewer shares, so the loss at the stop is still at most your max loss. The target and the stop moves are measured in \"1R\", a fixed % of the entry.",
        'The target is watched by the strategy; when price reaches it the short is covered at market.',
        'Once the trade is in profit by the breakeven step, the exchange stop is moved to the entry price.',
        if (form['sipProfitLock'] != false)
          'Profit lock: at +1.5x the stop the exchange stop moves to lock +0.5x; at +2.5x it locks +1.5x.',
        'Otherwise the position is squared off at 15:05.',
        'Backtest (Sep 2024 to Sep 2026, ₹500 risk, 1.2% / 3R / breakeven at 1R): about 4 in 10 trades win, the average loss is about ₹340, runs of 8 losing days happened, and 5 of 25 months were red.',
      ]),
      ChoiceCards<String>(
        value: active,
        onChanged: (label) {
          final p = presets.firstWhere((p) => p.label == label);
          set('sipStopPct', p.stop);
          set('sipTargetR', p.tgt);
          set('sipBreakevenAtR', p.at);
          set('sipBreakevenLockR', p.lock);
          set('sipProfitLock', true);
        },
        options: [for (final p in presets) (value: p.label, title: p.label, body: p.text)],
      ),
      ToggleCard(
        title: 'Fixed % stop instead of the structural stop',
        body:
            "Off (default): the stop sits past the day's high/low, so a normal pullback does not hit it, and fewer shares are traded. On: the old stop at a fixed % from the entry, as backtested. The structural stop has not been backtested.",
        value: form['sipFixedStopPct'] == true,
        onChanged: (v) => set('sipFixedStopPct', v),
      ),
      FieldPair(
        BoundField(
          label: form['sipFixedStopPct'] == true ? 'Stop distance' : '1R (target unit)',
          suffix: '%',
          kind: FieldKind.decimal,
          value: s(form, 'sipStopPct'),
          onChanged: (v) => set('sipStopPct', v),
          hint: form['sipFixedStopPct'] == true
              ? '1.2% was backtested. 0.8% to 1.6% were also positive.'
              : 'Not the stop: the target and the stop moves are multiples of this % of the entry. The stop itself is structural.',
        ),
        BoundField(
          label: 'Target',
          suffix: 'x stop',
          kind: FieldKind.decimal,
          value: s(form, 'sipTargetR'),
          onChanged: (v) => set('sipTargetR', v),
          hint: '3 = ${(stop * 3).toStringAsFixed(1)}% below the entry. 0 = no target.',
        ),
      ),
      FieldPair(
        BoundField(
          label: 'Stop to entry at',
          suffix: 'x stop',
          kind: FieldKind.decimal,
          value: s(form, 'sipBreakevenAtR'),
          onChanged: (v) => set('sipBreakevenAtR', v),
          hint: '1 = once up by the stop distance. 0 = off.',
        ),
        BoundField(
          label: 'Profit locked there',
          suffix: 'x stop',
          kind: FieldKind.decimal,
          value: s(form, 'sipBreakevenLockR'),
          onChanged: (v) => set('sipBreakevenLockR', v),
          hint: '0.2 = closes in profit after charges. 0 = exactly the entry.',
        ),
      ),
      BoundField(
        label: "Skip if yesterday's low is closer than",
        suffix: 'x stop',
        kind: FieldKind.decimal,
        value: s(form, 'sipSkipNearPdlR'),
        onChanged: (v) => set('sipSkipNearPdlR', v),
        hint:
            "0 = off (the default). 2 = no short when yesterday's low is less than 2x the stop below the price (longs: yesterday's high above it). Backtest 2 years: about the same profit either way.",
      ),
      BoundField(
        label: 'Min avg daily value',
        prefix: '₹ ',
        suffix: 'Cr',
        kind: FieldKind.decimal,
        value: s(form, 'sipMinAvgValueCr'),
        onChanged: (v) => set('sipMinAvgValueCr', v),
        hint: 'Skips thinly traded stocks. Backtested at ₹10 Cr; ₹25 Cr earned less.',
      ),
      ToggleCard(
        title: 'Profit lock (after breakeven)',
        body:
            'At +1.5x the stop, the exchange stop moves to lock +0.5x; at +2.5x it locks +1.5x. Backtest: same total profit, winning trades 39% → 51%, worst month −₹3.6k → −₹2.4k.',
        value: form['sipProfitLock'] != false,
        onChanged: (v) => set('sipProfitLock', v),
      ),
      _leverage(),
    ];
  }

  Widget _leverage() => BoundField(
    label: 'Fallback leverage',
    suffix: 'x',
    kind: FieldKind.decimal,
    value: s(form, 'sipLeverage'),
    onChanged: (v) => set('sipLeverage', v),
    hint:
        "Sizing uses Zerodha's own intraday leverage for each stock, asked at 09:20. This is used only when Zerodha cannot say (up to 5x).",
  );

  List<Widget> _oi() => [
    const Text('How a trade is managed', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
    const Bullets([
      "A SELL LIMIT 5% under yesterday's close goes in at 09:00 and fills in the pre-open auction at the 09:15 price.",
      'The exchange stop goes in at 09:15, the stop distance above the fill.',
      'The target is watched by the strategy; otherwise the position is squared off at 15:05.',
    ]),
    FieldPair(
      BoundField(
        label: 'Stop distance',
        suffix: '%',
        kind: FieldKind.decimal,
        value: s(form, 'sipStopPct'),
        onChanged: (v) => set('sipStopPct', v),
        hint: '1% was backtested.',
      ),
      BoundField(
        label: 'Target',
        suffix: 'x stop',
        kind: FieldKind.decimal,
        value: s(form, 'sipTargetR'),
        onChanged: (v) => set('sipTargetR', v),
        hint: '3x was backtested. 0 = no target.',
      ),
    ),
  ];

  List<Widget> _orb() => [
    const Text('How a trade is managed', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
    const Bullets([
      'The stop-loss sits the distance away from the fill and is placed on the exchange at once.',
      'There is no target. A position exits at its stop or at the 15:05 square-off.',
      'Expect about 2 losing trades for every winner; the winners are usually several times larger.',
    ]),
    BoundField(
      label: 'Stop distance',
      suffix: 'x ATR',
      kind: FieldKind.decimal,
      value: s(form, 'sipStopAtr'),
      onChanged: (v) => set('sipStopAtr', v),
      hint: "0.2 = a fifth of the stock's average daily range (14 days).",
    ),
    BoundField(
      label: 'Min avg daily value',
      prefix: '₹ ',
      suffix: 'Cr',
      kind: FieldKind.decimal,
      value: s(form, 'sipMinAvgValueCr'),
      onChanged: (v) => set('sipMinAvgValueCr', v),
      hint: 'Skips thinly traded stocks, where fills slip more.',
    ),
    _leverage(),
  ];

  List<Widget> _trend() => [
    const Bullets([
      'Stop at the day low (long) or high (short); shares are sized so it loses at most your max loss.',
      'No target: the trade rides until the 15-EMA crosses back over the 40-EMA, else 15:05.',
    ]),
    _leverage(),
  ];

  List<Widget> _stockPicker(BuildContext context) {
    final emaMode = s(form, 'targetMode') == 'EMA' && form['exitExactAtTarget'] != true;
    return [
      const Notice(
        "Entries: opening-drive, inside-candle, crossover and pullback setups on 5-minute candles from 09:20, with a volume spike against the stock's own last 10 sessions (Balanced); the stock must be 1.5% past yesterday's close in the trade's direction. Stop beyond the setup's swing, 0.85% to 1.2% from entry. Exit: ride the 15-EMA; at +1.5R the stop moves to +0.5R and the exit switches to the 40-EMA; at +3R the stop moves to +2R; all closed at 15:05. 2-year backtest at ₹500 risk, 1 trade a day, after charges: +₹47.6k. A setting you change runs as you set it, not as tested.",
        title: 'Recommended settings (the backtested set)',
        tone: Tone.profit,
        icon: Icons.trending_up_rounded,
      ),
      ToggleCard(
        title: 'Volume confirmation',
        body:
            "Every entry needs a volume spike on its signal candle, compared with that stock's own volume at the same time of day over the last 10 sessions.",
        value: form['volumeFilter'] != false,
        onChanged: (v) => set('volumeFilter', v),
        child: ChoiceCards<String>(
          value: s(form, 'volumeStrictness').isEmpty ? 'BALANCED' : s(form, 'volumeStrictness'),
          onChanged: (v) => set('volumeStrictness', v),
          options: const [
            (value: 'RELAXED', title: 'Relaxed', body: 'More trades. Volume clearly above normal.'),
            (value: 'BALANCED', title: 'Balanced', body: "Recommended. Volume well above the stock's normal."),
            (value: 'STRICT', title: 'Strict', body: 'Fewest trades. Only exceptional volume spikes.'),
          ],
        ),
      ),
      OptionGroup(
        title: 'Profit target mode',
        body:
            "Targets are sized from each stock's own daily volatility (ATR). The stop stays at the structural swing level in every mode.${form['exitExactAtTarget'] == true ? ' Turned off while the fixed rupee target below is on.' : ''}",
        child: ChoiceCards<String>(
          value:
              form['exitExactAtTarget'] == true
                  ? null
                  : (s(form, 'targetMode').isEmpty ? 'FULL' : s(form, 'targetMode')),
          onChanged: (v) => set('targetMode', v),
          options: const [
            (
              value: 'FULL',
              title: 'Full exit',
              body: "One target at 0.5x the stock's daily range. No trailing. Highest win rate.",
            ),
            (
              value: 'PARTIAL',
              title: 'Partial booking',
              body: 'Book half at that target; the rest rides the 15-EMA. Runner stop to break-even.',
            ),
            (
              value: 'QUICK',
              title: 'Quick wins',
              body: 'Book half at 0.5R (hit about half the time); the rest rides the 15-EMA.',
            ),
            (
              value: 'EMA',
              title: 'Ride the 15-EMA',
              body: 'No target. Exits on a 5m close across the 15-EMA, the stop, or 15:05. Best 2-year result.',
            ),
          ],
        ),
      ),
      if (emaMode) ...[
        ToggleCard(
          title: 'Profit lock',
          body:
              'At +1.5R the stop moves to +0.5R, and at +3R to +2R. In the 2-year backtest this made about 40% more than leaving the stop where it started.',
          value: form['profitLock'] != false,
          onChanged: (v) => set('profitLock', v),
        ),
        ToggleCard(
          title: 'Slow trail',
          body:
              'Once +1.5R, exits on a 5m close across the 40-EMA instead of the 15-EMA. In the 2-year backtest this made about 25% more.',
          value: form['slowTrail'] != false,
          onChanged: (v) => set('slowTrail', v),
        ),
      ],
      OptionGroup(
        title: 'Stagnation exit',
        body:
            'Closes the trade if it is still within 0.25% of the entry after this long. In the backtest a longer time (or off) did better.',
        child: OptionChips(
          options: const [
            (value: '0', label: 'Off'),
            (value: '35', label: '35 min'),
            (value: '60', label: '60 min'),
            (value: '120', label: '120 min'),
          ],
          selected: (v) => (s(form, 'stagnationMinutes').isEmpty ? '0' : s(form, 'stagnationMinutes')) == v,
          onSelected: (v) => set('stagnationMinutes', v),
        ),
      ),
      OptionGroup(
        title: 'Min day move',
        body:
            "Skips a setup unless the stock is already this far past yesterday's close in the trade's direction. 1.5% made about 23% more in the backtest.",
        child: OptionChips(
          options: const [
            (value: '0', label: 'Off'),
            (value: '1', label: '1%'),
            (value: '1.5', label: '1.5%'),
            (value: '2', label: '2%'),
          ],
          selected: (v) => double.tryParse(s(form, 'minDayMovePct')) == double.parse(v),
          onSelected: (v) => set('minDayMovePct', v),
        ),
      ),
      OptionGroup(
        title: 'Max stop distance',
        body:
            'The stop never sits further than this from the entry. A tighter stop buys more shares for the same max loss. 1.2% made about 3x what 2.2% made.',
        child: OptionChips(
          options: const [
            (value: '1', label: '1.0%'),
            (value: '1.2', label: '1.2%'),
            (value: '1.5', label: '1.5%'),
            (value: '2.2', label: '2.2% (old)'),
          ],
          selected: (v) => double.tryParse(s(form, 'maxStopPct')) == double.parse(v),
          onSelected: (v) => set('maxStopPct', v),
        ),
      ),
      ToggleCard(
        title: 'Exit exact at target (fixed profit target)',
        tone: Tone.warn,
        body:
            'Squares off the moment your exact target (₹${s(form, 'targetRs')}) or stop (₹${s(form, 'stopLossRs')}) is hit, with no trailing. Overrides the target mode. In the 2-year backtest a fixed ₹500 target lost ₹9.8k where riding the 15-EMA made +₹35.5k.',
        value: form['exitExactAtTarget'] == true,
        onChanged: (v) => set('exitExactAtTarget', v),
      ),
    ];
  }
}

// ─── Step 4: paper or live, review ────────────────────────────────────────────────────────────

class StepReview extends StatelessWidget {
  const StepReview({
    super.key,
    required this.form,
    required this.set,
    required this.brokers,
    required this.errors,
    required this.liveAck,
    required this.onLiveAck,
    required this.onGoToStep,
  });

  final StrategyForm form;
  final SetField set;
  final List<BrokerAccount> brokers;
  final List<({String message, int step})> errors;
  final bool liveAck;
  final ValueChanged<bool> onLiveAck;
  final ValueChanged<int> onGoToStep;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final meta = typeMeta(s(form, 'type'));
    final lot = formLotSize(form);
    final lots = s(form, 'lots');
    final totalQty = ((double.tryParse(lots) ?? 1).toInt()) * lot;
    final risk = estimateRisk(form);
    final brokerId = s(form, 'brokerAccountId');
    final broker = brokers.where((x) => x.id == brokerId).firstOrNull;
    final auto = isAutoSymbol(form);
    final live = form['isPaperTrade'] != true;

    Widget mode({required bool paper}) {
      final selected = paper != live;
      final tone = paper ? Tone.profit : Tone.warn;
      return Material(
        color: selected ? tone.bg(c) : c.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: selected ? tone.fg(c) : c.border, width: selected ? 1.5 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.card),
          onTap: () => set('isPaperTrade', paper),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Icon(paper ? Icons.science_outlined : Icons.bolt_rounded, size: 16, color: tone.fg(c)),
                    Text(
                      paper ? 'Paper trading' : 'Live trading',
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                    ),
                    if (paper) const Pill('Recommended first', tone: Tone.profit),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  paper
                      ? 'No real orders. Trades are simulated on live prices and nothing is sent to your broker.'
                      : 'Places real orders with real money on your connected broker account, including stop-loss orders.',
                  style: TextStyle(fontSize: 12, color: c.mutedForeground),
                ),
              ],
            ),
          ),
        ),
      );
    }

    Widget group(String title, int step, List<Widget> rows) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: GroupLabel(title)),
              TextButton.icon(
                onPressed: () => onGoToStep(step),
                icon: const Icon(Icons.edit_outlined, size: 14),
                label: const Text('Edit'),
              ),
            ],
          ),
          ...rows,
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FormSection(
          title: 'Paper or live?',
          description: 'You can switch this later from the edit page.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              mode(paper: true),
              const SizedBox(height: 8),
              mode(paper: false),
              if (live) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: c.lossSubtle,
                    borderRadius: BorderRadius.circular(AppRadius.card),
                    border: Border.all(color: c.loss.withValues(alpha: 0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'This strategy will place real orders${broker == null ? '' : ' on ${broker.label}'}. You can lose up to ${inr(risk.perDay)} a day.',
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c.loss),
                      ),
                      if (brokerId.isEmpty)
                        TextButton(
                          onPressed: () => onGoToStep(1),
                          child: const Text('No broker selected: choose one in step 2'),
                        ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: liveAck,
                        onChanged: (v) => onLiveAck(v ?? false),
                        title: const Text(
                          'I understand this trades with real money and I have checked the limits below.',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpace.gap),
        FormSection(
          title: 'Review',
          description: 'Check the details. Use Edit to jump back to a step.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              group('Strategy', 0, [
                KV('Name', s(form, 'name').isEmpty ? 'Untitled' : s(form, 'name')),
                KV(
                  'Type',
                  meta.label,
                  valueWidget: Wrap(
                    alignment: WrapAlignment.end,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      Text(meta.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                      Pill('${meta.risk.label} risk', tone: riskTone(meta.risk)),
                    ],
                  ),
                ),
              ]),
              group('Instrument and size', 1, [
                KV('Instrument', auto ? 'Auto-selected each day' : '${s(form, 'symbol')} (${s(form, 'exchange')})'),
                KV(
                  'Position size',
                  s(form, 'type') == 'STOCKS_IN_PLAY'
                      ? 'Risk-based'
                      : (auto ? '$lots lot(s)' : '$lots lot(s), $totalQty qty'),
                ),
                KV('Product', s(form, 'product')),
                KV('Broker', broker == null ? 'None selected' : '${broker.label} (${broker.clientId ?? 'connected'})'),
              ]),
              group('Risk', 2, [
                KV('Max loss per trade', inr(risk.perTrade), color: c.loss),
                KV('Max loss per day', inr(risk.perDay), color: c.loss),
                KV('Max trades per day', s(form, 'maxTradesPerDay').isEmpty ? 'n/a' : s(form, 'maxTradesPerDay')),
                if (risk.targetPerTrade != null) KV('Target per trade', inr(risk.targetPerTrade), color: c.profit),
              ]),
            ],
          ),
        ),
        if (errors.isNotEmpty) ...[
          const SizedBox(height: AppSpace.gap),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: c.lossSubtle,
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: c.loss.withValues(alpha: 0.4)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Fix these before saving',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c.loss),
                ),
                for (final e in errors)
                  Row(
                    children: [
                      Expanded(child: Text(e.message, style: const TextStyle(fontSize: 12))),
                      TextButton(onPressed: () => onGoToStep(e.step), child: Text('Step ${e.step + 1}')),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
