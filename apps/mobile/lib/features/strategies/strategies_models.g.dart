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
  todayPnl: (json['todayPnl'] as num?)?.toDouble(),
  latestExecution: json['latestExecution'] as Map<String, dynamic>?,
  performance:
      json['performance'] == null ? null : StrategyPerformance.fromJson(json['performance'] as Map<String, dynamic>),
  executions:
      (json['executions'] as List<dynamic>?)
          ?.map((e) => StrategyExecution.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  brokerAccount: json['brokerAccount'] as Map<String, dynamic>?,
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
  'todayPnl': instance.todayPnl,
  'latestExecution': instance.latestExecution,
  'performance': instance.performance,
  'executions': instance.executions,
  'brokerAccount': instance.brokerAccount,
};

const _$StrategyTypeEnumMap = {
  StrategyType.breakout15min: 'BREAKOUT_15MIN',
  StrategyType.emaVwapCrossover: 'EMA_VWAP_CROSSOVER',
  StrategyType.stocksInPlay: 'STOCKS_IN_PLAY',
  StrategyType.dailyScalper: 'DAILY_SCALPER',
  StrategyType.custom: 'CUSTOM',
};

_StrategyPerformance _$StrategyPerformanceFromJson(Map<String, dynamic> json) => _StrategyPerformance(
  totalTrades: (json['totalTrades'] as num?)?.toInt() ?? 0,
  winRate: (json['winRate'] as num?)?.toDouble() ?? 0,
  netPnl: (json['netPnl'] as num?)?.toDouble() ?? 0,
  profitFactor: (json['profitFactor'] as num?)?.toDouble() ?? 0,
  avgProfitPerWin: (json['avgProfitPerWin'] as num?)?.toDouble() ?? 0,
  todayTrades: (json['todayTrades'] as num?)?.toInt(),
  todayPnl: (json['todayPnl'] as num?)?.toDouble(),
);

Map<String, dynamic> _$StrategyPerformanceToJson(_StrategyPerformance instance) => <String, dynamic>{
  'totalTrades': instance.totalTrades,
  'winRate': instance.winRate,
  'netPnl': instance.netPnl,
  'profitFactor': instance.profitFactor,
  'avgProfitPerWin': instance.avgProfitPerWin,
  'todayTrades': instance.todayTrades,
  'todayPnl': instance.todayPnl,
};

_StrategyExecution _$StrategyExecutionFromJson(Map<String, dynamic> json) => _StrategyExecution(
  id: json['id'] as String,
  status: json['status'] as String? ?? 'STOPPED',
  startedAt: json['startedAt'] == null ? null : DateTime.parse(json['startedAt'] as String),
  stoppedAt: json['stoppedAt'] == null ? null : DateTime.parse(json['stoppedAt'] as String),
  logs: json['logs'] as String?,
  errorMsg: json['errorMsg'] as String?,
);

Map<String, dynamic> _$StrategyExecutionToJson(_StrategyExecution instance) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status,
  'startedAt': instance.startedAt?.toIso8601String(),
  'stoppedAt': instance.stoppedAt?.toIso8601String(),
  'logs': instance.logs,
  'errorMsg': instance.errorMsg,
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
