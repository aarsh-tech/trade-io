import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_envelope.dart';
import '../../../shared/widgets/async_view.dart';
import '../../brokers/brokers_providers.dart';
import '../strategies_api.dart';
import '../strategies_models.dart';
import '../strategies_providers.dart';
import '../strategy_config.dart';

class StrategyEditorScreen extends ConsumerWidget {
  const StrategyEditorScreen({super.key, this.id});
  final String? id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: Text(id == null ? 'Create strategy' : 'Edit strategy')),
    body:
        id == null
            ? const _Editor()
            : AsyncView(
              value: ref.watch(strategyProvider(id!)),
              onRetry: () => ref.invalidate(strategyProvider(id!)),
              data:
                  (row) =>
                      row.type == null
                          ? const Center(child: Text('This legacy strategy type cannot be edited in the app.'))
                          : row.isActive
                          ? const Center(child: Text('Stop this strategy before editing.'))
                          : _Editor(key: ValueKey(row.id), row: row),
            ),
  );
}

class _Editor extends ConsumerStatefulWidget {
  const _Editor({super.key, this.row});
  final StrategyRow? row;
  @override
  ConsumerState<_Editor> createState() => _EditorState();
}

class _EditorState extends ConsumerState<_Editor> {
  late final TextEditingController _name;
  late String _type;
  String? _broker;
  late bool _paper;
  bool _busy = false;
  List<String> _errors = [];
  final _fields = <String, TextEditingController>{};
  late Map<String, dynamic> _config;
  @override
  void initState() {
    super.initState();
    final row = widget.row;
    _name = TextEditingController(text: row?.name ?? '');
    _type = row?.type?.wire ?? 'EMA_VWAP_CROSSOVER';
    _broker = row?.brokerAccountId;
    _paper = row?.isPaperTrade ?? true;
    _loadConfig(row?.config ?? defaultStrategyConfig(_type));
  }

  /// Starts editing [config]: a text field per scalar value, a switch per boolean.
  void _loadConfig(Map<String, dynamic> config) {
    for (final field in _fields.values) {
      field.dispose();
    }
    _fields.clear();
    _config = Map.of(config);
    for (final entry in _config.entries) {
      if (entry.value is! bool && entry.value is! Map && entry.value is! List) {
        _fields[entry.key] = TextEditingController(text: '${entry.value ?? ''}');
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final config = Map<String, dynamic>.of(_config);
    for (final entry in _fields.entries) {
      final text = entry.value.text.trim();
      if (text.isEmpty) {
        config.remove(entry.key);
        continue;
      }
      config[entry.key] =
          configBounds.containsKey(entry.key) || _config[entry.key] is num ? num.tryParse(text) ?? text : text;
    }
    final errors = validateStrategyConfig(_type, config);
    if (_name.text.trim().isEmpty) errors.insert(0, 'Enter a strategy name');
    if (!_paper && _broker == null) errors.add('Choose a broker account for live trading');
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      if (!_paper) {
        final ok = await showDialog<bool>(
          context: context,
          builder:
              (ctx) => AlertDialog(
                title: const Text('Save LIVE strategy?'),
                content: const Text('This strategy will place real orders when started.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                  FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save live strategy')),
                ],
              ),
        );
        if (ok != true || !mounted) return;
      }
      await ref.read(strategiesApiProvider).save(widget.row?.id, {
        'name': _name.text.trim(),
        'type': _type,
        'config': jsonEncode(config),
        'isPaperTrade': _paper,
        if (_broker != null) 'brokerAccountId': _broker,
      });
      ref.invalidate(strategiesProvider);
      if (widget.row != null) ref.invalidate(strategyProvider(widget.row!.id));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _errors = [apiErrorMessage(e, 'Could not save strategy')]);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _label(String key) =>
      configBounds[key]?.label ??
      configTimes[key] ??
      key.replaceAllMapped(RegExp('[A-Z]'), (m) => ' ${m[0]!.toLowerCase()}');
  @override
  Widget build(BuildContext context) {
    final brokers = ref.watch(brokersProvider).value ?? [];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(controller: _name, enabled: !_busy, decoration: const InputDecoration(labelText: 'Strategy name')),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          isExpanded: true,
          value: _type,
          decoration: const InputDecoration(labelText: 'Strategy type'),
          items: [
            // A saved strategy of an older type keeps its type; new ones use the web's three.
            for (final type in {...creatableStrategyTypes.keys, _type})
              DropdownMenuItem(value: type, child: Text(creatableStrategyTypes[type] ?? type)),
          ],
          // Each type has its own settings, so picking another one starts from that type's defaults.
          onChanged:
              _busy || widget.row != null
                  ? null
                  : (value) => setState(() {
                    _type = value!;
                    _errors = [];
                    _loadConfig(defaultStrategyConfig(_type));
                  }),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Paper trading'),
          subtitle: const Text('Simulate orders before enabling live trading.'),
          value: _paper,
          onChanged: _busy ? null : (v) => setState(() => _paper = v),
        ),
        DropdownButtonFormField<String>(
          isExpanded: true,
          value: brokers.any((b) => b.id == _broker) ? _broker : null,
          decoration: const InputDecoration(labelText: 'Broker account'),
          items: [
            for (final b in brokers) DropdownMenuItem(value: b.id, child: Text('${b.label} · ${b.clientId ?? b.id}')),
          ],
          onChanged: _busy ? null : (v) => setState(() => _broker = v),
        ),
        const SizedBox(height: 20),
        Text('Configuration', style: Theme.of(context).textTheme.titleMedium),
        const Text('Times use IST. Empty optional fields keep the server defaults.'),
        for (final entry in _fields.entries)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: TextField(
              controller: entry.value,
              enabled: !_busy,
              keyboardType:
                  configBounds.containsKey(entry.key) || _config[entry.key] is num
                      ? const TextInputType.numberWithOptions(decimal: true)
                      : TextInputType.text,
              decoration: InputDecoration(
                labelText: _label(entry.key),
                helperText:
                    configBounds[entry.key] == null
                        ? null
                        : '${configBounds[entry.key]!.min} – ${configBounds[entry.key]!.max}',
              ),
            ),
          ),
        for (final entry in _config.entries.where((e) => e.value is bool))
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_label(entry.key)),
            value: entry.value as bool,
            onChanged: _busy ? null : (v) => setState(() => _config[entry.key] = v),
          ),
        const SizedBox(height: 12),
        PopupMenuButton<String>(
          tooltip: 'Add an optional configuration field',
          onSelected: (key) => setState(() => _fields[key] = TextEditingController()),
          itemBuilder:
              (_) => [
                for (final key in {
                  ...configBounds.keys,
                  ...configTimes.keys,
                  'targetMode',
                  'entryTimeframe',
                  'setup',
                }.where((key) => !_fields.containsKey(key)))
                  PopupMenuItem(value: key, child: Text(_label(key))),
              ],
          child: const Padding(padding: EdgeInsets.all(12), child: Text('Add optional setting +')),
        ),
        if (_errors.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(_errors.join('\n'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save strategy')),
      ],
    );
  }
}
