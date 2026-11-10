import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../strategies/strategies_providers.dart';
import '../risk_api.dart';
import '../risk_models.dart';
import '../risk_providers.dart';

/// Risk management (the web's RMS safety card): day P&L against the loss limit, the
/// emergency kill switch, and the order limits.
class RiskScreen extends ConsumerStatefulWidget {
  const RiskScreen({super.key});
  @override
  ConsumerState<RiskScreen> createState() => _RiskScreenState();
}

class _RiskScreenState extends ConsumerState<RiskScreen> {
  bool _busy = false;

  void _refresh() {
    ref
      ..invalidate(riskStatusProvider)
      ..invalidate(strategiesProvider)
      ..invalidate(positionsProvider)
      ..invalidate(ordersProvider);
  }

  Future<void> _kill(RiskStatus s) async {
    final reset = s.killSwitchActive;
    final ok = await confirmAction(
      context,
      title: reset ? 'Reset kill switch?' : 'Emergency stop?',
      message:
          reset
              ? 'Re-enable trading and allow new orders? Review your positions and limits first.'
              : 'Suspends new trading, cancels algo orders and closes algo intraday positions. Manual positions may stay open; review them at your broker.',
      confirmLabel: reset ? 'Reset' : 'Stop all trading',
      destructive: !reset,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final api = ref.read(riskApiProvider);
      final result = reset ? await api.resetKillSwitch() : await api.triggerKillSwitch();
      _refresh();
      if (mounted) toast(context, result.message);
    } catch (e) {
      if (mounted) toast(context, apiErrorMessage(e, 'Risk action failed'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Risk & kill switch')),
      body: AsyncView(
        value: ref.watch(riskStatusProvider),
        onRetry: () => ref.invalidate(riskStatusProvider),
        data: (s) {
          final pct = s.lossUsagePct;
          final tone = pct >= 80 ? c.loss : (pct >= 50 ? c.warn : c.profit);
          return RefreshIndicator(
            onRefresh: () => ref.refresh(riskStatusProvider.future),
            child: ListView(
              padding: AppSpace.pageInsets,
              children: [
                Panel(
                  accent: s.killSwitchActive ? c.loss : c.profit,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Icon(
                            s.killSwitchActive ? Icons.report_rounded : Icons.verified_user_outlined,
                            color: s.killSwitchActive ? c.loss : c.profit,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              s.killSwitchActive ? 'Trading suspended (kill switch ON)' : 'Risk management active',
                              style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 14),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Caption('Day P&L (realised + unrealised)'),
                      Text(
                        formatInr(s.totalDailyPnl, signed: true),
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: c.pnl(s.totalDailyPnl)),
                      ),
                      KV('Realised', formatInr(s.realizedPnl, signed: true), color: c.pnl(s.realizedPnl)),
                      KV('Unrealised', formatInr(s.unrealizedPnl, signed: true), color: c.pnl(s.unrealizedPnl)),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Expanded(child: Caption('Daily loss limit used')),
                          Text(
                            '${pct.toStringAsFixed(1)}%',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: tone),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Meter(pct / 100, color: tone),
                      const SizedBox(height: 4),
                      KV('Limit', formatInr(s.maxDailyLoss, decimals: 0)),
                      if (s.killSwitchActive && s.killSwitchTriggeredAt != null)
                        KV('Triggered', s.killSwitchTriggeredAt!.toLocal().toString().substring(0, 16), color: c.loss),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.gap),
                ToneButton(
                  label: s.killSwitchActive ? 'Reset kill switch' : 'Emergency stop (kill switch)',
                  icon: s.killSwitchActive ? Icons.restart_alt_rounded : Icons.power_settings_new_rounded,
                  tone: s.killSwitchActive ? Tone.neutral : Tone.loss,
                  filled: !s.killSwitchActive,
                  height: 44,
                  expand: true,
                  busy: _busy,
                  onPressed: () => _kill(s),
                ),
                const SizedBox(height: AppSpace.gap),
                _Settings(key: ValueKey('${s.maxDailyLoss}:${s.maxOrderValue}:${s.maxOrderQty}'), status: s),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Settings extends ConsumerStatefulWidget {
  const _Settings({super.key, required this.status});
  final RiskStatus status;
  @override
  ConsumerState<_Settings> createState() => _SettingsState();
}

class _SettingsState extends ConsumerState<_Settings> {
  final _form = GlobalKey<FormState>();
  // 5000.0 → "5000": whole rupee limits are shown without a trailing ".0".
  static String _plain(double? v) => v == null ? '' : (v == v.truncateToDouble() ? v.toStringAsFixed(0) : '$v');
  late final _loss = TextEditingController(text: _plain(widget.status.maxDailyLoss));
  late final _value = TextEditingController(text: _plain(widget.status.maxOrderValue));
  late final _qty = TextEditingController(text: widget.status.maxOrderQty?.toString() ?? '');
  bool _busy = false;

  @override
  void dispose() {
    _loss.dispose();
    _value.dispose();
    _qty.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    await runWithToast(
      context,
      () async {
        await ref.read(riskApiProvider).updateSettings({
          'maxDailyLoss': num.parse(_loss.text),
          if (_value.text.isNotEmpty) 'maxOrderValue': num.parse(_value.text),
          if (_qty.text.isNotEmpty) 'maxOrderQty': num.parse(_qty.text).toInt(),
        });
        ref.invalidate(riskStatusProvider);
      },
      success: 'Limits saved',
      failure: 'Could not save limits',
    );
    if (mounted) setState(() => _busy = false);
  }

  String? _validate(TextEditingController field, String? text) {
    if ((text ?? '').isEmpty && field != _loss) return null;
    final n = num.tryParse(text ?? '');
    if (n == null || !n.isFinite || n <= 0) return 'Enter a positive number';
    if (field == _qty && n != n.truncate()) return 'Enter a whole number';
    return null;
  }

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Order limits',
    icon: Icons.tune_rounded,
    child: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Every order and strategy is checked against these. Blank optional limits stay unchanged.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _loss,
            enabled: !_busy,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            decoration: const InputDecoration(labelText: 'Maximum daily loss', prefixText: '₹ '),
            validator: (t) => _validate(_loss, t),
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextFormField(
                  controller: _value,
                  enabled: !_busy,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                  decoration: const InputDecoration(labelText: 'Max order value', prefixText: '₹ '),
                  validator: (t) => _validate(_value, t),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _qty,
                  enabled: !_busy,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(labelText: 'Max order qty'),
                  validator: (t) => _validate(_qty, t),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save limits')),
          ),
        ],
      ),
    ),
  );
}
