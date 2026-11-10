// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'portfolio_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$BrokerPosition {

 String get symbol; String? get exchange; int get qty; double get avgPrice; double get ltp; double get pnl; String get side; String get product;
/// Create a copy of BrokerPosition
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BrokerPositionCopyWith<BrokerPosition> get copyWith => _$BrokerPositionCopyWithImpl<BrokerPosition>(this as BrokerPosition, _$identity);

  /// Serializes this BrokerPosition to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BrokerPosition&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.avgPrice, avgPrice) || other.avgPrice == avgPrice)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.pnl, pnl) || other.pnl == pnl)&&(identical(other.side, side) || other.side == side)&&(identical(other.product, product) || other.product == product));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,qty,avgPrice,ltp,pnl,side,product);

@override
String toString() {
  return 'BrokerPosition(symbol: $symbol, exchange: $exchange, qty: $qty, avgPrice: $avgPrice, ltp: $ltp, pnl: $pnl, side: $side, product: $product)';
}


}

/// @nodoc
abstract mixin class $BrokerPositionCopyWith<$Res>  {
  factory $BrokerPositionCopyWith(BrokerPosition value, $Res Function(BrokerPosition) _then) = _$BrokerPositionCopyWithImpl;
@useResult
$Res call({
 String symbol, String? exchange, int qty, double avgPrice, double ltp, double pnl, String side, String product
});




}
/// @nodoc
class _$BrokerPositionCopyWithImpl<$Res>
    implements $BrokerPositionCopyWith<$Res> {
  _$BrokerPositionCopyWithImpl(this._self, this._then);

  final BrokerPosition _self;
  final $Res Function(BrokerPosition) _then;

/// Create a copy of BrokerPosition
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = freezed,Object? qty = null,Object? avgPrice = null,Object? ltp = null,Object? pnl = null,Object? side = null,Object? product = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: freezed == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,avgPrice: null == avgPrice ? _self.avgPrice : avgPrice // ignore: cast_nullable_to_non_nullable
as double,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,pnl: null == pnl ? _self.pnl : pnl // ignore: cast_nullable_to_non_nullable
as double,side: null == side ? _self.side : side // ignore: cast_nullable_to_non_nullable
as String,product: null == product ? _self.product : product // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [BrokerPosition].
extension BrokerPositionPatterns on BrokerPosition {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BrokerPosition value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BrokerPosition() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BrokerPosition value)  $default,){
final _that = this;
switch (_that) {
case _BrokerPosition():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BrokerPosition value)?  $default,){
final _that = this;
switch (_that) {
case _BrokerPosition() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String? exchange,  int qty,  double avgPrice,  double ltp,  double pnl,  String side,  String product)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BrokerPosition() when $default != null:
return $default(_that.symbol,_that.exchange,_that.qty,_that.avgPrice,_that.ltp,_that.pnl,_that.side,_that.product);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String? exchange,  int qty,  double avgPrice,  double ltp,  double pnl,  String side,  String product)  $default,) {final _that = this;
switch (_that) {
case _BrokerPosition():
return $default(_that.symbol,_that.exchange,_that.qty,_that.avgPrice,_that.ltp,_that.pnl,_that.side,_that.product);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String? exchange,  int qty,  double avgPrice,  double ltp,  double pnl,  String side,  String product)?  $default,) {final _that = this;
switch (_that) {
case _BrokerPosition() when $default != null:
return $default(_that.symbol,_that.exchange,_that.qty,_that.avgPrice,_that.ltp,_that.pnl,_that.side,_that.product);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BrokerPosition extends BrokerPosition {
  const _BrokerPosition({required this.symbol, this.exchange, this.qty = 0, this.avgPrice = 0, this.ltp = 0, this.pnl = 0, this.side = 'BUY', this.product = 'MIS'}): super._();
  factory _BrokerPosition.fromJson(Map<String, dynamic> json) => _$BrokerPositionFromJson(json);

@override final  String symbol;
@override final  String? exchange;
@override@JsonKey() final  int qty;
@override@JsonKey() final  double avgPrice;
@override@JsonKey() final  double ltp;
@override@JsonKey() final  double pnl;
@override@JsonKey() final  String side;
@override@JsonKey() final  String product;

/// Create a copy of BrokerPosition
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BrokerPositionCopyWith<_BrokerPosition> get copyWith => __$BrokerPositionCopyWithImpl<_BrokerPosition>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BrokerPositionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BrokerPosition&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.avgPrice, avgPrice) || other.avgPrice == avgPrice)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.pnl, pnl) || other.pnl == pnl)&&(identical(other.side, side) || other.side == side)&&(identical(other.product, product) || other.product == product));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,qty,avgPrice,ltp,pnl,side,product);

@override
String toString() {
  return 'BrokerPosition(symbol: $symbol, exchange: $exchange, qty: $qty, avgPrice: $avgPrice, ltp: $ltp, pnl: $pnl, side: $side, product: $product)';
}


}

/// @nodoc
abstract mixin class _$BrokerPositionCopyWith<$Res> implements $BrokerPositionCopyWith<$Res> {
  factory _$BrokerPositionCopyWith(_BrokerPosition value, $Res Function(_BrokerPosition) _then) = __$BrokerPositionCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String? exchange, int qty, double avgPrice, double ltp, double pnl, String side, String product
});




}
/// @nodoc
class __$BrokerPositionCopyWithImpl<$Res>
    implements _$BrokerPositionCopyWith<$Res> {
  __$BrokerPositionCopyWithImpl(this._self, this._then);

  final _BrokerPosition _self;
  final $Res Function(_BrokerPosition) _then;

/// Create a copy of BrokerPosition
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = freezed,Object? qty = null,Object? avgPrice = null,Object? ltp = null,Object? pnl = null,Object? side = null,Object? product = null,}) {
  return _then(_BrokerPosition(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: freezed == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,avgPrice: null == avgPrice ? _self.avgPrice : avgPrice // ignore: cast_nullable_to_non_nullable
as double,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,pnl: null == pnl ? _self.pnl : pnl // ignore: cast_nullable_to_non_nullable
as double,side: null == side ? _self.side : side // ignore: cast_nullable_to_non_nullable
as String,product: null == product ? _self.product : product // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$Holding {

 String get symbol; String? get exchange; int get qty; double get avgPrice; double get ltp; double? get pnl; double? get pnlPct; double? get closePrice;
/// Create a copy of Holding
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$HoldingCopyWith<Holding> get copyWith => _$HoldingCopyWithImpl<Holding>(this as Holding, _$identity);

  /// Serializes this Holding to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Holding&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.avgPrice, avgPrice) || other.avgPrice == avgPrice)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.pnl, pnl) || other.pnl == pnl)&&(identical(other.pnlPct, pnlPct) || other.pnlPct == pnlPct)&&(identical(other.closePrice, closePrice) || other.closePrice == closePrice));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,qty,avgPrice,ltp,pnl,pnlPct,closePrice);

@override
String toString() {
  return 'Holding(symbol: $symbol, exchange: $exchange, qty: $qty, avgPrice: $avgPrice, ltp: $ltp, pnl: $pnl, pnlPct: $pnlPct, closePrice: $closePrice)';
}


}

/// @nodoc
abstract mixin class $HoldingCopyWith<$Res>  {
  factory $HoldingCopyWith(Holding value, $Res Function(Holding) _then) = _$HoldingCopyWithImpl;
@useResult
$Res call({
 String symbol, String? exchange, int qty, double avgPrice, double ltp, double? pnl, double? pnlPct, double? closePrice
});




}
/// @nodoc
class _$HoldingCopyWithImpl<$Res>
    implements $HoldingCopyWith<$Res> {
  _$HoldingCopyWithImpl(this._self, this._then);

  final Holding _self;
  final $Res Function(Holding) _then;

/// Create a copy of Holding
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = freezed,Object? qty = null,Object? avgPrice = null,Object? ltp = null,Object? pnl = freezed,Object? pnlPct = freezed,Object? closePrice = freezed,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: freezed == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,avgPrice: null == avgPrice ? _self.avgPrice : avgPrice // ignore: cast_nullable_to_non_nullable
as double,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,pnl: freezed == pnl ? _self.pnl : pnl // ignore: cast_nullable_to_non_nullable
as double?,pnlPct: freezed == pnlPct ? _self.pnlPct : pnlPct // ignore: cast_nullable_to_non_nullable
as double?,closePrice: freezed == closePrice ? _self.closePrice : closePrice // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [Holding].
extension HoldingPatterns on Holding {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Holding value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Holding() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Holding value)  $default,){
final _that = this;
switch (_that) {
case _Holding():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Holding value)?  $default,){
final _that = this;
switch (_that) {
case _Holding() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String? exchange,  int qty,  double avgPrice,  double ltp,  double? pnl,  double? pnlPct,  double? closePrice)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Holding() when $default != null:
return $default(_that.symbol,_that.exchange,_that.qty,_that.avgPrice,_that.ltp,_that.pnl,_that.pnlPct,_that.closePrice);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String? exchange,  int qty,  double avgPrice,  double ltp,  double? pnl,  double? pnlPct,  double? closePrice)  $default,) {final _that = this;
switch (_that) {
case _Holding():
return $default(_that.symbol,_that.exchange,_that.qty,_that.avgPrice,_that.ltp,_that.pnl,_that.pnlPct,_that.closePrice);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String? exchange,  int qty,  double avgPrice,  double ltp,  double? pnl,  double? pnlPct,  double? closePrice)?  $default,) {final _that = this;
switch (_that) {
case _Holding() when $default != null:
return $default(_that.symbol,_that.exchange,_that.qty,_that.avgPrice,_that.ltp,_that.pnl,_that.pnlPct,_that.closePrice);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Holding implements Holding {
  const _Holding({required this.symbol, this.exchange, this.qty = 0, this.avgPrice = 0, this.ltp = 0, this.pnl, this.pnlPct, this.closePrice});
  factory _Holding.fromJson(Map<String, dynamic> json) => _$HoldingFromJson(json);

@override final  String symbol;
@override final  String? exchange;
@override@JsonKey() final  int qty;
@override@JsonKey() final  double avgPrice;
@override@JsonKey() final  double ltp;
@override final  double? pnl;
@override final  double? pnlPct;
@override final  double? closePrice;

/// Create a copy of Holding
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$HoldingCopyWith<_Holding> get copyWith => __$HoldingCopyWithImpl<_Holding>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$HoldingToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Holding&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.avgPrice, avgPrice) || other.avgPrice == avgPrice)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.pnl, pnl) || other.pnl == pnl)&&(identical(other.pnlPct, pnlPct) || other.pnlPct == pnlPct)&&(identical(other.closePrice, closePrice) || other.closePrice == closePrice));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,qty,avgPrice,ltp,pnl,pnlPct,closePrice);

@override
String toString() {
  return 'Holding(symbol: $symbol, exchange: $exchange, qty: $qty, avgPrice: $avgPrice, ltp: $ltp, pnl: $pnl, pnlPct: $pnlPct, closePrice: $closePrice)';
}


}

/// @nodoc
abstract mixin class _$HoldingCopyWith<$Res> implements $HoldingCopyWith<$Res> {
  factory _$HoldingCopyWith(_Holding value, $Res Function(_Holding) _then) = __$HoldingCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String? exchange, int qty, double avgPrice, double ltp, double? pnl, double? pnlPct, double? closePrice
});




}
/// @nodoc
class __$HoldingCopyWithImpl<$Res>
    implements _$HoldingCopyWith<$Res> {
  __$HoldingCopyWithImpl(this._self, this._then);

  final _Holding _self;
  final $Res Function(_Holding) _then;

/// Create a copy of Holding
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = freezed,Object? qty = null,Object? avgPrice = null,Object? ltp = null,Object? pnl = freezed,Object? pnlPct = freezed,Object? closePrice = freezed,}) {
  return _then(_Holding(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: freezed == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,avgPrice: null == avgPrice ? _self.avgPrice : avgPrice // ignore: cast_nullable_to_non_nullable
as double,ltp: null == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double,pnl: freezed == pnl ? _self.pnl : pnl // ignore: cast_nullable_to_non_nullable
as double?,pnlPct: freezed == pnlPct ? _self.pnlPct : pnlPct // ignore: cast_nullable_to_non_nullable
as double?,closePrice: freezed == closePrice ? _self.closePrice : closePrice // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$Margins {

 MarginSegment? get equity; MarginSegment? get commodity;
/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MarginsCopyWith<Margins> get copyWith => _$MarginsCopyWithImpl<Margins>(this as Margins, _$identity);

  /// Serializes this Margins to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Margins&&(identical(other.equity, equity) || other.equity == equity)&&(identical(other.commodity, commodity) || other.commodity == commodity));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,equity,commodity);

@override
String toString() {
  return 'Margins(equity: $equity, commodity: $commodity)';
}


}

/// @nodoc
abstract mixin class $MarginsCopyWith<$Res>  {
  factory $MarginsCopyWith(Margins value, $Res Function(Margins) _then) = _$MarginsCopyWithImpl;
@useResult
$Res call({
 MarginSegment? equity, MarginSegment? commodity
});


$MarginSegmentCopyWith<$Res>? get equity;$MarginSegmentCopyWith<$Res>? get commodity;

}
/// @nodoc
class _$MarginsCopyWithImpl<$Res>
    implements $MarginsCopyWith<$Res> {
  _$MarginsCopyWithImpl(this._self, this._then);

  final Margins _self;
  final $Res Function(Margins) _then;

/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? equity = freezed,Object? commodity = freezed,}) {
  return _then(_self.copyWith(
equity: freezed == equity ? _self.equity : equity // ignore: cast_nullable_to_non_nullable
as MarginSegment?,commodity: freezed == commodity ? _self.commodity : commodity // ignore: cast_nullable_to_non_nullable
as MarginSegment?,
  ));
}
/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginSegmentCopyWith<$Res>? get equity {
    if (_self.equity == null) {
    return null;
  }

  return $MarginSegmentCopyWith<$Res>(_self.equity!, (value) {
    return _then(_self.copyWith(equity: value));
  });
}/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginSegmentCopyWith<$Res>? get commodity {
    if (_self.commodity == null) {
    return null;
  }

  return $MarginSegmentCopyWith<$Res>(_self.commodity!, (value) {
    return _then(_self.copyWith(commodity: value));
  });
}
}


/// Adds pattern-matching-related methods to [Margins].
extension MarginsPatterns on Margins {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Margins value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Margins() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Margins value)  $default,){
final _that = this;
switch (_that) {
case _Margins():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Margins value)?  $default,){
final _that = this;
switch (_that) {
case _Margins() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( MarginSegment? equity,  MarginSegment? commodity)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Margins() when $default != null:
return $default(_that.equity,_that.commodity);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( MarginSegment? equity,  MarginSegment? commodity)  $default,) {final _that = this;
switch (_that) {
case _Margins():
return $default(_that.equity,_that.commodity);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( MarginSegment? equity,  MarginSegment? commodity)?  $default,) {final _that = this;
switch (_that) {
case _Margins() when $default != null:
return $default(_that.equity,_that.commodity);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Margins extends Margins {
  const _Margins({this.equity, this.commodity}): super._();
  factory _Margins.fromJson(Map<String, dynamic> json) => _$MarginsFromJson(json);

@override final  MarginSegment? equity;
@override final  MarginSegment? commodity;

/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MarginsCopyWith<_Margins> get copyWith => __$MarginsCopyWithImpl<_Margins>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MarginsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Margins&&(identical(other.equity, equity) || other.equity == equity)&&(identical(other.commodity, commodity) || other.commodity == commodity));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,equity,commodity);

@override
String toString() {
  return 'Margins(equity: $equity, commodity: $commodity)';
}


}

/// @nodoc
abstract mixin class _$MarginsCopyWith<$Res> implements $MarginsCopyWith<$Res> {
  factory _$MarginsCopyWith(_Margins value, $Res Function(_Margins) _then) = __$MarginsCopyWithImpl;
@override @useResult
$Res call({
 MarginSegment? equity, MarginSegment? commodity
});


@override $MarginSegmentCopyWith<$Res>? get equity;@override $MarginSegmentCopyWith<$Res>? get commodity;

}
/// @nodoc
class __$MarginsCopyWithImpl<$Res>
    implements _$MarginsCopyWith<$Res> {
  __$MarginsCopyWithImpl(this._self, this._then);

  final _Margins _self;
  final $Res Function(_Margins) _then;

/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? equity = freezed,Object? commodity = freezed,}) {
  return _then(_Margins(
equity: freezed == equity ? _self.equity : equity // ignore: cast_nullable_to_non_nullable
as MarginSegment?,commodity: freezed == commodity ? _self.commodity : commodity // ignore: cast_nullable_to_non_nullable
as MarginSegment?,
  ));
}

/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginSegmentCopyWith<$Res>? get equity {
    if (_self.equity == null) {
    return null;
  }

  return $MarginSegmentCopyWith<$Res>(_self.equity!, (value) {
    return _then(_self.copyWith(equity: value));
  });
}/// Create a copy of Margins
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginSegmentCopyWith<$Res>? get commodity {
    if (_self.commodity == null) {
    return null;
  }

  return $MarginSegmentCopyWith<$Res>(_self.commodity!, (value) {
    return _then(_self.copyWith(commodity: value));
  });
}
}


/// @nodoc
mixin _$MarginSegment {

 bool? get enabled; double? get net; MarginAvailable? get available; MarginUtilised? get utilised;
/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MarginSegmentCopyWith<MarginSegment> get copyWith => _$MarginSegmentCopyWithImpl<MarginSegment>(this as MarginSegment, _$identity);

  /// Serializes this MarginSegment to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MarginSegment&&(identical(other.enabled, enabled) || other.enabled == enabled)&&(identical(other.net, net) || other.net == net)&&(identical(other.available, available) || other.available == available)&&(identical(other.utilised, utilised) || other.utilised == utilised));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,enabled,net,available,utilised);

@override
String toString() {
  return 'MarginSegment(enabled: $enabled, net: $net, available: $available, utilised: $utilised)';
}


}

/// @nodoc
abstract mixin class $MarginSegmentCopyWith<$Res>  {
  factory $MarginSegmentCopyWith(MarginSegment value, $Res Function(MarginSegment) _then) = _$MarginSegmentCopyWithImpl;
@useResult
$Res call({
 bool? enabled, double? net, MarginAvailable? available, MarginUtilised? utilised
});


$MarginAvailableCopyWith<$Res>? get available;$MarginUtilisedCopyWith<$Res>? get utilised;

}
/// @nodoc
class _$MarginSegmentCopyWithImpl<$Res>
    implements $MarginSegmentCopyWith<$Res> {
  _$MarginSegmentCopyWithImpl(this._self, this._then);

  final MarginSegment _self;
  final $Res Function(MarginSegment) _then;

/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? enabled = freezed,Object? net = freezed,Object? available = freezed,Object? utilised = freezed,}) {
  return _then(_self.copyWith(
enabled: freezed == enabled ? _self.enabled : enabled // ignore: cast_nullable_to_non_nullable
as bool?,net: freezed == net ? _self.net : net // ignore: cast_nullable_to_non_nullable
as double?,available: freezed == available ? _self.available : available // ignore: cast_nullable_to_non_nullable
as MarginAvailable?,utilised: freezed == utilised ? _self.utilised : utilised // ignore: cast_nullable_to_non_nullable
as MarginUtilised?,
  ));
}
/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginAvailableCopyWith<$Res>? get available {
    if (_self.available == null) {
    return null;
  }

  return $MarginAvailableCopyWith<$Res>(_self.available!, (value) {
    return _then(_self.copyWith(available: value));
  });
}/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginUtilisedCopyWith<$Res>? get utilised {
    if (_self.utilised == null) {
    return null;
  }

  return $MarginUtilisedCopyWith<$Res>(_self.utilised!, (value) {
    return _then(_self.copyWith(utilised: value));
  });
}
}


/// Adds pattern-matching-related methods to [MarginSegment].
extension MarginSegmentPatterns on MarginSegment {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MarginSegment value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MarginSegment() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MarginSegment value)  $default,){
final _that = this;
switch (_that) {
case _MarginSegment():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MarginSegment value)?  $default,){
final _that = this;
switch (_that) {
case _MarginSegment() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool? enabled,  double? net,  MarginAvailable? available,  MarginUtilised? utilised)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MarginSegment() when $default != null:
return $default(_that.enabled,_that.net,_that.available,_that.utilised);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool? enabled,  double? net,  MarginAvailable? available,  MarginUtilised? utilised)  $default,) {final _that = this;
switch (_that) {
case _MarginSegment():
return $default(_that.enabled,_that.net,_that.available,_that.utilised);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool? enabled,  double? net,  MarginAvailable? available,  MarginUtilised? utilised)?  $default,) {final _that = this;
switch (_that) {
case _MarginSegment() when $default != null:
return $default(_that.enabled,_that.net,_that.available,_that.utilised);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MarginSegment implements MarginSegment {
  const _MarginSegment({this.enabled, this.net, this.available, this.utilised});
  factory _MarginSegment.fromJson(Map<String, dynamic> json) => _$MarginSegmentFromJson(json);

@override final  bool? enabled;
@override final  double? net;
@override final  MarginAvailable? available;
@override final  MarginUtilised? utilised;

/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MarginSegmentCopyWith<_MarginSegment> get copyWith => __$MarginSegmentCopyWithImpl<_MarginSegment>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MarginSegmentToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MarginSegment&&(identical(other.enabled, enabled) || other.enabled == enabled)&&(identical(other.net, net) || other.net == net)&&(identical(other.available, available) || other.available == available)&&(identical(other.utilised, utilised) || other.utilised == utilised));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,enabled,net,available,utilised);

@override
String toString() {
  return 'MarginSegment(enabled: $enabled, net: $net, available: $available, utilised: $utilised)';
}


}

/// @nodoc
abstract mixin class _$MarginSegmentCopyWith<$Res> implements $MarginSegmentCopyWith<$Res> {
  factory _$MarginSegmentCopyWith(_MarginSegment value, $Res Function(_MarginSegment) _then) = __$MarginSegmentCopyWithImpl;
@override @useResult
$Res call({
 bool? enabled, double? net, MarginAvailable? available, MarginUtilised? utilised
});


@override $MarginAvailableCopyWith<$Res>? get available;@override $MarginUtilisedCopyWith<$Res>? get utilised;

}
/// @nodoc
class __$MarginSegmentCopyWithImpl<$Res>
    implements _$MarginSegmentCopyWith<$Res> {
  __$MarginSegmentCopyWithImpl(this._self, this._then);

  final _MarginSegment _self;
  final $Res Function(_MarginSegment) _then;

/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? enabled = freezed,Object? net = freezed,Object? available = freezed,Object? utilised = freezed,}) {
  return _then(_MarginSegment(
enabled: freezed == enabled ? _self.enabled : enabled // ignore: cast_nullable_to_non_nullable
as bool?,net: freezed == net ? _self.net : net // ignore: cast_nullable_to_non_nullable
as double?,available: freezed == available ? _self.available : available // ignore: cast_nullable_to_non_nullable
as MarginAvailable?,utilised: freezed == utilised ? _self.utilised : utilised // ignore: cast_nullable_to_non_nullable
as MarginUtilised?,
  ));
}

/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginAvailableCopyWith<$Res>? get available {
    if (_self.available == null) {
    return null;
  }

  return $MarginAvailableCopyWith<$Res>(_self.available!, (value) {
    return _then(_self.copyWith(available: value));
  });
}/// Create a copy of MarginSegment
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$MarginUtilisedCopyWith<$Res>? get utilised {
    if (_self.utilised == null) {
    return null;
  }

  return $MarginUtilisedCopyWith<$Res>(_self.utilised!, (value) {
    return _then(_self.copyWith(utilised: value));
  });
}
}


/// @nodoc
mixin _$MarginAvailable {

 double? get cash;@JsonKey(name: 'live_balance') double? get liveBalance;@JsonKey(name: 'opening_balance') double? get openingBalance; double? get collateral;@JsonKey(name: 'intraday_payin') double? get intradayPayin;
/// Create a copy of MarginAvailable
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MarginAvailableCopyWith<MarginAvailable> get copyWith => _$MarginAvailableCopyWithImpl<MarginAvailable>(this as MarginAvailable, _$identity);

  /// Serializes this MarginAvailable to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MarginAvailable&&(identical(other.cash, cash) || other.cash == cash)&&(identical(other.liveBalance, liveBalance) || other.liveBalance == liveBalance)&&(identical(other.openingBalance, openingBalance) || other.openingBalance == openingBalance)&&(identical(other.collateral, collateral) || other.collateral == collateral)&&(identical(other.intradayPayin, intradayPayin) || other.intradayPayin == intradayPayin));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,cash,liveBalance,openingBalance,collateral,intradayPayin);

@override
String toString() {
  return 'MarginAvailable(cash: $cash, liveBalance: $liveBalance, openingBalance: $openingBalance, collateral: $collateral, intradayPayin: $intradayPayin)';
}


}

/// @nodoc
abstract mixin class $MarginAvailableCopyWith<$Res>  {
  factory $MarginAvailableCopyWith(MarginAvailable value, $Res Function(MarginAvailable) _then) = _$MarginAvailableCopyWithImpl;
@useResult
$Res call({
 double? cash,@JsonKey(name: 'live_balance') double? liveBalance,@JsonKey(name: 'opening_balance') double? openingBalance, double? collateral,@JsonKey(name: 'intraday_payin') double? intradayPayin
});




}
/// @nodoc
class _$MarginAvailableCopyWithImpl<$Res>
    implements $MarginAvailableCopyWith<$Res> {
  _$MarginAvailableCopyWithImpl(this._self, this._then);

  final MarginAvailable _self;
  final $Res Function(MarginAvailable) _then;

/// Create a copy of MarginAvailable
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? cash = freezed,Object? liveBalance = freezed,Object? openingBalance = freezed,Object? collateral = freezed,Object? intradayPayin = freezed,}) {
  return _then(_self.copyWith(
cash: freezed == cash ? _self.cash : cash // ignore: cast_nullable_to_non_nullable
as double?,liveBalance: freezed == liveBalance ? _self.liveBalance : liveBalance // ignore: cast_nullable_to_non_nullable
as double?,openingBalance: freezed == openingBalance ? _self.openingBalance : openingBalance // ignore: cast_nullable_to_non_nullable
as double?,collateral: freezed == collateral ? _self.collateral : collateral // ignore: cast_nullable_to_non_nullable
as double?,intradayPayin: freezed == intradayPayin ? _self.intradayPayin : intradayPayin // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [MarginAvailable].
extension MarginAvailablePatterns on MarginAvailable {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MarginAvailable value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MarginAvailable() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MarginAvailable value)  $default,){
final _that = this;
switch (_that) {
case _MarginAvailable():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MarginAvailable value)?  $default,){
final _that = this;
switch (_that) {
case _MarginAvailable() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double? cash, @JsonKey(name: 'live_balance')  double? liveBalance, @JsonKey(name: 'opening_balance')  double? openingBalance,  double? collateral, @JsonKey(name: 'intraday_payin')  double? intradayPayin)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MarginAvailable() when $default != null:
return $default(_that.cash,_that.liveBalance,_that.openingBalance,_that.collateral,_that.intradayPayin);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double? cash, @JsonKey(name: 'live_balance')  double? liveBalance, @JsonKey(name: 'opening_balance')  double? openingBalance,  double? collateral, @JsonKey(name: 'intraday_payin')  double? intradayPayin)  $default,) {final _that = this;
switch (_that) {
case _MarginAvailable():
return $default(_that.cash,_that.liveBalance,_that.openingBalance,_that.collateral,_that.intradayPayin);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double? cash, @JsonKey(name: 'live_balance')  double? liveBalance, @JsonKey(name: 'opening_balance')  double? openingBalance,  double? collateral, @JsonKey(name: 'intraday_payin')  double? intradayPayin)?  $default,) {final _that = this;
switch (_that) {
case _MarginAvailable() when $default != null:
return $default(_that.cash,_that.liveBalance,_that.openingBalance,_that.collateral,_that.intradayPayin);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MarginAvailable implements MarginAvailable {
  const _MarginAvailable({this.cash, @JsonKey(name: 'live_balance') this.liveBalance, @JsonKey(name: 'opening_balance') this.openingBalance, this.collateral, @JsonKey(name: 'intraday_payin') this.intradayPayin});
  factory _MarginAvailable.fromJson(Map<String, dynamic> json) => _$MarginAvailableFromJson(json);

@override final  double? cash;
@override@JsonKey(name: 'live_balance') final  double? liveBalance;
@override@JsonKey(name: 'opening_balance') final  double? openingBalance;
@override final  double? collateral;
@override@JsonKey(name: 'intraday_payin') final  double? intradayPayin;

/// Create a copy of MarginAvailable
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MarginAvailableCopyWith<_MarginAvailable> get copyWith => __$MarginAvailableCopyWithImpl<_MarginAvailable>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MarginAvailableToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MarginAvailable&&(identical(other.cash, cash) || other.cash == cash)&&(identical(other.liveBalance, liveBalance) || other.liveBalance == liveBalance)&&(identical(other.openingBalance, openingBalance) || other.openingBalance == openingBalance)&&(identical(other.collateral, collateral) || other.collateral == collateral)&&(identical(other.intradayPayin, intradayPayin) || other.intradayPayin == intradayPayin));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,cash,liveBalance,openingBalance,collateral,intradayPayin);

@override
String toString() {
  return 'MarginAvailable(cash: $cash, liveBalance: $liveBalance, openingBalance: $openingBalance, collateral: $collateral, intradayPayin: $intradayPayin)';
}


}

/// @nodoc
abstract mixin class _$MarginAvailableCopyWith<$Res> implements $MarginAvailableCopyWith<$Res> {
  factory _$MarginAvailableCopyWith(_MarginAvailable value, $Res Function(_MarginAvailable) _then) = __$MarginAvailableCopyWithImpl;
@override @useResult
$Res call({
 double? cash,@JsonKey(name: 'live_balance') double? liveBalance,@JsonKey(name: 'opening_balance') double? openingBalance, double? collateral,@JsonKey(name: 'intraday_payin') double? intradayPayin
});




}
/// @nodoc
class __$MarginAvailableCopyWithImpl<$Res>
    implements _$MarginAvailableCopyWith<$Res> {
  __$MarginAvailableCopyWithImpl(this._self, this._then);

  final _MarginAvailable _self;
  final $Res Function(_MarginAvailable) _then;

/// Create a copy of MarginAvailable
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? cash = freezed,Object? liveBalance = freezed,Object? openingBalance = freezed,Object? collateral = freezed,Object? intradayPayin = freezed,}) {
  return _then(_MarginAvailable(
cash: freezed == cash ? _self.cash : cash // ignore: cast_nullable_to_non_nullable
as double?,liveBalance: freezed == liveBalance ? _self.liveBalance : liveBalance // ignore: cast_nullable_to_non_nullable
as double?,openingBalance: freezed == openingBalance ? _self.openingBalance : openingBalance // ignore: cast_nullable_to_non_nullable
as double?,collateral: freezed == collateral ? _self.collateral : collateral // ignore: cast_nullable_to_non_nullable
as double?,intradayPayin: freezed == intradayPayin ? _self.intradayPayin : intradayPayin // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$MarginUtilised {

 double? get debits; double? get exposure; double? get span;@JsonKey(name: 'm2m_realised') double? get m2mRealised;@JsonKey(name: 'm2m_unrealised') double? get m2mUnrealised;@JsonKey(name: 'option_premium') double? get optionPremium;
/// Create a copy of MarginUtilised
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$MarginUtilisedCopyWith<MarginUtilised> get copyWith => _$MarginUtilisedCopyWithImpl<MarginUtilised>(this as MarginUtilised, _$identity);

  /// Serializes this MarginUtilised to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is MarginUtilised&&(identical(other.debits, debits) || other.debits == debits)&&(identical(other.exposure, exposure) || other.exposure == exposure)&&(identical(other.span, span) || other.span == span)&&(identical(other.m2mRealised, m2mRealised) || other.m2mRealised == m2mRealised)&&(identical(other.m2mUnrealised, m2mUnrealised) || other.m2mUnrealised == m2mUnrealised)&&(identical(other.optionPremium, optionPremium) || other.optionPremium == optionPremium));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,debits,exposure,span,m2mRealised,m2mUnrealised,optionPremium);

@override
String toString() {
  return 'MarginUtilised(debits: $debits, exposure: $exposure, span: $span, m2mRealised: $m2mRealised, m2mUnrealised: $m2mUnrealised, optionPremium: $optionPremium)';
}


}

/// @nodoc
abstract mixin class $MarginUtilisedCopyWith<$Res>  {
  factory $MarginUtilisedCopyWith(MarginUtilised value, $Res Function(MarginUtilised) _then) = _$MarginUtilisedCopyWithImpl;
@useResult
$Res call({
 double? debits, double? exposure, double? span,@JsonKey(name: 'm2m_realised') double? m2mRealised,@JsonKey(name: 'm2m_unrealised') double? m2mUnrealised,@JsonKey(name: 'option_premium') double? optionPremium
});




}
/// @nodoc
class _$MarginUtilisedCopyWithImpl<$Res>
    implements $MarginUtilisedCopyWith<$Res> {
  _$MarginUtilisedCopyWithImpl(this._self, this._then);

  final MarginUtilised _self;
  final $Res Function(MarginUtilised) _then;

/// Create a copy of MarginUtilised
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? debits = freezed,Object? exposure = freezed,Object? span = freezed,Object? m2mRealised = freezed,Object? m2mUnrealised = freezed,Object? optionPremium = freezed,}) {
  return _then(_self.copyWith(
debits: freezed == debits ? _self.debits : debits // ignore: cast_nullable_to_non_nullable
as double?,exposure: freezed == exposure ? _self.exposure : exposure // ignore: cast_nullable_to_non_nullable
as double?,span: freezed == span ? _self.span : span // ignore: cast_nullable_to_non_nullable
as double?,m2mRealised: freezed == m2mRealised ? _self.m2mRealised : m2mRealised // ignore: cast_nullable_to_non_nullable
as double?,m2mUnrealised: freezed == m2mUnrealised ? _self.m2mUnrealised : m2mUnrealised // ignore: cast_nullable_to_non_nullable
as double?,optionPremium: freezed == optionPremium ? _self.optionPremium : optionPremium // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [MarginUtilised].
extension MarginUtilisedPatterns on MarginUtilised {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _MarginUtilised value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _MarginUtilised() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _MarginUtilised value)  $default,){
final _that = this;
switch (_that) {
case _MarginUtilised():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _MarginUtilised value)?  $default,){
final _that = this;
switch (_that) {
case _MarginUtilised() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double? debits,  double? exposure,  double? span, @JsonKey(name: 'm2m_realised')  double? m2mRealised, @JsonKey(name: 'm2m_unrealised')  double? m2mUnrealised, @JsonKey(name: 'option_premium')  double? optionPremium)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _MarginUtilised() when $default != null:
return $default(_that.debits,_that.exposure,_that.span,_that.m2mRealised,_that.m2mUnrealised,_that.optionPremium);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double? debits,  double? exposure,  double? span, @JsonKey(name: 'm2m_realised')  double? m2mRealised, @JsonKey(name: 'm2m_unrealised')  double? m2mUnrealised, @JsonKey(name: 'option_premium')  double? optionPremium)  $default,) {final _that = this;
switch (_that) {
case _MarginUtilised():
return $default(_that.debits,_that.exposure,_that.span,_that.m2mRealised,_that.m2mUnrealised,_that.optionPremium);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double? debits,  double? exposure,  double? span, @JsonKey(name: 'm2m_realised')  double? m2mRealised, @JsonKey(name: 'm2m_unrealised')  double? m2mUnrealised, @JsonKey(name: 'option_premium')  double? optionPremium)?  $default,) {final _that = this;
switch (_that) {
case _MarginUtilised() when $default != null:
return $default(_that.debits,_that.exposure,_that.span,_that.m2mRealised,_that.m2mUnrealised,_that.optionPremium);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _MarginUtilised implements MarginUtilised {
  const _MarginUtilised({this.debits, this.exposure, this.span, @JsonKey(name: 'm2m_realised') this.m2mRealised, @JsonKey(name: 'm2m_unrealised') this.m2mUnrealised, @JsonKey(name: 'option_premium') this.optionPremium});
  factory _MarginUtilised.fromJson(Map<String, dynamic> json) => _$MarginUtilisedFromJson(json);

@override final  double? debits;
@override final  double? exposure;
@override final  double? span;
@override@JsonKey(name: 'm2m_realised') final  double? m2mRealised;
@override@JsonKey(name: 'm2m_unrealised') final  double? m2mUnrealised;
@override@JsonKey(name: 'option_premium') final  double? optionPremium;

/// Create a copy of MarginUtilised
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$MarginUtilisedCopyWith<_MarginUtilised> get copyWith => __$MarginUtilisedCopyWithImpl<_MarginUtilised>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$MarginUtilisedToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _MarginUtilised&&(identical(other.debits, debits) || other.debits == debits)&&(identical(other.exposure, exposure) || other.exposure == exposure)&&(identical(other.span, span) || other.span == span)&&(identical(other.m2mRealised, m2mRealised) || other.m2mRealised == m2mRealised)&&(identical(other.m2mUnrealised, m2mUnrealised) || other.m2mUnrealised == m2mUnrealised)&&(identical(other.optionPremium, optionPremium) || other.optionPremium == optionPremium));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,debits,exposure,span,m2mRealised,m2mUnrealised,optionPremium);

@override
String toString() {
  return 'MarginUtilised(debits: $debits, exposure: $exposure, span: $span, m2mRealised: $m2mRealised, m2mUnrealised: $m2mUnrealised, optionPremium: $optionPremium)';
}


}

/// @nodoc
abstract mixin class _$MarginUtilisedCopyWith<$Res> implements $MarginUtilisedCopyWith<$Res> {
  factory _$MarginUtilisedCopyWith(_MarginUtilised value, $Res Function(_MarginUtilised) _then) = __$MarginUtilisedCopyWithImpl;
@override @useResult
$Res call({
 double? debits, double? exposure, double? span,@JsonKey(name: 'm2m_realised') double? m2mRealised,@JsonKey(name: 'm2m_unrealised') double? m2mUnrealised,@JsonKey(name: 'option_premium') double? optionPremium
});




}
/// @nodoc
class __$MarginUtilisedCopyWithImpl<$Res>
    implements _$MarginUtilisedCopyWith<$Res> {
  __$MarginUtilisedCopyWithImpl(this._self, this._then);

  final _MarginUtilised _self;
  final $Res Function(_MarginUtilised) _then;

/// Create a copy of MarginUtilised
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? debits = freezed,Object? exposure = freezed,Object? span = freezed,Object? m2mRealised = freezed,Object? m2mUnrealised = freezed,Object? optionPremium = freezed,}) {
  return _then(_MarginUtilised(
debits: freezed == debits ? _self.debits : debits // ignore: cast_nullable_to_non_nullable
as double?,exposure: freezed == exposure ? _self.exposure : exposure // ignore: cast_nullable_to_non_nullable
as double?,span: freezed == span ? _self.span : span // ignore: cast_nullable_to_non_nullable
as double?,m2mRealised: freezed == m2mRealised ? _self.m2mRealised : m2mRealised // ignore: cast_nullable_to_non_nullable
as double?,m2mUnrealised: freezed == m2mUnrealised ? _self.m2mUnrealised : m2mUnrealised // ignore: cast_nullable_to_non_nullable
as double?,optionPremium: freezed == optionPremium ? _self.optionPremium : optionPremium // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}

// dart format on
