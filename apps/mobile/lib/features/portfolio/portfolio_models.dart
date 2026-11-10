import 'package:freezed_annotation/freezed_annotation.dart';

part 'portfolio_models.freezed.dart';
part 'portfolio_models.g.dart';

/// GET /brokers/:id/positions — Kite net positions as mapped by the server
/// (ZerodhaClient.getPositions). `qty` is negative for a short; 0 for a position closed today.
@freezed
abstract class BrokerPosition with _$BrokerPosition {
  const BrokerPosition._();

  const factory BrokerPosition({
    required String symbol,
    String? exchange,
    @Default(0) int qty,
    @Default(0) double avgPrice,
    @Default(0) double ltp,
    @Default(0) double pnl,
    @Default('BUY') String side,
    @Default('MIS') String product,
  }) = _BrokerPosition;

  factory BrokerPosition.fromJson(Map<String, dynamic> json) => _$BrokerPositionFromJson(json);

  bool get isOpen => qty != 0;
}

/// GET /brokers/:id/holdings
@freezed
abstract class Holding with _$Holding {
  const factory Holding({
    required String symbol,
    String? exchange,
    @Default(0) int qty,
    @Default(0) double avgPrice,
    @Default(0) double ltp,
    double? pnl,
    double? pnlPct,
    double? closePrice,
  }) = _Holding;

  factory Holding.fromJson(Map<String, dynamic> json) => _$HoldingFromJson(json);
}

/// GET /brokers/:id/margins — Kite's raw margins object; only the fields the UI reads.
@freezed
abstract class Margins with _$Margins {
  const Margins._();

  const factory Margins({MarginSegment? equity, MarginSegment? commodity}) = _Margins;

  factory Margins.fromJson(Map<String, dynamic> json) => _$MarginsFromJson(json);

  /// Same fallback chain as the web dashboard: live balance → cash → net.
  double? get equityAvailable => equity?.available?.liveBalance ?? equity?.available?.cash ?? equity?.net;

  double? get equityUsed => equity?.utilised?.debits;
}

@freezed
abstract class MarginSegment with _$MarginSegment {
  const factory MarginSegment({bool? enabled, double? net, MarginAvailable? available, MarginUtilised? utilised}) =
      _MarginSegment;

  factory MarginSegment.fromJson(Map<String, dynamic> json) => _$MarginSegmentFromJson(json);
}

@freezed
abstract class MarginAvailable with _$MarginAvailable {
  const factory MarginAvailable({
    double? cash,
    @JsonKey(name: 'live_balance') double? liveBalance,
    @JsonKey(name: 'opening_balance') double? openingBalance,
    double? collateral,
    @JsonKey(name: 'intraday_payin') double? intradayPayin,
  }) = _MarginAvailable;

  factory MarginAvailable.fromJson(Map<String, dynamic> json) => _$MarginAvailableFromJson(json);
}

@freezed
abstract class MarginUtilised with _$MarginUtilised {
  const factory MarginUtilised({
    double? debits,
    double? exposure,
    double? span,
    @JsonKey(name: 'm2m_realised') double? m2mRealised,
    @JsonKey(name: 'm2m_unrealised') double? m2mUnrealised,
    @JsonKey(name: 'option_premium') double? optionPremium,
  }) = _MarginUtilised;

  factory MarginUtilised.fromJson(Map<String, dynamic> json) => _$MarginUtilisedFromJson(json);
}
