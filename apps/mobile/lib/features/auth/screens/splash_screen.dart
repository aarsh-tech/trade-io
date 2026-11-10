import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/design.dart';

/// Shown while the saved session is restored at start-up (AuthUnknown).
///
/// The mark sits dead centre at 88dp, exactly where Android's own launch screen drew it
/// (res/drawable*/launch_background.xml and drawable-v31/splash_icon.xml), so the hand-over
/// from the native splash to Flutter is invisible. The wordmark fades in under it, and a
/// progress bar appears only if restoring takes long enough to notice.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  static const markSize = 88.0;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  bool _showProgress = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _showProgress = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const Center(child: BrandMark(size: SplashScreen.markSize)),
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: SplashScreen.markSize + 72),
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: const Duration(milliseconds: 450),
                curve: Curves.easeOut,
                builder:
                    (context, t, child) =>
                        Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: child)),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Tradeio', style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 6),
                    Text('Algo trading desk', style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 56,
            child: SafeArea(
              top: false,
              child: AnimatedOpacity(
                opacity: _showProgress ? 1 : 0,
                duration: const Duration(milliseconds: 300),
                // Built only once shown: an indeterminate bar animates every frame, even invisible.
                child:
                    !_showProgress
                        ? const SizedBox(height: 40)
                        : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 120,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: const LinearProgressIndicator(minHeight: 3),
                              ),
                            ),
                            const SizedBox(height: 14),
                            Text('Restoring your session', style: theme.textTheme.bodySmall),
                          ],
                        ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
