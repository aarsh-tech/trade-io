// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'portfolio_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_BrokerPosition _$BrokerPositionFromJson(Map<String, dynamic> json) => _BrokerPosition(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String?,
  qty: (json['qty'] as num?)?.toInt() ?? 0,
  avgPrice: (json['avgPrice'] as num?)?.toDouble() ?? 0,
  ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
  pnl: (json['pnl'] as num?)?.toDouble() ?? 0,
  side: json['side'] as String? ?? 'BUY',
  product: json['product'] as String? ?? 'MIS',
);

Map<String, dynamic> _$BrokerPositionToJson(_BrokerPosition instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'qty': instance.qty,
  'avgPrice': instance.avgPrice,
  'ltp': instance.ltp,
  'pnl': instance.pnl,
  'side': instance.side,
  'product': instance.product,
};

_Holding _$HoldingFromJson(Map<String, dynamic> json) => _Holding(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String?,
  qty: (json['qty'] as num?)?.toInt() ?? 0,
  avgPrice: (json['avgPrice'] as num?)?.toDouble() ?? 0,
  ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
  pnl: (json['pnl'] as num?)?.toDouble(),
  pnlPct: (json['pnlPct'] as num?)?.toDouble(),
  closePrice: (json['closePrice'] as num?)?.toDouble(),
);

Map<String, dynamic> _$HoldingToJson(_Holding instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'qty': instance.qty,
  'avgPrice': instance.avgPrice,
  'ltp': instance.ltp,
  'pnl': instance.pnl,
  'pnlPct': instance.pnlPct,
  'closePrice': instance.closePrice,
};

_Margins _$MarginsFromJson(Map<String, dynamic> json) => _Margins(
  equity: json['equity'] == null ? null : MarginSegment.fromJson(json['equity'] as Map<String, dynamic>),
  commodity: json['commodity'] == null ? null : MarginSegment.fromJson(json['commodity'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MarginsToJson(_Margins instance) => <String, dynamic>{
  'equity': instance.equity,
  'commodity': instance.commodity,
};

_MarginSegment _$MarginSegmentFromJson(Map<String, dynamic> json) => _MarginSegment(
  enabled: json['enabled'] as bool?,
  net: (json['net'] as num?)?.toDouble(),
  available: json['available'] == null ? null : MarginAvailable.fromJson(json['available'] as Map<String, dynamic>),
  utilised: json['utilised'] == null ? null : MarginUtilised.fromJson(json['utilised'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MarginSegmentToJson(_MarginSegment instance) => <String, dynamic>{
  'enabled': instance.enabled,
  'net': instance.net,
  'available': instance.available,
  'utilised': instance.utilised,
};

_MarginAvailable _$MarginAvailableFromJson(Map<String, dynamic> json) => _MarginAvailable(
  cash: (json['cash'] as num?)?.toDouble(),
  liveBalance: (json['live_balance'] as num?)?.toDouble(),
  openingBalance: (json['opening_balance'] as num?)?.toDouble(),
  collateral: (json['collateral'] as num?)?.toDouble(),
  intradayPayin: (json['intraday_payin'] as num?)?.toDouble(),
);

Map<String, dynamic> _$MarginAvailableToJson(_MarginAvailable instance) => <String, dynamic>{
  'cash': instance.cash,
  'live_balance': instance.liveBalance,
  'opening_balance': instance.openingBalance,
  'collateral': instance.collateral,
  'intraday_payin': instance.intradayPayin,
};

_MarginUtilised _$MarginUtilisedFromJson(Map<String, dynamic> json) => _MarginUtilised(
  debits: (json['debits'] as num?)?.toDouble(),
  exposure: (json['exposure'] as num?)?.toDouble(),
  span: (json['span'] as num?)?.toDouble(),
  m2mRealised: (json['m2m_realised'] as num?)?.toDouble(),
  m2mUnrealised: (json['m2m_unrealised'] as num?)?.toDouble(),
  optionPremium: (json['option_premium'] as num?)?.toDouble(),
);

Map<String, dynamic> _$MarginUtilisedToJson(_MarginUtilised instance) => <String, dynamic>{
  'debits': instance.debits,
  'exposure': instance.exposure,
  'span': instance.span,
  'm2m_realised': instance.m2mRealised,
  'm2m_unrealised': instance.m2mUnrealised,
  'option_premium': instance.optionPremium,
};
