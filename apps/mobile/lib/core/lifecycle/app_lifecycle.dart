import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// True while the app is on screen. Pollers pause when it is false and catch up when it
/// turns true again, the way the web app does on tab focus.
class AppForeground extends Notifier<bool> {
  @override
  bool build() => true;

  void set(bool value) {
    if (state != value) state = value;
  }
}

final appForegroundProvider = NotifierProvider<AppForeground, bool>(AppForeground.new);

/// Feeds Flutter's lifecycle into [appForegroundProvider]. Wrap the app once.
class AppLifecycleBridge extends ConsumerStatefulWidget {
  const AppLifecycleBridge({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AppLifecycleBridge> createState() => _AppLifecycleBridgeState();
}

class _AppLifecycleBridgeState extends ConsumerState<AppLifecycleBridge> {
  late final AppLifecycleListener _listener;

  @override
  void initState() {
    super.initState();
    _listener = AppLifecycleListener(
      onStateChange: (state) => ref.read(appForegroundProvider.notifier).set(state == AppLifecycleState.resumed),
    );
  }

  @override
  void dispose() {
    _listener.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
