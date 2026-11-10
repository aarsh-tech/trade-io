import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_envelope.dart';
import 'ui.dart';

/// Renders an [AsyncValue]: a spinner on first load, the data afterwards (also while it
/// refreshes in the background), and an error with a retry button when there is no data to show.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.data, this.onRetry, this.loading});

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;
  final Widget? loading;

  @override
  Widget build(BuildContext context) {
    return value.when(
      skipLoadingOnReload: true,
      data: data,
      loading: () => loading ?? const Loading(),
      error: (e, _) => ErrorRetry(message: apiErrorMessage(e, 'Could not load this'), onRetry: onRetry),
    );
  }
}

/// Small centred spinner with an optional caption.
class Loading extends StatelessWidget {
  const Loading({super.key, this.label});
  final String? label;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.2)),
          if (label != null) ...[
            const SizedBox(height: 10),
            Text(label!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    ),
  );
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: EmptyPanel(
      icon: Icons.cloud_off_outlined,
      title: 'Could not load',
      message: message,
      actions: [if (onRetry != null) ToneButton(label: 'Retry', icon: Icons.refresh_rounded, onPressed: onRetry)],
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.actions = const []});

  final IconData icon;
  final String title;
  final String? message;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) =>
      Center(child: EmptyPanel(icon: icon, title: title, message: message, actions: actions));
}
