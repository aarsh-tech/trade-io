import 'package:freezed_annotation/freezed_annotation.dart';

part 'market_models.freezed.dart';
part 'market_models.g.dart';

/// One instrument's live quote from the `/market` socket (`ticks` event).
/// Mirrors MarketTick in apps/auth-service/src/market/market-tick.ts.
@freezed
abstract class MarketTick with _$MarketTick {
  const factory MarketTick({
    /// Canonical key, e.g. `NSE:RELIANCE`.
    required String key,
    required String symbol,
    required String exchange,
    required double ltp,
    double? close,
    double? change,
    double? changePct,
    double? volume,
    String? exchangeTs,
    required String ts,
    @Default('ws') String source,
  }) = _MarketTick;

  factory MarketTick.fromJson(Map<String, dynamic> json) => _$MarketTickFromJson(json);
}

enum FeedState {
  @JsonValue('connected')
  connected,
  @JsonValue('stale')
  stale,
  @JsonValue('closed')
  closed,
}

@freezed
abstract class FeedStatus with _$FeedStatus {
  const factory FeedStatus({
    @JsonKey(unknownEnumValue: FeedState.closed) @Default(FeedState.closed) FeedState status,
    String? lastExchangeTs,
    String? lastMessageAt,
  }) = _FeedStatus;

  factory FeedStatus.fromJson(Map<String, dynamic> json) => _$FeedStatusFromJson(json);

  static const closed = FeedStatus();
}

/// Kite order postback forwarded by the server (`order_update` event).
@freezed
abstract class OrderUpdate with _$OrderUpdate {
  const factory OrderUpdate({
    required String orderId,
    required String status,
    String? exchange,
    String? tradingsymbol,
    String? transactionType,
    String? orderType,
    String? product,
    int? quantity,
    int? filledQuantity,
    int? pendingQuantity,
    double? price,
    double? triggerPrice,
    double? averagePrice,
    String? statusMessage,
    String? tag,
  }) = _OrderUpdate;

  factory OrderUpdate.fromJson(Map<String, dynamic> json) => _$OrderUpdateFromJson(json);
}

/// GET /market/overview
@freezed
abstract class MarketOverview with _$MarketOverview {
  const factory MarketOverview({@Default([]) List<IndexQuote> indices, @Default([]) List<WatchStock> stocks}) =
      _MarketOverview;

  factory MarketOverview.fromJson(Map<String, dynamic> json) => _$MarketOverviewFromJson(json);
}

@freezed
abstract class IndexQuote with _$IndexQuote {
  const factory IndexQuote({
    required String symbol,

    /// Kite key such as `NSE:NIFTY 50`; absent when the broker is not connected.
    String? key,
    @Default(0) double price,
    double? close,

    /// Percent change vs previous close.
    @Default(0) double change,
    @Default(0) double changeAbs,
  }) = _IndexQuote;

  factory IndexQuote.fromJson(Map<String, dynamic> json) => _$IndexQuoteFromJson(json);
}

@freezed
abstract class WatchStock with _$WatchStock {
  const factory WatchStock({
    required String symbol,
    required String exchange,
    required String key,
    @Default(0) double price,
    double? close,

    /// Percent change vs previous close.
    @Default(0) double change,
  }) = _WatchStock;

  factory WatchStock.fromJson(Map<String, dynamic> json) => _$WatchStockFromJson(json);
}

/// GET /market/movers
@freezed
abstract class Movers with _$Movers {
  const factory Movers({@Default([]) List<Mover> topGainers, @Default([]) List<Mover> topLosers}) = _Movers;

  factory Movers.fromJson(Map<String, dynamic> json) => _$MoversFromJson(json);
}

@freezed
abstract class Mover with _$Mover {
  const factory Mover({
    required String symbol,
    @Default('NSE') String exchange,
    @Default(0) double ltp,
    double? close,
    @Default(0) double change,
    @Default(0) double changePercent,
  }) = _Mover;

  factory Mover.fromJson(Map<String, dynamic> json) => _$MoverFromJson(json);
}

enum SessionState {
  @JsonValue('pre-open')
  preOpen('Pre-open'),
  @JsonValue('open')
  open('Market open'),
  @JsonValue('closed')
  closed('Market closed'),
  @JsonValue('holiday')
  holiday('Holiday'),
  @JsonValue('weekend')
  weekend('Weekend');

  const SessionState(this.label);

  final String label;
}

/// GET /market/session
@freezed
abstract class SessionInfo with _$SessionInfo {
  const factory SessionInfo({
    @JsonKey(unknownEnumValue: SessionState.closed) required SessionState state,
    DateTime? nextOpenAt,
    DateTime? closesAt,
  }) = _SessionInfo;

  factory SessionInfo.fromJson(Map<String, dynamic> json) => _$SessionInfoFromJson(json);
}
