import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/api_envelope.dart';
import '../../../router.dart';
import '../../../shared/enums.dart';
import '../../../shared/widgets/action_button.dart';
import '../../../shared/widgets/async_view.dart';
import '../brokers_api.dart';
import '../brokers_providers.dart';

class BrokersScreen extends ConsumerWidget {
  const BrokersScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Broker accounts')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed:
          () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            useSafeArea: true,
            builder: (_) => const _ConnectForm(),
          ),
      icon: const Icon(Icons.add),
      label: const Text('Link Zerodha'),
    ),
    body: AsyncView(
      value: ref.watch(brokersProvider),
      onRetry: () => ref.invalidate(brokersProvider),
      data:
          (accounts) => RefreshIndicator(
            onRefresh: () => ref.refresh(brokersProvider.future),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (accounts.isEmpty)
                  const EmptyState(
                    icon: Icons.account_balance_outlined,
                    title: 'No linked accounts',
                    message: 'Link your Zerodha account, then sign in to activate its session.',
                  ),
                for (final b in accounts)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${b.label} · ${b.clientId ?? ''}', style: Theme.of(context).textTheme.titleMedium),
                          Text(
                            b.sessionExpired
                                ? 'Session expired — sign in again'
                                : b.isActive
                                ? 'Active · ${b.tokenHealth ?? 'Session not checked'}'
                                : 'Inactive',
                          ),
                          Wrap(
                            spacing: 8,
                            children: [
                              if (b.broker == BrokerType.zerodha)
                                OutlinedButton(
                                  onPressed: () => context.push(Routes.brokerLogin(b.id)),
                                  child: const Text('Sign in / renew'),
                                ),
                              OutlinedButton(
                                onPressed: () {
                                  ref.read(selectedBrokerProvider.notifier).select(b.id);
                                  context.go(Routes.positions);
                                },
                                child: const Text('Positions'),
                              ),
                              ActionButton(
                                label: 'Disconnect',
                                confirm:
                                    'Unlink ${b.clientId ?? b.label}? Running strategies and positions are not automatically closed.',
                                action: () => ref.read(brokersApiProvider).disconnect(b.id),
                                onSuccess: () => ref.invalidate(brokersProvider),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
    ),
  );
}

class _ConnectForm extends ConsumerStatefulWidget {
  const _ConnectForm();
  @override
  ConsumerState<_ConnectForm> createState() => _ConnectFormState();
}

class _ConnectFormState extends ConsumerState<_ConnectForm> {
  final _form = GlobalKey<FormState>();
  final _client = TextEditingController(), _key = TextEditingController(), _secret = TextEditingController();
  @override
  void dispose() {
    _client.dispose();
    _key.dispose();
    _secret.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.viewInsetsOf(context).bottom + 24),
    child: Form(
      key: _form,
      child: ListView(
        shrinkWrap: true,
        children: [
          Text('Link Zerodha', style: Theme.of(context).textTheme.titleLarge),
          const Text('Use the API credentials from your Kite Connect app. The server stores them encrypted.'),
          for (final field in [(_client, 'Client ID'), (_key, 'API key'), (_secret, 'API secret')])
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: TextFormField(
                controller: field.$1,
                obscureText: field.$1 != _client,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(labelText: field.$2),
                validator: (s) => s == null || s.trim().isEmpty ? 'Required' : null,
              ),
            ),
          const SizedBox(height: 16),
          ActionButton(
            label: 'Link account',
            action: () async {
              if (!_form.currentState!.validate()) throw const ApiException('Complete all broker credentials');
              await ref.read(brokersApiProvider).connect({
                'broker': 'ZERODHA',
                'clientId': _client.text.trim(),
                'apiKey': _key.text.trim(),
                'apiSecret': _secret.text.trim(),
              });
              ref.invalidate(brokersProvider);
              if (context.mounted) Navigator.pop(context);
            },
          ),
        ],
      ),
    ),
  );
}
