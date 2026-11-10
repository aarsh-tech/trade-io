import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/utils/polling.dart';
import '../../shared/enums.dart';
import 'brokers_api.dart';
import 'brokers_models.dart';

/// Linked broker accounts. Refreshed slowly; a Zerodha login elsewhere shows up within a minute.
final brokersProvider = FutureProvider<List<BrokerAccount>>((ref) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(brokersApiProvider).list();
});

/// A broker the user picked on the Positions screen; null means "use the default".
class SelectedBroker extends Notifier<String?> {
  @override
  String? build() {
    ref.watch(authControllerProvider.select((s) => s is AuthSignedIn ? s.user.id : null));
    return null;
  }

  void select(String? id) => state = id;
}

final selectedBrokerProvider = NotifierProvider<SelectedBroker, String?>(SelectedBroker.new);

/// The account whose data the screens show: the user's pick, else the active Zerodha account,
/// else any active account (same rule as the web's Positions page). Null when none is linked.
final activeBrokerProvider = Provider<AsyncValue<BrokerAccount?>>((ref) {
  final selected = ref.watch(selectedBrokerProvider);
  return ref.watch(brokersProvider).whenData((accounts) {
    if (selected != null) {
      final picked = accounts.where((a) => a.id == selected);
      if (picked.isNotEmpty) return picked.first;
    }
    final active = accounts.where((a) => a.isActive);
    final zerodha = active.where((a) => a.broker == BrokerType.zerodha);
    if (zerodha.isNotEmpty) return zerodha.first;
    return active.isNotEmpty ? active.first : null;
  });
});
