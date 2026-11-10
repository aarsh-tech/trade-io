// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'market_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$MarketTick {

/// Canonical key, e.g. `NSE:RELIANCE`.
 String get key; String get symbol; String get exchange; double get ltp; double? get close; double? get change; double? get changePct; double? get volume; String? get exchangeTs; String get ts; String get source;
/// Create a copy of MarketTick
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MarketTickCopyWith<MarketTick> get copyWith => _$MarketTickCopyWithImpl<MarketTick>(this as MarketTick, _$identity);

  /// Serializes this MarketTick to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MarketTick&&(identical(other.key, key) || other.key == key)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change)&&(identical(other.changePct, changePct) || other.changePct == changePct)&&(identical(other.volume, volume) || other.volume == volume)&&(identical(other.exchangeTs, exchangeTs) || other.exchangeTs == exchangeTs)&&(identical(other.ts, ts) || other.ts == ts)&&(identical(other.source, source) || other.source == source));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,key,symbol,exchange,ltp,close,change,changePct,volume,exchangeTs,ts,source);

@override
String toString() {
  return 'MarketTick(key: $key, symbol: $symbol, exchange: $exchange, ltp: $ltp, close: $close, change: $change, changePct: $changePct, volume: $volume, exchangeTs: $exchangeTs, ts: $ts, source: $source)';
}


}

/// @nodoc
abstract mixin class $MarketTickCopyWith<$Res>  {
  factory $MarketTickCopyWith(MarketTick value, $Res Function(MarketTick) _then) = _$MarketTickCopyWithImpl;
@useResult
$Res call({
 String key, String symbol, String exchange, double ltp, double? close, double? change, double? changePct, double? volume, String? exchangeTs, String ts, String source
});




}
/// @nodoc
class _$MarketTickCopyWithImpl<$Res>
    implements $MarketTickCopyWith<$Res> {
  _$MarketTickCopyWithImpl(this._self, this._then);

  final MarketTick _self;
  final $Res Function(MarketTick) _then;

/// Create a copy of MarketTick
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? key = null,Object? symbol = null,Object? exchange = null,Object? ltp = null,Object? close = freezed,Object? change = freezed,Object? changePct = freezed,Object? volume = freezed,Object? exchangeTs = freezed,Object? ts = null,Object? source = null,}) {
  return _then(_self.copyWith(
key: null == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: freezed == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double?,changePct: freezed == changePct ? _self.changePct : changePct // ignore: cast_nullable_to_non_nullable
as double?,volume: freezed == volume ? _self.volume : volume // ignore: cast_nullable_to_non_nullable
as double?,exchangeTs: freezed == exchangeTs ? _self.exchangeTs : exchangeTs // ignore: cast_nullable_to_non_nullable
as String?,ts: null == ts ? _self.ts : ts // ignore: cast_nullable_to_non_nullable
as String,source: null == source ? _self.source : source // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [MarketTick].
extension MarketTickPatterns on MarketTick {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MarketTick value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MarketTick() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MarketTick value)  $default,){
final _that = this;
switch (_that) {
case _MarketTick():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MarketTick value)?  $default,){
final _that = this;
switch (_that) {
case _MarketTick() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String key,  String symbol,  String exchange,  double ltp,  double? close,  double? change,  double? changePct,  double? volume,  String? exchangeTs,  String ts,  String source)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MarketTick() when $default != null:
return $default(_that.key,_that.symbol,_that.exchange,_that.ltp,_that.close,_that.change,_that.changePct,_that.volume,_that.exchangeTs,_that.ts,_that.source);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String key,  String symbol,  String exchange,  double ltp,  double? close,  double? change,  double? changePct,  double? volume,  String? exchangeTs,  String ts,  String source)  $default,) {final _that = this;
switch (_that) {
case _MarketTick():
return $default(_that.key,_that.symbol,_that.exchange,_that.ltp,_that.close,_that.change,_that.changePct,_that.volume,_that.exchangeTs,_that.ts,_that.source);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String key,  String symbol,  String exchange,  double ltp,  double? close,  double? change,  double? changePct,  double? volume,  String? exchangeTs,  String ts,  String source)?  $default,) {final _that = this;
switch (_that) {
case _MarketTick() when $default != null:
return $default(_that.key,_that.symbol,_that.exchange,_that.ltp,_that.close,_that.change,_that.changePct,_that.volume,_that.exchangeTs,_that.ts,_that.source);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MarketTick implements MarketTick {
  const _MarketTick({required this.key, required this.symbol, required this.exchange, required this.ltp, this.close, this.change, this.changePct, this.volume, this.exchangeTs, required this.ts, this.source = 'ws'});
  factory _MarketTick.fromJson(Map<String, dynamic> json) => _$MarketTickFromJson(json);

/// Canonical key, e.g. `NSE:RELIANCE`.
@override final  String key;
@override final  String symbol;
@override final  String exchange;
@override final  double ltp;
@override final  double? close;
@override final  double? change;
@override final  double? changePct;
@override final  double? volume;
@override final  String? exchangeTs;
@override final  String ts;
@override@JsonKey() final  String source;

/// Create a copy of MarketTick
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MarketTickCopyWith<_MarketTick> get copyWith => __$MarketTickCopyWithImpl<_MarketTick>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MarketTickToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MarketTick&&(identical(other.key, key) || other.key == key)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change)&&(identical(other.changePct, changePct) || other.changePct == changePct)&&(identical(other.volume, volume) || other.volume == volume)&&(identical(other.exchangeTs, exchangeTs) || other.exchangeTs == exchangeTs)&&(identical(other.ts, ts) || other.ts == ts)&&(identical(other.source, source) || other.source == source));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,key,symbol,exchange,ltp,close,change,changePct,volume,exchangeTs,ts,source);

@override
String toString() {
  return 'MarketTick(key: $key, symbol: $symbol, exchange: $exchange, ltp: $ltp, close: $close, change: $change, changePct: $changePct, volume: $volume, exchangeTs: $exchangeTs, ts: $ts, source: $source)';
}


}

/// @nodoc
abstract mixin class _$MarketTickCopyWith<$Res> implements $MarketTickCopyWith<$Res> {
  factory _$MarketTickCopyWith(_MarketTick value, $Res Function(_MarketTick) _then) = __$MarketTickCopyWithImpl;
@override @useResult
$Res call({
 String key, String symbol, String exchange, double ltp, double? close, double? change, double? changePct, double? volume, String? exchangeTs, String ts, String source
});




}
/// @nodoc
class __$MarketTickCopyWithImpl<$Res>
    implements _$MarketTickCopyWith<$Res> {
  __$MarketTickCopyWithImpl(this._self, this._then);

  final _MarketTick _self;
  final $Res Function(_MarketTick) _then;

/// Create a copy of MarketTick
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? key = null,Object? symbol = null,Object? exchange = null,Object? ltp = null,Object? close = freezed,Object? change = freezed,Object? changePct = freezed,Object? volume = freezed,Object? exchangeTs = freezed,Object? ts = null,Object? source = null,}) {
  return _then(_MarketTick(
key: null == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: freezed == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double?,changePct: freezed == changePct ? _self.changePct : changePct // ignore: cast_nullable_to_non_nullable
as double?,volume: freezed == volume ? _self.volume : volume // ignore: cast_nullable_to_non_nullable
as double?,exchangeTs: freezed == exchangeTs ? _self.exchangeTs : exchangeTs // ignore: cast_nullable_to_non_nullable
as String?,ts: null == ts ? _self.ts : ts // ignore: cast_nullable_to_non_nullable
as String,source: null == source ? _self.source : source // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$FeedStatus {

@JsonKey(unknownEnumValue: FeedState.closed) FeedState get status; String? get lastExchangeTs; String? get lastMessageAt;
/// Create a copy of FeedStatus
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$FeedStatusCopyWith<FeedStatus> get copyWith => _$FeedStatusCopyWithImpl<FeedStatus>(this as FeedStatus, _$identity);

  /// Serializes this FeedStatus to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is FeedStatus&&(identical(other.status, status) || other.status == status)&&(identical(other.lastExchangeTs, lastExchangeTs) || other.lastExchangeTs == lastExchangeTs)&&(identical(other.lastMessageAt, lastMessageAt) || other.lastMessageAt == lastMessageAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,status,lastExchangeTs,lastMessageAt);

@override
String toString() {
  return 'FeedStatus(status: $status, lastExchangeTs: $lastExchangeTs, lastMessageAt: $lastMessageAt)';
}


}

/// @nodoc
abstract mixin class $FeedStatusCopyWith<$Res>  {
  factory $FeedStatusCopyWith(FeedStatus value, $Res Function(FeedStatus) _then) = _$FeedStatusCopyWithImpl;
@useResult
$Res call({
@JsonKey(unknownEnumValue: FeedState.closed) FeedState status, String? lastExchangeTs, String? lastMessageAt
});




}
/// @nodoc
class _$FeedStatusCopyWithImpl<$Res>
    implements $FeedStatusCopyWith<$Res> {
  _$FeedStatusCopyWithImpl(this._self, this._then);

  final FeedStatus _self;
  final $Res Function(FeedStatus) _then;

/// Create a copy of FeedStatus
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? status = null,Object? lastExchangeTs = freezed,Object? lastMessageAt = freezed,}) {
  return _then(_self.copyWith(
status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as FeedState,lastExchangeTs: freezed == lastExchangeTs ? _self.lastExchangeTs : lastExchangeTs // ignore: cast_nullable_to_non_nullable
as String?,lastMessageAt: freezed == lastMessageAt ? _self.lastMessageAt : lastMessageAt // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [FeedStatus].
extension FeedStatusPatterns on FeedStatus {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _FeedStatus value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _FeedStatus() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _FeedStatus value)  $default,){
final _that = this;
switch (_that) {
case _FeedStatus():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _FeedStatus value)?  $default,){
final _that = this;
switch (_that) {
case _FeedStatus() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function(@JsonKey(unknownEnumValue: FeedState.closed)  FeedState status,  String? lastExchangeTs,  String? lastMessageAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _FeedStatus() when $default != null:
return $default(_that.status,_that.lastExchangeTs,_that.lastMessageAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function(@JsonKey(unknownEnumValue: FeedState.closed)  FeedState status,  String? lastExchangeTs,  String? lastMessageAt)  $default,) {final _that = this;
switch (_that) {
case _FeedStatus():
return $default(_that.status,_that.lastExchangeTs,_that.lastMessageAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function(@JsonKey(unknownEnumValue: FeedState.closed)  FeedState status,  String? lastExchangeTs,  String? lastMessageAt)?  $default,) {final _that = this;
switch (_that) {
case _FeedStatus() when $default != null:
return $default(_that.status,_that.lastExchangeTs,_that.lastMessageAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _FeedStatus implements FeedStatus {
  const _FeedStatus({@JsonKey(unknownEnumValue: FeedState.closed) this.status = FeedState.closed, this.lastExchangeTs, this.lastMessageAt});
  factory _FeedStatus.fromJson(Map<String, dynamic> json) => _$FeedStatusFromJson(json);

@override@JsonKey(unknownEnumValue: FeedState.closed) final  FeedState status;
@override final  String? lastExchangeTs;
@override final  String? lastMessageAt;

/// Create a copy of FeedStatus
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$FeedStatusCopyWith<_FeedStatus> get copyWith => __$FeedStatusCopyWithImpl<_FeedStatus>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$FeedStatusToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _FeedStatus&&(identical(other.status, status) || other.status == status)&&(identical(other.lastExchangeTs, lastExchangeTs) || other.lastExchangeTs == lastExchangeTs)&&(identical(other.lastMessageAt, lastMessageAt) || other.lastMessageAt == lastMessageAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,status,lastExchangeTs,lastMessageAt);

@override
String toString() {
  return 'FeedStatus(status: $status, lastExchangeTs: $lastExchangeTs, lastMessageAt: $lastMessageAt)';
}


}

/// @nodoc
abstract mixin class _$FeedStatusCopyWith<$Res> implements $FeedStatusCopyWith<$Res> {
  factory _$FeedStatusCopyWith(_FeedStatus value, $Res Function(_FeedStatus) _then) = __$FeedStatusCopyWithImpl;
@override @useResult
$Res call({
@JsonKey(unknownEnumValue: FeedState.closed) FeedState status, String? lastExchangeTs, String? lastMessageAt
});




}
/// @nodoc
class __$FeedStatusCopyWithImpl<$Res>
    implements _$FeedStatusCopyWith<$Res> {
  __$FeedStatusCopyWithImpl(this._self, this._then);

  final _FeedStatus _self;
  final $Res Function(_FeedStatus) _then;

/// Create a copy of FeedStatus
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? status = null,Object? lastExchangeTs = freezed,Object? lastMessageAt = freezed,}) {
  return _then(_FeedStatus(
status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as FeedState,lastExchangeTs: freezed == lastExchangeTs ? _self.lastExchangeTs : lastExchangeTs // ignore: cast_nullable_to_non_nullable
as String?,lastMessageAt: freezed == lastMessageAt ? _self.lastMessageAt : lastMessageAt // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$OrderUpdate {

 String get orderId; String get status; String? get exchange; String? get tradingsymbol; String? get transactionType; String? get orderType; String? get product; int? get quantity; int? get filledQuantity; int? get pendingQuantity; double? get price; double? get triggerPrice; double? get averagePrice; String? get statusMessage; String? get tag;
/// Create a copy of OrderUpdate
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrderUpdateCopyWith<OrderUpdate> get copyWith => _$OrderUpdateCopyWithImpl<OrderUpdate>(this as OrderUpdate, _$identity);

  /// Serializes this OrderUpdate to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OrderUpdate&&(identical(other.orderId, orderId) || other.orderId == orderId)&&(identical(other.status, status) || other.status == status)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.tradingsymbol, tradingsymbol) || other.tradingsymbol == tradingsymbol)&&(identical(other.transactionType, transactionType) || other.transactionType == transactionType)&&(identical(other.orderType, orderType) || other.orderType == orderType)&&(identical(other.product, product) || other.product == product)&&(identical(other.quantity, quantity) || other.quantity == quantity)&&(identical(other.filledQuantity, filledQuantity) || other.filledQuantity == filledQuantity)&&(identical(other.pendingQuantity, pendingQuantity) || other.pendingQuantity == pendingQuantity)&&(identical(other.price, price) || other.price == price)&&(identical(other.triggerPrice, triggerPrice) || other.triggerPrice == triggerPrice)&&(identical(other.averagePrice, averagePrice) || other.averagePrice == averagePrice)&&(identical(other.statusMessage, statusMessage) || other.statusMessage == statusMessage)&&(identical(other.tag, tag) || other.tag == tag));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,orderId,status,exchange,tradingsymbol,transactionType,orderType,product,quantity,filledQuantity,pendingQuantity,price,triggerPrice,averagePrice,statusMessage,tag);

@override
String toString() {
  return 'OrderUpdate(orderId: $orderId, status: $status, exchange: $exchange, tradingsymbol: $tradingsymbol, transactionType: $transactionType, orderType: $orderType, product: $product, quantity: $quantity, filledQuantity: $filledQuantity, pendingQuantity: $pendingQuantity, price: $price, triggerPrice: $triggerPrice, averagePrice: $averagePrice, statusMessage: $statusMessage, tag: $tag)';
}


}

/// @nodoc
abstract mixin class $OrderUpdateCopyWith<$Res>  {
  factory $OrderUpdateCopyWith(OrderUpdate value, $Res Function(OrderUpdate) _then) = _$OrderUpdateCopyWithImpl;
@useResult
$Res call({
 String orderId, String status, String? exchange, String? tradingsymbol, String? transactionType, String? orderType, String? product, int? quantity, int? filledQuantity, int? pendingQuantity, double? price, double? triggerPrice, double? averagePrice, String? statusMessage, String? tag
});




}
/// @nodoc
class _$OrderUpdateCopyWithImpl<$Res>
    implements $OrderUpdateCopyWith<$Res> {
  _$OrderUpdateCopyWithImpl(this._self, this._then);

  final OrderUpdate _self;
  final $Res Function(OrderUpdate) _then;

/// Create a copy of OrderUpdate
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? orderId = null,Object? status = null,Object? exchange = freezed,Object? tradingsymbol = freezed,Object? transactionType = freezed,Object? orderType = freezed,Object? product = freezed,Object? quantity = freezed,Object? filledQuantity = freezed,Object? pendingQuantity = freezed,Object? price = freezed,Object? triggerPrice = freezed,Object? averagePrice = freezed,Object? statusMessage = freezed,Object? tag = freezed,}) {
  return _then(_self.copyWith(
orderId: null == orderId ? _self.orderId : orderId // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,exchange: freezed == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String?,tradingsymbol: freezed == tradingsymbol ? _self.tradingsymbol : tradingsymbol // ignore: cast_nullable_to_non_nullable
as String?,transactionType: freezed == transactionType ? _self.transactionType : transactionType // ignore: cast_nullable_to_non_nullable
as String?,orderType: freezed == orderType ? _self.orderType : orderType // ignore: cast_nullable_to_non_nullable
as String?,product: freezed == product ? _self.product : product // ignore: cast_nullable_to_non_nullable
as String?,quantity: freezed == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as int?,filledQuantity: freezed == filledQuantity ? _self.filledQuantity : filledQuantity // ignore: cast_nullable_to_non_nullable
as int?,pendingQuantity: freezed == pendingQuantity ? _self.pendingQuantity : pendingQuantity // ignore: cast_nullable_to_non_nullable
as int?,price: freezed == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double?,triggerPrice: freezed == triggerPrice ? _self.triggerPrice : triggerPrice // ignore: cast_nullable_to_non_nullable
as double?,averagePrice: freezed == averagePrice ? _self.averagePrice : averagePrice // ignore: cast_nullable_to_non_nullable
as double?,statusMessage: freezed == statusMessage ? _self.statusMessage : statusMessage // ignore: cast_nullable_to_non_nullable
as String?,tag: freezed == tag ? _self.tag : tag // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [OrderUpdate].
extension OrderUpdatePatterns on OrderUpdate {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OrderUpdate value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OrderUpdate() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OrderUpdate value)  $default,){
final _that = this;
switch (_that) {
case _OrderUpdate():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OrderUpdate value)?  $default,){
final _that = this;
switch (_that) {
case _OrderUpdate() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String orderId,  String status,  String? exchange,  String? tradingsymbol,  String? transactionType,  String? orderType,  String? product,  int? quantity,  int? filledQuantity,  int? pendingQuantity,  double? price,  double? triggerPrice,  double? averagePrice,  String? statusMessage,  String? tag)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OrderUpdate() when $default != null:
return $default(_that.orderId,_that.status,_that.exchange,_that.tradingsymbol,_that.transactionType,_that.orderType,_that.product,_that.quantity,_that.filledQuantity,_that.pendingQuantity,_that.price,_that.triggerPrice,_that.averagePrice,_that.statusMessage,_that.tag);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String orderId,  String status,  String? exchange,  String? tradingsymbol,  String? transactionType,  String? orderType,  String? product,  int? quantity,  int? filledQuantity,  int? pendingQuantity,  double? price,  double? triggerPrice,  double? averagePrice,  String? statusMessage,  String? tag)  $default,) {final _that = this;
switch (_that) {
case _OrderUpdate():
return $default(_that.orderId,_that.status,_that.exchange,_that.tradingsymbol,_that.transactionType,_that.orderType,_that.product,_that.quantity,_that.filledQuantity,_that.pendingQuantity,_that.price,_that.triggerPrice,_that.averagePrice,_that.statusMessage,_that.tag);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String orderId,  String status,  String? exchange,  String? tradingsymbol,  String? transactionType,  String? orderType,  String? product,  int? quantity,  int? filledQuantity,  int? pendingQuantity,  double? price,  double? triggerPrice,  double? averagePrice,  String? statusMessage,  String? tag)?  $default,) {final _that = this;
switch (_that) {
case _OrderUpdate() when $default != null:
return $default(_that.orderId,_that.status,_that.exchange,_that.tradingsymbol,_that.transactionType,_that.orderType,_that.product,_that.quantity,_that.filledQuantity,_that.pendingQuantity,_that.price,_that.triggerPrice,_that.averagePrice,_that.statusMessage,_that.tag);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OrderUpdate implements OrderUpdate {
  const _OrderUpdate({required this.orderId, required this.status, this.exchange, this.tradingsymbol, this.transactionType, this.orderType, this.product, this.quantity, this.filledQuantity, this.pendingQuantity, this.price, this.triggerPrice, this.averagePrice, this.statusMessage, this.tag});
  factory _OrderUpdate.fromJson(Map<String, dynamic> json) => _$OrderUpdateFromJson(json);

@override final  String orderId;
@override final  String status;
@override final  String? exchange;
@override final  String? tradingsymbol;
@override final  String? transactionType;
@override final  String? orderType;
@override final  String? product;
@override final  int? quantity;
@override final  int? filledQuantity;
@override final  int? pendingQuantity;
@override final  double? price;
@override final  double? triggerPrice;
@override final  double? averagePrice;
@override final  String? statusMessage;
@override final  String? tag;

/// Create a copy of OrderUpdate
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrderUpdateCopyWith<_OrderUpdate> get copyWith => __$OrderUpdateCopyWithImpl<_OrderUpdate>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrderUpdateToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OrderUpdate&&(identical(other.orderId, orderId) || other.orderId == orderId)&&(identical(other.status, status) || other.status == status)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.tradingsymbol, tradingsymbol) || other.tradingsymbol == tradingsymbol)&&(identical(other.transactionType, transactionType) || other.transactionType == transactionType)&&(identical(other.orderType, orderType) || other.orderType == orderType)&&(identical(other.product, product) || other.product == product)&&(identical(other.quantity, quantity) || other.quantity == quantity)&&(identical(other.filledQuantity, filledQuantity) || other.filledQuantity == filledQuantity)&&(identical(other.pendingQuantity, pendingQuantity) || other.pendingQuantity == pendingQuantity)&&(identical(other.price, price) || other.price == price)&&(identical(other.triggerPrice, triggerPrice) || other.triggerPrice == triggerPrice)&&(identical(other.averagePrice, averagePrice) || other.averagePrice == averagePrice)&&(identical(other.statusMessage, statusMessage) || other.statusMessage == statusMessage)&&(identical(other.tag, tag) || other.tag == tag));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,orderId,status,exchange,tradingsymbol,transactionType,orderType,product,quantity,filledQuantity,pendingQuantity,price,triggerPrice,averagePrice,statusMessage,tag);

@override
String toString() {
  return 'OrderUpdate(orderId: $orderId, status: $status, exchange: $exchange, tradingsymbol: $tradingsymbol, transactionType: $transactionType, orderType: $orderType, product: $product, quantity: $quantity, filledQuantity: $filledQuantity, pendingQuantity: $pendingQuantity, price: $price, triggerPrice: $triggerPrice, averagePrice: $averagePrice, statusMessage: $statusMessage, tag: $tag)';
}


}

/// @nodoc
abstract mixin class _$OrderUpdateCopyWith<$Res> implements $OrderUpdateCopyWith<$Res> {
  factory _$OrderUpdateCopyWith(_OrderUpdate value, $Res Function(_OrderUpdate) _then) = __$OrderUpdateCopyWithImpl;
@override @useResult
$Res call({
 String orderId, String status, String? exchange, String? tradingsymbol, String? transactionType, String? orderType, String? product, int? quantity, int? filledQuantity, int? pendingQuantity, double? price, double? triggerPrice, double? averagePrice, String? statusMessage, String? tag
});




}
/// @nodoc
class __$OrderUpdateCopyWithImpl<$Res>
    implements _$OrderUpdateCopyWith<$Res> {
  __$OrderUpdateCopyWithImpl(this._self, this._then);

  final _OrderUpdate _self;
  final $Res Function(_OrderUpdate) _then;

/// Create a copy of OrderUpdate
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? orderId = null,Object? status = null,Object? exchange = freezed,Object? tradingsymbol = freezed,Object? transactionType = freezed,Object? orderType = freezed,Object? product = freezed,Object? quantity = freezed,Object? filledQuantity = freezed,Object? pendingQuantity = freezed,Object? price = freezed,Object? triggerPrice = freezed,Object? averagePrice = freezed,Object? statusMessage = freezed,Object? tag = freezed,}) {
  return _then(_OrderUpdate(
orderId: null == orderId ? _self.orderId : orderId // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,exchange: freezed == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String?,tradingsymbol: freezed == tradingsymbol ? _self.tradingsymbol : tradingsymbol // ignore: cast_nullable_to_non_nullable
as String?,transactionType: freezed == transactionType ? _self.transactionType : transactionType // ignore: cast_nullable_to_non_nullable
as String?,orderType: freezed == orderType ? _self.orderType : orderType // ignore: cast_nullable_to_non_nullable
as String?,product: freezed == product ? _self.product : product // ignore: cast_nullable_to_non_nullable
as String?,quantity: freezed == quantity ? _self.quantity : quantity // ignore: cast_nullable_to_non_nullable
as int?,filledQuantity: freezed == filledQuantity ? _self.filledQuantity : filledQuantity // ignore: cast_nullable_to_non_nullable
as int?,pendingQuantity: freezed == pendingQuantity ? _self.pendingQuantity : pendingQuantity // ignore: cast_nullable_to_non_nullable
as int?,price: freezed == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double?,triggerPrice: freezed == triggerPrice ? _self.triggerPrice : triggerPrice // ignore: cast_nullable_to_non_nullable
as double?,averagePrice: freezed == averagePrice ? _self.averagePrice : averagePrice // ignore: cast_nullable_to_non_nullable
as double?,statusMessage: freezed == statusMessage ? _self.statusMessage : statusMessage // ignore: cast_nullable_to_non_nullable
as String?,tag: freezed == tag ? _self.tag : tag // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$MarketOverview {

 List<IndexQuote> get indices; List<WatchStock> get stocks;
/// Create a copy of MarketOverview
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MarketOverviewCopyWith<MarketOverview> get copyWith => _$MarketOverviewCopyWithImpl<MarketOverview>(this as MarketOverview, _$identity);

  /// Serializes this MarketOverview to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MarketOverview&&const DeepCollectionEquality().equals(other.indices, indices)&&const DeepCollectionEquality().equals(other.stocks, stocks));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(indices),const DeepCollectionEquality().hash(stocks));

@override
String toString() {
  return 'MarketOverview(indices: $indices, stocks: $stocks)';
}


}

/// @nodoc
abstract mixin class $MarketOverviewCopyWith<$Res>  {
  factory $MarketOverviewCopyWith(MarketOverview value, $Res Function(MarketOverview) _then) = _$MarketOverviewCopyWithImpl;
@useResult
$Res call({
 List<IndexQuote> indices, List<WatchStock> stocks
});




}
/// @nodoc
class _$MarketOverviewCopyWithImpl<$Res>
    implements $MarketOverviewCopyWith<$Res> {
  _$MarketOverviewCopyWithImpl(this._self, this._then);

  final MarketOverview _self;
  final $Res Function(MarketOverview) _then;

/// Create a copy of MarketOverview
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? indices = null,Object? stocks = null,}) {
  return _then(_self.copyWith(
indices: null == indices ? _self.indices : indices // ignore: cast_nullable_to_non_nullable
as List<IndexQuote>,stocks: null == stocks ? _self.stocks : stocks // ignore: cast_nullable_to_non_nullable
as List<WatchStock>,
  ));
}

}


/// Adds pattern-matching-related methods to [MarketOverview].
extension MarketOverviewPatterns on MarketOverview {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MarketOverview value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MarketOverview() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MarketOverview value)  $default,){
final _that = this;
switch (_that) {
case _MarketOverview():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MarketOverview value)?  $default,){
final _that = this;
switch (_that) {
case _MarketOverview() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<IndexQuote> indices,  List<WatchStock> stocks)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MarketOverview() when $default != null:
return $default(_that.indices,_that.stocks);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<IndexQuote> indices,  List<WatchStock> stocks)  $default,) {final _that = this;
switch (_that) {
case _MarketOverview():
return $default(_that.indices,_that.stocks);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<IndexQuote> indices,  List<WatchStock> stocks)?  $default,) {final _that = this;
switch (_that) {
case _MarketOverview() when $default != null:
return $default(_that.indices,_that.stocks);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MarketOverview implements MarketOverview {
  const _MarketOverview({final  List<IndexQuote> indices = const [], final  List<WatchStock> stocks = const []}): _indices = indices,_stocks = stocks;
  factory _MarketOverview.fromJson(Map<String, dynamic> json) => _$MarketOverviewFromJson(json);

 final  List<IndexQuote> _indices;
@override@JsonKey() List<IndexQuote> get indices {
  if (_indices is EqualUnmodifiableListView) return _indices;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_indices);
}

 final  List<WatchStock> _stocks;
@override@JsonKey() List<WatchStock> get stocks {
  if (_stocks is EqualUnmodifiableListView) return _stocks;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_stocks);
}


/// Create a copy of MarketOverview
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MarketOverviewCopyWith<_MarketOverview> get copyWith => __$MarketOverviewCopyWithImpl<_MarketOverview>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MarketOverviewToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MarketOverview&&const DeepCollectionEquality().equals(other._indices, _indices)&&const DeepCollectionEquality().equals(other._stocks, _stocks));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_indices),const DeepCollectionEquality().hash(_stocks));

@override
String toString() {
  return 'MarketOverview(indices: $indices, stocks: $stocks)';
}


}

/// @nodoc
abstract mixin class _$MarketOverviewCopyWith<$Res> implements $MarketOverviewCopyWith<$Res> {
  factory _$MarketOverviewCopyWith(_MarketOverview value, $Res Function(_MarketOverview) _then) = __$MarketOverviewCopyWithImpl;
@override @useResult
$Res call({
 List<IndexQuote> indices, List<WatchStock> stocks
});




}
/// @nodoc
class __$MarketOverviewCopyWithImpl<$Res>
    implements _$MarketOverviewCopyWith<$Res> {
  __$MarketOverviewCopyWithImpl(this._self, this._then);

  final _MarketOverview _self;
  final $Res Function(_MarketOverview) _then;

/// Create a copy of MarketOverview
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? indices = null,Object? stocks = null,}) {
  return _then(_MarketOverview(
indices: null == indices ? _self._indices : indices // ignore: cast_nullable_to_non_nullable
as List<IndexQuote>,stocks: null == stocks ? _self._stocks : stocks // ignore: cast_nullable_to_non_nullable
as List<WatchStock>,
  ));
}


}


/// @nodoc
mixin _$IndexQuote {

 String get symbol;/// Kite key such as `NSE:NIFTY 50`; absent when the broker is not connected.
 String? get key; double get price; double? get close;/// Percent change vs previous close.
 double get change; double get changeAbs;
/// Create a copy of IndexQuote
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$IndexQuoteCopyWith<IndexQuote> get copyWith => _$IndexQuoteCopyWithImpl<IndexQuote>(this as IndexQuote, _$identity);

  /// Serializes this IndexQuote to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is IndexQuote&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.key, key) || other.key == key)&&(identical(other.price, price) || other.price == price)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change)&&(identical(other.changeAbs, changeAbs) || other.changeAbs == changeAbs));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,key,price,close,change,changeAbs);

@override
String toString() {
  return 'IndexQuote(symbol: $symbol, key: $key, price: $price, close: $close, change: $change, changeAbs: $changeAbs)';
}


}

/// @nodoc
abstract mixin class $IndexQuoteCopyWith<$Res>  {
  factory $IndexQuoteCopyWith(IndexQuote value, $Res Function(IndexQuote) _then) = _$IndexQuoteCopyWithImpl;
@useResult
$Res call({
 String symbol, String? key, double price, double? close, double change, double changeAbs
});




}
/// @nodoc
class _$IndexQuoteCopyWithImpl<$Res>
    implements $IndexQuoteCopyWith<$Res> {
  _$IndexQuoteCopyWithImpl(this._self, this._then);

  final IndexQuote _self;
  final $Res Function(IndexQuote) _then;

/// Create a copy of IndexQuote
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? key = freezed,Object? price = null,Object? close = freezed,Object? change = null,Object? changeAbs = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,key: freezed == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as String?,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: null == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double,changeAbs: null == changeAbs ? _self.changeAbs : changeAbs // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [IndexQuote].
extension IndexQuotePatterns on IndexQuote {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _IndexQuote value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _IndexQuote() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _IndexQuote value)  $default,){
final _that = this;
switch (_that) {
case _IndexQuote():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _IndexQuote value)?  $default,){
final _that = this;
switch (_that) {
case _IndexQuote() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String? key,  double price,  double? close,  double change,  double changeAbs)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _IndexQuote() when $default != null:
return $default(_that.symbol,_that.key,_that.price,_that.close,_that.change,_that.changeAbs);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String? key,  double price,  double? close,  double change,  double changeAbs)  $default,) {final _that = this;
switch (_that) {
case _IndexQuote():
return $default(_that.symbol,_that.key,_that.price,_that.close,_that.change,_that.changeAbs);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String? key,  double price,  double? close,  double change,  double changeAbs)?  $default,) {final _that = this;
switch (_that) {
case _IndexQuote() when $default != null:
return $default(_that.symbol,_that.key,_that.price,_that.close,_that.change,_that.changeAbs);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _IndexQuote implements IndexQuote {
  const _IndexQuote({required this.symbol, this.key, this.price = 0, this.close, this.change = 0, this.changeAbs = 0});
  factory _IndexQuote.fromJson(Map<String, dynamic> json) => _$IndexQuoteFromJson(json);

@override final  String symbol;
/// Kite key such as `NSE:NIFTY 50`; absent when the broker is not connected.
@override final  String? key;
@override@JsonKey() final  double price;
@override final  double? close;
/// Percent change vs previous close.
@override@JsonKey() final  double change;
@override@JsonKey() final  double changeAbs;

/// Create a copy of IndexQuote
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$IndexQuoteCopyWith<_IndexQuote> get copyWith => __$IndexQuoteCopyWithImpl<_IndexQuote>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$IndexQuoteToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _IndexQuote&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.key, key) || other.key == key)&&(identical(other.price, price) || other.price == price)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change)&&(identical(other.changeAbs, changeAbs) || other.changeAbs == changeAbs));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,key,price,close,change,changeAbs);

@override
String toString() {
  return 'IndexQuote(symbol: $symbol, key: $key, price: $price, close: $close, change: $change, changeAbs: $changeAbs)';
}


}

/// @nodoc
abstract mixin class _$IndexQuoteCopyWith<$Res> implements $IndexQuoteCopyWith<$Res> {
  factory _$IndexQuoteCopyWith(_IndexQuote value, $Res Function(_IndexQuote) _then) = __$IndexQuoteCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String? key, double price, double? close, double change, double changeAbs
});




}
/// @nodoc
class __$IndexQuoteCopyWithImpl<$Res>
    implements _$IndexQuoteCopyWith<$Res> {
  __$IndexQuoteCopyWithImpl(this._self, this._then);

  final _IndexQuote _self;
  final $Res Function(_IndexQuote) _then;

/// Create a copy of IndexQuote
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? key = freezed,Object? price = null,Object? close = freezed,Object? change = null,Object? changeAbs = null,}) {
  return _then(_IndexQuote(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,key: freezed == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as String?,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: null == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double,changeAbs: null == changeAbs ? _self.changeAbs : changeAbs // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$WatchStock {

 String get symbol; String get exchange; String get key; double get price; double? get close;/// Percent change vs previous close.
 double get change;
/// Create a copy of WatchStock
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$WatchStockCopyWith<WatchStock> get copyWith => _$WatchStockCopyWithImpl<WatchStock>(this as WatchStock, _$identity);

  /// Serializes this WatchStock to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is WatchStock&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.key, key) || other.key == key)&&(identical(other.price, price) || other.price == price)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,key,price,close,change);

@override
String toString() {
  return 'WatchStock(symbol: $symbol, exchange: $exchange, key: $key, price: $price, close: $close, change: $change)';
}


}

/// @nodoc
abstract mixin class $WatchStockCopyWith<$Res>  {
  factory $WatchStockCopyWith(WatchStock value, $Res Function(WatchStock) _then) = _$WatchStockCopyWithImpl;
@useResult
$Res call({
 String symbol, String exchange, String key, double price, double? close, double change
});




}
/// @nodoc
class _$WatchStockCopyWithImpl<$Res>
    implements $WatchStockCopyWith<$Res> {
  _$WatchStockCopyWithImpl(this._self, this._then);

  final WatchStock _self;
  final $Res Function(WatchStock) _then;

/// Create a copy of WatchStock
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = null,Object? key = null,Object? price = null,Object? close = freezed,Object? change = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,key: null == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as String,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: null == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [WatchStock].
extension WatchStockPatterns on WatchStock {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _WatchStock value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _WatchStock() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _WatchStock value)  $default,){
final _that = this;
switch (_that) {
case _WatchStock():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _WatchStock value)?  $default,){
final _that = this;
switch (_that) {
case _WatchStock() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String exchange,  String key,  double price,  double? close,  double change)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _WatchStock() when $default != null:
return $default(_that.symbol,_that.exchange,_that.key,_that.price,_that.close,_that.change);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String exchange,  String key,  double price,  double? close,  double change)  $default,) {final _that = this;
switch (_that) {
case _WatchStock():
return $default(_that.symbol,_that.exchange,_that.key,_that.price,_that.close,_that.change);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String exchange,  String key,  double price,  double? close,  double change)?  $default,) {final _that = this;
switch (_that) {
case _WatchStock() when $default != null:
return $default(_that.symbol,_that.exchange,_that.key,_that.price,_that.close,_that.change);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _WatchStock implements WatchStock {
  const _WatchStock({required this.symbol, required this.exchange, required this.key, this.price = 0, this.close, this.change = 0});
  factory _WatchStock.fromJson(Map<String, dynamic> json) => _$WatchStockFromJson(json);

@override final  String symbol;
@override final  String exchange;
@override final  String key;
@override@JsonKey() final  double price;
@override final  double? close;
/// Percent change vs previous close.
@override@JsonKey() final  double change;

/// Create a copy of WatchStock
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$WatchStockCopyWith<_WatchStock> get copyWith => __$WatchStockCopyWithImpl<_WatchStock>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$WatchStockToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _WatchStock&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.key, key) || other.key == key)&&(identical(other.price, price) || other.price == price)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,key,price,close,change);

@override
String toString() {
  return 'WatchStock(symbol: $symbol, exchange: $exchange, key: $key, price: $price, close: $close, change: $change)';
}


}

/// @nodoc
abstract mixin class _$WatchStockCopyWith<$Res> implements $WatchStockCopyWith<$Res> {
  factory _$WatchStockCopyWith(_WatchStock value, $Res Function(_WatchStock) _then) = __$WatchStockCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String exchange, String key, double price, double? close, double change
});




}
/// @nodoc
class __$WatchStockCopyWithImpl<$Res>
    implements _$WatchStockCopyWith<$Res> {
  __$WatchStockCopyWithImpl(this._self, this._then);

  final _WatchStock _self;
  final $Res Function(_WatchStock) _then;

/// Create a copy of WatchStock
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = null,Object? key = null,Object? price = null,Object? close = freezed,Object? change = null,}) {
  return _then(_WatchStock(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,key: null == key ? _self.key : key // ignore: cast_nullable_to_non_nullable
as String,price: null == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: null == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$Movers {

 List<Mover> get topGainers; List<Mover> get topLosers;
/// Create a copy of Movers
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MoversCopyWith<Movers> get copyWith => _$MoversCopyWithImpl<Movers>(this as Movers, _$identity);

  /// Serializes this Movers to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Movers&&const DeepCollectionEquality().equals(other.topGainers, topGainers)&&const DeepCollectionEquality().equals(other.topLosers, topLosers));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(topGainers),const DeepCollectionEquality().hash(topLosers));

@override
String toString() {
  return 'Movers(topGainers: $topGainers, topLosers: $topLosers)';
}


}

/// @nodoc
abstract mixin class $MoversCopyWith<$Res>  {
  factory $MoversCopyWith(Movers value, $Res Function(Movers) _then) = _$MoversCopyWithImpl;
@useResult
$Res call({
 List<Mover> topGainers, List<Mover> topLosers
});




}
/// @nodoc
class _$MoversCopyWithImpl<$Res>
    implements $MoversCopyWith<$Res> {
  _$MoversCopyWithImpl(this._self, this._then);

  final Movers _self;
  final $Res Function(Movers) _then;

/// Create a copy of Movers
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? topGainers = null,Object? topLosers = null,}) {
  return _then(_self.copyWith(
topGainers: null == topGainers ? _self.topGainers : topGainers // ignore: cast_nullable_to_non_nullable
as List<Mover>,topLosers: null == topLosers ? _self.topLosers : topLosers // ignore: cast_nullable_to_non_nullable
as List<Mover>,
  ));
}

}


/// Adds pattern-matching-related methods to [Movers].
extension MoversPatterns on Movers {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Movers value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Movers() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Movers value)  $default,){
final _that = this;
switch (_that) {
case _Movers():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Movers value)?  $default,){
final _that = this;
switch (_that) {
case _Movers() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<Mover> topGainers,  List<Mover> topLosers)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Movers() when $default != null:
return $default(_that.topGainers,_that.topLosers);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<Mover> topGainers,  List<Mover> topLosers)  $default,) {final _that = this;
switch (_that) {
case _Movers():
return $default(_that.topGainers,_that.topLosers);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<Mover> topGainers,  List<Mover> topLosers)?  $default,) {final _that = this;
switch (_that) {
case _Movers() when $default != null:
return $default(_that.topGainers,_that.topLosers);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Movers implements Movers {
  const _Movers({final  List<Mover> topGainers = const [], final  List<Mover> topLosers = const []}): _topGainers = topGainers,_topLosers = topLosers;
  factory _Movers.fromJson(Map<String, dynamic> json) => _$MoversFromJson(json);

 final  List<Mover> _topGainers;
@override@JsonKey() List<Mover> get topGainers {
  if (_topGainers is EqualUnmodifiableListView) return _topGainers;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_topGainers);
}

 final  List<Mover> _topLosers;
@override@JsonKey() List<Mover> get topLosers {
  if (_topLosers is EqualUnmodifiableListView) return _topLosers;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_topLosers);
}


/// Create a copy of Movers
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MoversCopyWith<_Movers> get copyWith => __$MoversCopyWithImpl<_Movers>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MoversToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Movers&&const DeepCollectionEquality().equals(other._topGainers, _topGainers)&&const DeepCollectionEquality().equals(other._topLosers, _topLosers));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_topGainers),const DeepCollectionEquality().hash(_topLosers));

@override
String toString() {
  return 'Movers(topGainers: $topGainers, topLosers: $topLosers)';
}


}

/// @nodoc
abstract mixin class _$MoversCopyWith<$Res> implements $MoversCopyWith<$Res> {
  factory _$MoversCopyWith(_Movers value, $Res Function(_Movers) _then) = __$MoversCopyWithImpl;
@override @useResult
$Res call({
 List<Mover> topGainers, List<Mover> topLosers
});




}
/// @nodoc
class __$MoversCopyWithImpl<$Res>
    implements _$MoversCopyWith<$Res> {
  __$MoversCopyWithImpl(this._self, this._then);

  final _Movers _self;
  final $Res Function(_Movers) _then;

/// Create a copy of Movers
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? topGainers = null,Object? topLosers = null,}) {
  return _then(_Movers(
topGainers: null == topGainers ? _self._topGainers : topGainers // ignore: cast_nullable_to_non_nullable
as List<Mover>,topLosers: null == topLosers ? _self._topLosers : topLosers // ignore: cast_nullable_to_non_nullable
as List<Mover>,
  ));
}


}


/// @nodoc
mixin _$Mover {

 String get symbol; String get exchange; double get ltp; double? get close; double get change; double get changePercent;
/// Create a copy of Mover
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MoverCopyWith<Mover> get copyWith => _$MoverCopyWithImpl<Mover>(this as Mover, _$identity);

  /// Serializes this Mover to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Mover&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change)&&(identical(other.changePercent, changePercent) || other.changePercent == changePercent));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,ltp,close,change,changePercent);

@override
String toString() {
  return 'Mover(symbol: $symbol, exchange: $exchange, ltp: $ltp, close: $close, change: $change, changePercent: $changePercent)';
}


}

/// @nodoc
abstract mixin class $MoverCopyWith<$Res>  {
  factory $MoverCopyWith(Mover value, $Res Function(Mover) _then) = _$MoverCopyWithImpl;
@useResult
$Res call({
 String symbol, String exchange, double ltp, double? close, double change, double changePercent
});




}
/// @nodoc
class _$MoverCopyWithImpl<$Res>
    implements $MoverCopyWith<$Res> {
  _$MoverCopyWithImpl(this._self, this._then);

  final Mover _self;
  final $Res Function(Mover) _then;

/// Create a copy of Mover
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = null,Object? ltp = null,Object? close = freezed,Object? change = null,Object? changePercent = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: null == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double,changePercent: null == changePercent ? _self.changePercent : changePercent // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [Mover].
extension MoverPatterns on Mover {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Mover value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Mover() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Mover value)  $default,){
final _that = this;
switch (_that) {
case _Mover():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Mover value)?  $default,){
final _that = this;
switch (_that) {
case _Mover() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String exchange,  double ltp,  double? close,  double change,  double changePercent)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Mover() when $default != null:
return $default(_that.symbol,_that.exchange,_that.ltp,_that.close,_that.change,_that.changePercent);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String exchange,  double ltp,  double? close,  double change,  double changePercent)  $default,) {final _that = this;
switch (_that) {
case _Mover():
return $default(_that.symbol,_that.exchange,_that.ltp,_that.close,_that.change,_that.changePercent);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String exchange,  double ltp,  double? close,  double change,  double changePercent)?  $default,) {final _that = this;
switch (_that) {
case _Mover() when $default != null:
return $default(_that.symbol,_that.exchange,_that.ltp,_that.close,_that.change,_that.changePercent);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Mover implements Mover {
  const _Mover({required this.symbol, this.exchange = 'NSE', this.ltp = 0, this.close, this.change = 0, this.changePercent = 0});
  factory _Mover.fromJson(Map<String, dynamic> json) => _$MoverFromJson(json);

@override final  String symbol;
@override@JsonKey() final  String exchange;
@override@JsonKey() final  double ltp;
@override final  double? close;
@override@JsonKey() final  double change;
@override@JsonKey() final  double changePercent;

/// Create a copy of Mover
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MoverCopyWith<_Mover> get copyWith => __$MoverCopyWithImpl<_Mover>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MoverToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Mover&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.close, close) || other.close == close)&&(identical(other.change, change) || other.change == change)&&(identical(other.changePercent, changePercent) || other.changePercent == changePercent));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,ltp,close,change,changePercent);

@override
String toString() {
  return 'Mover(symbol: $symbol, exchange: $exchange, ltp: $ltp, close: $close, change: $change, changePercent: $changePercent)';
}


}

/// @nodoc
abstract mixin class _$MoverCopyWith<$Res> implements $MoverCopyWith<$Res> {
  factory _$MoverCopyWith(_Mover value, $Res Function(_Mover) _then) = __$MoverCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String exchange, double ltp, double? close, double change, double changePercent
});




}
/// @nodoc
class __$MoverCopyWithImpl<$Res>
    implements _$MoverCopyWith<$Res> {
  __$MoverCopyWithImpl(this._self, this._then);

  final _Mover _self;
  final $Res Function(_Mover) _then;

/// Create a copy of Mover
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = null,Object? ltp = null,Object? close = freezed,Object? change = null,Object? changePercent = null,}) {
  return _then(_Mover(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,close: freezed == close ? _self.close : close // ignore: cast_nullable_to_non_nullable
as double?,change: null == change ? _self.change : change // ignore: cast_nullable_to_non_nullable
as double,changePercent: null == changePercent ? _self.changePercent : changePercent // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$SessionInfo {

@JsonKey(unknownEnumValue: SessionState.closed) SessionState get state; DateTime? get nextOpenAt; DateTime? get closesAt;
/// Create a copy of SessionInfo
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SessionInfoCopyWith<SessionInfo> get copyWith => _$SessionInfoCopyWithImpl<SessionInfo>(this as SessionInfo, _$identity);

  /// Serializes this SessionInfo to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SessionInfo&&(identical(other.state, state) || other.state == state)&&(identical(other.nextOpenAt, nextOpenAt) || other.nextOpenAt == nextOpenAt)&&(identical(other.closesAt, closesAt) || other.closesAt == closesAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,state,nextOpenAt,closesAt);

@override
String toString() {
  return 'SessionInfo(state: $state, nextOpenAt: $nextOpenAt, closesAt: $closesAt)';
}


}

/// @nodoc
abstract mixin class $SessionInfoCopyWith<$Res>  {
  factory $SessionInfoCopyWith(SessionInfo value, $Res Function(SessionInfo) _then) = _$SessionInfoCopyWithImpl;
@useResult
$Res call({
@JsonKey(unknownEnumValue: SessionState.closed) SessionState state, DateTime? nextOpenAt, DateTime? closesAt
});




}
/// @nodoc
class _$SessionInfoCopyWithImpl<$Res>
    implements $SessionInfoCopyWith<$Res> {
  _$SessionInfoCopyWithImpl(this._self, this._then);

  final SessionInfo _self;
  final $Res Function(SessionInfo) _then;

/// Create a copy of SessionInfo
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? state = null,Object? nextOpenAt = freezed,Object? closesAt = freezed,}) {
  return _then(_self.copyWith(
state: null == state ? _self.state : state // ignore: cast_nullable_to_non_nullable
as SessionState,nextOpenAt: freezed == nextOpenAt ? _self.nextOpenAt : nextOpenAt // ignore: cast_nullable_to_non_nullable
as DateTime?,closesAt: freezed == closesAt ? _self.closesAt : closesAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [SessionInfo].
extension SessionInfoPatterns on SessionInfo {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SessionInfo value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SessionInfo() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SessionInfo value)  $default,){
final _that = this;
switch (_that) {
case _SessionInfo():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SessionInfo value)?  $default,){
final _that = this;
switch (_that) {
case _SessionInfo() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function(@JsonKey(unknownEnumValue: SessionState.closed)  SessionState state,  DateTime? nextOpenAt,  DateTime? closesAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SessionInfo() when $default != null:
return $default(_that.state,_that.nextOpenAt,_that.closesAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function(@JsonKey(unknownEnumValue: SessionState.closed)  SessionState state,  DateTime? nextOpenAt,  DateTime? closesAt)  $default,) {final _that = this;
switch (_that) {
case _SessionInfo():
return $default(_that.state,_that.nextOpenAt,_that.closesAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function(@JsonKey(unknownEnumValue: SessionState.closed)  SessionState state,  DateTime? nextOpenAt,  DateTime? closesAt)?  $default,) {final _that = this;
switch (_that) {
case _SessionInfo() when $default != null:
return $default(_that.state,_that.nextOpenAt,_that.closesAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SessionInfo implements SessionInfo {
  const _SessionInfo({@JsonKey(unknownEnumValue: SessionState.closed) required this.state, this.nextOpenAt, this.closesAt});
  factory _SessionInfo.fromJson(Map<String, dynamic> json) => _$SessionInfoFromJson(json);

@override@JsonKey(unknownEnumValue: SessionState.closed) final  SessionState state;
@override final  DateTime? nextOpenAt;
@override final  DateTime? closesAt;

/// Create a copy of SessionInfo
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SessionInfoCopyWith<_SessionInfo> get copyWith => __$SessionInfoCopyWithImpl<_SessionInfo>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SessionInfoToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SessionInfo&&(identical(other.state, state) || other.state == state)&&(identical(other.nextOpenAt, nextOpenAt) || other.nextOpenAt == nextOpenAt)&&(identical(other.closesAt, closesAt) || other.closesAt == closesAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,state,nextOpenAt,closesAt);

@override
String toString() {
  return 'SessionInfo(state: $state, nextOpenAt: $nextOpenAt, closesAt: $closesAt)';
}


}

/// @nodoc
abstract mixin class _$SessionInfoCopyWith<$Res> implements $SessionInfoCopyWith<$Res> {
  factory _$SessionInfoCopyWith(_SessionInfo value, $Res Function(_SessionInfo) _then) = __$SessionInfoCopyWithImpl;
@override @useResult
$Res call({
@JsonKey(unknownEnumValue: SessionState.closed) SessionState state, DateTime? nextOpenAt, DateTime? closesAt
});




}
/// @nodoc
class __$SessionInfoCopyWithImpl<$Res>
    implements _$SessionInfoCopyWith<$Res> {
  __$SessionInfoCopyWithImpl(this._self, this._then);

  final _SessionInfo _self;
  final $Res Function(_SessionInfo) _then;

/// Create a copy of SessionInfo
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? state = null,Object? nextOpenAt = freezed,Object? closesAt = freezed,}) {
  return _then(_SessionInfo(
state: null == state ? _self.state : state // ignore: cast_nullable_to_non_nullable
as SessionState,nextOpenAt: freezed == nextOpenAt ? _self.nextOpenAt : nextOpenAt // ignore: cast_nullable_to_non_nullable
as DateTime?,closesAt: freezed == closesAt ? _self.closesAt : closesAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}

// dart format on
