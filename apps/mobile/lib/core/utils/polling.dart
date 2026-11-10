import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../lifecycle/app_lifecycle.dart';

extension PollingRef on Ref {
  /// Re-runs this provider every [every] while the app is in the foreground, and once as soon
  /// as it comes back to the foreground. The previous value stays available during the reload
  /// (AsyncValue keeps it), so lists don't flash to a spinner.
  ///
  /// Use it for the fallback refresh of data the server also pushes over a socket, and keep
  /// the interval generous: the socket is the fast path.
  void pollEvery(Duration every) {
    Timer? timer;
    void schedule() {
      timer?.cancel();
      timer = Timer(every, () {
        if (read(appForegroundProvider)) {
          invalidateSelf();
        } else {
          schedule();
        }
      });
    }

    schedule();
    listen<bool>(appForegroundProvider, (previous, next) {
      if (next && previous == false) invalidateSelf();
    });
    onDispose(() => timer?.cancel());
  }
}
