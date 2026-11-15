import 'package:freezed_annotation/freezed_annotation.dart';
part 'scanner_models.freezed.dart';
part 'scanner_models.g.dart';

@freezed
abstract class ScreenerData with _$ScreenerData {
  const factory ScreenerData({@Default([]) List<ScreenerStock> stocks, String? timestamp}) = _ScreenerData;
  factory ScreenerData.fromJson(Map<String, dynamic> json) => _$ScreenerDataFromJson(json);
}

@freezed
abstract class ScreenerStock with _$ScreenerStock {
  const factory ScreenerStock({
    required String symbol,
    @Default('NSE') String exchange,
    @Default(0) double ltp,
    @Default(0) double changePct,
    @Default(0) double open,
    @Default(0) double close,
    @Default(0) double volume,
    @Default('NEUTRAL') String signal,
    @Default('WATCH') String suggestedAction,
    @Default(0) double suggestedSL,
    @JsonKey(name: 'suggestedTarget1') @Default(0) double suggestedTarget,
    @Default(0) double suggestedTarget2,
    @Default(1) int lotSize,
  }) = _ScreenerStock;
  factory ScreenerStock.fromJson(Map<String, dynamic> json) => _$ScreenerStockFromJson(json);
}

@freezed
abstract class MoveAlertsData with _$MoveAlertsData {
  const factory MoveAlertsData({String? day, String? status, String? updatedAt, @Default([]) List<MoveAlert> alerts}) =
      _MoveAlertsData;
  factory MoveAlertsData.fromJson(Map<String, dynamic> json) => _$MoveAlertsDataFromJson(json);
}

@freezed
abstract class MoveAlert with _$MoveAlert {
  const factory MoveAlert({
    required String id,
    required String symbol,
    required String type,
    @Default('') String hhmm,
    @Default('') String text,
    @Default(0) double level,
    @Default(0) double ltp,
    @Default(0) double changePct,
    @Default(0) double volPace,
    @Default(0) double stopRef,
  }) = _MoveAlert;
  factory MoveAlert.fromJson(Map<String, dynamic> json) => _$MoveAlertFromJson(json);
}

@freezed
abstract class SwingScan with _$SwingScan {
  const factory SwingScan({
    String? id,
    String? scannedAt,
    @Default(false) bool isScanning,
    @Default(0) int totalScanned,
    @Default(0) int totalResults,
    @Default(1) int page,
    @Default(1) int totalPages,
    @Default([]) List<SwingResult> results,
  }) = _SwingScan;
  factory SwingScan.fromJson(Map<String, dynamic> json) => _$SwingScanFromJson(json);
}

@freezed
abstract class SwingResult with _$SwingResult {
  const factory SwingResult({
    required String symbol,
    @Default('NSE') String exchange,
    required String pattern,
    @Default(0) double score,
    @Default('') String confidence,
    @Default(0) double currentPrice,
    @Default(0) double entryPrice,
    @Default(0) double stopLoss,
    @Default(0) double target1,
    @Default(0) double target2,
    @Default(0) double riskReward,
    @Default(0) double riskPct,
    String? direction,
    @Default([]) List<String> notes,
  }) = _SwingResult;
  factory SwingResult.fromJson(Map<String, dynamic> json) => _$SwingResultFromJson(json);
}

/// GET /swing-scanner/chart/:symbol — daily bars (columns), the setups' base ranges and RS rating.
@freezed
abstract class SwingChart with _$SwingChart {
  const factory SwingChart({
    required String symbol,
    @Default('') String asOf,
    int? rsRating,
    @Default([]) List<SwingChartBase> bases,
    required SwingChartBars bars,
  }) = _SwingChart;
  factory SwingChart.fromJson(Map<String, dynamic> json) => _$SwingChartFromJson(json);
}

/// Columns of equal length; `t` is the IST trading day as UTC-midnight epoch seconds.
@freezed
abstract class SwingChartBars with _$SwingChartBars {
  const factory SwingChartBars({
    @Default([]) List<int> t,
    @Default([]) List<double> o,
    @Default([]) List<double> h,
    @Default([]) List<double> l,
    @Default([]) List<double> c,
    @Default([]) List<double> v,
  }) = _SwingChartBars;
  factory SwingChartBars.fromJson(Map<String, dynamic> json) => _$SwingChartBarsFromJson(json);
}

@freezed
abstract class SwingChartBase with _$SwingChartBase {
  const factory SwingChartBase({
    required String pattern,
    @Default('LONG') String direction,
    required int from,
    required double high,
    required double low,
  }) = _SwingChartBase;
  factory SwingChartBase.fromJson(Map<String, dynamic> json) => _$SwingChartBaseFromJson(json);
}
