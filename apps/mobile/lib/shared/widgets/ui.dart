import 'package:flutter/material.dart';

import '../../core/network/api_envelope.dart';
import '../../core/theme/app_theme.dart';

/// The web's building blocks (Card + CardHeader, Badge, the muted pill tabs, stat tiles,
/// toned outline buttons) so every screen reads like the web app on a phone.

/// Semantic colour of a badge or button, mapped to the web tokens.
enum Tone { neutral, brand, profit, loss, warn, signal }

extension ToneColors on Tone {
  Color fg(AppColors c) => switch (this) {
    Tone.neutral => c.mutedForeground,
    Tone.brand => c.accentForeground,
    Tone.profit => c.profit,
    Tone.loss => c.loss,
    Tone.warn => c.warn,
    Tone.signal => c.signal,
  };

  Color bg(AppColors c) => switch (this) {
    Tone.neutral => c.muted,
    Tone.brand => c.brandSubtle,
    Tone.profit => c.profitSubtle,
    Tone.loss => c.lossSubtle,
    Tone.warn => c.warnSubtle,
    Tone.signal => c.signalSubtle,
  };

  Color line(AppColors c) => this == Tone.neutral ? c.border : fg(c).withValues(alpha: 0.32);
}

/// Tone for a signed amount.
Tone pnlTone(num? v) => v == null || v == 0 ? Tone.neutral : (v > 0 ? Tone.profit : Tone.loss);

/// A small tinted label (web `Badge`): status, product, side, mode.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.neutral, this.dot = false, this.icon, this.solid = false});

  final String label;
  final Tone tone;
  final bool dot;
  final IconData? icon;

  /// Filled with the tone colour (web's "Kill switch ON" style) instead of the subtle tint.
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg = solid ? (tone == Tone.loss ? c.onLoss : (tone == Tone.profit ? c.onProfit : c.onWarn)) : tone.fg(c);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: solid ? tone.fg(c) : tone.bg(c),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: solid ? tone.fg(c) : tone.line(c)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(width: 6, height: 6, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
            const SizedBox(width: 4),
          ],
          if (icon != null) ...[Icon(icon, size: 11, color: fg), const SizedBox(width: 3)],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 10.5, height: 1.35, fontWeight: FontWeight.w600, color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

/// A coloured dot (feed, live tick).
class Dot extends StatelessWidget {
  const Dot(this.color, {super.key, this.size = 7});
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) =>
      Container(width: size, height: size, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

/// Card with the web's header bar: icon + title on the left, an action on the right, a hairline
/// under it, then the body.
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    this.title,
    this.titleWidget,
    this.icon,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.card),
    this.footer,
    this.accent,
  });

  final String? title;
  final Widget? titleWidget;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Widget? footer;

  /// A coloured left edge (web `border-l-2`), e.g. a high-confidence pick.
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final hasHeader = title != null || titleWidget != null || trailing != null;
    Widget body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (hasHeader)
          Container(
            constraints: const BoxConstraints(minHeight: 42),
            padding: const EdgeInsets.fromLTRB(AppSpace.card, 6, 6, 6),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
            child: Row(
              children: [
                if (icon != null) ...[Icon(icon, size: 15, color: c.mutedForeground), const SizedBox(width: 7)],
                Expanded(
                  child:
                      titleWidget ??
                      Text(
                        title ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                ),
                if (trailing != null) trailing! else const SizedBox(width: 6),
              ],
            ),
          ),
        Padding(padding: padding, child: child),
        if (footer != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.card, vertical: 10),
            decoration: BoxDecoration(
              color: c.muted.withValues(alpha: 0.5),
              border: Border(top: BorderSide(color: c.border)),
            ),
            child: footer,
          ),
      ],
    );
    if (accent != null) {
      body = DecoratedBox(
        decoration: BoxDecoration(border: Border(left: BorderSide(color: accent!, width: 2.5))),
        child: body,
      );
    }
    return Card(child: body);
  }
}

/// "Funds ›" style link in a panel header.
class PanelLink extends StatelessWidget {
  const PanelLink(this.label, {super.key, required this.onTap});
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.control),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.accentForeground)),
            Icon(Icons.chevron_right_rounded, size: 16, color: c.accentForeground),
          ],
        ),
      ),
    );
  }
}

/// Label on the left, value on the right (web `Row` in the summary tiles).
class KV extends StatelessWidget {
  const KV(this.label, this.value, {super.key, this.color, this.valueWidget, this.bold = false});
  final String label;
  final String value;
  final Color? color;
  final Widget? valueWidget;
  final bool bold;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 12, color: c.mutedForeground))),
          const SizedBox(width: 8),
          // The value may take up to two thirds of the row and wraps, right-aligned, beyond that.
          Flexible(
            flex: 2,
            child: Align(
              alignment: Alignment.topRight,
              child:
                  valueWidget ??
                  Text(
                    value,
                    textAlign: TextAlign.end,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: bold ? FontWeight.w600 : FontWeight.w500,
                      color: color ?? c.foreground,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Small caption over a figure (web `text-[11px] text-muted-foreground`).
class Caption extends StatelessWidget {
  const Caption(this.text, {super.key, this.icon, this.color});
  final String text;
  final IconData? icon;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final fg = color ?? context.colors.mutedForeground;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 12, color: fg), const SizedBox(width: 4)],
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: fg),
          ),
        ),
      ],
    );
  }
}

/// A figure with its caption and an optional footer under a hairline (web `Tile`).
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, this.icon, required this.value, this.footer, this.trailing});
  final String label;
  final IconData? icon;
  final Widget value;
  final Widget? footer;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.card),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [Expanded(child: Caption(label, icon: icon)), if (trailing != null) trailing!]),
            const SizedBox(height: 4),
            DefaultTextStyle.merge(
              style: TextStyle(
                fontSize: 20,
                height: 1.3,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.3,
                color: c.foreground,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
              child: value,
            ),
            if (footer != null) ...[
              const SizedBox(height: 10),
              Divider(color: c.border),
              const SizedBox(height: 8),
              footer!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Two or four figures side by side in one bordered strip (web stat strip).
class StatStrip extends StatelessWidget {
  const StatStrip({super.key, required this.items});
  final List<({String label, String value, Color? color})> items;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final rows = <List<({String label, String value, Color? color})>>[];
    for (var i = 0; i < items.length; i += 2) {
      rows.add(items.sublist(i, i + 2 > items.length ? items.length : i + 2));
    }
    return Card(
      child: Column(
        children: [
          for (var r = 0; r < rows.length; r++)
            Container(
              decoration: BoxDecoration(border: r == 0 ? null : Border(top: BorderSide(color: c.border))),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < rows[r].length; i++)
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(border: i == 0 ? null : Border(left: BorderSide(color: c.border))),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Caption(rows[r][i].label),
                              const SizedBox(height: 2),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  rows[r][i].value,
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w600,
                                    color: rows[r][i].color ?? c.foreground,
                                    fontFeatures: const [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The web's muted pill switcher (Holdings | Positions, All | Long | Short).
class SegmentTabs<T> extends StatelessWidget {
  const SegmentTabs({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    this.expand = true,
  });

  final List<({T value, String label, Tone? tone})> options;
  final T value;
  final ValueChanged<T> onChanged;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget item(({T value, String label, Tone? tone}) o) {
      final selected = o.value == value;
      final fg = selected ? (o.tone?.fg(c) ?? c.foreground) : c.mutedForeground;
      final child = Material(
        color: selected ? (o.tone == null ? c.card : o.tone!.bg(c)) : Colors.transparent,
        borderRadius: BorderRadius.circular(5),
        child: InkWell(
          borderRadius: BorderRadius.circular(5),
          onTap: () => onChanged(o.value),
          child: Container(
            height: 32,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration:
                selected && o.tone == null
                    ? BoxDecoration(borderRadius: BorderRadius.circular(5), border: Border.all(color: c.border))
                    : null,
            child: Text(
              o.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: fg),
            ),
          ),
        ),
      );
      return expand ? Expanded(child: child) : child;
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: c.muted,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: c.border.withValues(alpha: 0.7)),
      ),
      child: Row(
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        children: [for (final o in options) item(o)],
      ),
    );
  }
}

/// Compact outline button tinted by [tone] (web `variant="outline"` + `text-loss border-loss/30`).
class ToneButton extends StatelessWidget {
  const ToneButton({
    super.key,
    required this.label,
    this.icon,
    this.tone = Tone.neutral,
    required this.onPressed,
    this.filled = false,
    this.busy = false,
    this.height = 32,
    this.expand = false,
  });

  final String label;
  final IconData? icon;
  final Tone tone;
  final VoidCallback? onPressed;
  final bool filled;
  final bool busy;
  final double height;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fg =
        filled
            ? switch (tone) {
              Tone.profit => c.onProfit,
              Tone.loss => c.onLoss,
              Tone.warn => c.onWarn,
              _ => c.onPrimary,
            }
            : (tone == Tone.neutral ? c.foreground : tone.fg(c));
    final bg = filled ? (tone == Tone.neutral || tone == Tone.brand ? c.primary : tone.fg(c)) : c.card;
    final enabled = onPressed != null && !busy;
    return Opacity(
      opacity: enabled || busy ? 1 : 0.5,
      child: Material(
        color: bg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.control),
          side: filled ? BorderSide.none : BorderSide(color: tone.line(c)),
        ),
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: BorderRadius.circular(AppRadius.control),
          child: Container(
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (busy)
                  SizedBox.square(dimension: 13, child: CircularProgressIndicator(strokeWidth: 1.8, color: fg))
                else if (icon != null)
                  Icon(icon, size: 14, color: fg),
                if (busy || icon != null) const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Page title + one-line description, the first thing on every web page.
class PageHeader extends StatelessWidget {
  const PageHeader(this.title, {super.key, this.subtitle, this.actions = const []});
  final String title;
  final String? subtitle;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.titleLarge),
        if (subtitle != null) ...[const SizedBox(height: 2), Text(subtitle!, style: theme.textTheme.bodySmall)],
        if (actions.isNotEmpty) ...[const SizedBox(height: 10), Wrap(spacing: 8, runSpacing: 8, children: actions)],
      ],
    );
  }
}

/// Uppercase group label (web menu groups, "OPEN · 2").
class GroupLabel extends StatelessWidget {
  const GroupLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 0, 2, 6),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
              color: context.colors.mutedForeground,
            ),
          ),
        ),
        if (trailing != null) trailing!,
      ],
    ),
  );
}

/// Search box (h-9, leading magnifier, clear button).
class SearchField extends StatefulWidget {
  const SearchField({super.key, required this.onChanged, this.hint = 'Search symbol…'});
  final ValueChanged<String> onChanged;
  final String hint;
  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  final _c = TextEditingController();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: _c,
    onChanged: (v) {
      setState(() {});
      widget.onChanged(v);
    },
    textCapitalization: TextCapitalization.characters,
    autocorrect: false,
    style: const TextStyle(fontSize: 13),
    decoration: InputDecoration(
      hintText: widget.hint,
      prefixIcon: const Icon(Icons.search_rounded, size: 18),
      prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      suffixIcon:
          _c.text.isEmpty
              ? null
              : IconButton(
                tooltip: 'Clear',
                icon: const Icon(Icons.close_rounded, size: 16),
                onPressed: () {
                  _c.clear();
                  setState(() {});
                  widget.onChanged('');
                },
              ),
      contentPadding: const EdgeInsets.symmetric(vertical: 9),
    ),
  );
}

/// A thin meter (daily loss used).
class Meter extends StatelessWidget {
  const Meter(this.fraction, {super.key, required this.color});
  final double fraction;
  final Color color;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(4),
    child: LinearProgressIndicator(
      value: fraction.clamp(0, 1),
      color: color,
      backgroundColor: context.colors.muted,
      minHeight: 6,
    ),
  );
}

/// Centered message with optional actions (web empty states).
class EmptyPanel extends StatelessWidget {
  const EmptyPanel({super.key, required this.icon, required this.title, this.message, this.actions = const []});
  final IconData icon;
  final String title;
  final String? message;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle),
            child: Icon(icon, size: 20, color: c.mutedForeground),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 14),
          ),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(message!, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: actions),
          ],
        ],
      ),
    );
  }
}

/// Inline notice box (web `bg-warn-subtle border-warn/40` alerts).
class Notice extends StatelessWidget {
  const Notice(this.message, {super.key, this.tone = Tone.neutral, this.icon, this.title, this.action});
  final String message;
  final String? title;
  final Tone tone;
  final IconData? icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: tone == Tone.neutral ? c.muted.withValues(alpha: 0.6) : tone.bg(c),
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: tone.line(c)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon ?? Icons.info_outline_rounded,
            size: 16,
            color: tone == Tone.neutral ? c.mutedForeground : tone.fg(c),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Text(
                    title!,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: tone == Tone.neutral ? c.foreground : tone.fg(c),
                    ),
                  ),
                Text(message, style: TextStyle(fontSize: 12, height: 1.4, color: c.foreground)),
                if (action != null) ...[const SizedBox(height: 8), action!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Asks before a trading or destructive action. Resolves true on confirm.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final c = context.colors;
  final ok = await showDialog<bool>(
    context: context,
    builder:
        (ctx) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          actions: [
            OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              style: destructive ? FilledButton.styleFrom(backgroundColor: c.loss, foregroundColor: c.onLoss) : null,
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(confirmLabel),
            ),
          ],
        ),
  );
  return ok == true;
}

/// A short message at the bottom of the screen (web toast).
void toast(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? context.colors.loss : null,
        duration: Duration(seconds: error ? 5 : 3),
      ),
    );
}

/// Runs [action], shows a toast with its result, and returns whether it worked.
Future<bool> runWithToast(
  BuildContext context,
  Future<void> Function() action, {
  String? success,
  required String failure,
}) async {
  try {
    await action();
    if (context.mounted && success != null) toast(context, success);
    return true;
  } catch (e) {
    if (context.mounted) toast(context, apiErrorMessage(e, failure), error: true);
    return false;
  }
}
