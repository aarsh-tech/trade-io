import 'dart:convert';

import 'package:freezed_annotation/freezed_annotation.dart';

import '../../shared/enums.dart';
import '../orders/orders_models.dart';

part 'strategies_models.freezed.dart';
part 'strategies_models.g.dart';

/// Saved strategy and its decoded server configuration.
@freezed
abstract class StrategyRow with _$StrategyRow {
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
  }) = _StrategyRow;

  factory StrategyRow.fromJson(Map<String, dynamic> json) => _$StrategyRowFromJson(json);
}

Map<String, dynamic> configFromJson(dynamic value) {
  if (value == null || value == '') return {};
  final decoded = value is String ? jsonDecode(value) : value;
  return Map<String, dynamic>.from(decoded as Map);
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
