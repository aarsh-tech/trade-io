import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/enums.dart';
import '../../../shared/widgets/async_view.dart';
import '../../../shared/widgets/ui.dart';
import '../../dashboard/dashboard_providers.dart';
import '../brokers_api.dart';
import '../brokers_models.dart';
import '../brokers_providers.dart';
import '../kite_session.dart';

/// Web /brokers: linked accounts with session state and daily login, and linking a new one.
class BrokersScreen extends ConsumerWidget {
  const BrokersScreen({super.key});

  void _link(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const _ConnectForm(),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Brokers')),
    body: AsyncView(
      value: ref.watch(brokersProvider),
      onRetry: () => ref.invalidate(brokersProvider),
      data:
          (accounts) => RefreshIndicator(
            onRefresh: () => ref.refresh(brokersProvider.future),
            child: ListView(
              padding: AppSpace.pageInsets,
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const PageHeader(
                  'Broker accounts',
                  subtitle: 'Connect your Zerodha Kite account. Zerodha needs a fresh login every day.',
                ),
                const SizedBox(height: AppSpace.gap),
                const GroupLabel('Connected accounts'),
                if (accounts.isEmpty)
                  const Card(
                    child: EmptyPanel(
                      icon: Icons.power_off_outlined,
                      title: 'No brokers connected yet',
                      message: 'Link your Zerodha account, then log in to activate its session.',
                    ),
                  ),
                for (final b in accounts) ...[_BrokerCard(account: b), const SizedBox(height: AppSpace.gap)],
                const SizedBox(height: 4),
                const GroupLabel('Available brokers'),
                Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
                    leading: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: context.colors.brandSubtle,
                        borderRadius: BorderRadius.circular(AppRadius.card),
                      ),
                      child: Icon(Icons.bolt_rounded, color: context.colors.accentForeground, size: 20),
                    ),
                    title: const Text('Zerodha Kite', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    subtitle: const Text('Kite Connect API · equity, F&O'),
                    trailing:
                        accounts.any((a) => a.broker == BrokerType.zerodha)
                            ? const Pill('Connected', tone: Tone.profit, dot: true)
                            : ToneButton(label: 'Connect', filled: true, onPressed: () => _link(context)),
                  ),
                ),
                if (accounts.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => _link(context),
                      icon: const Icon(Icons.add_rounded, size: 16),
                      label: const Text('Link another Zerodha account'),
                    ),
                  ),
                ],
              ],
            ),
          ),
    ),
  );
}

class _BrokerCard extends ConsumerWidget {
  const _BrokerCard({required this.account});

  final BrokerAccount account;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final b = account;
    final kite = KiteSession.of([b], ref.watch(clockProvider).value ?? DateTime.now());
    final (String status, Tone tone) = switch (kite.state) {
      KiteTokenState.ok => ('Session active · ${formatCountdown(kite.remaining!)} left', Tone.profit),
      KiteTokenState.soon => ('Expires in ${formatCountdown(kite.remaining!)}', Tone.warn),
      KiteTokenState.expired => ('Not logged in today', Tone.warn),
      KiteTokenState.none => (b.isActive ? 'Active' : 'Inactive', Tone.neutral),
    };
    return Panel(
      accent: kite.connected ? c.profit : c.warn,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    Text('Client ID ${b.clientId ?? '—'}', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              Pill(status, tone: tone, dot: true),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (b.broker == BrokerType.zerodha) ...[
                Expanded(
                  child: ToneButton(
                    label: kite.connected ? 'Renew token' : 'Daily login',
                    icon: Icons.login_rounded,
                    tone: kite.connected ? Tone.neutral : Tone.warn,
                    filled: !kite.connected,
                    height: 36,
                    expand: true,
                    onPressed: () => context.push(Routes.brokerLogin(b.id)),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              ToneButton(
                label: 'Positions',
                height: 36,
                onPressed: () {
                  ref.read(selectedBrokerProvider.notifier).select(b.id);
                  context.go(Routes.positions);
                },
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Disconnect broker account',
                icon: Icon(Icons.link_off_rounded, size: 18, color: c.loss),
                onPressed: () async {
                  final ok = await confirmAction(
                    context,
                    title: 'Disconnect ${b.clientId ?? b.label}?',
                    message: 'Running strategies and open positions are not closed automatically.',
                    confirmLabel: 'Disconnect',
                    destructive: true,
                  );
                  if (!ok || !context.mounted) return;
                  await runWithToast(
                    context,
                    () async {
                      await ref.read(brokersApiProvider).disconnect(b.id);
                      ref.invalidate(brokersProvider);
                    },
                    success: 'Broker disconnected',
                    failure: 'Could not disconnect',
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ConnectForm extends ConsumerStatefulWidget {
  const _ConnectForm();
  @override
  ConsumerState<_ConnectForm> createState() => _ConnectFormState();
}

class _ConnectFormState extends ConsumerState<_ConnectForm> {
  static const _redirect = 'https://api.tradeio.site/v1/brokers/callback/zerodha';
  final _form = GlobalKey<FormState>();
  final _client = TextEditingController(), _key = TextEditingController(), _secret = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _client.dispose();
    _key.dispose();
    _secret.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(brokersApiProvider).connect({
        'broker': 'ZERODHA',
        'clientId': _client.text.trim(),
        'apiKey': _key.text.trim(),
        'apiSecret': _secret.text.trim(),
      });
      ref.invalidate(brokersProvider);
      if (mounted) {
        toast(context, 'Zerodha account linked. Now do the daily login.');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e, 'Could not link the account'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: Form(
        key: _form,
        child: ListView(
          shrinkWrap: true,
          children: [
            Text('Connect Zerodha', style: Theme.of(context).textTheme.titleMedium),
            Text('Link your trading account securely', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            for (final (field, label, secret) in [
              (_client, 'Client ID', false),
              (_key, 'API key', true),
              (_secret, 'API secret', true),
            ]) ...[
              TextFormField(
                controller: field,
                enabled: !_busy,
                obscureText: secret,
                autocorrect: false,
                enableSuggestions: false,
                textCapitalization: field == _client ? TextCapitalization.characters : TextCapitalization.none,
                decoration: InputDecoration(labelText: label),
                validator: (s) => s == null || s.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 10),
            ],
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: c.brandSubtle,
                borderRadius: BorderRadius.circular(AppRadius.card),
                border: Border.all(color: c.primary.withValues(alpha: 0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Kite developer app settings',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.accentForeground),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _redirect,
                          style: const TextStyle(fontFamily: fontMono, fontSize: 11),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          Clipboard.setData(const ClipboardData(text: _redirect));
                          toast(context, 'Copied redirect URL');
                        },
                        child: const Text('Copy'),
                      ),
                    ],
                  ),
                  Text(
                    'Redirect URL for your Kite Connect app. Zerodha also requires a unique static IP in the app settings.',
                    style: TextStyle(fontSize: 11.5, color: c.accentForeground),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            const Notice(
              'Credentials are encrypted with AES-256-GCM on the server and never shown again.',
              icon: Icons.lock_outline_rounded,
            ),
            if (_error != null) ...[const SizedBox(height: 10), Notice(_error!, tone: Tone.loss)],
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
              onPressed: _busy ? null : _submit,
              child: Text(_busy ? 'Linking…' : 'Link account'),
            ),
          ],
        ),
      ),
    );
  }
}
