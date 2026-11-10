// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'risk_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_RiskActionResult _$RiskActionResultFromJson(Map<String, dynamic> json) =>
    _RiskActionResult(message: json['message'] as String);

Map<String, dynamic> _$RiskActionResultToJson(_RiskActionResult instance) => <String, dynamic>{
  'message': instance.message,
};

_RiskStatus _$RiskStatusFromJson(Map<String, dynamic> json) => _RiskStatus(
  killSwitchActive: json['killSwitchActive'] as bool? ?? false,
  killSwitchTriggeredAt:
      json['killSwitchTriggeredAt'] == null ? null : DateTime.parse(json['killSwitchTriggeredAt'] as String),
  maxDailyLoss: (json['maxDailyLoss'] as num?)?.toDouble() ?? 0,
  maxOrderValue: (json['maxOrderValue'] as num?)?.toDouble(),
  maxOrderQty: (json['maxOrderQty'] as num?)?.toInt(),
  realizedPnl: (json['realizedPnl'] as num?)?.toDouble() ?? 0,
  unrealizedPnl: (json['unrealizedPnl'] as num?)?.toDouble() ?? 0,
  totalDailyPnl: (json['totalDailyPnl'] as num?)?.toDouble() ?? 0,
  lossUsagePct: (json['lossUsagePct'] as num?)?.toDouble() ?? 0,
);

Map<String, dynamic> _$RiskStatusToJson(_RiskStatus instance) => <String, dynamic>{
  'killSwitchActive': instance.killSwitchActive,
  'killSwitchTriggeredAt': instance.killSwitchTriggeredAt?.toIso8601String(),
  'maxDailyLoss': instance.maxDailyLoss,
  'maxOrderValue': instance.maxOrderValue,
  'maxOrderQty': instance.maxOrderQty,
  'realizedPnl': instance.realizedPnl,
  'unrealizedPnl': instance.unrealizedPnl,
  'totalDailyPnl': instance.totalDailyPnl,
  'lossUsagePct': instance.lossUsagePct,
};
