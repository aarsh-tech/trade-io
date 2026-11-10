// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scanner_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_ScreenerData _$ScreenerDataFromJson(Map<String, dynamic> json) => _ScreenerData(
  stocks:
      (json['stocks'] as List<dynamic>?)?.map((e) => ScreenerStock.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
  timestamp: json['timestamp'] as String?,
);

Map<String, dynamic> _$ScreenerDataToJson(_ScreenerData instance) => <String, dynamic>{
  'stocks': instance.stocks,
  'timestamp': instance.timestamp,
};

_ScreenerStock _$ScreenerStockFromJson(Map<String, dynamic> json) => _ScreenerStock(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String? ?? 'NSE',
  ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
  changePct: (json['changePct'] as num?)?.toDouble() ?? 0,
  open: (json['open'] as num?)?.toDouble() ?? 0,
  close: (json['close'] as num?)?.toDouble() ?? 0,
  volume: (json['volume'] as num?)?.toDouble() ?? 0,
  signal: json['signal'] as String? ?? 'NEUTRAL',
  suggestedAction: json['suggestedAction'] as String? ?? 'WATCH',
  suggestedSL: (json['suggestedSL'] as num?)?.toDouble() ?? 0,
  suggestedTarget: (json['suggestedTarget1'] as num?)?.toDouble() ?? 0,
  suggestedTarget2: (json['suggestedTarget2'] as num?)?.toDouble() ?? 0,
  lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
);

Map<String, dynamic> _$ScreenerStockToJson(_ScreenerStock instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'ltp': instance.ltp,
  'changePct': instance.changePct,
  'open': instance.open,
  'close': instance.close,
  'volume': instance.volume,
  'signal': instance.signal,
  'suggestedAction': instance.suggestedAction,
  'suggestedSL': instance.suggestedSL,
  'suggestedTarget1': instance.suggestedTarget,
  'suggestedTarget2': instance.suggestedTarget2,
  'lotSize': instance.lotSize,
};

_MoveAlertsData _$MoveAlertsDataFromJson(Map<String, dynamic> json) => _MoveAlertsData(
  day: json['day'] as String?,
  status: json['status'] as String?,
  updatedAt: json['updatedAt'] as String?,
  alerts:
      (json['alerts'] as List<dynamic>?)?.map((e) => MoveAlert.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
);

Map<String, dynamic> _$MoveAlertsDataToJson(_MoveAlertsData instance) => <String, dynamic>{
  'day': instance.day,
  'status': instance.status,
  'updatedAt': instance.updatedAt,
  'alerts': instance.alerts,
};

_MoveAlert _$MoveAlertFromJson(Map<String, dynamic> json) => _MoveAlert(
  id: json['id'] as String,
  symbol: json['symbol'] as String,
  type: json['type'] as String,
  hhmm: json['hhmm'] as String? ?? '',
  text: json['text'] as String? ?? '',
  level: (json['level'] as num?)?.toDouble() ?? 0,
  ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
  changePct: (json['changePct'] as num?)?.toDouble() ?? 0,
  volPace: (json['volPace'] as num?)?.toDouble() ?? 0,
  stopRef: (json['stopRef'] as num?)?.toDouble() ?? 0,
);

Map<String, dynamic> _$MoveAlertToJson(_MoveAlert instance) => <String, dynamic>{
  'id': instance.id,
  'symbol': instance.symbol,
  'type': instance.type,
  'hhmm': instance.hhmm,
  'text': instance.text,
  'level': instance.level,
  'ltp': instance.ltp,
  'changePct': instance.changePct,
  'volPace': instance.volPace,
  'stopRef': instance.stopRef,
};

_SwingScan _$SwingScanFromJson(Map<String, dynamic> json) => _SwingScan(
  id: json['id'] as String?,
  scannedAt: json['scannedAt'] as String?,
  isScanning: json['isScanning'] as bool? ?? false,
  totalScanned: (json['totalScanned'] as num?)?.toInt() ?? 0,
  totalResults: (json['totalResults'] as num?)?.toInt() ?? 0,
  page: (json['page'] as num?)?.toInt() ?? 1,
  totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
  results:
      (json['results'] as List<dynamic>?)?.map((e) => SwingResult.fromJson(e as Map<String, dynamic>)).toList() ??
      const [],
);

Map<String, dynamic> _$SwingScanToJson(_SwingScan instance) => <String, dynamic>{
  'id': instance.id,
  'scannedAt': instance.scannedAt,
  'isScanning': instance.isScanning,
  'totalScanned': instance.totalScanned,
  'totalResults': instance.totalResults,
  'page': instance.page,
  'totalPages': instance.totalPages,
  'results': instance.results,
};

_SwingResult _$SwingResultFromJson(Map<String, dynamic> json) => _SwingResult(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String? ?? 'NSE',
  pattern: json['pattern'] as String,
  score: (json['score'] as num?)?.toDouble() ?? 0,
  confidence: json['confidence'] as String? ?? '',
  currentPrice: (json['currentPrice'] as num?)?.toDouble() ?? 0,
  entryPrice: (json['entryPrice'] as num?)?.toDouble() ?? 0,
  stopLoss: (json['stopLoss'] as num?)?.toDouble() ?? 0,
  target1: (json['target1'] as num?)?.toDouble() ?? 0,
  target2: (json['target2'] as num?)?.toDouble() ?? 0,
  riskReward: (json['riskReward'] as num?)?.toDouble() ?? 0,
  riskPct: (json['riskPct'] as num?)?.toDouble() ?? 0,
  direction: json['direction'] as String?,
  notes: (json['notes'] as List<dynamic>?)?.map((e) => e as String).toList() ?? const [],
);

Map<String, dynamic> _$SwingResultToJson(_SwingResult instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'pattern': instance.pattern,
  'score': instance.score,
  'confidence': instance.confidence,
  'currentPrice': instance.currentPrice,
  'entryPrice': instance.entryPrice,
  'stopLoss': instance.stopLoss,
  'target1': instance.target1,
  'target2': instance.target2,
  'riskReward': instance.riskReward,
  'riskPct': instance.riskPct,
  'direction': instance.direction,
  'notes': instance.notes,
};
