import 'package:freezed_annotation/freezed_annotation.dart';

import '../../shared/enums.dart';

part 'orders_models.freezed.dart';
part 'orders_models.g.dart';

/// A row from GET /orders (the DB order book, both live and paper, newest first).
@freezed
abstract class Order with _$Order {
  const Order._();

  const factory Order({
    required String id,
    required String symbol,
    @Default('NSE') String exchange,
    @JsonKey(fromJson: orderSideFromJson) OrderSide? side,
    @JsonKey(fromJson: orderTypeFromJson) OrderType? orderType,
    @JsonKey(fromJson: productTypeFromJson) ProductType? productType,
    @Default(0) int qty,
    @Default(0) int filledQty,
    double? price,
    double? avgPrice,
    double? triggerPrice,
    String? brokerOrderId,
    @JsonKey(fromJson: orderStatusFromJson) OrderStatus? status,
    @Default(false) bool isPaperTrade,
    required DateTime createdAt,
    String? brokerAccountId,
    OrderExecution? execution,
  }) = _Order;

  factory Order.fromJson(Map<String, dynamic> json) => _$OrderFromJson(json);

  String? get strategyName => execution?.strategy?.name;

  bool get isAlgo => execution != null;

  /// Only open or pending broker orders can be cancelled.
  bool get canCancel =>
      brokerOrderId != null && !isPaperTrade && (status == OrderStatus.open || status == OrderStatus.pending);
}

@freezed
abstract class OrderExecution with _$OrderExecution {
  const factory OrderExecution({String? id, OrderStrategyRef? strategy}) = _OrderExecution;

  factory OrderExecution.fromJson(Map<String, dynamic> json) => _$OrderExecutionFromJson(json);
}

@freezed
abstract class OrderStrategyRef with _$OrderStrategyRef {
  const factory OrderStrategyRef({required String name}) = _OrderStrategyRef;

  factory OrderStrategyRef.fromJson(Map<String, dynamic> json) => _$OrderStrategyRefFromJson(json);
}

/// GET /orders/day-pnl — today's realised P&L from real fills, net of charges.
@freezed
abstract class DayPnl with _$DayPnl {
  const factory DayPnl({
    required String date,
    @Default(0) double realizedPnl,
    @Default(0) double grossPnl,
    @Default(0) double charges,
    @Default(0) double algoPnl,
    @Default(0) double manualPnl,
    @Default(0) int trades,
  }) = _DayPnl;

  factory DayPnl.fromJson(Map<String, dynamic> json) => _$DayPnlFromJson(json);
}

/// POST /orders/sync
@freezed
abstract class SyncResult with _$SyncResult {
  const factory SyncResult({String? message}) = _SyncResult;

  factory SyncResult.fromJson(Map<String, dynamic> json) => _$SyncResultFromJson(json);
}
