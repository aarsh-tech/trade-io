// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ticket_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Instrument {

 String get symbol; String get exchange; String? get name; double? get ltp; int get lotSize;
/// Create a copy of Instrument
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$InstrumentCopyWith<Instrument> get copyWith => _$InstrumentCopyWithImpl<Instrument>(this as Instrument, _$identity);

  /// Serializes this Instrument to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Instrument&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.name, name) || other.name == name)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.lotSize, lotSize) || other.lotSize == lotSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,name,ltp,lotSize);

@override
String toString() {
  return 'Instrument(symbol: $symbol, exchange: $exchange, name: $name, ltp: $ltp, lotSize: $lotSize)';
}


}

/// @nodoc
abstract mixin class $InstrumentCopyWith<$Res>  {
  factory $InstrumentCopyWith(Instrument value, $Res Function(Instrument) _then) = _$InstrumentCopyWithImpl;
@useResult
$Res call({
 String symbol, String exchange, String? name, double? ltp, int lotSize
});




}
/// @nodoc
class _$InstrumentCopyWithImpl<$Res>
    implements $InstrumentCopyWith<$Res> {
  _$InstrumentCopyWithImpl(this._self, this._then);

  final Instrument _self;
  final $Res Function(Instrument) _then;

/// Create a copy of Instrument
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? symbol = null,Object? exchange = null,Object? name = freezed,Object? ltp = freezed,Object? lotSize = null,}) {
  return _then(_self.copyWith(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,name: freezed == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String?,ltp: freezed == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double?,lotSize: null == lotSize ? _self.lotSize : lotSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [Instrument].
extension InstrumentPatterns on Instrument {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Instrument value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Instrument() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Instrument value)  $default,){
final _that = this;
switch (_that) {
case _Instrument():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Instrument value)?  $default,){
final _that = this;
switch (_that) {
case _Instrument() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String symbol,  String exchange,  String? name,  double? ltp,  int lotSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Instrument() when $default != null:
return $default(_that.symbol,_that.exchange,_that.name,_that.ltp,_that.lotSize);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String symbol,  String exchange,  String? name,  double? ltp,  int lotSize)  $default,) {final _that = this;
switch (_that) {
case _Instrument():
return $default(_that.symbol,_that.exchange,_that.name,_that.ltp,_that.lotSize);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String symbol,  String exchange,  String? name,  double? ltp,  int lotSize)?  $default,) {final _that = this;
switch (_that) {
case _Instrument() when $default != null:
return $default(_that.symbol,_that.exchange,_that.name,_that.ltp,_that.lotSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Instrument implements Instrument {
  const _Instrument({required this.symbol, required this.exchange, this.name, this.ltp, this.lotSize = 1});
  factory _Instrument.fromJson(Map<String, dynamic> json) => _$InstrumentFromJson(json);

@override final  String symbol;
@override final  String exchange;
@override final  String? name;
@override final  double? ltp;
@override@JsonKey() final  int lotSize;

/// Create a copy of Instrument
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$InstrumentCopyWith<_Instrument> get copyWith => __$InstrumentCopyWithImpl<_Instrument>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$InstrumentToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Instrument&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.name, name) || other.name == name)&&(identical(other.ltp, ltp) || other.ltp == ltp)&&(identical(other.lotSize, lotSize) || other.lotSize == lotSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,symbol,exchange,name,ltp,lotSize);

@override
String toString() {
  return 'Instrument(symbol: $symbol, exchange: $exchange, name: $name, ltp: $ltp, lotSize: $lotSize)';
}


}

/// @nodoc
abstract mixin class _$InstrumentCopyWith<$Res> implements $InstrumentCopyWith<$Res> {
  factory _$InstrumentCopyWith(_Instrument value, $Res Function(_Instrument) _then) = __$InstrumentCopyWithImpl;
@override @useResult
$Res call({
 String symbol, String exchange, String? name, double? ltp, int lotSize
});




}
/// @nodoc
class __$InstrumentCopyWithImpl<$Res>
    implements _$InstrumentCopyWith<$Res> {
  __$InstrumentCopyWithImpl(this._self, this._then);

  final _Instrument _self;
  final $Res Function(_Instrument) _then;

/// Create a copy of Instrument
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? symbol = null,Object? exchange = null,Object? name = freezed,Object? ltp = freezed,Object? lotSize = null,}) {
  return _then(_Instrument(
symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,name: freezed == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String?,ltp: freezed == ltp ? _self.ltp : ltp // ignore: cast_nullable_to_non_nullable
as double?,lotSize: null == lotSize ? _self.lotSize : lotSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$OrderLimits {

 bool get killSwitchActive; int? get maxOrderQty; int? get freezeLimit; double? get maxOrderValue;
/// Create a copy of OrderLimits
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrderLimitsCopyWith<OrderLimits> get copyWith => _$OrderLimitsCopyWithImpl<OrderLimits>(this as OrderLimits, _$identity);

  /// Serializes this OrderLimits to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OrderLimits&&(identical(other.killSwitchActive, killSwitchActive) || other.killSwitchActive == killSwitchActive)&&(identical(other.maxOrderQty, maxOrderQty) || other.maxOrderQty == maxOrderQty)&&(identical(other.freezeLimit, freezeLimit) || other.freezeLimit == freezeLimit)&&(identical(other.maxOrderValue, maxOrderValue) || other.maxOrderValue == maxOrderValue));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,killSwitchActive,maxOrderQty,freezeLimit,maxOrderValue);

@override
String toString() {
  return 'OrderLimits(killSwitchActive: $killSwitchActive, maxOrderQty: $maxOrderQty, freezeLimit: $freezeLimit, maxOrderValue: $maxOrderValue)';
}


}

/// @nodoc
abstract mixin class $OrderLimitsCopyWith<$Res>  {
  factory $OrderLimitsCopyWith(OrderLimits value, $Res Function(OrderLimits) _then) = _$OrderLimitsCopyWithImpl;
@useResult
$Res call({
 bool killSwitchActive, int? maxOrderQty, int? freezeLimit, double? maxOrderValue
});




}
/// @nodoc
class _$OrderLimitsCopyWithImpl<$Res>
    implements $OrderLimitsCopyWith<$Res> {
  _$OrderLimitsCopyWithImpl(this._self, this._then);

  final OrderLimits _self;
  final $Res Function(OrderLimits) _then;

/// Create a copy of OrderLimits
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? killSwitchActive = null,Object? maxOrderQty = freezed,Object? freezeLimit = freezed,Object? maxOrderValue = freezed,}) {
  return _then(_self.copyWith(
killSwitchActive: null == killSwitchActive ? _self.killSwitchActive : killSwitchActive // ignore: cast_nullable_to_non_nullable
as bool,maxOrderQty: freezed == maxOrderQty ? _self.maxOrderQty : maxOrderQty // ignore: cast_nullable_to_non_nullable
as int?,freezeLimit: freezed == freezeLimit ? _self.freezeLimit : freezeLimit // ignore: cast_nullable_to_non_nullable
as int?,maxOrderValue: freezed == maxOrderValue ? _self.maxOrderValue : maxOrderValue // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [OrderLimits].
extension OrderLimitsPatterns on OrderLimits {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OrderLimits value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OrderLimits() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OrderLimits value)  $default,){
final _that = this;
switch (_that) {
case _OrderLimits():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OrderLimits value)?  $default,){
final _that = this;
switch (_that) {
case _OrderLimits() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool killSwitchActive,  int? maxOrderQty,  int? freezeLimit,  double? maxOrderValue)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OrderLimits() when $default != null:
return $default(_that.killSwitchActive,_that.maxOrderQty,_that.freezeLimit,_that.maxOrderValue);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool killSwitchActive,  int? maxOrderQty,  int? freezeLimit,  double? maxOrderValue)  $default,) {final _that = this;
switch (_that) {
case _OrderLimits():
return $default(_that.killSwitchActive,_that.maxOrderQty,_that.freezeLimit,_that.maxOrderValue);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool killSwitchActive,  int? maxOrderQty,  int? freezeLimit,  double? maxOrderValue)?  $default,) {final _that = this;
switch (_that) {
case _OrderLimits() when $default != null:
return $default(_that.killSwitchActive,_that.maxOrderQty,_that.freezeLimit,_that.maxOrderValue);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OrderLimits implements OrderLimits {
  const _OrderLimits({this.killSwitchActive = false, this.maxOrderQty, this.freezeLimit, this.maxOrderValue});
  factory _OrderLimits.fromJson(Map<String, dynamic> json) => _$OrderLimitsFromJson(json);

@override@JsonKey() final  bool killSwitchActive;
@override final  int? maxOrderQty;
@override final  int? freezeLimit;
@override final  double? maxOrderValue;

/// Create a copy of OrderLimits
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrderLimitsCopyWith<_OrderLimits> get copyWith => __$OrderLimitsCopyWithImpl<_OrderLimits>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrderLimitsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OrderLimits&&(identical(other.killSwitchActive, killSwitchActive) || other.killSwitchActive == killSwitchActive)&&(identical(other.maxOrderQty, maxOrderQty) || other.maxOrderQty == maxOrderQty)&&(identical(other.freezeLimit, freezeLimit) || other.freezeLimit == freezeLimit)&&(identical(other.maxOrderValue, maxOrderValue) || other.maxOrderValue == maxOrderValue));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,killSwitchActive,maxOrderQty,freezeLimit,maxOrderValue);

@override
String toString() {
  return 'OrderLimits(killSwitchActive: $killSwitchActive, maxOrderQty: $maxOrderQty, freezeLimit: $freezeLimit, maxOrderValue: $maxOrderValue)';
}


}

/// @nodoc
abstract mixin class _$OrderLimitsCopyWith<$Res> implements $OrderLimitsCopyWith<$Res> {
  factory _$OrderLimitsCopyWith(_OrderLimits value, $Res Function(_OrderLimits) _then) = __$OrderLimitsCopyWithImpl;
@override @useResult
$Res call({
 bool killSwitchActive, int? maxOrderQty, int? freezeLimit, double? maxOrderValue
});




}
/// @nodoc
class __$OrderLimitsCopyWithImpl<$Res>
    implements _$OrderLimitsCopyWith<$Res> {
  __$OrderLimitsCopyWithImpl(this._self, this._then);

  final _OrderLimits _self;
  final $Res Function(_OrderLimits) _then;

/// Create a copy of OrderLimits
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? killSwitchActive = null,Object? maxOrderQty = freezed,Object? freezeLimit = freezed,Object? maxOrderValue = freezed,}) {
  return _then(_OrderLimits(
killSwitchActive: null == killSwitchActive ? _self.killSwitchActive : killSwitchActive // ignore: cast_nullable_to_non_nullable
as bool,maxOrderQty: freezed == maxOrderQty ? _self.maxOrderQty : maxOrderQty // ignore: cast_nullable_to_non_nullable
as int?,freezeLimit: freezed == freezeLimit ? _self.freezeLimit : freezeLimit // ignore: cast_nullable_to_non_nullable
as int?,maxOrderValue: freezed == maxOrderValue ? _self.maxOrderValue : maxOrderValue // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$TickSize {

 double get tickSize;
/// Create a copy of TickSize
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$TickSizeCopyWith<TickSize> get copyWith => _$TickSizeCopyWithImpl<TickSize>(this as TickSize, _$identity);

  /// Serializes this TickSize to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is TickSize&&(identical(other.tickSize, tickSize) || other.tickSize == tickSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,tickSize);

@override
String toString() {
  return 'TickSize(tickSize: $tickSize)';
}


}

/// @nodoc
abstract mixin class $TickSizeCopyWith<$Res>  {
  factory $TickSizeCopyWith(TickSize value, $Res Function(TickSize) _then) = _$TickSizeCopyWithImpl;
@useResult
$Res call({
 double tickSize
});




}
/// @nodoc
class _$TickSizeCopyWithImpl<$Res>
    implements $TickSizeCopyWith<$Res> {
  _$TickSizeCopyWithImpl(this._self, this._then);

  final TickSize _self;
  final $Res Function(TickSize) _then;

/// Create a copy of TickSize
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? tickSize = null,}) {
  return _then(_self.copyWith(
tickSize: null == tickSize ? _self.tickSize : tickSize // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [TickSize].
extension TickSizePatterns on TickSize {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _TickSize value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _TickSize() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _TickSize value)  $default,){
final _that = this;
switch (_that) {
case _TickSize():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _TickSize value)?  $default,){
final _that = this;
switch (_that) {
case _TickSize() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double tickSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _TickSize() when $default != null:
return $default(_that.tickSize);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double tickSize)  $default,) {final _that = this;
switch (_that) {
case _TickSize():
return $default(_that.tickSize);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double tickSize)?  $default,) {final _that = this;
switch (_that) {
case _TickSize() when $default != null:
return $default(_that.tickSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _TickSize implements TickSize {
  const _TickSize({required this.tickSize});
  factory _TickSize.fromJson(Map<String, dynamic> json) => _$TickSizeFromJson(json);

@override final  double tickSize;

/// Create a copy of TickSize
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$TickSizeCopyWith<_TickSize> get copyWith => __$TickSizeCopyWithImpl<_TickSize>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$TickSizeToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _TickSize&&(identical(other.tickSize, tickSize) || other.tickSize == tickSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,tickSize);

@override
String toString() {
  return 'TickSize(tickSize: $tickSize)';
}


}

/// @nodoc
abstract mixin class _$TickSizeCopyWith<$Res> implements $TickSizeCopyWith<$Res> {
  factory _$TickSizeCopyWith(_TickSize value, $Res Function(_TickSize) _then) = __$TickSizeCopyWithImpl;
@override @useResult
$Res call({
 double tickSize
});




}
/// @nodoc
class __$TickSizeCopyWithImpl<$Res>
    implements _$TickSizeCopyWith<$Res> {
  __$TickSizeCopyWithImpl(this._self, this._then);

  final _TickSize _self;
  final $Res Function(_TickSize) _then;

/// Create a copy of TickSize
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? tickSize = null,}) {
  return _then(_TickSize(
tickSize: null == tickSize ? _self.tickSize : tickSize // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$LotSize {

 int get lotSize;
/// Create a copy of LotSize
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LotSizeCopyWith<LotSize> get copyWith => _$LotSizeCopyWithImpl<LotSize>(this as LotSize, _$identity);

  /// Serializes this LotSize to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is LotSize&&(identical(other.lotSize, lotSize) || other.lotSize == lotSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,lotSize);

@override
String toString() {
  return 'LotSize(lotSize: $lotSize)';
}


}

/// @nodoc
abstract mixin class $LotSizeCopyWith<$Res>  {
  factory $LotSizeCopyWith(LotSize value, $Res Function(LotSize) _then) = _$LotSizeCopyWithImpl;
@useResult
$Res call({
 int lotSize
});




}
/// @nodoc
class _$LotSizeCopyWithImpl<$Res>
    implements $LotSizeCopyWith<$Res> {
  _$LotSizeCopyWithImpl(this._self, this._then);

  final LotSize _self;
  final $Res Function(LotSize) _then;

/// Create a copy of LotSize
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? lotSize = null,}) {
  return _then(_self.copyWith(
lotSize: null == lotSize ? _self.lotSize : lotSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [LotSize].
extension LotSizePatterns on LotSize {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _LotSize value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _LotSize() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _LotSize value)  $default,){
final _that = this;
switch (_that) {
case _LotSize():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _LotSize value)?  $default,){
final _that = this;
switch (_that) {
case _LotSize() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int lotSize)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _LotSize() when $default != null:
return $default(_that.lotSize);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int lotSize)  $default,) {final _that = this;
switch (_that) {
case _LotSize():
return $default(_that.lotSize);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int lotSize)?  $default,) {final _that = this;
switch (_that) {
case _LotSize() when $default != null:
return $default(_that.lotSize);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _LotSize implements LotSize {
  const _LotSize({required this.lotSize});
  factory _LotSize.fromJson(Map<String, dynamic> json) => _$LotSizeFromJson(json);

@override final  int lotSize;

/// Create a copy of LotSize
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LotSizeCopyWith<_LotSize> get copyWith => __$LotSizeCopyWithImpl<_LotSize>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LotSizeToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _LotSize&&(identical(other.lotSize, lotSize) || other.lotSize == lotSize));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,lotSize);

@override
String toString() {
  return 'LotSize(lotSize: $lotSize)';
}


}

/// @nodoc
abstract mixin class _$LotSizeCopyWith<$Res> implements $LotSizeCopyWith<$Res> {
  factory _$LotSizeCopyWith(_LotSize value, $Res Function(_LotSize) _then) = __$LotSizeCopyWithImpl;
@override @useResult
$Res call({
 int lotSize
});




}
/// @nodoc
class __$LotSizeCopyWithImpl<$Res>
    implements _$LotSizeCopyWith<$Res> {
  __$LotSizeCopyWithImpl(this._self, this._then);

  final _LotSize _self;
  final $Res Function(_LotSize) _then;

/// Create a copy of LotSize
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? lotSize = null,}) {
  return _then(_LotSize(
lotSize: null == lotSize ? _self.lotSize : lotSize // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}

// dart format on
