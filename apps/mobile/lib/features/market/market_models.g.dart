// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'market_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_MarketTick _$MarketTickFromJson(Map<String, dynamic> json) => _MarketTick(
  key: json['key'] as String,
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String,
  ltp: (json['ltp'] as num).toDouble(),
  close: (json['close'] as num?)?.toDouble(),
  change: (json['change'] as num?)?.toDouble(),
  changePct: (json['changePct'] as num?)?.toDouble(),
  volume: (json['volume'] as num?)?.toDouble(),
  exchangeTs: json['exchangeTs'] as String?,
  ts: json['ts'] as String,
  source: json['source'] as String? ?? 'ws',
);

Map<String, dynamic> _$MarketTickToJson(_MarketTick instance) => <String, dynamic>{
  'key': instance.key,
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'ltp': instance.ltp,
  'close': instance.close,
  'change': instance.change,
  'changePct': instance.changePct,
  'volume': instance.volume,
  'exchangeTs': instance.exchangeTs,
  'ts': instance.ts,
  'source': instance.source,
};

_FeedStatus _$FeedStatusFromJson(Map<String, dynamic> json) => _FeedStatus(
  status: $enumDecodeNullable(_$FeedStateEnumMap, json['status'], unknownValue: FeedState.closed) ?? FeedState.closed,
  lastExchangeTs: json['lastExchangeTs'] as String?,
  lastMessageAt: json['lastMessageAt'] as String?,
);

Map<String, dynamic> _$FeedStatusToJson(_FeedStatus instance) => <String, dynamic>{
  'status': _$FeedStateEnumMap[instance.status]!,
  'lastExchangeTs': instance.lastExchangeTs,
  'lastMessageAt': instance.lastMessageAt,
};

const _$FeedStateEnumMap = {FeedState.connected: 'connected', FeedState.stale: 'stale', FeedState.closed: 'closed'};

_OrderUpdate _$OrderUpdateFromJson(Map<String, dynamic> json) => _OrderUpdate(
  orderId: json['orderId'] as String,
  status: json['status'] as String,
  exchange: json['exchange'] as String?,
  tradingsymbol: json['tradingsymbol'] as String?,
  transactionType: json['transactionType'] as String?,
  orderType: json['orderType'] as String?,
  product: json['product'] as String?,
  quantity: (json['quantity'] as num?)?.toInt(),
  filledQuantity: (json['filledQuantity'] as num?)?.toInt(),
  pendingQuantity: (json['pendingQuantity'] as num?)?.toInt(),
  price: (json['price'] as num?)?.toDouble(),
  triggerPrice: (json['triggerPrice'] as num?)?.toDouble(),
  averagePrice: (json['averagePrice'] as num?)?.toDouble(),
  statusMessage: json['statusMessage'] as String?,
  tag: json['tag'] as String?,
);

Map<String, dynamic> _$OrderUpdateToJson(_OrderUpdate instance) => <String, dynamic>{
  'orderId': instance.orderId,
  'status': instance.status,
  'exchange': instance.exchange,
  'tradingsymbol': instance.tradingsymbol,
  'transactionType': instance.transactionType,
  'orderType': instance.orderType,
  'product': instance.product,
  'quantity': instance.quantity,
  'filledQuantity': instance.filledQuantity,
  'pendingQuantity': instance.pendingQuantity,
  'price': instance.price,
  'triggerPrice': instance.triggerPrice,
  'averagePrice': instance.averagePrice,
  'statusMessage': instance.statusMessage,
  'tag': instance.tag,
};

_MarketOverview _$MarketOverviewFromJson(Map<String, dynamic> json) => _MarketOverview(
  indices:
      (json['indices'] as List<dynamic>?)?.map((e) => IndexQuote.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
  stocks:
      (json['stocks'] as List<dynamic>?)?.map((e) => WatchStock.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
);

Map<String, dynamic> _$MarketOverviewToJson(_MarketOverview instance) => <String, dynamic>{
  'indices': instance.indices,
  'stocks': instance.stocks,
};

_IndexQuote _$IndexQuoteFromJson(Map<String, dynamic> json) => _IndexQuote(
  symbol: json['symbol'] as String,
  key: json['key'] as String?,
  price: (json['price'] as num?)?.toDouble() ?? 0,
  close: (json['close'] as num?)?.toDouble(),
  change: (json['change'] as num?)?.toDouble() ?? 0,
  changeAbs: (json['changeAbs'] as num?)?.toDouble() ?? 0,
);

Map<String, dynamic> _$IndexQuoteToJson(_IndexQuote instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'key': instance.key,
  'price': instance.price,
  'close': instance.close,
  'change': instance.change,
  'changeAbs': instance.changeAbs,
};

_WatchStock _$WatchStockFromJson(Map<String, dynamic> json) => _WatchStock(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String,
  key: json['key'] as String,
  price: (json['price'] as num?)?.toDouble() ?? 0,
  close: (json['close'] as num?)?.toDouble(),
  change: (json['change'] as num?)?.toDouble() ?? 0,
);

Map<String, dynamic> _$WatchStockToJson(_WatchStock instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'key': instance.key,
  'price': instance.price,
  'close': instance.close,
  'change': instance.change,
};

_Movers _$MoversFromJson(Map<String, dynamic> json) => _Movers(
  topGainers:
      (json['topGainers'] as List<dynamic>?)?.map((e) => Mover.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
  topLosers:
      (json['topLosers'] as List<dynamic>?)?.map((e) => Mover.fromJson(e as Map<String, dynamic>)).toList() ?? const [],
);

Map<String, dynamic> _$MoversToJson(_Movers instance) => <String, dynamic>{
  'topGainers': instance.topGainers,
  'topLosers': instance.topLosers,
};

_Mover _$MoverFromJson(Map<String, dynamic> json) => _Mover(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String? ?? 'NSE',
  ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
  close: (json['close'] as num?)?.toDouble(),
  change: (json['change'] as num?)?.toDouble() ?? 0,
  changePercent: (json['changePercent'] as num?)?.toDouble() ?? 0,
);

Map<String, dynamic> _$MoverToJson(_Mover instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'ltp': instance.ltp,
  'close': instance.close,
  'change': instance.change,
  'changePercent': instance.changePercent,
};

_SessionInfo _$SessionInfoFromJson(Map<String, dynamic> json) => _SessionInfo(
  state: $enumDecode(_$SessionStateEnumMap, json['state'], unknownValue: SessionState.closed),
  nextOpenAt: json['nextOpenAt'] == null ? null : DateTime.parse(json['nextOpenAt'] as String),
  closesAt: json['closesAt'] == null ? null : DateTime.parse(json['closesAt'] as String),
);

Map<String, dynamic> _$SessionInfoToJson(_SessionInfo instance) => <String, dynamic>{
  'state': _$SessionStateEnumMap[instance.state]!,
  'nextOpenAt': instance.nextOpenAt?.toIso8601String(),
  'closesAt': instance.closesAt?.toIso8601String(),
};

const _$SessionStateEnumMap = {
  SessionState.preOpen: 'pre-open',
  SessionState.open: 'open',
  SessionState.closed: 'closed',
  SessionState.holiday: 'holiday',
  SessionState.weekend: 'weekend',
};
