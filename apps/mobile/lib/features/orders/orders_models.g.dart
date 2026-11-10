// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orders_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Order _$OrderFromJson(Map<String, dynamic> json) => _Order(
  id: json['id'] as String,
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String? ?? 'NSE',
  side: orderSideFromJson(json['side']),
  orderType: orderTypeFromJson(json['orderType']),
  productType: productTypeFromJson(json['productType']),
  qty: (json['qty'] as num?)?.toInt() ?? 0,
  filledQty: (json['filledQty'] as num?)?.toInt() ?? 0,
  price: (json['price'] as num?)?.toDouble(),
  avgPrice: (json['avgPrice'] as num?)?.toDouble(),
  triggerPrice: (json['triggerPrice'] as num?)?.toDouble(),
  brokerOrderId: json['brokerOrderId'] as String?,
  status: orderStatusFromJson(json['status']),
  isPaperTrade: json['isPaperTrade'] as bool? ?? false,
  createdAt: DateTime.parse(json['createdAt'] as String),
  brokerAccountId: json['brokerAccountId'] as String?,
  execution: json['execution'] == null ? null : OrderExecution.fromJson(json['execution'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OrderToJson(_Order instance) => <String, dynamic>{
  'id': instance.id,
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'side': _$OrderSideEnumMap[instance.side],
  'orderType': _$OrderTypeEnumMap[instance.orderType],
  'productType': _$ProductTypeEnumMap[instance.productType],
  'qty': instance.qty,
  'filledQty': instance.filledQty,
  'price': instance.price,
  'avgPrice': instance.avgPrice,
  'triggerPrice': instance.triggerPrice,
  'brokerOrderId': instance.brokerOrderId,
  'status': _$OrderStatusEnumMap[instance.status],
  'isPaperTrade': instance.isPaperTrade,
  'createdAt': instance.createdAt.toIso8601String(),
  'brokerAccountId': instance.brokerAccountId,
  'execution': instance.execution,
};

const _$OrderSideEnumMap = {OrderSide.buy: 'BUY', OrderSide.sell: 'SELL'};

const _$OrderTypeEnumMap = {
  OrderType.market: 'MARKET',
  OrderType.limit: 'LIMIT',
  OrderType.sl: 'SL',
  OrderType.slM: 'SL_M',
};

const _$ProductTypeEnumMap = {ProductType.cnc: 'CNC', ProductType.mis: 'MIS', ProductType.nrml: 'NRML'};

const _$OrderStatusEnumMap = {
  OrderStatus.pending: 'PENDING',
  OrderStatus.open: 'OPEN',
  OrderStatus.complete: 'COMPLETE',
  OrderStatus.rejected: 'REJECTED',
  OrderStatus.cancelled: 'CANCELLED',
};

_OrderExecution _$OrderExecutionFromJson(Map<String, dynamic> json) => _OrderExecution(
  id: json['id'] as String?,
  strategy: json['strategy'] == null ? null : OrderStrategyRef.fromJson(json['strategy'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OrderExecutionToJson(_OrderExecution instance) => <String, dynamic>{
  'id': instance.id,
  'strategy': instance.strategy,
};

_OrderStrategyRef _$OrderStrategyRefFromJson(Map<String, dynamic> json) =>
    _OrderStrategyRef(name: json['name'] as String);

Map<String, dynamic> _$OrderStrategyRefToJson(_OrderStrategyRef instance) => <String, dynamic>{'name': instance.name};

_DayPnl _$DayPnlFromJson(Map<String, dynamic> json) => _DayPnl(
  date: json['date'] as String,
  realizedPnl: (json['realizedPnl'] as num?)?.toDouble() ?? 0,
  grossPnl: (json['grossPnl'] as num?)?.toDouble() ?? 0,
  charges: (json['charges'] as num?)?.toDouble() ?? 0,
  algoPnl: (json['algoPnl'] as num?)?.toDouble() ?? 0,
  manualPnl: (json['manualPnl'] as num?)?.toDouble() ?? 0,
  trades: (json['trades'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$DayPnlToJson(_DayPnl instance) => <String, dynamic>{
  'date': instance.date,
  'realizedPnl': instance.realizedPnl,
  'grossPnl': instance.grossPnl,
  'charges': instance.charges,
  'algoPnl': instance.algoPnl,
  'manualPnl': instance.manualPnl,
  'trades': instance.trades,
};

_SyncResult _$SyncResultFromJson(Map<String, dynamic> json) => _SyncResult(message: json['message'] as String?);

Map<String, dynamic> _$SyncResultToJson(_SyncResult instance) => <String, dynamic>{'message': instance.message};
