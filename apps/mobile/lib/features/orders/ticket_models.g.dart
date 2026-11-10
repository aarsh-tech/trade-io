// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ticket_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Instrument _$InstrumentFromJson(Map<String, dynamic> json) => _Instrument(
  symbol: json['symbol'] as String,
  exchange: json['exchange'] as String,
  name: json['name'] as String?,
  ltp: (json['ltp'] as num?)?.toDouble(),
  lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
);

Map<String, dynamic> _$InstrumentToJson(_Instrument instance) => <String, dynamic>{
  'symbol': instance.symbol,
  'exchange': instance.exchange,
  'name': instance.name,
  'ltp': instance.ltp,
  'lotSize': instance.lotSize,
};

_OrderLimits _$OrderLimitsFromJson(Map<String, dynamic> json) => _OrderLimits(
  killSwitchActive: json['killSwitchActive'] as bool? ?? false,
  maxOrderQty: (json['maxOrderQty'] as num?)?.toInt(),
  freezeLimit: (json['freezeLimit'] as num?)?.toInt(),
  maxOrderValue: (json['maxOrderValue'] as num?)?.toDouble(),
);

Map<String, dynamic> _$OrderLimitsToJson(_OrderLimits instance) => <String, dynamic>{
  'killSwitchActive': instance.killSwitchActive,
  'maxOrderQty': instance.maxOrderQty,
  'freezeLimit': instance.freezeLimit,
  'maxOrderValue': instance.maxOrderValue,
};

_TickSize _$TickSizeFromJson(Map<String, dynamic> json) => _TickSize(tickSize: (json['tickSize'] as num).toDouble());

Map<String, dynamic> _$TickSizeToJson(_TickSize instance) => <String, dynamic>{'tickSize': instance.tickSize};

_LotSize _$LotSizeFromJson(Map<String, dynamic> json) => _LotSize(lotSize: (json['lotSize'] as num).toInt());

Map<String, dynamic> _$LotSizeToJson(_LotSize instance) => <String, dynamic>{'lotSize': instance.lotSize};
