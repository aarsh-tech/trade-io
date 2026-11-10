import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/lifecycle/app_lifecycle.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/appearance_controller.dart';
import 'router.dart';

class TradeioApp extends ConsumerWidget {
  const TradeioApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppLifecycleBridge(
      child: MaterialApp.router(
        title: 'Tradeio',
        debugShowCheckedModeBanner: false,
        theme: lightTheme(),
        darkTheme: darkTheme(),
        themeMode: ref.watch(appearanceProvider),
        routerConfig: ref.watch(routerProvider),
      ),
    );
  }
}
