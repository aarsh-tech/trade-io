import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/ui.dart';

/// Form building blocks for the strategy wizard (web `form-ui.tsx`: Section, Field, NumberField).

typedef SetField = void Function(String key, Object? value);

/// Titled block with a one-line description (web `Section`).
class FormSection extends StatelessWidget {
  const FormSection({super.key, required this.title, this.description, required this.child});
  final String title;
  final String? description;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(AppSpace.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 14)),
          if (description != null) ...[
            const SizedBox(height: 2),
            Text(description!, style: Theme.of(context).textTheme.bodySmall),
          ],
          const SizedBox(height: 12),
          child,
        ],
      ),
    ),
  );
}

enum FieldKind { integer, decimal, time, text }

/// A text field bound to one form value. Follows outside changes (presets) without losing the
/// cursor while the user types.
class BoundField extends StatefulWidget {
  const BoundField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.kind = FieldKind.integer,
    this.hint,
    this.prefix,
    this.suffix,
    this.error,
    this.enabled = true,
    this.placeholder,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final FieldKind kind;
  final String? hint;
  final String? prefix;
  final String? suffix;
  final String? error;
  final bool enabled;
  final String? placeholder;

  @override
  State<BoundField> createState() => _BoundFieldState();
}

class _BoundFieldState extends State<BoundField> {
  late final _c = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(BoundField old) {
    super.didUpdateWidget(old);
    if (widget.value != _c.text) {
      _c.value = TextEditingValue(text: widget.value, selection: TextSelection.collapsed(offset: widget.value.length));
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final kind = widget.kind;
    return TextField(
      controller: _c,
      enabled: widget.enabled,
      onChanged: widget.onChanged,
      keyboardType: switch (kind) {
        FieldKind.integer => TextInputType.number,
        FieldKind.decimal => const TextInputType.numberWithOptions(decimal: true),
        FieldKind.time => TextInputType.datetime,
        FieldKind.text => TextInputType.text,
      },
      inputFormatters: switch (kind) {
        FieldKind.integer => [FilteringTextInputFormatter.digitsOnly],
        FieldKind.decimal => [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
        FieldKind.time => [FilteringTextInputFormatter.allow(RegExp(r'[0-9:]')), LengthLimitingTextInputFormatter(5)],
        FieldKind.text => null,
      },
      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.placeholder ?? (kind == FieldKind.time ? 'HH:MM' : null),
        prefixText: widget.prefix,
        suffixText: widget.suffix,
        helperText: widget.error == null ? widget.hint : null,
        helperMaxLines: 6,
        errorText: widget.error,
        errorMaxLines: 3,
      ),
    );
  }
}

/// A checkbox card: title, explanation, and extra fields shown while it is on.
class ToggleCard extends StatelessWidget {
  const ToggleCard({
    super.key,
    required this.title,
    this.body,
    required this.value,
    required this.onChanged,
    this.badge,
    this.tone = Tone.neutral,
    this.child,
  });

  final String title;
  final String? body;
  final bool value;
  final ValueChanged<bool> onChanged;
  final String? badge;
  final Tone tone;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tinted = tone != Tone.neutral;
    return Container(
      decoration: BoxDecoration(
        color: tinted ? tone.bg(c) : c.card,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: tinted ? tone.line(c) : c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppRadius.card),
            onTap: () => onChanged(!value),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              title,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: tinted ? tone.fg(c) : c.foreground,
                              ),
                            ),
                            if (badge != null) Pill(badge!, tone: tinted ? tone : Tone.neutral),
                          ],
                        ),
                        if (body != null) ...[
                          const SizedBox(height: 3),
                          Text(body!, style: TextStyle(fontSize: 12, height: 1.4, color: c.mutedForeground)),
                        ],
                      ],
                    ),
                  ),
                  Checkbox(value: value, onChanged: (v) => onChanged(v ?? false)),
                ],
              ),
            ),
          ),
          if (value && child != null)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: tinted ? tone.line(c) : c.border))),
              child: child,
            ),
        ],
      ),
    );
  }
}

/// One-of-many cards with a title and explanation (radio group).
class ChoiceCards<T> extends StatelessWidget {
  const ChoiceCards({super.key, required this.options, required this.value, required this.onChanged});

  final List<({T value, String title, String body})> options;
  final T? value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      children: [
        for (final (i, o) in options.indexed) ...[
          if (i > 0) const SizedBox(height: 8),
          Material(
            color: o.value == value ? c.brandSubtle : c.card,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.card),
              side: BorderSide(color: o.value == value ? c.primary : c.border, width: o.value == value ? 1.5 : 1),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(AppRadius.card),
              onTap: () => onChanged(o.value),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 8, 12, 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Radio<T>(
                      value: o.value,
                      groupValue: value,
                      onChanged: (v) => onChanged(v as T),
                      visualDensity: VisualDensity.compact,
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(o.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            if (o.body.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(o.body, style: TextStyle(fontSize: 12, height: 1.4, color: c.mutedForeground)),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// A row of short options (Off / 35 min / 60 min) as chips.
class OptionChips extends StatelessWidget {
  const OptionChips({super.key, required this.options, required this.selected, required this.onSelected});
  final List<({String value, String label})> options;
  final bool Function(String value) selected;
  final ValueChanged<String> onSelected;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      for (final o in options)
        ChoiceChip(label: Text(o.label), selected: selected(o.value), onSelected: (_) => onSelected(o.value)),
    ],
  );
}

/// Label + options + explanation, used for the advanced stock-picker choices.
class OptionGroup extends StatelessWidget {
  const OptionGroup({super.key, required this.title, required this.body, required this.child});
  final String title;
  final String body;
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: context.colors.card,
      borderRadius: BorderRadius.circular(AppRadius.card),
      border: Border.all(color: context.colors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 3),
        Text(body, style: TextStyle(fontSize: 12, height: 1.4, color: context.colors.mutedForeground)),
        const SizedBox(height: 10),
        child,
      ],
    ),
  );
}

/// Bulleted explanation list.
class Bullets extends StatelessWidget {
  const Bullets(this.items, {super.key});
  final List<String> items;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final t in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(padding: const EdgeInsets.only(top: 7, right: 7), child: Dot(c.mutedForeground, size: 4)),
                Expanded(child: Text(t, style: TextStyle(fontSize: 12, height: 1.45, color: c.mutedForeground))),
              ],
            ),
          ),
      ],
    );
  }
}

/// Two widgets side by side with a gap (the web's 2-column field grid).
class FieldPair extends StatelessWidget {
  const FieldPair(this.a, this.b, {super.key});
  final Widget a, b;
  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [Expanded(child: a), const SizedBox(width: 10), Expanded(child: b)],
  );
}
