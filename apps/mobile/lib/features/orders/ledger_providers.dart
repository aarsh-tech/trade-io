import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/socket/market_socket.dart';
import '../../core/utils/polling.dart';
import 'ledger_models.dart';
import 'orders_api.dart';

typedef LedgerQuery = ({int month, int year, int page, String status, String segment, String q, String? date});
final ledgerProvider = FutureProvider.autoDispose.family<LedgerData, LedgerQuery>((ref, query) {
  ref.pollEvery(const Duration(seconds: 60));
  ref.listen(orderUpdateStreamProvider, (_, next) {
    if (next.hasValue) ref.invalidateSelf();
  });
  return ref.watch(ordersApiProvider).ledger({
    'month': query.month,
    'year': query.year,
    'page': query.page,
    'pageSize': 25,
    'status': query.status,
    'segment': query.segment,
    'q': query.q,
    if (query.date != null) 'date': query.date,
  });
});
