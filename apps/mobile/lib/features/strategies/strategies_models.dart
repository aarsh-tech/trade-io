import 'dart:convert';

import 'package:freezed_annotation/freezed_annotation.dart';

import '../../shared/enums.dart';
import '../orders/orders_models.dart';

part 'strategies_models.freezed.dart';
part 'strategies_models.g.dart';

/// Saved strategy and its decoded server configuration.
@freezed
abstract class StrategyRow with _$StrategyRow {
  const StrategyRow._();

  const factory StrategyRow({
    required String id,
    required String name,
    @JsonKey(fromJson: strategyTypeFromJson) StrategyType? type,
    @Default(false) bool isActive,
    @Default(false) bool isPaperTrade,
    @Default(false) bool autoStart,
    String? brokerAccountId,
    @JsonKey(fromJson: configFromJson) @Default({}) Map<String, dynamic> config,
    DateTime? updatedAt,

    /// Today's closed-trade P&L (absent when the strategy has not traded today).
    double? todayPnl,

    /// The newest execution (`{ status, startedAt }`), null when it never ran.
    Map<String, dynamic>? latestExecution,

    /// Detail only (GET /strategies/:id): last-30-day performance, past runs, the broker.
    StrategyPerformance? performance,
    @Default([]) List<StrategyExecution> executions,
    Map<String, dynamic>? brokerAccount,
  }) = _StrategyRow;

  /// RUNNING / COMPLETED / STOPPED, as the web's StatusBadge reads it.
  String get runStatus => isActive ? 'RUNNING' : (latestExecution?['status'] == 'COMPLETED' ? 'COMPLETED' : 'STOPPED');

  factory StrategyRow.fromJson(Map<String, dynamic> json) => _$StrategyRowFromJson(json);
}

Map<String, dynamic> configFromJson(dynamic value) {
  if (value == null || value == '') return {};
  final decoded = value is String ? jsonDecode(value) : value;
  return Map<String, dynamic>.from(decoded as Map);
}

/// Closed-trade stats over the last 30 days (`performance` on GET /strategies/:id).
@freezed
abstract class StrategyPerformance with _$StrategyPerformance {
  const factory StrategyPerformance({
    @Default(0) int totalTrades,
    @Default(0) double winRate,
    @Default(0) double netPnl,
    @Default(0) double profitFactor,
    @Default(0) double avgProfitPerWin,
    int? todayTrades,
    double? todayPnl,
  }) = _StrategyPerformance;
  factory StrategyPerformance.fromJson(Map<String, dynamic> json) => _$StrategyPerformanceFromJson(json);
}

/// One run of a strategy. [logs] is a JSON array of lines, stored as text.
@freezed
abstract class StrategyExecution with _$StrategyExecution {
  const StrategyExecution._();

  const factory StrategyExecution({
    required String id,
    @Default('STOPPED') String status,
    DateTime? startedAt,
    DateTime? stoppedAt,
    String? logs,
    String? errorMsg,
  }) = _StrategyExecution;
  factory StrategyExecution.fromJson(Map<String, dynamic> json) => _$StrategyExecutionFromJson(json);

  List<String> get logLines {
    try {
      final v = jsonDecode(logs ?? '[]');
      return v is List ? [for (final l in v) '$l'] : const [];
    } catch (_) {
      return const [];
    }
  }

  /// `45m` / `2h 5m`, "In progress" while running.
  String get duration {
    final start = startedAt, stop = stoppedAt;
    if (stop == null || start == null) return status == 'RUNNING' ? 'In progress' : '—';
    final mins = stop.difference(start).inMinutes;
    return mins < 60 ? '${mins}m' : '${mins ~/ 60}h ${mins % 60}m';
  }
}

@freezed
abstract class StrategyStatus with _$StrategyStatus {
  const factory StrategyStatus({
    @Default(false) bool running,
    @Default(false) bool autoStart,
    @Default([]) List<String> logs,
    Map<String, dynamic>? state,
    @Default([]) List<Order> orders,
  }) = _StrategyStatus;
  factory StrategyStatus.fromJson(Map<String, dynamic> json) => _$StrategyStatusFromJson(json);
}
