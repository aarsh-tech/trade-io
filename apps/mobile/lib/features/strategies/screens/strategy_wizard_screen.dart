import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../router.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../market/market_api.dart';
import '../../orders/ticket_models.dart';
import '../strategies_api.dart';
import '../strategies_models.dart';
import '../strategies_providers.dart';
import '../strategy_config.dart';
import '../strategy_form.dart';
import '../widgets/wizard_steps.dart';

/// The web's 4-step strategy wizard (create and edit): Type → Instrument → Risk → Review.
class StrategyWizardScreen extends ConsumerWidget {
  const StrategyWizardScreen({super.key, this.id});

  /// Null to create; a strategy id to edit.
  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (id == null) return _Wizard(initial: createDefaultForm());
    final row = ref.watch(strategyProvider(id!));
    return AsyncView(
      value: row,
      loading: const Scaffold(body: Loading(label: 'Loading strategy…')),
      onRetry: () => ref.invalidate(strategyProvider(id!)),
      data:
          (s) => _Wizard(
            key: ValueKey(s.id),
            row: s,
            initial: strategyToForm(
              name: s.name,
              type: s.type?.wire ?? '',
              config: s.config,
              brokerAccountId: s.brokerAccountId,
              isPaperTrade: s.isPaperTrade,
            ),
          ),
    );
  }
}

const _steps = [
  (title: 'Type', hint: 'What to trade with'),
  (title: 'Instrument', hint: 'Broker, symbol and size'),
  (title: 'Risk', hint: 'Limits and sizing'),
  (title: 'Review', hint: 'Paper or live, then save'),
];
const _last = 3;

class _Wizard extends ConsumerStatefulWidget {
  const _Wizard({super.key, required this.initial, this.row});
  final StrategyForm initial;
  final StrategyRow? row;
  @override
  ConsumerState<_Wizard> createState() => _WizardState();
}

class _WizardState extends ConsumerState<_Wizard> {
  late StrategyForm _form = Map.of(widget.initial);
  late String _baseline = jsonEncode(widget.initial);
  late int _step = 0;
  late int _maxStep = _edit ? _last : 0;
  bool _liveAck = false;
  bool _saving = false;
  final _scroll = ScrollController();

  bool get _edit => widget.row != null;
  bool get _dirty => jsonEncode(_form) != _baseline;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _set(String key, Object? value) {
    setState(() => _form = {..._form, key: value});
    if (key == 'symbol' || key == 'brokerAccountId') _refreshLotSize();
  }

  /// The broker's lot size for the chosen symbol (web Step2 effect).
  Future<void> _refreshLotSize() async {
    final symbol = s(_form, 'symbol'), account = s(_form, 'brokerAccountId');
    if (symbol.isEmpty || symbol == 'AUTO' || account.isEmpty) return;
    try {
      final lot = await ref.read(marketApiProvider).lotSize(symbol, account);
      if (mounted && s(_form, 'symbol') == symbol && lot.lotSize > 0) {
        setState(() => _form = {..._form, 'lotSize': lot.lotSize});
      }
    } catch (_) {
      // Keeps the index default; the server sizes orders by the real lot anyway.
    }
  }

  void _selectType(String type) {
    if (_edit) return;
    setState(() => _form = withType(_form, type));
  }

  void _selectInstrument(Instrument i) {
    final seg = i.segment;
    setState(() {
      _form = {
        ..._form,
        'symbol': i.symbol,
        'exchange': i.exchange,
        'instrumentType': seg == 'NFO-OPT' || seg == 'BFO-OPT' ? 'OPTION' : (seg == 'INDICES' ? 'INDEX' : 'STOCK'),
        if (i.lotSize > 0) 'lotSize': i.lotSize,
      };
    });
    _refreshLotSize();
  }

  List<({String message, int step})> get _errors {
    final type = s(_form, 'type');
    if (type.isEmpty) return const [];
    return [
      for (final m in validateStrategyConfig(type, buildStrategyConfig(_form))) (message: m, step: stepOfError(m)),
    ];
  }

  List<String> _stepErrors(int step) => [
    for (final e in _errors)
      if (e.step == step) e.message,
  ];

  /// Why [step] cannot be completed, or null when it can (web `blocker`).
  String? _blocker(int step) {
    final live = _form['isPaperTrade'] != true;
    if (s(_form, 'type').isEmpty) return 'Choose a strategy type to continue';
    if (s(_form, 'name').trim().isEmpty) return 'Give the strategy a name to continue';
    if (step >= 1) {
      if (s(_form, 'symbol').trim().isEmpty) return 'Select an instrument to continue';
      if (!((double.tryParse(s(_form, 'lots')) ?? 0) >= 1)) return 'Lots must be at least 1';
      final e = _stepErrors(1);
      if (e.isNotEmpty) return e.first;
    }
    if (step >= 2) {
      final e = _stepErrors(2);
      if (e.isNotEmpty) return e.first;
    }
    if (step >= 3) {
      if (live && s(_form, 'brokerAccountId').isEmpty) return 'Select a broker account to trade live';
      if (live && !_liveAck) return 'Confirm you understand live trading';
      if (_edit && !_dirty) return 'No changes to save yet';
    }
    return null;
  }

  void _goTo(int i) {
    if (i > _maxStep && !_edit) return;
    setState(() => _step = i);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _next() {
    if (_blocker(_step) != null || _step >= _last) return;
    setState(() {
      _maxStep = _maxStep > _step + 1 ? _maxStep : _step + 1;
      _step++;
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<bool> _confirmLeave() async {
    if (!_dirty || _saving) return true;
    return confirmAction(
      context,
      title: 'Discard changes?',
      message: 'You have unsaved changes to this strategy.',
      confirmLabel: 'Discard',
      destructive: true,
    );
  }

  Future<void> _submit() async {
    if (_blocker(_step) != null || _saving) return;
    setState(() => _saving = true);
    final row = widget.row;
    final broker = s(_form, 'brokerAccountId');
    final paper = _form['isPaperTrade'] == true;
    final body = <String, dynamic>{
      'name': s(_form, 'name').trim(),
      'type': s(_form, 'type'),
      if (broker.isNotEmpty) 'brokerAccountId': broker,
      'config': jsonEncode(row == null ? buildStrategyConfig(_form) : mergeEditedConfig(row.config, _form)),
      if (row == null || paper != row.isPaperTrade) 'isPaperTrade': paper,
    };
    try {
      await ref.read(strategiesApiProvider).save(row?.id, body);
      _baseline = jsonEncode(_form);
      ref.invalidate(strategiesProvider);
      if (row != null) ref.invalidate(strategyProvider(row.id));
      if (!mounted) return;
      toast(
        context,
        row == null
            ? '${s(_form, 'name').trim()} created. Start it from the Strategies page.'
            : row.isActive
            ? 'Strategy updated. Changes apply the next time it starts.'
            : 'Strategy updated',
      );
      context.canPop() ? context.pop() : context.go(Routes.strategies);
    } catch (e) {
      if (mounted) toast(context, apiErrorMessage(e, 'Failed to save strategy'), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final reason = _blocker(_step);
    final live = _form['isPaperTrade'] != true;
    final brokers = ref.watch(brokersProvider);

    // Create: preselect the first (active) broker once the list arrives.
    if (!_edit && s(_form, 'brokerAccountId').isEmpty) {
      final list = brokers.value ?? const [];
      if (list.isNotEmpty) {
        final pick = list.where((b) => b.isActive).firstOrNull ?? list.first;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || s(_form, 'brokerAccountId').isNotEmpty) return;
          final base = jsonDecode(_baseline) as Map<String, dynamic>;
          _baseline = jsonEncode({...base, 'brokerAccountId': pick.id});
          _set('brokerAccountId', pick.id);
        });
      }
    }

    final stepErrors = _step == 1 || _step == 2 ? _stepErrors(_step) : const <String>[];
    final body = switch (_step) {
      0 => StepType(form: _form, set: _set, onSelectType: _selectType, locked: _edit),
      1 => StepInstrument(form: _form, set: _set, brokers: brokers, onInstrument: _selectInstrument),
      2 => StepRisk(form: _form, set: _set, errors: _stepErrors(2)),
      _ => StepReview(
        form: _form,
        set: _set,
        brokers: brokers.value ?? const [],
        errors: _errors,
        liveAck: _liveAck,
        onLiveAck: (v) => setState(() => _liveAck = v),
        onGoToStep: _goTo,
      ),
    };

    return PopScope(
      canPop: !_dirty || _saving,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (await _confirmLeave()) {
          _baseline = jsonEncode(_form);
          if (mounted) navigator.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_edit ? 'Edit strategy' : 'Create strategy'),
              Text(
                _edit ? s(_form, 'name') : 'Step ${_step + 1} of 4: ${_steps[_step].hint}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11.5),
              ),
            ],
          ),
          actions: [
            if (_edit)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Pill(_dirty ? 'Unsaved' : 'Saved', tone: _dirty ? Tone.warn : Tone.neutral, dot: true),
              ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(46),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.page, 0, AppSpace.page, 8),
              child: Row(
                children: [
                  for (final (i, st) in _steps.indexed) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: _StepTab(
                        index: i,
                        title: st.title,
                        current: _step,
                        reachable: _edit || i <= _maxStep,
                        edit: _edit,
                        onTap: () => _goTo(i),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        body: ListView(
          controller: _scroll,
          padding: AppSpace.pageInsets,
          children: [
            if (_edit && widget.row!.isActive) ...[
              const Notice(
                'Your changes are saved now but only take effect the next time it starts. Stop and start it to apply them.',
                title: 'This strategy is running.',
                tone: Tone.warn,
                icon: Icons.warning_amber_rounded,
              ),
              const SizedBox(height: AppSpace.gap),
            ],
            body,
            if (stepErrors.isNotEmpty) ...[
              const SizedBox(height: AppSpace.gap),
              Notice(
                stepErrors.join('\n'),
                title: 'Fix these before continuing',
                tone: Tone.loss,
                icon: Icons.error_outline_rounded,
              ),
            ],
          ],
        ),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(color: c.card, border: Border(top: BorderSide(color: c.border))),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.page, 8, AppSpace.page, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (reason != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline_rounded, size: 14, color: c.warn),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              reason,
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.warn),
                            ),
                          ),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      OutlinedButton(
                        onPressed:
                            _saving
                                ? null
                                : _step == 0
                                ? () => Navigator.maybePop(context)
                                : () => _goTo(_step - 1),
                        child: Text(_step == 0 ? 'Cancel' : 'Back'),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child:
                            _step < _last
                                ? FilledButton(
                                  onPressed: reason == null ? _next : null,
                                  child: Text('Next: ${_steps[_step + 1].title}'),
                                )
                                : FilledButton.icon(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: live ? c.loss : c.profit,
                                    foregroundColor: live ? c.onLoss : c.onProfit,
                                  ),
                                  onPressed: reason == null && !_saving ? _submit : null,
                                  icon:
                                      _saving
                                          ? const SizedBox.square(
                                            dimension: 14,
                                            child: CircularProgressIndicator(strokeWidth: 2),
                                          )
                                          : const Icon(Icons.check_rounded, size: 18),
                                  label: Text(
                                    _saving
                                        ? 'Saving…'
                                        : _edit
                                        ? (live ? 'Save changes (live)' : 'Save changes')
                                        : (live ? 'Create live strategy' : 'Create paper strategy'),
                                  ),
                                ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StepTab extends StatelessWidget {
  const _StepTab({
    required this.index,
    required this.title,
    required this.current,
    required this.reachable,
    required this.edit,
    required this.onTap,
  });
  final int index, current;
  final String title;
  final bool reachable, edit;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final isCurrent = index == current;
    final done = index < current || (edit && !isCurrent);
    final bar = isCurrent ? c.primary : (done ? c.profit : c.border);
    return InkWell(
      onTap: reachable ? onTap : null,
      borderRadius: BorderRadius.circular(AppRadius.control),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(height: 3, decoration: BoxDecoration(color: bar, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 5),
          Row(
            children: [
              Container(
                width: 18,
                height: 18,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isCurrent ? c.primary : (done ? c.profitSubtle : Colors.transparent),
                  border: Border.all(
                    color: isCurrent ? c.primary : (done ? c.profit.withValues(alpha: 0.4) : c.border),
                  ),
                ),
                child:
                    done && !edit
                        ? Icon(Icons.check_rounded, size: 11, color: c.profit)
                        : Text(
                          '${index + 1}',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: isCurrent ? c.onPrimary : (done ? c.profit : c.mutedForeground),
                          ),
                        ),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isCurrent ? c.foreground : c.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
