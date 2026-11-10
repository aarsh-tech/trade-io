import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppearanceStore {
  const AppearanceStore();
  static const _storage = FlutterSecureStorage();
  Future<String?> read() => _storage.read(key: 'appearance');
  Future<void> write(String mode) => _storage.write(key: 'appearance', value: mode);
}

final appearanceStoreProvider = Provider<AppearanceStore>((ref) => const AppearanceStore());

class AppearanceController extends Notifier<ThemeMode> {
  int _revision = 0;
  @override
  ThemeMode build() {
    unawaited(_restore());
    return ThemeMode.system;
  }

  Future<void> _restore() async {
    final revision = _revision;
    try {
      final saved = await ref.read(appearanceStoreProvider).read();
      if (!ref.mounted || revision != _revision) return;
      state = ThemeMode.values.firstWhere((mode) => mode.name == saved, orElse: () => ThemeMode.system);
    } catch (_) {
      // Use the phone's appearance when storage is unavailable.
    }
  }

  Future<void> select(ThemeMode mode) async {
    _revision++;
    state = mode;
    await ref.read(appearanceStoreProvider).write(mode.name);
  }
}

final appearanceProvider = NotifierProvider<AppearanceController, ThemeMode>(AppearanceController.new);
