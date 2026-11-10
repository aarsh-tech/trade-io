// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'brokers_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_BrokerLogin _$BrokerLoginFromJson(Map<String, dynamic> json) => _BrokerLogin(url: json['url'] as String);

Map<String, dynamic> _$BrokerLoginToJson(_BrokerLogin instance) => <String, dynamic>{'url': instance.url};

_BrokerAccount _$BrokerAccountFromJson(Map<String, dynamic> json) => _BrokerAccount(
  id: json['id'] as String,
  broker: brokerTypeFromJson(json['broker']),
  clientId: json['clientId'] as String?,
  isActive: json['isActive'] as bool? ?? false,
  tokenExpiry: json['tokenExpiry'] == null ? null : DateTime.parse(json['tokenExpiry'] as String),
  tokenHealth: json['tokenHealth'] as String?,
  createdAt: json['createdAt'] == null ? null : DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$BrokerAccountToJson(_BrokerAccount instance) => <String, dynamic>{
  'id': instance.id,
  'broker': _$BrokerTypeEnumMap[instance.broker],
  'clientId': instance.clientId,
  'isActive': instance.isActive,
  'tokenExpiry': instance.tokenExpiry?.toIso8601String(),
  'tokenHealth': instance.tokenHealth,
  'createdAt': instance.createdAt?.toIso8601String(),
};

const _$BrokerTypeEnumMap = {
  BrokerType.zerodha: 'ZERODHA',
  BrokerType.angel: 'ANGEL',
  BrokerType.upstox: 'UPSTOX',
  BrokerType.fivepaisa: 'FIVEPAISA',
};
