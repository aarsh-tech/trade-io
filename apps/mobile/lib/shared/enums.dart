import 'package:json_annotation/json_annotation.dart';

/// Mirror of the enums in packages/shared-types/src/index.ts. The `@JsonValue` strings are
/// the wire values the backend sends and expects; json_serializable converts them.
///
/// Keep this file in step with shared-types: `dart run tool/check_enums.dart` fails when
/// the two drift apart.

enum BrokerType {
  @JsonValue('ZERODHA')
  zerodha('ZERODHA'),
  @JsonValue('ANGEL')
  angel('ANGEL'),
  @JsonValue('UPSTOX')
  upstox('UPSTOX'),
  @JsonValue('FIVEPAISA')
  fivepaisa('FIVEPAISA');

  const BrokerType(this.wire);

  final String wire;
}

enum StrategyType {
  @JsonValue('BREAKOUT_15MIN')
  breakout15min('BREAKOUT_15MIN'),
  @JsonValue('EMA_VWAP_CROSSOVER')
  emaVwapCrossover('EMA_VWAP_CROSSOVER'),
  @JsonValue('STOCKS_IN_PLAY')
  stocksInPlay('STOCKS_IN_PLAY'),
  @JsonValue('DAILY_SCALPER')
  dailyScalper('DAILY_SCALPER'),
  @JsonValue('CUSTOM')
  custom('CUSTOM');

  const StrategyType(this.wire);

  final String wire;
}

enum ExecStatus {
  @JsonValue('RUNNING')
  running('RUNNING'),
  @JsonValue('STOPPED')
  stopped('STOPPED'),
  @JsonValue('ERROR')
  error('ERROR'),
  @JsonValue('COMPLETED')
  completed('COMPLETED');

  const ExecStatus(this.wire);

  final String wire;
}

enum OrderSide {
  @JsonValue('BUY')
  buy('BUY'),
  @JsonValue('SELL')
  sell('SELL');

  const OrderSide(this.wire);

  final String wire;
}

enum OrderType {
  @JsonValue('MARKET')
  market('MARKET'),
  @JsonValue('LIMIT')
  limit('LIMIT'),
  @JsonValue('SL')
  sl('SL'),
  @JsonValue('SL_M')
  slM('SL_M');

  const OrderType(this.wire);

  final String wire;
}

enum ProductType {
  @JsonValue('CNC')
  cnc('CNC'),
  @JsonValue('MIS')
  mis('MIS'),
  @JsonValue('NRML')
  nrml('NRML');

  const ProductType(this.wire);

  final String wire;
}

enum OrderStatus {
  @JsonValue('PENDING')
  pending('PENDING'),
  @JsonValue('OPEN')
  open('OPEN'),
  @JsonValue('COMPLETE')
  complete('COMPLETE'),
  @JsonValue('REJECTED')
  rejected('REJECTED'),
  @JsonValue('CANCELLED')
  cancelled('CANCELLED');

  const OrderStatus(this.wire);

  final String wire;
}

/// The member whose wire value is [wire], or null for an unknown or missing value. Never
/// throws, so a new server value can't crash a screen.
T? enumFromWire<T extends Enum>(List<T> values, String Function(T) wireOf, Object? wire) {
  if (wire is! String) return null;
  for (final v in values) {
    if (wireOf(v) == wire) return v;
  }
  return null;
}

// Tolerant parsers for models: `@JsonKey(fromJson: orderStatusFromJson) OrderStatus? status`.
// json_serializable's default enum decoding throws on an unknown value; these return null.
BrokerType? brokerTypeFromJson(Object? v) => enumFromWire(BrokerType.values, (e) => e.wire, v);
StrategyType? strategyTypeFromJson(Object? v) => enumFromWire(StrategyType.values, (e) => e.wire, v);
OrderSide? orderSideFromJson(Object? v) => enumFromWire(OrderSide.values, (e) => e.wire, v);
OrderType? orderTypeFromJson(Object? v) => enumFromWire(OrderType.values, (e) => e.wire, v);
ProductType? productTypeFromJson(Object? v) => enumFromWire(ProductType.values, (e) => e.wire, v);
OrderStatus? orderStatusFromJson(Object? v) => enumFromWire(OrderStatus.values, (e) => e.wire, v);
