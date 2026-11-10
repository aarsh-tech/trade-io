import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/theme/app_theme.dart';
import 'package:tradeio_mobile/core/theme/appearance_controller.dart';

class MemoryAppearanceStore extends AppearanceStore {
  MemoryAppearanceStore({this.saved, this.pending});
  String? saved;
  Completer<String?>? pending;
  @override
  Future<String?> read() async => pending == null ? saved : pending!.future;
  @override
  Future<void> write(String mode) async {
    saved = mode;
  }
}

void main() {
  test('restores and persists the selected appearance', () async {
    final store = MemoryAppearanceStore(saved: 'dark');
    final container = ProviderContainer(overrides: [appearanceStoreProvider.overrideWithValue(store)]);
    addTearDown(container.dispose);
    expect(container.read(appearanceProvider), ThemeMode.system);
    await container.pump();
    expect(container.read(appearanceProvider), ThemeMode.dark);
    await container.read(appearanceProvider.notifier).select(ThemeMode.light);
    expect(container.read(appearanceProvider), ThemeMode.light);
    expect(store.saved, 'light');
  });
  test('a slow stored preference cannot overwrite a new user selection', () async {
    final pending = Completer<String?>();
    final store = MemoryAppearanceStore(pending: pending);
    final container = ProviderContainer(overrides: [appearanceStoreProvider.overrideWithValue(store)]);
    addTearDown(container.dispose);
    container.read(appearanceProvider);
    await container.read(appearanceProvider.notifier).select(ThemeMode.light);
    pending.complete('dark');
    await container.pump();
    expect(container.read(appearanceProvider), ThemeMode.light);
  });
  test('an unknown saved preference follows the system', () async {
    final container = ProviderContainer(
      overrides: [appearanceStoreProvider.overrideWithValue(MemoryAppearanceStore(saved: 'unknown'))],
    );
    addTearDown(container.dispose);
    container.read(appearanceProvider);
    await container.pump();
    expect(container.read(appearanceProvider), ThemeMode.system);
  });
  test('body text and trading colours stay readable in both appearances', () {
    double contrast(Color a, Color b) {
      final x = a.computeLuminance(), y = b.computeLuminance();
      return x > y ? (x + .05) / (y + .05) : (y + .05) / (x + .05);
    }

    for (final theme in [lightTheme(), darkTheme()]) {
      final colors = theme.extension<AppColors>()!;
      for (final surface in [colors.background, colors.card, theme.colorScheme.primaryContainer]) {
        for (final ink in [colors.foreground, colors.mutedForeground, colors.profit, colors.loss]) {
          expect(contrast(ink, surface), greaterThanOrEqualTo(4.5), reason: '${theme.brightness}: $ink on $surface');
        }
      }
    }
  });
}
