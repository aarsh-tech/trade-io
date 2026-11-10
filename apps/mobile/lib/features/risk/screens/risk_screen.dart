import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_envelope.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/action_button.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../strategies/strategies_providers.dart';
import '../risk_api.dart';
import '../risk_models.dart';
import '../risk_providers.dart';

class RiskScreen extends ConsumerWidget {
  const RiskScreen({super.key});
  void _refresh(WidgetRef ref) {
    ref
      ..invalidate(riskStatusProvider)
      ..invalidate(strategiesProvider)
      ..invalidate(positionsProvider)
      ..invalidate(ordersProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Risk management')),
    body: AsyncView(
      value: ref.watch(riskStatusProvider),
      onRetry: () => ref.invalidate(riskStatusProvider),
      data:
          (s) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.killSwitchActive ? 'Trading suspended' : 'Trading enabled',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 12),
                      const Text('Daily P&L'),
                      PnlText(s.totalDailyPnl, style: Theme.of(context).textTheme.headlineMedium),
                      Text('Realised ${formatInr(s.realizedPnl)} · Unrealised ${formatInr(s.unrealizedPnl)}'),
                      const SizedBox(height: 12),
                      LinearProgressIndicator(value: (s.lossUsagePct / 100).clamp(0, 1)),
                      Text('${s.lossUsagePct.toStringAsFixed(1)}% of daily loss limit · ${formatInr(s.maxDailyLoss)}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              ActionButton(
                showSuccessMessage: false,
                label: s.killSwitchActive ? 'Reset kill switch' : 'Emergency stop',
                confirm:
                    s.killSwitchActive
                        ? 'Re-enable trading and allow new orders? Review your positions and limits first.'
                        : 'Suspend new trading, cancel algo orders and close algo intraday positions? Manual positions may remain open; review them at your broker.',
                action: () async {
                  final api = ref.read(riskApiProvider);
                  final result = s.killSwitchActive ? await api.resetKillSwitch() : await api.triggerKillSwitch();
                  _refresh(ref);
                  if (!context.mounted) return;
                  await showDialog<void>(
                    context: context,
                    builder:
                        (ctx) => AlertDialog(
                          title: const Text('Risk control result'),
                          content: Text(result.message),
                          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
                        ),
                  );
                },
                onSuccess: () => _refresh(ref),
              ),
              const SizedBox(height: 20),
              _Settings(key: ValueKey('${s.maxDailyLoss}:${s.maxOrderValue}:${s.maxOrderQty}'), status: s),
            ],
          ),
    ),
  );
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
  @override
  void dispose() {
    _loss.dispose();
    _value.dispose();
    _qty.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Order limits', style: Theme.of(context).textTheme.titleLarge),
        const Text('Blank optional limits are left unchanged.'),
        for (final field in [
          (_loss, 'Maximum daily loss (₹)'),
          (_value, 'Maximum order value (₹)'),
          (_qty, 'Maximum order quantity'),
        ])
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: TextFormField(
              controller: field.$1,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: field.$2),
              validator: (text) {
                if ((text ?? '').isEmpty && field.$1 != _loss) return null;
                final n = num.tryParse(text ?? '');
                if (n == null || !n.isFinite || n <= 0) return 'Enter a positive number';
                if (field.$1 == _qty && n != n.truncate()) return 'Enter a whole number';
                return null;
              },
            ),
          ),
        const SizedBox(height: 12),
        ActionButton(
          label: 'Save limits',
          action: () async {
            if (!_form.currentState!.validate()) throw const ApiException('Check the highlighted limits');
            await ref.read(riskApiProvider).updateSettings({
              'maxDailyLoss': num.parse(_loss.text),
              if (_value.text.isNotEmpty) 'maxOrderValue': num.parse(_value.text),
              if (_qty.text.isNotEmpty) 'maxOrderQty': num.parse(_qty.text).toInt(),
            });
          },
          onSuccess: () => ref.invalidate(riskStatusProvider),
        ),
      ],
    ),
  );
}
