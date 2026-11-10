import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/socket/market_socket.dart';
import '../brokers/brokers_api.dart';
import '../market/market_api.dart';
import '../risk/risk_api.dart';
import 'ticket_models.dart';

typedef InstrumentSearch = ({String query, String accountId});
final instrumentSearchProvider = FutureProvider.autoDispose.family<List<Instrument>, InstrumentSearch>(
  (ref, query) => ref.watch(marketApiProvider).search(query.query, query.accountId),
);
typedef TicketQuery = ({String accountId, String symbol, String exchange});
typedef TicketMetadata = ({double tick, int lot, OrderLimits limits});
final ticketMetadataProvider = FutureProvider.autoDispose.family<TicketMetadata, TicketQuery>((ref, query) async {
  final broker = ref.watch(brokersApiProvider),
      market = ref.watch(marketApiProvider),
      risk = ref.watch(riskApiProvider);
  final results = await Future.wait<Object>([
    broker.tickSize(query.accountId, query.symbol, query.exchange),
    market.lotSize(query.symbol, query.accountId),
    risk.orderLimits(query.symbol, query.exchange),
  ]);
  return (
    tick: (results[0] as TickSize).tickSize,
    lot: (results[1] as LotSize).lotSize,
    limits: results[2] as OrderLimits,
  );
});
final ticketSubscriptionProvider = Provider.autoDispose.family<void, String>(
  (ref, key) => ref.holdMarketSubscription([key]),
);
