// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AppUser _$AppUserFromJson(Map<String, dynamic> json) => _AppUser(
  id: json['id'] as String,
  email: json['email'] as String,
  name: json['name'] as String,
  role: json['role'] as String?,
  isActive: json['isActive'] as bool?,
  twoFaEnabled: json['twoFaEnabled'] as bool? ?? false,
);

Map<String, dynamic> _$AppUserToJson(_AppUser instance) => <String, dynamic>{
  'id': instance.id,
  'email': instance.email,
  'name': instance.name,
  'role': instance.role,
  'isActive': instance.isActive,
  'twoFaEnabled': instance.twoFaEnabled,
};

_TwoFaSetup _$TwoFaSetupFromJson(Map<String, dynamic> json) =>
    _TwoFaSetup(secret: json['secret'] as String, qrCode: json['qrCode'] as String);

Map<String, dynamic> _$TwoFaSetupToJson(_TwoFaSetup instance) => <String, dynamic>{
  'secret': instance.secret,
  'qrCode': instance.qrCode,
};
