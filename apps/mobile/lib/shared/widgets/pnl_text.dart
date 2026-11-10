import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/format.dart';

/// A rupee amount coloured by sign. The sign is always shown too, so colour is never the only
/// signal (same rule as the web).
class PnlText extends StatelessWidget {
  const PnlText(this.value, {super.key, this.style, this.decimals = 2});

  final num? value;
  final TextStyle? style;
  final int decimals;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final base = style ?? DefaultTextStyle.of(context).style;
    final color = v == null ? Theme.of(context).colorScheme.onSurfaceVariant : context.colors.pnl(v);
    return Text(
      formatInr(v, decimals: decimals, signed: true),
      style: base.copyWith(color: color, fontFeatures: const [FontFeature.tabularFigures()]),
    );
  }
}

/// A percent change coloured by sign.
class PctText extends StatelessWidget {
  const PctText(this.value, {super.key, this.style});

  final num? value;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final base = style ?? DefaultTextStyle.of(context).style;
    final color = v == null ? Theme.of(context).colorScheme.onSurfaceVariant : context.colors.pnl(v);
    return Text(formatPct(v), style: base.copyWith(color: color, fontFeatures: const [FontFeature.tabularFigures()]));
  }
}

/// Numbers that must line up in a column.
TextStyle tabular(TextStyle? base) =>
    (base ?? const TextStyle()).copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
