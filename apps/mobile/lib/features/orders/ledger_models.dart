import 'package:freezed_annotation/freezed_annotation.dart';
part 'ledger_models.freezed.dart';
part 'ledger_models.g.dart';

@freezed
abstract class LedgerData with _$LedgerData {
  const factory LedgerData({
    required LedgerSummary summary,
    required LedgerPagination pagination,
    @Default([]) List<LedgerDay> dailyLedger,
    @Default([]) List<ClosedTrade> closedTrades,
  }) = _LedgerData;
  factory LedgerData.fromJson(Map<String, dynamic> json) => _$LedgerDataFromJson(json);
}

@freezed
abstract class LedgerSummary with _$LedgerSummary {
  const factory LedgerSummary({
    @Default(0) double totalRealizedPnl,
    @Default(0) double totalGrossPnl,
    @Default(0) double totalCharges,
    @Default(0) int totalTrades,
    @Default(0) double winRate,
    @Default(0) int estimatedChargeTrades,
  }) = _LedgerSummary;
  factory LedgerSummary.fromJson(Map<String, dynamic> json) => _$LedgerSummaryFromJson(json);
}

@freezed
abstract class LedgerPagination with _$LedgerPagination {
  const factory LedgerPagination({@Default(1) int page, @Default(1) int totalPages, @Default(0) int total}) =
      _LedgerPagination;
  factory LedgerPagination.fromJson(Map<String, dynamic> json) => _$LedgerPaginationFromJson(json);
}

@freezed
abstract class LedgerDay with _$LedgerDay {
  const factory LedgerDay({
    required String date,
    @Default('') String formattedDate,
    @Default(0) int tradesCount,
    @Default(0) double pnl,
    @Default(0) double charges,
    @Default(0) double cumulativePnl,
  }) = _LedgerDay;
  factory LedgerDay.fromJson(Map<String, dynamic> json) => _$LedgerDayFromJson(json);
}

@freezed
abstract class ClosedTrade with _$ClosedTrade {
  const factory ClosedTrade({
    required String id,
    required String symbol,
    required String date,
    @Default(0) int qty,
    @Default('') String side,
    @Default(0) double entryPrice,
    @Default(0) double exitPrice,
    @Default(0) double realizedPnl,
    @Default(0) double grossPnl,
    @Default(0) double charges,
    @Default(false) bool chargesExact,
    String? strategyName,
  }) = _ClosedTrade;
  factory ClosedTrade.fromJson(Map<String, dynamic> json) => _$ClosedTradeFromJson(json);
}
