import 'package:freezed_annotation/freezed_annotation.dart';

import '../../shared/enums.dart';

part 'brokers_models.freezed.dart';
part 'brokers_models.g.dart';

@freezed
abstract class BrokerLogin with _$BrokerLogin {
  const factory BrokerLogin({required String url}) = _BrokerLogin;
  factory BrokerLogin.fromJson(Map<String, dynamic> json) => _$BrokerLoginFromJson(json);
}

/// One linked broker account (GET /brokers). Secrets never leave the server.
@freezed
abstract class BrokerAccount with _$BrokerAccount {
  const BrokerAccount._();

  const factory BrokerAccount({
    required String id,
    @JsonKey(fromJson: brokerTypeFromJson) BrokerType? broker,
    String? clientId,
    @Default(false) bool isActive,
    DateTime? tokenExpiry,

    /// `HEALTHY` or `EXPIRED` (server-side enum; kept as text so a new value can't break parsing).
    String? tokenHealth,
    DateTime? createdAt,
  }) = _BrokerAccount;

  factory BrokerAccount.fromJson(Map<String, dynamic> json) => _$BrokerAccountFromJson(json);

  bool get sessionExpired => tokenHealth == 'EXPIRED';

  String get label => broker?.wire ?? 'Broker';
}
