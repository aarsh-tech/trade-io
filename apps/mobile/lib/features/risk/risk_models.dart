import 'package:freezed_annotation/freezed_annotation.dart';

part 'risk_models.freezed.dart';
part 'risk_models.g.dart';

@freezed
abstract class RiskActionResult with _$RiskActionResult {
  const factory RiskActionResult({required String message}) = _RiskActionResult;
  factory RiskActionResult.fromJson(Map<String, dynamic> json) => _$RiskActionResultFromJson(json);
}

/// GET /risk/status
@freezed
abstract class RiskStatus with _$RiskStatus {
  const factory RiskStatus({
    @Default(false) bool killSwitchActive,
    DateTime? killSwitchTriggeredAt,
    @Default(0) double maxDailyLoss,
    double? maxOrderValue,
    int? maxOrderQty,
    @Default(0) double realizedPnl,
    @Default(0) double unrealizedPnl,
    @Default(0) double totalDailyPnl,
    @Default(0) double lossUsagePct,
  }) = _RiskStatus;

  factory RiskStatus.fromJson(Map<String, dynamic> json) => _$RiskStatusFromJson(json);
}
