// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'scanner_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ScreenerData {

 List<ScreenerStock> get stocks; String? get timestamp;
/// Create a copy of ScreenerData
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ScreenerDataCopyWith<ScreenerData> get copyWith => _$ScreenerDataCopyWithImpl<ScreenerData>(this as ScreenerData, _$identity);

  /// Serializes this ScreenerData to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ScreenerData&&const DeepCollectionEquality().equals(other.stocks, stocks)&&(identical(other.timestamp, timestamp) || other.timestamp == timestamp));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(stocks),timestamp);

@override
String toString() {
  return 'ScreenerData(stocks: $stocks, timestamp: $timestamp)';
}


}

/// @nodoc
abstract mixin class $ScreenerDataCopyWith<$Res>  {
  factory $ScreenerDataCopyWith(ScreenerData value, $Res Function(ScreenerData) _then) = _$ScreenerDataCopyWithImpl;
@useResult
$Res call({
 List<ScreenerStock> stocks, String? timestamp
});




}
/// @nodoc
class _$ScreenerDataCopyWithImpl<$Res>
    implements $ScreenerDataCopyWith<$Res> {
  _$ScreenerDataCopyWithImpl(this._self, this._then);

  final ScreenerData _self;
  final $Res Function(ScreenerData) _then;

/// Create a copy of ScreenerData
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? stocks = null,Object? timestamp = freezed,}) {
  return _then(_self.copyWith(
stocks: null == stocks ? _self.stocks : stocks // ignore: cast_nullable_to_non_nullable
as List<ScreenerStock>,timestamp: freezed == timestamp ? _self.timestamp : timestamp // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ScreenerData].
extension ScreenerDataPatterns on ScreenerData {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ScreenerData value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ScreenerData() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ScreenerData value)  $default,){
final _that = this;
switch (_that) {
case _ScreenerData():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ScreenerData value)?  $default,){
final _that = this;
switch (_that) {
case _ScreenerData() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<ScreenerStock> stocks,  String? timestamp)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ScreenerData() when $default != null:
return $default(_that.stocks,_that.timestamp);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<ScreenerStock> stocks,  String? timestamp)  $default,) {final _that = this;
switch (_that) {
case _ScreenerData():
return $default(_that.stocks,_that.timestamp);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<ScreenerStock> stocks,  String? timestamp)?  $default,) {final _that = this;
switch (_that) {
case _ScreenerData() when $default != null:
return $default(_that.stocks,_that.timestamp);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ScreenerData implements ScreenerData {
  const _ScreenerData({final  List<ScreenerStock> stocks = const [], this.timestamp}): _stocks = stocks;
  factory _ScreenerData.fromJson(Map<String, dynamic> json) => _$ScreenerDataFromJson(json);

 final  List<ScreenerStock> _stocks;
@override@JsonKey() List<ScreenerStock> get stocks {
  if (_stocks is EqualUnmodifiableListView) return _stocks;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_stocks);
}

@override final  String? timestamp;

/// Create a copy of ScreenerData
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ScreenerDataCopyWith<_ScreenerData> get copyWith => __$ScreenerDataCopyWithImpl<_ScreenerData>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ScreenerDataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ScreenerData&&const DeepCollectionEquality().equals(other._stocks, _stocks)&&(identical(other.timestamp, timestamp) || other.timestamp == timestamp));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_stocks),timestamp);

@override
String toString() {
  return 'ScreenerData(stocks: $stocks, timestamp: $timestamp)';
}


}

/// @nodoc
abstract mixin class _$ScreenerDataCopyWith<$Res> implements $ScreenerDataCopyWith<$Res> {
  factory _$ScreenerDataCopyWith(_ScreenerData value, $Res Function(_ScreenerData) _then) = __$ScreenerDataCopyWithImpl;
@override @useResult
$Res call({
 List<ScreenerStock> stocks, String? timestamp
});




}
/// @nodoc
class __$ScreenerDataCopyWithImpl<$Res>
    implements _$ScreenerDataCopyWith<$Res> {
  __$ScreenerDataCopyWithImpl(this._self, this._then);

  final _ScreenerData _self;
  final $Res Function(_ScreenerData) _then;

/// Create a copy of ScreenerData
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? stocks = null,Object? timestamp = freezed,}) {
  return _then(_ScreenerData(
stocks: null == stocks ? _self._stocks : stocks // ignore: cast_nullable_to_non_nullable
as List<ScreenerStock>,timestamp: freezed == timestamp ? _self.timestamp : timestamp // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$ScreenerStock {

 String get symbol; String get exchange; double get ltp; double get changePct; double get open; double get close; double get volume; String get signal; String get suggestedAction; double get suggestedSL;@JsonKey(name: 'suggestedTarget1') double get suggestedTarget; double get suggestedTarget2; int get lotSize;
/// Create a copy of ScreenerStock
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ScreenerStockCopyWith<ScreenerStock> get copyWith => _$ScreenerStockCopyWithImpl<ScreenerStock>(this as ScreenerStock, _$identity);

  /// Serializes this ScreenerStock to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ScreenerStock&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.changePct, changePct) || other.changePct == changePct)&&(identical(other.open, open) || other.open == open)&&(identical(other.close, close) || other.close == close)&&(identical(other.volume, volume) || other.volume == volume)&&(identical(other.signal, signal) || other.signal == signal)&&(identical(other.suggestedAction, suggestedAction) || other.suggestedAction == suggestedAction)&&(identical(other.suggestedSL, suggestedSL) || other.suggestedSL == suggestedSL)&&(identical(other.suggestedTarget, suggestedTarget) || other.suggestedTarget == suggestedTarget)&&(identical(other.suggestedTarget2, suggestedTarget2) || other.suggestedTarget2 == suggestedTarget2)&&(identical(other.lotSize, lotSize) || other.lotSize == lotSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,ltp,changePct,open,close,volume,signal,suggestedAction,suggestedSL,suggestedTarget,suggestedTarget2,lotSize);

@override
String toString() {
  return 'ScreenerStock(symbol: $symbol, exchange: $exchange, ltp: $ltp, changePct: $changePct, open: $open, close: $close, volume: $volume, signal: $signal, suggestedAction: $suggestedAction, suggestedSL: $suggestedSL, suggestedTarget: $suggestedTarget, suggestedTarget2: $suggestedTarget2, lotSize: $lotSize)';
}


}

/// @nodoc
abstract mixin class $ScreenerStockCopyWith<$Res>  {
  factory $ScreenerStockCopyWith(ScreenerStock value, $Res Function(ScreenerStock) _then) = _$ScreenerStockCopyWithImpl;
@useResult
$Res call({
 String symbol, String exchange, double ltp, double changePct, double open, double close, double volume, String signal, String suggestedAction, double suggestedSL,@JsonKey(name: 'suggestedTarget1') double suggestedTarget, double suggestedTarget2, int lotSize
});




}
/// @nodoc
class _$ScreenerStockCopyWithImpl<$Res>
    implements $ScreenerStockCopyWith<$Res> {
  _$ScreenerStockCopyWithImpl(this._self, this._then);

  final ScreenerStock _self;
  final $Res Function(ScreenerStock) _then;

/// Create a copy of ScreenerStock
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = null,Object? ltp = null,Object? changePct = null,Object? open = null,Object? close = null,Object? volume = null,Object? signal = null,Object? suggestedAction = null,Object? suggestedSL = null,Object? suggestedTarget = null,Object? suggestedTarget2 = null,Object? lotSize = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,changePct: null == changePct ? _self.changePct : changePct // ignore: cast_nullable_to_non_nullable
as double,open: null == open ? _self.open : open // ignore: cast_nullable_to_non_nullable
as double,close: null == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double,volume: null == volume ? _self.volume : volume // ignore: cast_nullable_to_non_nullable
as double,signal: null == signal ? _self.signal : signal // ignore: cast_nullable_to_non_nullable
as String,suggestedAction: null == suggestedAction ? _self.suggestedAction : suggestedAction // ignore: cast_nullable_to_non_nullable
as String,suggestedSL: null == suggestedSL ? _self.suggestedSL : suggestedSL // ignore: cast_nullable_to_non_nullable
as double,suggestedTarget: null == suggestedTarget ? _self.suggestedTarget : suggestedTarget // ignore: cast_nullable_to_non_nullable
as double,suggestedTarget2: null == suggestedTarget2 ? _self.suggestedTarget2 : suggestedTarget2 // ignore: cast_nullable_to_non_nullable
as double,lotSize: null == lotSize ? _self.lotSize : lotSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [ScreenerStock].
extension ScreenerStockPatterns on ScreenerStock {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ScreenerStock value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ScreenerStock() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ScreenerStock value)  $default,){
final _that = this;
switch (_that) {
case _ScreenerStock():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ScreenerStock value)?  $default,){
final _that = this;
switch (_that) {
case _ScreenerStock() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String exchange,  double ltp,  double changePct,  double open,  double close,  double volume,  String signal,  String suggestedAction,  double suggestedSL, @JsonKey(name: 'suggestedTarget1')  double suggestedTarget,  double suggestedTarget2,  int lotSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ScreenerStock() when $default != null:
return $default(_that.symbol,_that.exchange,_that.ltp,_that.changePct,_that.open,_that.close,_that.volume,_that.signal,_that.suggestedAction,_that.suggestedSL,_that.suggestedTarget,_that.suggestedTarget2,_that.lotSize);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String exchange,  double ltp,  double changePct,  double open,  double close,  double volume,  String signal,  String suggestedAction,  double suggestedSL, @JsonKey(name: 'suggestedTarget1')  double suggestedTarget,  double suggestedTarget2,  int lotSize)  $default,) {final _that = this;
switch (_that) {
case _ScreenerStock():
return $default(_that.symbol,_that.exchange,_that.ltp,_that.changePct,_that.open,_that.close,_that.volume,_that.signal,_that.suggestedAction,_that.suggestedSL,_that.suggestedTarget,_that.suggestedTarget2,_that.lotSize);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String exchange,  double ltp,  double changePct,  double open,  double close,  double volume,  String signal,  String suggestedAction,  double suggestedSL, @JsonKey(name: 'suggestedTarget1')  double suggestedTarget,  double suggestedTarget2,  int lotSize)?  $default,) {final _that = this;
switch (_that) {
case _ScreenerStock() when $default != null:
return $default(_that.symbol,_that.exchange,_that.ltp,_that.changePct,_that.open,_that.close,_that.volume,_that.signal,_that.suggestedAction,_that.suggestedSL,_that.suggestedTarget,_that.suggestedTarget2,_that.lotSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ScreenerStock implements ScreenerStock {
  const _ScreenerStock({required this.symbol, this.exchange = 'NSE', this.ltp = 0, this.changePct = 0, this.open = 0, this.close = 0, this.volume = 0, this.signal = 'NEUTRAL', this.suggestedAction = 'WATCH', this.suggestedSL = 0, @JsonKey(name: 'suggestedTarget1') this.suggestedTarget = 0, this.suggestedTarget2 = 0, this.lotSize = 1});
  factory _ScreenerStock.fromJson(Map<String, dynamic> json) => _$ScreenerStockFromJson(json);

@override final  String symbol;
@override@JsonKey() final  String exchange;
@override@JsonKey() final  double ltp;
@override@JsonKey() final  double changePct;
@override@JsonKey() final  double open;
@override@JsonKey() final  double close;
@override@JsonKey() final  double volume;
@override@JsonKey() final  String signal;
@override@JsonKey() final  String suggestedAction;
@override@JsonKey() final  double suggestedSL;
@override@JsonKey(name: 'suggestedTarget1') final  double suggestedTarget;
@override@JsonKey() final  double suggestedTarget2;
@override@JsonKey() final  int lotSize;

/// Create a copy of ScreenerStock
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ScreenerStockCopyWith<_ScreenerStock> get copyWith => __$ScreenerStockCopyWithImpl<_ScreenerStock>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ScreenerStockToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ScreenerStock&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.changePct, changePct) || other.changePct == changePct)&&(identical(other.open, open) || other.open == open)&&(identical(other.close, close) || other.close == close)&&(identical(other.volume, volume) || other.volume == volume)&&(identical(other.signal, signal) || other.signal == signal)&&(identical(other.suggestedAction, suggestedAction) || other.suggestedAction == suggestedAction)&&(identical(other.suggestedSL, suggestedSL) || other.suggestedSL == suggestedSL)&&(identical(other.suggestedTarget, suggestedTarget) || other.suggestedTarget == suggestedTarget)&&(identical(other.suggestedTarget2, suggestedTarget2) || other.suggestedTarget2 == suggestedTarget2)&&(identical(other.lotSize, lotSize) || other.lotSize == lotSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,ltp,changePct,open,close,volume,signal,suggestedAction,suggestedSL,suggestedTarget,suggestedTarget2,lotSize);

@override
String toString() {
  return 'ScreenerStock(symbol: $symbol, exchange: $exchange, ltp: $ltp, changePct: $changePct, open: $open, close: $close, volume: $volume, signal: $signal, suggestedAction: $suggestedAction, suggestedSL: $suggestedSL, suggestedTarget: $suggestedTarget, suggestedTarget2: $suggestedTarget2, lotSize: $lotSize)';
}


}

/// @nodoc
abstract mixin class _$ScreenerStockCopyWith<$Res> implements $ScreenerStockCopyWith<$Res> {
  factory _$ScreenerStockCopyWith(_ScreenerStock value, $Res Function(_ScreenerStock) _then) = __$ScreenerStockCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String exchange, double ltp, double changePct, double open, double close, double volume, String signal, String suggestedAction, double suggestedSL,@JsonKey(name: 'suggestedTarget1') double suggestedTarget, double suggestedTarget2, int lotSize
});




}
/// @nodoc
class __$ScreenerStockCopyWithImpl<$Res>
    implements _$ScreenerStockCopyWith<$Res> {
  __$ScreenerStockCopyWithImpl(this._self, this._then);

  final _ScreenerStock _self;
  final $Res Function(_ScreenerStock) _then;

/// Create a copy of ScreenerStock
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = null,Object? ltp = null,Object? changePct = null,Object? open = null,Object? close = null,Object? volume = null,Object? signal = null,Object? suggestedAction = null,Object? suggestedSL = null,Object? suggestedTarget = null,Object? suggestedTarget2 = null,Object? lotSize = null,}) {
  return _then(_ScreenerStock(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,changePct: null == changePct ? _self.changePct : changePct // ignore: cast_nullable_to_non_nullable
as double,open: null == open ? _self.open : open // ignore: cast_nullable_to_non_nullable
as double,close: null == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double,volume: null == volume ? _self.volume : volume // ignore: cast_nullable_to_non_nullable
as double,signal: null == signal ? _self.signal : signal // ignore: cast_nullable_to_non_nullable
as String,suggestedAction: null == suggestedAction ? _self.suggestedAction : suggestedAction // ignore: cast_nullable_to_non_nullable
as String,suggestedSL: null == suggestedSL ? _self.suggestedSL : suggestedSL // ignore: cast_nullable_to_non_nullable
as double,suggestedTarget: null == suggestedTarget ? _self.suggestedTarget : suggestedTarget // ignore: cast_nullable_to_non_nullable
as double,suggestedTarget2: null == suggestedTarget2 ? _self.suggestedTarget2 : suggestedTarget2 // ignore: cast_nullable_to_non_nullable
as double,lotSize: null == lotSize ? _self.lotSize : lotSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$MoveAlertsData {

 String? get day; String? get status; String? get updatedAt; List<MoveAlert> get alerts;
/// Create a copy of MoveAlertsData
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MoveAlertsDataCopyWith<MoveAlertsData> get copyWith => _$MoveAlertsDataCopyWithImpl<MoveAlertsData>(this as MoveAlertsData, _$identity);

  /// Serializes this MoveAlertsData to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MoveAlertsData&&(identical(other.day, day) || other.day == day)&&(identical(other.status, status) || other.status == status)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other.alerts, alerts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,day,status,updatedAt,const DeepCollectionEquality().hash(alerts));

@override
String toString() {
  return 'MoveAlertsData(day: $day, status: $status, updatedAt: $updatedAt, alerts: $alerts)';
}


}

/// @nodoc
abstract mixin class $MoveAlertsDataCopyWith<$Res>  {
  factory $MoveAlertsDataCopyWith(MoveAlertsData value, $Res Function(MoveAlertsData) _then) = _$MoveAlertsDataCopyWithImpl;
@useResult
$Res call({
 String? day, String? status, String? updatedAt, List<MoveAlert> alerts
});




}
/// @nodoc
class _$MoveAlertsDataCopyWithImpl<$Res>
    implements $MoveAlertsDataCopyWith<$Res> {
  _$MoveAlertsDataCopyWithImpl(this._self, this._then);

  final MoveAlertsData _self;
  final $Res Function(MoveAlertsData) _then;

/// Create a copy of MoveAlertsData
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? day = freezed,Object? status = freezed,Object? updatedAt = freezed,Object? alerts = null,}) {
  return _then(_self.copyWith(
day: freezed == day ? _self.day : day // ignore: cast_nullable_to_non_nullable
as String?,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String?,updatedAt: freezed == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String?,alerts: null == alerts ? _self.alerts : alerts // ignore: cast_nullable_to_non_nullable
as List<MoveAlert>,
  ));
}

}


/// Adds pattern-matching-related methods to [MoveAlertsData].
extension MoveAlertsDataPatterns on MoveAlertsData {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MoveAlertsData value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MoveAlertsData() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MoveAlertsData value)  $default,){
final _that = this;
switch (_that) {
case _MoveAlertsData():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MoveAlertsData value)?  $default,){
final _that = this;
switch (_that) {
case _MoveAlertsData() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? day,  String? status,  String? updatedAt,  List<MoveAlert> alerts)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MoveAlertsData() when $default != null:
return $default(_that.day,_that.status,_that.updatedAt,_that.alerts);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? day,  String? status,  String? updatedAt,  List<MoveAlert> alerts)  $default,) {final _that = this;
switch (_that) {
case _MoveAlertsData():
return $default(_that.day,_that.status,_that.updatedAt,_that.alerts);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? day,  String? status,  String? updatedAt,  List<MoveAlert> alerts)?  $default,) {final _that = this;
switch (_that) {
case _MoveAlertsData() when $default != null:
return $default(_that.day,_that.status,_that.updatedAt,_that.alerts);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MoveAlertsData implements MoveAlertsData {
  const _MoveAlertsData({this.day, this.status, this.updatedAt, final  List<MoveAlert> alerts = const []}): _alerts = alerts;
  factory _MoveAlertsData.fromJson(Map<String, dynamic> json) => _$MoveAlertsDataFromJson(json);

@override final  String? day;
@override final  String? status;
@override final  String? updatedAt;
 final  List<MoveAlert> _alerts;
@override@JsonKey() List<MoveAlert> get alerts {
  if (_alerts is EqualUnmodifiableListView) return _alerts;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alerts);
}


/// Create a copy of MoveAlertsData
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MoveAlertsDataCopyWith<_MoveAlertsData> get copyWith => __$MoveAlertsDataCopyWithImpl<_MoveAlertsData>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MoveAlertsDataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MoveAlertsData&&(identical(other.day, day) || other.day == day)&&(identical(other.status, status) || other.status == status)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&const DeepCollectionEquality().equals(other._alerts, _alerts));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,day,status,updatedAt,const DeepCollectionEquality().hash(_alerts));

@override
String toString() {
  return 'MoveAlertsData(day: $day, status: $status, updatedAt: $updatedAt, alerts: $alerts)';
}


}

/// @nodoc
abstract mixin class _$MoveAlertsDataCopyWith<$Res> implements $MoveAlertsDataCopyWith<$Res> {
  factory _$MoveAlertsDataCopyWith(_MoveAlertsData value, $Res Function(_MoveAlertsData) _then) = __$MoveAlertsDataCopyWithImpl;
@override @useResult
$Res call({
 String? day, String? status, String? updatedAt, List<MoveAlert> alerts
});




}
/// @nodoc
class __$MoveAlertsDataCopyWithImpl<$Res>
    implements _$MoveAlertsDataCopyWith<$Res> {
  __$MoveAlertsDataCopyWithImpl(this._self, this._then);

  final _MoveAlertsData _self;
  final $Res Function(_MoveAlertsData) _then;

/// Create a copy of MoveAlertsData
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? day = freezed,Object? status = freezed,Object? updatedAt = freezed,Object? alerts = null,}) {
  return _then(_MoveAlertsData(
day: freezed == day ? _self.day : day // ignore: cast_nullable_to_non_nullable
as String?,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String?,updatedAt: freezed == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as String?,alerts: null == alerts ? _self._alerts : alerts // ignore: cast_nullable_to_non_nullable
as List<MoveAlert>,
  ));
}


}


/// @nodoc
mixin _$MoveAlert {

 String get id; String get symbol; String get type; String get hhmm; String get text; double get level; double get ltp; double get changePct; double get volPace; double get stopRef;
/// Create a copy of MoveAlert
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MoveAlertCopyWith<MoveAlert> get copyWith => _$MoveAlertCopyWithImpl<MoveAlert>(this as MoveAlert, _$identity);

  /// Serializes this MoveAlert to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MoveAlert&&(identical(other.id, id) || other.id == id)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.type, type) || other.type == type)&&(identical(other.hhmm, hhmm) || other.hhmm == hhmm)&&(identical(other.text, text) || other.text == text)&&(identical(other.level, level) || other.level == level)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.changePct, changePct) || other.changePct == changePct)&&(identical(other.volPace, volPace) || other.volPace == volPace)&&(identical(other.stopRef, stopRef) || other.stopRef == stopRef));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,symbol,type,hhmm,text,level,ltp,changePct,volPace,stopRef);

@override
String toString() {
  return 'MoveAlert(id: $id, symbol: $symbol, type: $type, hhmm: $hhmm, text: $text, level: $level, ltp: $ltp, changePct: $changePct, volPace: $volPace, stopRef: $stopRef)';
}


}

/// @nodoc
abstract mixin class $MoveAlertCopyWith<$Res>  {
  factory $MoveAlertCopyWith(MoveAlert value, $Res Function(MoveAlert) _then) = _$MoveAlertCopyWithImpl;
@useResult
$Res call({
 String id, String symbol, String type, String hhmm, String text, double level, double ltp, double changePct, double volPace, double stopRef
});




}
/// @nodoc
class _$MoveAlertCopyWithImpl<$Res>
    implements $MoveAlertCopyWith<$Res> {
  _$MoveAlertCopyWithImpl(this._self, this._then);

  final MoveAlert _self;
  final $Res Function(MoveAlert) _then;

/// Create a copy of MoveAlert
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? symbol = null,Object? type = null,Object? hhmm = null,Object? text = null,Object? level = null,Object? ltp = null,Object? changePct = null,Object? volPace = null,Object? stopRef = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,hhmm: null == hhmm ? _self.hhmm : hhmm // ignore: cast_nullable_to_non_nullable
as String,text: null == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String,level: null == level ? _self.level : level // ignore: cast_nullable_to_non_nullable
as double,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,changePct: null == changePct ? _self.changePct : changePct // ignore: cast_nullable_to_non_nullable
as double,volPace: null == volPace ? _self.volPace : volPace // ignore: cast_nullable_to_non_nullable
as double,stopRef: null == stopRef ? _self.stopRef : stopRef // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [MoveAlert].
extension MoveAlertPatterns on MoveAlert {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MoveAlert value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MoveAlert() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MoveAlert value)  $default,){
final _that = this;
switch (_that) {
case _MoveAlert():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MoveAlert value)?  $default,){
final _that = this;
switch (_that) {
case _MoveAlert() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String symbol,  String type,  String hhmm,  String text,  double level,  double ltp,  double changePct,  double volPace,  double stopRef)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MoveAlert() when $default != null:
return $default(_that.id,_that.symbol,_that.type,_that.hhmm,_that.text,_that.level,_that.ltp,_that.changePct,_that.volPace,_that.stopRef);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String symbol,  String type,  String hhmm,  String text,  double level,  double ltp,  double changePct,  double volPace,  double stopRef)  $default,) {final _that = this;
switch (_that) {
case _MoveAlert():
return $default(_that.id,_that.symbol,_that.type,_that.hhmm,_that.text,_that.level,_that.ltp,_that.changePct,_that.volPace,_that.stopRef);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String symbol,  String type,  String hhmm,  String text,  double level,  double ltp,  double changePct,  double volPace,  double stopRef)?  $default,) {final _that = this;
switch (_that) {
case _MoveAlert() when $default != null:
return $default(_that.id,_that.symbol,_that.type,_that.hhmm,_that.text,_that.level,_that.ltp,_that.changePct,_that.volPace,_that.stopRef);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MoveAlert implements MoveAlert {
  const _MoveAlert({required this.id, required this.symbol, required this.type, this.hhmm = '', this.text = '', this.level = 0, this.ltp = 0, this.changePct = 0, this.volPace = 0, this.stopRef = 0});
  factory _MoveAlert.fromJson(Map<String, dynamic> json) => _$MoveAlertFromJson(json);

@override final  String id;
@override final  String symbol;
@override final  String type;
@override@JsonKey() final  String hhmm;
@override@JsonKey() final  String text;
@override@JsonKey() final  double level;
@override@JsonKey() final  double ltp;
@override@JsonKey() final  double changePct;
@override@JsonKey() final  double volPace;
@override@JsonKey() final  double stopRef;

/// Create a copy of MoveAlert
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MoveAlertCopyWith<_MoveAlert> get copyWith => __$MoveAlertCopyWithImpl<_MoveAlert>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MoveAlertToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MoveAlert&&(identical(other.id, id) || other.id == id)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.type, type) || other.type == type)&&(identical(other.hhmm, hhmm) || other.hhmm == hhmm)&&(identical(other.text, text) || other.text == text)&&(identical(other.level, level) || other.level == level)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.changePct, changePct) || other.changePct == changePct)&&(identical(other.volPace, volPace) || other.volPace == volPace)&&(identical(other.stopRef, stopRef) || other.stopRef == stopRef));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,symbol,type,hhmm,text,level,ltp,changePct,volPace,stopRef);

@override
String toString() {
  return 'MoveAlert(id: $id, symbol: $symbol, type: $type, hhmm: $hhmm, text: $text, level: $level, ltp: $ltp, changePct: $changePct, volPace: $volPace, stopRef: $stopRef)';
}


}

/// @nodoc
abstract mixin class _$MoveAlertCopyWith<$Res> implements $MoveAlertCopyWith<$Res> {
  factory _$MoveAlertCopyWith(_MoveAlert value, $Res Function(_MoveAlert) _then) = __$MoveAlertCopyWithImpl;
@override @useResult
$Res call({
 String id, String symbol, String type, String hhmm, String text, double level, double ltp, double changePct, double volPace, double stopRef
});




}
/// @nodoc
class __$MoveAlertCopyWithImpl<$Res>
    implements _$MoveAlertCopyWith<$Res> {
  __$MoveAlertCopyWithImpl(this._self, this._then);

  final _MoveAlert _self;
  final $Res Function(_MoveAlert) _then;

/// Create a copy of MoveAlert
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? symbol = null,Object? type = null,Object? hhmm = null,Object? text = null,Object? level = null,Object? ltp = null,Object? changePct = null,Object? volPace = null,Object? stopRef = null,}) {
  return _then(_MoveAlert(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as String,hhmm: null == hhmm ? _self.hhmm : hhmm // ignore: cast_nullable_to_non_nullable
as String,text: null == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String,level: null == level ? _self.level : level // ignore: cast_nullable_to_non_nullable
as double,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,changePct: null == changePct ? _self.changePct : changePct // ignore: cast_nullable_to_non_nullable
as double,volPace: null == volPace ? _self.volPace : volPace // ignore: cast_nullable_to_non_nullable
as double,stopRef: null == stopRef ? _self.stopRef : stopRef // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$SwingScan {

 String? get id; String? get scannedAt; bool get isScanning; int get totalScanned; int get totalResults; int get page; int get totalPages; List<SwingResult> get results;
/// Create a copy of SwingScan
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SwingScanCopyWith<SwingScan> get copyWith => _$SwingScanCopyWithImpl<SwingScan>(this as SwingScan, _$identity);

  /// Serializes this SwingScan to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SwingScan&&(identical(other.id, id) || other.id == id)&&(identical(other.scannedAt, scannedAt) || other.scannedAt == scannedAt)&&(identical(other.isScanning, isScanning) || other.isScanning == isScanning)&&(identical(other.totalScanned, totalScanned) || other.totalScanned == totalScanned)&&(identical(other.totalResults, totalResults) || other.totalResults == totalResults)&&(identical(other.page, page) || other.page == page)&&(identical(other.totalPages, totalPages) || other.totalPages == totalPages)&&const DeepCollectionEquality().equals(other.results, results));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,scannedAt,isScanning,totalScanned,totalResults,page,totalPages,const DeepCollectionEquality().hash(results));

@override
String toString() {
  return 'SwingScan(id: $id, scannedAt: $scannedAt, isScanning: $isScanning, totalScanned: $totalScanned, totalResults: $totalResults, page: $page, totalPages: $totalPages, results: $results)';
}


}

/// @nodoc
abstract mixin class $SwingScanCopyWith<$Res>  {
  factory $SwingScanCopyWith(SwingScan value, $Res Function(SwingScan) _then) = _$SwingScanCopyWithImpl;
@useResult
$Res call({
 String? id, String? scannedAt, bool isScanning, int totalScanned, int totalResults, int page, int totalPages, List<SwingResult> results
});




}
/// @nodoc
class _$SwingScanCopyWithImpl<$Res>
    implements $SwingScanCopyWith<$Res> {
  _$SwingScanCopyWithImpl(this._self, this._then);

  final SwingScan _self;
  final $Res Function(SwingScan) _then;

/// Create a copy of SwingScan
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = freezed,Object? scannedAt = freezed,Object? isScanning = null,Object? totalScanned = null,Object? totalResults = null,Object? page = null,Object? totalPages = null,Object? results = null,}) {
  return _then(_self.copyWith(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,scannedAt: freezed == scannedAt ? _self.scannedAt : scannedAt // ignore: cast_nullable_to_non_nullable
as String?,isScanning: null == isScanning ? _self.isScanning : isScanning // ignore: cast_nullable_to_non_nullable
as bool,totalScanned: null == totalScanned ? _self.totalScanned : totalScanned // ignore: cast_nullable_to_non_nullable
as int,totalResults: null == totalResults ? _self.totalResults : totalResults // ignore: cast_nullable_to_non_nullable
as int,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,totalPages: null == totalPages ? _self.totalPages : totalPages // ignore: cast_nullable_to_non_nullable
as int,results: null == results ? _self.results : results // ignore: cast_nullable_to_non_nullable
as List<SwingResult>,
  ));
}

}


/// Adds pattern-matching-related methods to [SwingScan].
extension SwingScanPatterns on SwingScan {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SwingScan value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SwingScan() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SwingScan value)  $default,){
final _that = this;
switch (_that) {
case _SwingScan():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SwingScan value)?  $default,){
final _that = this;
switch (_that) {
case _SwingScan() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? id,  String? scannedAt,  bool isScanning,  int totalScanned,  int totalResults,  int page,  int totalPages,  List<SwingResult> results)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SwingScan() when $default != null:
return $default(_that.id,_that.scannedAt,_that.isScanning,_that.totalScanned,_that.totalResults,_that.page,_that.totalPages,_that.results);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? id,  String? scannedAt,  bool isScanning,  int totalScanned,  int totalResults,  int page,  int totalPages,  List<SwingResult> results)  $default,) {final _that = this;
switch (_that) {
case _SwingScan():
return $default(_that.id,_that.scannedAt,_that.isScanning,_that.totalScanned,_that.totalResults,_that.page,_that.totalPages,_that.results);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? id,  String? scannedAt,  bool isScanning,  int totalScanned,  int totalResults,  int page,  int totalPages,  List<SwingResult> results)?  $default,) {final _that = this;
switch (_that) {
case _SwingScan() when $default != null:
return $default(_that.id,_that.scannedAt,_that.isScanning,_that.totalScanned,_that.totalResults,_that.page,_that.totalPages,_that.results);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SwingScan implements SwingScan {
  const _SwingScan({this.id, this.scannedAt, this.isScanning = false, this.totalScanned = 0, this.totalResults = 0, this.page = 1, this.totalPages = 1, final  List<SwingResult> results = const []}): _results = results;
  factory _SwingScan.fromJson(Map<String, dynamic> json) => _$SwingScanFromJson(json);

@override final  String? id;
@override final  String? scannedAt;
@override@JsonKey() final  bool isScanning;
@override@JsonKey() final  int totalScanned;
@override@JsonKey() final  int totalResults;
@override@JsonKey() final  int page;
@override@JsonKey() final  int totalPages;
 final  List<SwingResult> _results;
@override@JsonKey() List<SwingResult> get results {
  if (_results is EqualUnmodifiableListView) return _results;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_results);
}


/// Create a copy of SwingScan
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SwingScanCopyWith<_SwingScan> get copyWith => __$SwingScanCopyWithImpl<_SwingScan>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SwingScanToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SwingScan&&(identical(other.id, id) || other.id == id)&&(identical(other.scannedAt, scannedAt) || other.scannedAt == scannedAt)&&(identical(other.isScanning, isScanning) || other.isScanning == isScanning)&&(identical(other.totalScanned, totalScanned) || other.totalScanned == totalScanned)&&(identical(other.totalResults, totalResults) || other.totalResults == totalResults)&&(identical(other.page, page) || other.page == page)&&(identical(other.totalPages, totalPages) || other.totalPages == totalPages)&&const DeepCollectionEquality().equals(other._results, _results));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,scannedAt,isScanning,totalScanned,totalResults,page,totalPages,const DeepCollectionEquality().hash(_results));

@override
String toString() {
  return 'SwingScan(id: $id, scannedAt: $scannedAt, isScanning: $isScanning, totalScanned: $totalScanned, totalResults: $totalResults, page: $page, totalPages: $totalPages, results: $results)';
}


}

/// @nodoc
abstract mixin class _$SwingScanCopyWith<$Res> implements $SwingScanCopyWith<$Res> {
  factory _$SwingScanCopyWith(_SwingScan value, $Res Function(_SwingScan) _then) = __$SwingScanCopyWithImpl;
@override @useResult
$Res call({
 String? id, String? scannedAt, bool isScanning, int totalScanned, int totalResults, int page, int totalPages, List<SwingResult> results
});




}
/// @nodoc
class __$SwingScanCopyWithImpl<$Res>
    implements _$SwingScanCopyWith<$Res> {
  __$SwingScanCopyWithImpl(this._self, this._then);

  final _SwingScan _self;
  final $Res Function(_SwingScan) _then;

/// Create a copy of SwingScan
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = freezed,Object? scannedAt = freezed,Object? isScanning = null,Object? totalScanned = null,Object? totalResults = null,Object? page = null,Object? totalPages = null,Object? results = null,}) {
  return _then(_SwingScan(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,scannedAt: freezed == scannedAt ? _self.scannedAt : scannedAt // ignore: cast_nullable_to_non_nullable
as String?,isScanning: null == isScanning ? _self.isScanning : isScanning // ignore: cast_nullable_to_non_nullable
as bool,totalScanned: null == totalScanned ? _self.totalScanned : totalScanned // ignore: cast_nullable_to_non_nullable
as int,totalResults: null == totalResults ? _self.totalResults : totalResults // ignore: cast_nullable_to_non_nullable
as int,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,totalPages: null == totalPages ? _self.totalPages : totalPages // ignore: cast_nullable_to_non_nullable
as int,results: null == results ? _self._results : results // ignore: cast_nullable_to_non_nullable
as List<SwingResult>,
  ));
}


}


/// @nodoc
mixin _$SwingResult {

 String get symbol; String get exchange; String get pattern; double get score; String get confidence; double get currentPrice; double get entryPrice; double get stopLoss; double get target1; double get target2; double get riskReward; double get riskPct; String? get direction; List<String> get notes;
/// Create a copy of SwingResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SwingResultCopyWith<SwingResult> get copyWith => _$SwingResultCopyWithImpl<SwingResult>(this as SwingResult, _$identity);

  /// Serializes this SwingResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SwingResult&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.pattern, pattern) || other.pattern == pattern)&&(identical(other.score, score) || other.score == score)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.currentPrice, currentPrice) || other.currentPrice == currentPrice)&&(identical(other.entryPrice, entryPrice) || other.entryPrice == entryPrice)&&(identical(other.stopLoss, stopLoss) || other.stopLoss == stopLoss)&&(identical(other.target1, target1) || other.target1 == target1)&&(identical(other.target2, target2) || other.target2 == target2)&&(identical(other.riskReward, riskReward) || other.riskReward == riskReward)&&(identical(other.riskPct, riskPct) || other.riskPct == riskPct)&&(identical(other.direction, direction) || other.direction == direction)&&const DeepCollectionEquality().equals(other.notes, notes));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,pattern,score,confidence,currentPrice,entryPrice,stopLoss,target1,target2,riskReward,riskPct,direction,const DeepCollectionEquality().hash(notes));

@override
String toString() {
  return 'SwingResult(symbol: $symbol, exchange: $exchange, pattern: $pattern, score: $score, confidence: $confidence, currentPrice: $currentPrice, entryPrice: $entryPrice, stopLoss: $stopLoss, target1: $target1, target2: $target2, riskReward: $riskReward, riskPct: $riskPct, direction: $direction, notes: $notes)';
}


}

/// @nodoc
abstract mixin class $SwingResultCopyWith<$Res>  {
  factory $SwingResultCopyWith(SwingResult value, $Res Function(SwingResult) _then) = _$SwingResultCopyWithImpl;
@useResult
$Res call({
 String symbol, String exchange, String pattern, double score, String confidence, double currentPrice, double entryPrice, double stopLoss, double target1, double target2, double riskReward, double riskPct, String? direction, List<String> notes
});




}
/// @nodoc
class _$SwingResultCopyWithImpl<$Res>
    implements $SwingResultCopyWith<$Res> {
  _$SwingResultCopyWithImpl(this._self, this._then);

  final SwingResult _self;
  final $Res Function(SwingResult) _then;

/// Create a copy of SwingResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = null,Object? pattern = null,Object? score = null,Object? confidence = null,Object? currentPrice = null,Object? entryPrice = null,Object? stopLoss = null,Object? target1 = null,Object? target2 = null,Object? riskReward = null,Object? riskPct = null,Object? direction = freezed,Object? notes = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,pattern: null == pattern ? _self.pattern : pattern // ignore: cast_nullable_to_non_nullable
as String,score: null == score ? _self.score : score // ignore: cast_nullable_to_non_nullable
as double,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as String,currentPrice: null == currentPrice ? _self.currentPrice : currentPrice // ignore: cast_nullable_to_non_nullable
as double,entryPrice: null == entryPrice ? _self.entryPrice : entryPrice // ignore: cast_nullable_to_non_nullable
as double,stopLoss: null == stopLoss ? _self.stopLoss : stopLoss // ignore: cast_nullable_to_non_nullable
as double,target1: null == target1 ? _self.target1 : target1 // ignore: cast_nullable_to_non_nullable
as double,target2: null == target2 ? _self.target2 : target2 // ignore: cast_nullable_to_non_nullable
as double,riskReward: null == riskReward ? _self.riskReward : riskReward // ignore: cast_nullable_to_non_nullable
as double,riskPct: null == riskPct ? _self.riskPct : riskPct // ignore: cast_nullable_to_non_nullable
as double,direction: freezed == direction ? _self.direction : direction // ignore: cast_nullable_to_non_nullable
as String?,notes: null == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as List<String>,
  ));
}

}


/// Adds pattern-matching-related methods to [SwingResult].
extension SwingResultPatterns on SwingResult {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SwingResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SwingResult() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SwingResult value)  $default,){
final _that = this;
switch (_that) {
case _SwingResult():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SwingResult value)?  $default,){
final _that = this;
switch (_that) {
case _SwingResult() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String exchange,  String pattern,  double score,  String confidence,  double currentPrice,  double entryPrice,  double stopLoss,  double target1,  double target2,  double riskReward,  double riskPct,  String? direction,  List<String> notes)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SwingResult() when $default != null:
return $default(_that.symbol,_that.exchange,_that.pattern,_that.score,_that.confidence,_that.currentPrice,_that.entryPrice,_that.stopLoss,_that.target1,_that.target2,_that.riskReward,_that.riskPct,_that.direction,_that.notes);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String exchange,  String pattern,  double score,  String confidence,  double currentPrice,  double entryPrice,  double stopLoss,  double target1,  double target2,  double riskReward,  double riskPct,  String? direction,  List<String> notes)  $default,) {final _that = this;
switch (_that) {
case _SwingResult():
return $default(_that.symbol,_that.exchange,_that.pattern,_that.score,_that.confidence,_that.currentPrice,_that.entryPrice,_that.stopLoss,_that.target1,_that.target2,_that.riskReward,_that.riskPct,_that.direction,_that.notes);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String exchange,  String pattern,  double score,  String confidence,  double currentPrice,  double entryPrice,  double stopLoss,  double target1,  double target2,  double riskReward,  double riskPct,  String? direction,  List<String> notes)?  $default,) {final _that = this;
switch (_that) {
case _SwingResult() when $default != null:
return $default(_that.symbol,_that.exchange,_that.pattern,_that.score,_that.confidence,_that.currentPrice,_that.entryPrice,_that.stopLoss,_that.target1,_that.target2,_that.riskReward,_that.riskPct,_that.direction,_that.notes);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SwingResult implements SwingResult {
  const _SwingResult({required this.symbol, this.exchange = 'NSE', required this.pattern, this.score = 0, this.confidence = '', this.currentPrice = 0, this.entryPrice = 0, this.stopLoss = 0, this.target1 = 0, this.target2 = 0, this.riskReward = 0, this.riskPct = 0, this.direction, final  List<String> notes = const []}): _notes = notes;
  factory _SwingResult.fromJson(Map<String, dynamic> json) => _$SwingResultFromJson(json);

@override final  String symbol;
@override@JsonKey() final  String exchange;
@override final  String pattern;
@override@JsonKey() final  double score;
@override@JsonKey() final  String confidence;
@override@JsonKey() final  double currentPrice;
@override@JsonKey() final  double entryPrice;
@override@JsonKey() final  double stopLoss;
@override@JsonKey() final  double target1;
@override@JsonKey() final  double target2;
@override@JsonKey() final  double riskReward;
@override@JsonKey() final  double riskPct;
@override final  String? direction;
 final  List<String> _notes;
@override@JsonKey() List<String> get notes {
  if (_notes is EqualUnmodifiableListView) return _notes;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_notes);
}


/// Create a copy of SwingResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SwingResultCopyWith<_SwingResult> get copyWith => __$SwingResultCopyWithImpl<_SwingResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SwingResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SwingResult&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.pattern, pattern) || other.pattern == pattern)&&(identical(other.score, score) || other.score == score)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.currentPrice, currentPrice) || other.currentPrice == currentPrice)&&(identical(other.entryPrice, entryPrice) || other.entryPrice == entryPrice)&&(identical(other.stopLoss, stopLoss) || other.stopLoss == stopLoss)&&(identical(other.target1, target1) || other.target1 == target1)&&(identical(other.target2, target2) || other.target2 == target2)&&(identical(other.riskReward, riskReward) || other.riskReward == riskReward)&&(identical(other.riskPct, riskPct) || other.riskPct == riskPct)&&(identical(other.direction, direction) || other.direction == direction)&&const DeepCollectionEquality().equals(other._notes, _notes));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,pattern,score,confidence,currentPrice,entryPrice,stopLoss,target1,target2,riskReward,riskPct,direction,const DeepCollectionEquality().hash(_notes));

@override
String toString() {
  return 'SwingResult(symbol: $symbol, exchange: $exchange, pattern: $pattern, score: $score, confidence: $confidence, currentPrice: $currentPrice, entryPrice: $entryPrice, stopLoss: $stopLoss, target1: $target1, target2: $target2, riskReward: $riskReward, riskPct: $riskPct, direction: $direction, notes: $notes)';
}


}

/// @nodoc
abstract mixin class _$SwingResultCopyWith<$Res> implements $SwingResultCopyWith<$Res> {
  factory _$SwingResultCopyWith(_SwingResult value, $Res Function(_SwingResult) _then) = __$SwingResultCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String exchange, String pattern, double score, String confidence, double currentPrice, double entryPrice, double stopLoss, double target1, double target2, double riskReward, double riskPct, String? direction, List<String> notes
});




}
/// @nodoc
class __$SwingResultCopyWithImpl<$Res>
    implements _$SwingResultCopyWith<$Res> {
  __$SwingResultCopyWithImpl(this._self, this._then);

  final _SwingResult _self;
  final $Res Function(_SwingResult) _then;

/// Create a copy of SwingResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = null,Object? pattern = null,Object? score = null,Object? confidence = null,Object? currentPrice = null,Object? entryPrice = null,Object? stopLoss = null,Object? target1 = null,Object? target2 = null,Object? riskReward = null,Object? riskPct = null,Object? direction = freezed,Object? notes = null,}) {
  return _then(_SwingResult(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,pattern: null == pattern ? _self.pattern : pattern // ignore: cast_nullable_to_non_nullable
as String,score: null == score ? _self.score : score // ignore: cast_nullable_to_non_nullable
as double,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as String,currentPrice: null == currentPrice ? _self.currentPrice : currentPrice // ignore: cast_nullable_to_non_nullable
as double,entryPrice: null == entryPrice ? _self.entryPrice : entryPrice // ignore: cast_nullable_to_non_nullable
as double,stopLoss: null == stopLoss ? _self.stopLoss : stopLoss // ignore: cast_nullable_to_non_nullable
as double,target1: null == target1 ? _self.target1 : target1 // ignore: cast_nullable_to_non_nullable
as double,target2: null == target2 ? _self.target2 : target2 // ignore: cast_nullable_to_non_nullable
as double,riskReward: null == riskReward ? _self.riskReward : riskReward // ignore: cast_nullable_to_non_nullable
as double,riskPct: null == riskPct ? _self.riskPct : riskPct // ignore: cast_nullable_to_non_nullable
as double,direction: freezed == direction ? _self.direction : direction // ignore: cast_nullable_to_non_nullable
as String?,notes: null == notes ? _self._notes : notes // ignore: cast_nullable_to_non_nullable
as List<String>,
  ));
}


}


/// @nodoc
mixin _$SwingChart {

 String get symbol; String get asOf; int? get rsRating; List<SwingChartBase> get bases; SwingChartBars get bars;
/// Create a copy of SwingChart
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SwingChartCopyWith<SwingChart> get copyWith => _$SwingChartCopyWithImpl<SwingChart>(this as SwingChart, _$identity);

  /// Serializes this SwingChart to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SwingChart&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.asOf, asOf) || other.asOf == asOf)&&(identical(other.rsRating, rsRating) || other.rsRating == rsRating)&&const DeepCollectionEquality().equals(other.bases, bases)&&(identical(other.bars, bars) || other.bars == bars));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,asOf,rsRating,const DeepCollectionEquality().hash(bases),bars);

@override
String toString() {
  return 'SwingChart(symbol: $symbol, asOf: $asOf, rsRating: $rsRating, bases: $bases, bars: $bars)';
}


}

/// @nodoc
abstract mixin class $SwingChartCopyWith<$Res>  {
  factory $SwingChartCopyWith(SwingChart value, $Res Function(SwingChart) _then) = _$SwingChartCopyWithImpl;
@useResult
$Res call({
 String symbol, String asOf, int? rsRating, List<SwingChartBase> bases, SwingChartBars bars
});


$SwingChartBarsCopyWith<$Res> get bars;

}
/// @nodoc
class _$SwingChartCopyWithImpl<$Res>
    implements $SwingChartCopyWith<$Res> {
  _$SwingChartCopyWithImpl(this._self, this._then);

  final SwingChart _self;
  final $Res Function(SwingChart) _then;

/// Create a copy of SwingChart
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? asOf = null,Object? rsRating = freezed,Object? bases = null,Object? bars = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,asOf: null == asOf ? _self.asOf : asOf // ignore: cast_nullable_to_non_nullable
as String,rsRating: freezed == rsRating ? _self.rsRating : rsRating // ignore: cast_nullable_to_non_nullable
as int?,bases: null == bases ? _self.bases : bases // ignore: cast_nullable_to_non_nullable
as List<SwingChartBase>,bars: null == bars ? _self.bars : bars // ignore: cast_nullable_to_non_nullable
as SwingChartBars,
  ));
}
/// Create a copy of SwingChart
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SwingChartBarsCopyWith<$Res> get bars {
  
  return $SwingChartBarsCopyWith<$Res>(_self.bars, (value) {
    return _then(_self.copyWith(bars: value));
  });
}
}


/// Adds pattern-matching-related methods to [SwingChart].
extension SwingChartPatterns on SwingChart {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SwingChart value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SwingChart() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SwingChart value)  $default,){
final _that = this;
switch (_that) {
case _SwingChart():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SwingChart value)?  $default,){
final _that = this;
switch (_that) {
case _SwingChart() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String asOf,  int? rsRating,  List<SwingChartBase> bases,  SwingChartBars bars)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SwingChart() when $default != null:
return $default(_that.symbol,_that.asOf,_that.rsRating,_that.bases,_that.bars);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String asOf,  int? rsRating,  List<SwingChartBase> bases,  SwingChartBars bars)  $default,) {final _that = this;
switch (_that) {
case _SwingChart():
return $default(_that.symbol,_that.asOf,_that.rsRating,_that.bases,_that.bars);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String asOf,  int? rsRating,  List<SwingChartBase> bases,  SwingChartBars bars)?  $default,) {final _that = this;
switch (_that) {
case _SwingChart() when $default != null:
return $default(_that.symbol,_that.asOf,_that.rsRating,_that.bases,_that.bars);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SwingChart implements SwingChart {
  const _SwingChart({required this.symbol, this.asOf = '', this.rsRating, final  List<SwingChartBase> bases = const [], required this.bars}): _bases = bases;
  factory _SwingChart.fromJson(Map<String, dynamic> json) => _$SwingChartFromJson(json);

@override final  String symbol;
@override@JsonKey() final  String asOf;
@override final  int? rsRating;
 final  List<SwingChartBase> _bases;
@override@JsonKey() List<SwingChartBase> get bases {
  if (_bases is EqualUnmodifiableListView) return _bases;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_bases);
}

@override final  SwingChartBars bars;

/// Create a copy of SwingChart
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SwingChartCopyWith<_SwingChart> get copyWith => __$SwingChartCopyWithImpl<_SwingChart>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SwingChartToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SwingChart&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.asOf, asOf) || other.asOf == asOf)&&(identical(other.rsRating, rsRating) || other.rsRating == rsRating)&&const DeepCollectionEquality().equals(other._bases, _bases)&&(identical(other.bars, bars) || other.bars == bars));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,asOf,rsRating,const DeepCollectionEquality().hash(_bases),bars);

@override
String toString() {
  return 'SwingChart(symbol: $symbol, asOf: $asOf, rsRating: $rsRating, bases: $bases, bars: $bars)';
}


}

/// @nodoc
abstract mixin class _$SwingChartCopyWith<$Res> implements $SwingChartCopyWith<$Res> {
  factory _$SwingChartCopyWith(_SwingChart value, $Res Function(_SwingChart) _then) = __$SwingChartCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String asOf, int? rsRating, List<SwingChartBase> bases, SwingChartBars bars
});


@override $SwingChartBarsCopyWith<$Res> get bars;

}
/// @nodoc
class __$SwingChartCopyWithImpl<$Res>
    implements _$SwingChartCopyWith<$Res> {
  __$SwingChartCopyWithImpl(this._self, this._then);

  final _SwingChart _self;
  final $Res Function(_SwingChart) _then;

/// Create a copy of SwingChart
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? asOf = null,Object? rsRating = freezed,Object? bases = null,Object? bars = null,}) {
  return _then(_SwingChart(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,asOf: null == asOf ? _self.asOf : asOf // ignore: cast_nullable_to_non_nullable
as String,rsRating: freezed == rsRating ? _self.rsRating : rsRating // ignore: cast_nullable_to_non_nullable
as int?,bases: null == bases ? _self._bases : bases // ignore: cast_nullable_to_non_nullable
as List<SwingChartBase>,bars: null == bars ? _self.bars : bars // ignore: cast_nullable_to_non_nullable
as SwingChartBars,
  ));
}

/// Create a copy of SwingChart
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SwingChartBarsCopyWith<$Res> get bars {
  
  return $SwingChartBarsCopyWith<$Res>(_self.bars, (value) {
    return _then(_self.copyWith(bars: value));
  });
}
}


/// @nodoc
mixin _$SwingChartBars {

 List<int> get t; List<double> get o; List<double> get h; List<double> get l; List<double> get c; List<double> get v;
/// Create a copy of SwingChartBars
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SwingChartBarsCopyWith<SwingChartBars> get copyWith => _$SwingChartBarsCopyWithImpl<SwingChartBars>(this as SwingChartBars, _$identity);

  /// Serializes this SwingChartBars to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SwingChartBars&&const DeepCollectionEquality().equals(other.t, t)&&const DeepCollectionEquality().equals(other.o, o)&&const DeepCollectionEquality().equals(other.h, h)&&const DeepCollectionEquality().equals(other.l, l)&&const DeepCollectionEquality().equals(other.c, c)&&const DeepCollectionEquality().equals(other.v, v));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(t),const DeepCollectionEquality().hash(o),const DeepCollectionEquality().hash(h),const DeepCollectionEquality().hash(l),const DeepCollectionEquality().hash(c),const DeepCollectionEquality().hash(v));

@override
String toString() {
  return 'SwingChartBars(t: $t, o: $o, h: $h, l: $l, c: $c, v: $v)';
}


}

/// @nodoc
abstract mixin class $SwingChartBarsCopyWith<$Res>  {
  factory $SwingChartBarsCopyWith(SwingChartBars value, $Res Function(SwingChartBars) _then) = _$SwingChartBarsCopyWithImpl;
@useResult
$Res call({
 List<int> t, List<double> o, List<double> h, List<double> l, List<double> c, List<double> v
});




}
/// @nodoc
class _$SwingChartBarsCopyWithImpl<$Res>
    implements $SwingChartBarsCopyWith<$Res> {
  _$SwingChartBarsCopyWithImpl(this._self, this._then);

  final SwingChartBars _self;
  final $Res Function(SwingChartBars) _then;

/// Create a copy of SwingChartBars
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? t = null,Object? o = null,Object? h = null,Object? l = null,Object? c = null,Object? v = null,}) {
  return _then(_self.copyWith(
t: null == t ? _self.t : t // ignore: cast_nullable_to_non_nullable
as List<int>,o: null == o ? _self.o : o // ignore: cast_nullable_to_non_nullable
as List<double>,h: null == h ? _self.h : h // ignore: cast_nullable_to_non_nullable
as List<double>,l: null == l ? _self.l : l // ignore: cast_nullable_to_non_nullable
as List<double>,c: null == c ? _self.c : c // ignore: cast_nullable_to_non_nullable
as List<double>,v: null == v ? _self.v : v // ignore: cast_nullable_to_non_nullable
as List<double>,
  ));
}

}


/// Adds pattern-matching-related methods to [SwingChartBars].
extension SwingChartBarsPatterns on SwingChartBars {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SwingChartBars value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SwingChartBars() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SwingChartBars value)  $default,){
final _that = this;
switch (_that) {
case _SwingChartBars():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SwingChartBars value)?  $default,){
final _that = this;
switch (_that) {
case _SwingChartBars() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<int> t,  List<double> o,  List<double> h,  List<double> l,  List<double> c,  List<double> v)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SwingChartBars() when $default != null:
return $default(_that.t,_that.o,_that.h,_that.l,_that.c,_that.v);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<int> t,  List<double> o,  List<double> h,  List<double> l,  List<double> c,  List<double> v)  $default,) {final _that = this;
switch (_that) {
case _SwingChartBars():
return $default(_that.t,_that.o,_that.h,_that.l,_that.c,_that.v);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<int> t,  List<double> o,  List<double> h,  List<double> l,  List<double> c,  List<double> v)?  $default,) {final _that = this;
switch (_that) {
case _SwingChartBars() when $default != null:
return $default(_that.t,_that.o,_that.h,_that.l,_that.c,_that.v);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SwingChartBars implements SwingChartBars {
  const _SwingChartBars({final  List<int> t = const [], final  List<double> o = const [], final  List<double> h = const [], final  List<double> l = const [], final  List<double> c = const [], final  List<double> v = const []}): _t = t,_o = o,_h = h,_l = l,_c = c,_v = v;
  factory _SwingChartBars.fromJson(Map<String, dynamic> json) => _$SwingChartBarsFromJson(json);

 final  List<int> _t;
@override@JsonKey() List<int> get t {
  if (_t is EqualUnmodifiableListView) return _t;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_t);
}

 final  List<double> _o;
@override@JsonKey() List<double> get o {
  if (_o is EqualUnmodifiableListView) return _o;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_o);
}

 final  List<double> _h;
@override@JsonKey() List<double> get h {
  if (_h is EqualUnmodifiableListView) return _h;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_h);
}

 final  List<double> _l;
@override@JsonKey() List<double> get l {
  if (_l is EqualUnmodifiableListView) return _l;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_l);
}

 final  List<double> _c;
@override@JsonKey() List<double> get c {
  if (_c is EqualUnmodifiableListView) return _c;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_c);
}

 final  List<double> _v;
@override@JsonKey() List<double> get v {
  if (_v is EqualUnmodifiableListView) return _v;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_v);
}


/// Create a copy of SwingChartBars
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SwingChartBarsCopyWith<_SwingChartBars> get copyWith => __$SwingChartBarsCopyWithImpl<_SwingChartBars>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SwingChartBarsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SwingChartBars&&const DeepCollectionEquality().equals(other._t, _t)&&const DeepCollectionEquality().equals(other._o, _o)&&const DeepCollectionEquality().equals(other._h, _h)&&const DeepCollectionEquality().equals(other._l, _l)&&const DeepCollectionEquality().equals(other._c, _c)&&const DeepCollectionEquality().equals(other._v, _v));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_t),const DeepCollectionEquality().hash(_o),const DeepCollectionEquality().hash(_h),const DeepCollectionEquality().hash(_l),const DeepCollectionEquality().hash(_c),const DeepCollectionEquality().hash(_v));

@override
String toString() {
  return 'SwingChartBars(t: $t, o: $o, h: $h, l: $l, c: $c, v: $v)';
}


}

/// @nodoc
abstract mixin class _$SwingChartBarsCopyWith<$Res> implements $SwingChartBarsCopyWith<$Res> {
  factory _$SwingChartBarsCopyWith(_SwingChartBars value, $Res Function(_SwingChartBars) _then) = __$SwingChartBarsCopyWithImpl;
@override @useResult
$Res call({
 List<int> t, List<double> o, List<double> h, List<double> l, List<double> c, List<double> v
});




}
/// @nodoc
class __$SwingChartBarsCopyWithImpl<$Res>
    implements _$SwingChartBarsCopyWith<$Res> {
  __$SwingChartBarsCopyWithImpl(this._self, this._then);

  final _SwingChartBars _self;
  final $Res Function(_SwingChartBars) _then;

/// Create a copy of SwingChartBars
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? t = null,Object? o = null,Object? h = null,Object? l = null,Object? c = null,Object? v = null,}) {
  return _then(_SwingChartBars(
t: null == t ? _self._t : t // ignore: cast_nullable_to_non_nullable
as List<int>,o: null == o ? _self._o : o // ignore: cast_nullable_to_non_nullable
as List<double>,h: null == h ? _self._h : h // ignore: cast_nullable_to_non_nullable
as List<double>,l: null == l ? _self._l : l // ignore: cast_nullable_to_non_nullable
as List<double>,c: null == c ? _self._c : c // ignore: cast_nullable_to_non_nullable
as List<double>,v: null == v ? _self._v : v // ignore: cast_nullable_to_non_nullable
as List<double>,
  ));
}


}


/// @nodoc
mixin _$SwingChartBase {

 String get pattern; String get direction; int get from; double get high; double get low;
/// Create a copy of SwingChartBase
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SwingChartBaseCopyWith<SwingChartBase> get copyWith => _$SwingChartBaseCopyWithImpl<SwingChartBase>(this as SwingChartBase, _$identity);

  /// Serializes this SwingChartBase to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SwingChartBase&&(identical(other.pattern, pattern) || other.pattern == pattern)&&(identical(other.direction, direction) || other.direction == direction)&&(identical(other.from, from) || other.from == from)&&(identical(other.high, high) || other.high == high)&&(identical(other.low, low) || other.low == low));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,pattern,direction,from,high,low);

@override
String toString() {
  return 'SwingChartBase(pattern: $pattern, direction: $direction, from: $from, high: $high, low: $low)';
}


}

/// @nodoc
abstract mixin class $SwingChartBaseCopyWith<$Res>  {
  factory $SwingChartBaseCopyWith(SwingChartBase value, $Res Function(SwingChartBase) _then) = _$SwingChartBaseCopyWithImpl;
@useResult
$Res call({
 String pattern, String direction, int from, double high, double low
});




}
/// @nodoc
class _$SwingChartBaseCopyWithImpl<$Res>
    implements $SwingChartBaseCopyWith<$Res> {
  _$SwingChartBaseCopyWithImpl(this._self, this._then);

  final SwingChartBase _self;
  final $Res Function(SwingChartBase) _then;

/// Create a copy of SwingChartBase
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? pattern = null,Object? direction = null,Object? from = null,Object? high = null,Object? low = null,}) {
  return _then(_self.copyWith(
pattern: null == pattern ? _self.pattern : pattern // ignore: cast_nullable_to_non_nullable
as String,direction: null == direction ? _self.direction : direction // ignore: cast_nullable_to_non_nullable
as String,from: null == from ? _self.from : from // ignore: cast_nullable_to_non_nullable
as int,high: null == high ? _self.high : high // ignore: cast_nullable_to_non_nullable
as double,low: null == low ? _self.low : low // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [SwingChartBase].
extension SwingChartBasePatterns on SwingChartBase {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SwingChartBase value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SwingChartBase() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SwingChartBase value)  $default,){
final _that = this;
switch (_that) {
case _SwingChartBase():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SwingChartBase value)?  $default,){
final _that = this;
switch (_that) {
case _SwingChartBase() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String pattern,  String direction,  int from,  double high,  double low)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SwingChartBase() when $default != null:
return $default(_that.pattern,_that.direction,_that.from,_that.high,_that.low);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String pattern,  String direction,  int from,  double high,  double low)  $default,) {final _that = this;
switch (_that) {
case _SwingChartBase():
return $default(_that.pattern,_that.direction,_that.from,_that.high,_that.low);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String pattern,  String direction,  int from,  double high,  double low)?  $default,) {final _that = this;
switch (_that) {
case _SwingChartBase() when $default != null:
return $default(_that.pattern,_that.direction,_that.from,_that.high,_that.low);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SwingChartBase implements SwingChartBase {
  const _SwingChartBase({required this.pattern, this.direction = 'LONG', required this.from, required this.high, required this.low});
  factory _SwingChartBase.fromJson(Map<String, dynamic> json) => _$SwingChartBaseFromJson(json);

@override final  String pattern;
@override@JsonKey() final  String direction;
@override final  int from;
@override final  double high;
@override final  double low;

/// Create a copy of SwingChartBase
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SwingChartBaseCopyWith<_SwingChartBase> get copyWith => __$SwingChartBaseCopyWithImpl<_SwingChartBase>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SwingChartBaseToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SwingChartBase&&(identical(other.pattern, pattern) || other.pattern == pattern)&&(identical(other.direction, direction) || other.direction == direction)&&(identical(other.from, from) || other.from == from)&&(identical(other.high, high) || other.high == high)&&(identical(other.low, low) || other.low == low));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,pattern,direction,from,high,low);

@override
String toString() {
  return 'SwingChartBase(pattern: $pattern, direction: $direction, from: $from, high: $high, low: $low)';
}


}

/// @nodoc
abstract mixin class _$SwingChartBaseCopyWith<$Res> implements $SwingChartBaseCopyWith<$Res> {
  factory _$SwingChartBaseCopyWith(_SwingChartBase value, $Res Function(_SwingChartBase) _then) = __$SwingChartBaseCopyWithImpl;
@override @useResult
$Res call({
 String pattern, String direction, int from, double high, double low
});




}
/// @nodoc
class __$SwingChartBaseCopyWithImpl<$Res>
    implements _$SwingChartBaseCopyWith<$Res> {
  __$SwingChartBaseCopyWithImpl(this._self, this._then);

  final _SwingChartBase _self;
  final $Res Function(_SwingChartBase) _then;

/// Create a copy of SwingChartBase
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? pattern = null,Object? direction = null,Object? from = null,Object? high = null,Object? low = null,}) {
  return _then(_SwingChartBase(
pattern: null == pattern ? _self.pattern : pattern // ignore: cast_nullable_to_non_nullable
as String,direction: null == direction ? _self.direction : direction // ignore: cast_nullable_to_non_nullable
as String,from: null == from ? _self.from : from // ignore: cast_nullable_to_non_nullable
as int,high: null == high ? _self.high : high // ignore: cast_nullable_to_non_nullable
as double,low: null == low ? _self.low : low // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}

// dart format on
