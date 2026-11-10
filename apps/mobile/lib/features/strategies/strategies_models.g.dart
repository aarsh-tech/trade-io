// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'strategies_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_StrategyRow _$StrategyRowFromJson(Map<String, dynamic> json) => _StrategyRow(
  id: json['id'] as String,
  name: json['name'] as String,
  type: strategyTypeFromJson(json['type']),
  isActive: json['isActive'] as bool? ?? false,
  isPaperTrade: json['isPaperTrade'] as bool? ?? false,
  autoStart: json['autoStart'] as bool? ?? false,
  brokerAccountId: json['brokerAccountId'] as String?,
  config: json['config'] == null ? const {} : configFromJson(json['config']),
  updatedAt: json['updatedAt'] == null ? null : DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$StrategyRowToJson(_StrategyRow instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'type': _$StrategyTypeEnumMap[instance.type],
  'isActive': instance.isActive,
  'isPaperTrade': instance.isPaperTrade,
  'autoStart': instance.autoStart,
  'brokerAccountId': instance.brokerAccountId,
  'config': instance.config,
  'updatedAt': instance.updatedAt?.toIso8601String(),
};

const _$StrategyTypeEnumMap = {
  StrategyType.breakout15min: 'BREAKOUT_15MIN',
  StrategyType.emaVwapCrossover: 'EMA_VWAP_CROSSOVER',
  StrategyType.stocksInPlay: 'STOCKS_IN_PLAY',
  StrategyType.dailyScalper: 'DAILY_SCALPER',
  StrategyType.custom: 'CUSTOM',
};

_StrategyStatus _$StrategyStatusFromJson(Map<String, dynamic> json) => _StrategyStatus(
  running: json['running'] as bool? ?? false,
  autoStart: json['autoStart'] as bool? ?? false,
  logs: (json['logs'] as List<dynamic>?)?.map((e) => e as String).toList() ?? const [],
  state: json['state'] as Map<String, dynamic>?,
  orders:
      (json['orders'] as List<dynamic>?)?.map((e) => Order.fromJson(e as Map<String, dynamic>)).toList() ?? const [],
);

Map<String, dynamic> _$StrategyStatusToJson(_StrategyStatus instance) => <String, dynamic>{
  'running': instance.running,
  'autoStart': instance.autoStart,
  'logs': instance.logs,
  'state': instance.state,
  'orders': instance.orders,
};
