import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/polling.dart';
import 'risk_api.dart';
import 'risk_models.dart';

/// Shared by the dashboard tiles. The endpoint hits the broker, so it is polled once a minute.
final riskStatusProvider = FutureProvider<RiskStatus>((ref) {
  ref.pollEvery(const Duration(seconds: 60));
  return ref.watch(riskApiProvider).status();
});
