import 'package:freezed_annotation/freezed_annotation.dart';
part 'ticket_models.freezed.dart';
part 'ticket_models.g.dart';

@freezed
abstract class Instrument with _$Instrument {
  const factory Instrument({
    required String symbol,
    required String exchange,
    String? name,
    double? ltp,
    @Default(1) int lotSize,
  }) = _Instrument;
  factory Instrument.fromJson(Map<String, dynamic> json) => _$InstrumentFromJson(json);
}

@freezed
abstract class OrderLimits with _$OrderLimits {
  const factory OrderLimits({
    @Default(false) bool killSwitchActive,
    int? maxOrderQty,
    int? freezeLimit,
    double? maxOrderValue,
  }) = _OrderLimits;
  factory OrderLimits.fromJson(Map<String, dynamic> json) => _$OrderLimitsFromJson(json);
}

@freezed
abstract class TickSize with _$TickSize {
  const factory TickSize({required double tickSize}) = _TickSize;
  factory TickSize.fromJson(Map<String, dynamic> json) => _$TickSizeFromJson(json);
}

@freezed
abstract class LotSize with _$LotSize {
  const factory LotSize({required int lotSize}) = _LotSize;
  factory LotSize.fromJson(Map<String, dynamic> json) => _$LotSizeFromJson(json);
}
