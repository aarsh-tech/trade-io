import 'package:flutter/material.dart';
import '../../core/network/api_envelope.dart';

/// A single-flight mutation with an optional explicit trading confirmation.
class ActionButton extends StatefulWidget {
  const ActionButton({
    super.key,
    required this.label,
    required this.action,
    this.confirm,
    this.onSuccess,
    this.enabled = true,
    this.onBusyChanged,
    this.showSuccessMessage = true,
  });
  final String label;
  final String? confirm;
  final Future<void> Function() action;
  final VoidCallback? onSuccess;
  final bool enabled;
  final ValueChanged<bool>? onBusyChanged;
  final bool showSuccessMessage;
  @override
  State<ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<ActionButton> {
  bool _busy = false;
  Future<void> _run() async {
    if (_busy) return;
    setState(() => _busy = true);
    widget.onBusyChanged?.call(true);
    try {
      if (widget.confirm != null) {
        final ok = await showDialog<bool>(
          context: context,
          builder:
              (ctx) => AlertDialog(
                title: Text('${widget.label}?'),
                content: Text(widget.confirm!),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                  FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(widget.label)),
                ],
              ),
        );
        if (ok != true || !mounted) return;
      }
      await widget.action();
      if (!mounted) return;
      if (widget.showSuccessMessage) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${widget.label}: done')));
      }
      widget.onSuccess?.call();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(apiErrorMessage(e, '${widget.label} failed'))));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        widget.onBusyChanged?.call(false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: _busy || !widget.enabled ? null : _run,
    child:
        _busy
            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : Text(widget.label),
  );
}
