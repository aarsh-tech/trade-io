import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/appearance_controller.dart';

/// The web's AuthLayout: brand tile, centred title, one bordered card, a footer link.
class AuthLayout extends ConsumerWidget {
  const AuthLayout({super.key, this.title, this.subtitle, required this.child, this.footer});

  final String? title;
  final String? subtitle;
  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 400),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          color: c.card,
                          borderRadius: BorderRadius.circular(AppRadius.card),
                          border: Border.all(color: c.input.withValues(alpha: 0.6)),
                        ),
                        padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Center(
                              child: Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: c.primary,
                                  borderRadius: BorderRadius.circular(AppRadius.card),
                                ),
                                child: Icon(Icons.bolt_rounded, size: 28, color: c.onPrimary),
                              ),
                            ),
                            const SizedBox(height: 20),
                            if (title != null) ...[
                              Text(
                                title!,
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w400, color: c.foreground),
                              ),
                              if (subtitle != null) ...[
                                const SizedBox(height: 6),
                                Text(
                                  subtitle!,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(fontSize: 12, height: 1.5, color: c.mutedForeground),
                                ),
                              ],
                              const SizedBox(height: 24),
                            ],
                            child,
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.bolt_rounded, size: 14, color: c.accentForeground),
                          const SizedBox(width: 4),
                          Text(
                            'TRADEIO.SITE',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.6,
                              color: c.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                      if (footer != null) ...[const SizedBox(height: 12), Center(child: footer)],
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: IconButton(
                tooltip: dark ? 'Light mode' : 'Dark mode',
                icon: Icon(dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined, size: 19),
                onPressed:
                    () => ref
                        .read(appearanceProvider.notifier)
                        .select(dark ? ThemeMode.light : ThemeMode.dark)
                        .catchError((Object _) {}),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The reason a request failed, kept on screen (a snackbar is gone before it can be read).
class FormError extends StatelessWidget {
  const FormError(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: c.lossSubtle,
          border: Border.all(color: c.loss.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(AppRadius.control),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline_rounded, size: 16, color: c.loss),
            const SizedBox(width: 8),
            Expanded(child: SelectableText(message, style: TextStyle(fontSize: 12, color: c.loss))),
          ],
        ),
      ),
    );
  }
}

/// Password field with a show/hide toggle.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.controller,
    required this.label,
    this.enabled = true,
    this.validator,
    this.onSubmitted,
    this.autofillHints = const [AutofillHints.password],
    this.textInputAction,
  });

  final TextEditingController controller;
  final String label;
  final bool enabled;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String> autofillHints;
  final TextInputAction? textInputAction;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _show = false;
  @override
  Widget build(BuildContext context) => TextFormField(
    controller: widget.controller,
    enabled: widget.enabled,
    obscureText: !_show,
    autocorrect: false,
    enableSuggestions: false,
    autofillHints: widget.autofillHints,
    textInputAction: widget.textInputAction,
    onFieldSubmitted: widget.onSubmitted,
    validator: widget.validator,
    decoration: InputDecoration(
      labelText: widget.label,
      suffixIcon: IconButton(
        tooltip: _show ? 'Hide password' : 'Show password',
        icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
        onPressed: () => setState(() => _show = !_show),
      ),
    ),
  );
}

/// The full-width primary button with a spinner while busy.
class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.label, required this.busy, required this.onPressed});
  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => FilledButton(
    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
    onPressed: busy ? null : onPressed,
    child:
        busy
            ? SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: context.colors.mutedForeground),
            )
            : Text(label),
  );
}
