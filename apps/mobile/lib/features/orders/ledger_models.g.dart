// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ledger_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_LedgerData _$LedgerDataFromJson(Map<String, dynamic> json) => _LedgerData(
  summary: LedgerSummary.fromJson(json['summary'] as Map<String, dynamic>),
  pagination: LedgerPagination.fromJson(json['pagination'] as Map<String, dynamic>),
  dailyLedger:
      (json['dailyLedger'] as List<dynamic>?)?.map((e) => LedgerDay.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
  closedTrades:
      (json['closedTrades'] as List<dynamic>?)?.map((e) => ClosedTrade.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
);

Map<String, dynamic> _$LedgerDataToJson(_LedgerData instance) => <String, dynamic>{
  'summary': instance.summary,
  'pagination': instance.pagination,
  'dailyLedger': instance.dailyLedger,
  'closedTrades': instance.closedTrades,
};

_LedgerSummary _$LedgerSummaryFromJson(Map<String, dynamic> json) => _LedgerSummary(
  totalRealizedPnl: (json['totalRealizedPnl'] as num?)?.toDouble() ?? 0,
  totalGrossPnl: (json['totalGrossPnl'] as num?)?.toDouble() ?? 0,
  totalCharges: (json['totalCharges'] as num?)?.toDouble() ?? 0,
  totalTrades: (json['totalTrades'] as num?)?.toInt() ?? 0,
  winRate: (json['winRate'] as num?)?.toDouble() ?? 0,
  estimatedChargeTrades: (json['estimatedChargeTrades'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$LedgerSummaryToJson(_LedgerSummary instance) => <String, dynamic>{
  'totalRealizedPnl': instance.totalRealizedPnl,
  'totalGrossPnl': instance.totalGrossPnl,
  'totalCharges': instance.totalCharges,
  'totalTrades': instance.totalTrades,
  'winRate': instance.winRate,
  'estimatedChargeTrades': instance.estimatedChargeTrades,
};

_LedgerPagination _$LedgerPaginationFromJson(Map<String, dynamic> json) => _LedgerPagination(
  page: (json['page'] as num?)?.toInt() ?? 1,
  totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
  total: (json['total'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$LedgerPaginationToJson(_LedgerPagination instance) => <String, dynamic>{
  'page': instance.page,
  'totalPages': instance.totalPages,
  'total': instance.total,
};

_LedgerDay _$LedgerDayFromJson(Map<String, dynamic> json) => _LedgerDay(
  date: json['date'] as String,
  formattedDate: json['formattedDate'] as String? ?? '',
  tradesCount: (json['tradesCount'] as num?)?.toInt() ?? 0,
  pnl: (json['pnl'] as num?)?.toDouble() ?? 0,
  charges: (json['charges'] as num?)?.toDouble() ?? 0,
  cumulativePnl: (json['cumulativePnl'] as num?)?.toDouble() ?? 0,
);

Map<String, dynamic> _$LedgerDayToJson(_LedgerDay instance) => <String, dynamic>{
  'date': instance.date,
  'formattedDate': instance.formattedDate,
  'tradesCount': instance.tradesCount,
  'pnl': instance.pnl,
  'charges': instance.charges,
  'cumulativePnl': instance.cumulativePnl,
};

_ClosedTrade _$ClosedTradeFromJson(Map<String, dynamic> json) => _ClosedTrade(
  id: json['id'] as String,
  symbol: json['symbol'] as String,
  date: json['date'] as String,
  qty: (json['qty'] as num?)?.toInt() ?? 0,
  side: json['side'] as String? ?? '',
  entryPrice: (json['entryPrice'] as num?)?.toDouble() ?? 0,
  exitPrice: (json['exitPrice'] as num?)?.toDouble() ?? 0,
  realizedPnl: (json['realizedPnl'] as num?)?.toDouble() ?? 0,
  grossPnl: (json['grossPnl'] as num?)?.toDouble() ?? 0,
  charges: (json['charges'] as num?)?.toDouble() ?? 0,
  chargesExact: json['chargesExact'] as bool? ?? false,
  strategyName: json['strategyName'] as String?,
);

Map<String, dynamic> _$ClosedTradeToJson(_ClosedTrade instance) => <String, dynamic>{
  'id': instance.id,
  'symbol': instance.symbol,
  'date': instance.date,
  'qty': instance.qty,
  'side': instance.side,
  'entryPrice': instance.entryPrice,
  'exitPrice': instance.exitPrice,
  'realizedPnl': instance.realizedPnl,
  'grossPnl': instance.grossPnl,
  'charges': instance.charges,
  'chargesExact': instance.chargesExact,
  'strategyName': instance.strategyName,
};
