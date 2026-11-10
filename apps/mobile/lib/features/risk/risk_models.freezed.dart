// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'risk_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$RiskActionResult {

 String get message;
/// Create a copy of RiskActionResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RiskActionResultCopyWith<RiskActionResult> get copyWith => _$RiskActionResultCopyWithImpl<RiskActionResult>(this as RiskActionResult, _$identity);

  /// Serializes this RiskActionResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RiskActionResult&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'RiskActionResult(message: $message)';
}


}

/// @nodoc
abstract mixin class $RiskActionResultCopyWith<$Res>  {
  factory $RiskActionResultCopyWith(RiskActionResult value, $Res Function(RiskActionResult) _then) = _$RiskActionResultCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class _$RiskActionResultCopyWithImpl<$Res>
    implements $RiskActionResultCopyWith<$Res> {
  _$RiskActionResultCopyWithImpl(this._self, this._then);

  final RiskActionResult _self;
  final $Res Function(RiskActionResult) _then;

/// Create a copy of RiskActionResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? message = null,}) {
  return _then(_self.copyWith(
message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [RiskActionResult].
extension RiskActionResultPatterns on RiskActionResult {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RiskActionResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RiskActionResult() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RiskActionResult value)  $default,){
final _that = this;
switch (_that) {
case _RiskActionResult():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RiskActionResult value)?  $default,){
final _that = this;
switch (_that) {
case _RiskActionResult() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String message)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RiskActionResult() when $default != null:
return $default(_that.message);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String message)  $default,) {final _that = this;
switch (_that) {
case _RiskActionResult():
return $default(_that.message);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String message)?  $default,) {final _that = this;
switch (_that) {
case _RiskActionResult() when $default != null:
return $default(_that.message);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RiskActionResult implements RiskActionResult {
  const _RiskActionResult({required this.message});
  factory _RiskActionResult.fromJson(Map<String, dynamic> json) => _$RiskActionResultFromJson(json);

@override final  String message;

/// Create a copy of RiskActionResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RiskActionResultCopyWith<_RiskActionResult> get copyWith => __$RiskActionResultCopyWithImpl<_RiskActionResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RiskActionResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RiskActionResult&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'RiskActionResult(message: $message)';
}


}

/// @nodoc
abstract mixin class _$RiskActionResultCopyWith<$Res> implements $RiskActionResultCopyWith<$Res> {
  factory _$RiskActionResultCopyWith(_RiskActionResult value, $Res Function(_RiskActionResult) _then) = __$RiskActionResultCopyWithImpl;
@override @useResult
$Res call({
 String message
});




}
/// @nodoc
class __$RiskActionResultCopyWithImpl<$Res>
    implements _$RiskActionResultCopyWith<$Res> {
  __$RiskActionResultCopyWithImpl(this._self, this._then);

  final _RiskActionResult _self;
  final $Res Function(_RiskActionResult) _then;

/// Create a copy of RiskActionResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(_RiskActionResult(
message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$RiskStatus {

 bool get killSwitchActive; DateTime? get killSwitchTriggeredAt; double get maxDailyLoss; double? get maxOrderValue; int? get maxOrderQty; double get realizedPnl; double get unrealizedPnl; double get totalDailyPnl; double get lossUsagePct;
/// Create a copy of RiskStatus
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$RiskStatusCopyWith<RiskStatus> get copyWith => _$RiskStatusCopyWithImpl<RiskStatus>(this as RiskStatus, _$identity);

  /// Serializes this RiskStatus to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is RiskStatus&&(identical(other.killSwitchActive, killSwitchActive) || other.killSwitchActive == killSwitchActive)&&(identical(other.killSwitchTriggeredAt, killSwitchTriggeredAt) || other.killSwitchTriggeredAt == killSwitchTriggeredAt)&&(identical(other.maxDailyLoss, maxDailyLoss) || other.maxDailyLoss == maxDailyLoss)&&(identical(other.maxOrderValue, maxOrderValue) || other.maxOrderValue == maxOrderValue)&&(identical(other.maxOrderQty, maxOrderQty) || other.maxOrderQty == maxOrderQty)&&(identical(other.realizedPnl, realizedPnl) || other.realizedPnl == realizedPnl)&&(identical(other.unrealizedPnl, unrealizedPnl) || other.unrealizedPnl == unrealizedPnl)&&(identical(other.totalDailyPnl, totalDailyPnl) || other.totalDailyPnl == totalDailyPnl)&&(identical(other.lossUsagePct, lossUsagePct) || other.lossUsagePct == lossUsagePct));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,killSwitchActive,killSwitchTriggeredAt,maxDailyLoss,maxOrderValue,maxOrderQty,realizedPnl,unrealizedPnl,totalDailyPnl,lossUsagePct);

@override
String toString() {
  return 'RiskStatus(killSwitchActive: $killSwitchActive, killSwitchTriggeredAt: $killSwitchTriggeredAt, maxDailyLoss: $maxDailyLoss, maxOrderValue: $maxOrderValue, maxOrderQty: $maxOrderQty, realizedPnl: $realizedPnl, unrealizedPnl: $unrealizedPnl, totalDailyPnl: $totalDailyPnl, lossUsagePct: $lossUsagePct)';
}


}

/// @nodoc
abstract mixin class $RiskStatusCopyWith<$Res>  {
  factory $RiskStatusCopyWith(RiskStatus value, $Res Function(RiskStatus) _then) = _$RiskStatusCopyWithImpl;
@useResult
$Res call({
 bool killSwitchActive, DateTime? killSwitchTriggeredAt, double maxDailyLoss, double? maxOrderValue, int? maxOrderQty, double realizedPnl, double unrealizedPnl, double totalDailyPnl, double lossUsagePct
});




}
/// @nodoc
class _$RiskStatusCopyWithImpl<$Res>
    implements $RiskStatusCopyWith<$Res> {
  _$RiskStatusCopyWithImpl(this._self, this._then);

  final RiskStatus _self;
  final $Res Function(RiskStatus) _then;

/// Create a copy of RiskStatus
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? killSwitchActive = null,Object? killSwitchTriggeredAt = freezed,Object? maxDailyLoss = null,Object? maxOrderValue = freezed,Object? maxOrderQty = freezed,Object? realizedPnl = null,Object? unrealizedPnl = null,Object? totalDailyPnl = null,Object? lossUsagePct = null,}) {
  return _then(_self.copyWith(
killSwitchActive: null == killSwitchActive ? _self.killSwitchActive : killSwitchActive // ignore: cast_nullable_to_non_nullable
as bool,killSwitchTriggeredAt: freezed == killSwitchTriggeredAt ? _self.killSwitchTriggeredAt : killSwitchTriggeredAt // ignore: cast_nullable_to_non_nullable
as DateTime?,maxDailyLoss: null == maxDailyLoss ? _self.maxDailyLoss : maxDailyLoss // ignore: cast_nullable_to_non_nullable
as double,maxOrderValue: freezed == maxOrderValue ? _self.maxOrderValue : maxOrderValue // ignore: cast_nullable_to_non_nullable
as double?,maxOrderQty: freezed == maxOrderQty ? _self.maxOrderQty : maxOrderQty // ignore: cast_nullable_to_non_nullable
as int?,realizedPnl: null == realizedPnl ? _self.realizedPnl : realizedPnl // ignore: cast_nullable_to_non_nullable
as double,unrealizedPnl: null == unrealizedPnl ? _self.unrealizedPnl : unrealizedPnl // ignore: cast_nullable_to_non_nullable
as double,totalDailyPnl: null == totalDailyPnl ? _self.totalDailyPnl : totalDailyPnl // ignore: cast_nullable_to_non_nullable
as double,lossUsagePct: null == lossUsagePct ? _self.lossUsagePct : lossUsagePct // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [RiskStatus].
extension RiskStatusPatterns on RiskStatus {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _RiskStatus value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _RiskStatus() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _RiskStatus value)  $default,){
final _that = this;
switch (_that) {
case _RiskStatus():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _RiskStatus value)?  $default,){
final _that = this;
switch (_that) {
case _RiskStatus() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool killSwitchActive,  DateTime? killSwitchTriggeredAt,  double maxDailyLoss,  double? maxOrderValue,  int? maxOrderQty,  double realizedPnl,  double unrealizedPnl,  double totalDailyPnl,  double lossUsagePct)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _RiskStatus() when $default != null:
return $default(_that.killSwitchActive,_that.killSwitchTriggeredAt,_that.maxDailyLoss,_that.maxOrderValue,_that.maxOrderQty,_that.realizedPnl,_that.unrealizedPnl,_that.totalDailyPnl,_that.lossUsagePct);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool killSwitchActive,  DateTime? killSwitchTriggeredAt,  double maxDailyLoss,  double? maxOrderValue,  int? maxOrderQty,  double realizedPnl,  double unrealizedPnl,  double totalDailyPnl,  double lossUsagePct)  $default,) {final _that = this;
switch (_that) {
case _RiskStatus():
return $default(_that.killSwitchActive,_that.killSwitchTriggeredAt,_that.maxDailyLoss,_that.maxOrderValue,_that.maxOrderQty,_that.realizedPnl,_that.unrealizedPnl,_that.totalDailyPnl,_that.lossUsagePct);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool killSwitchActive,  DateTime? killSwitchTriggeredAt,  double maxDailyLoss,  double? maxOrderValue,  int? maxOrderQty,  double realizedPnl,  double unrealizedPnl,  double totalDailyPnl,  double lossUsagePct)?  $default,) {final _that = this;
switch (_that) {
case _RiskStatus() when $default != null:
return $default(_that.killSwitchActive,_that.killSwitchTriggeredAt,_that.maxDailyLoss,_that.maxOrderValue,_that.maxOrderQty,_that.realizedPnl,_that.unrealizedPnl,_that.totalDailyPnl,_that.lossUsagePct);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _RiskStatus implements RiskStatus {
  const _RiskStatus({this.killSwitchActive = false, this.killSwitchTriggeredAt, this.maxDailyLoss = 0, this.maxOrderValue, this.maxOrderQty, this.realizedPnl = 0, this.unrealizedPnl = 0, this.totalDailyPnl = 0, this.lossUsagePct = 0});
  factory _RiskStatus.fromJson(Map<String, dynamic> json) => _$RiskStatusFromJson(json);

@override@JsonKey() final  bool killSwitchActive;
@override final  DateTime? killSwitchTriggeredAt;
@override@JsonKey() final  double maxDailyLoss;
@override final  double? maxOrderValue;
@override final  int? maxOrderQty;
@override@JsonKey() final  double realizedPnl;
@override@JsonKey() final  double unrealizedPnl;
@override@JsonKey() final  double totalDailyPnl;
@override@JsonKey() final  double lossUsagePct;

/// Create a copy of RiskStatus
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$RiskStatusCopyWith<_RiskStatus> get copyWith => __$RiskStatusCopyWithImpl<_RiskStatus>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$RiskStatusToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _RiskStatus&&(identical(other.killSwitchActive, killSwitchActive) || other.killSwitchActive == killSwitchActive)&&(identical(other.killSwitchTriggeredAt, killSwitchTriggeredAt) || other.killSwitchTriggeredAt == killSwitchTriggeredAt)&&(identical(other.maxDailyLoss, maxDailyLoss) || other.maxDailyLoss == maxDailyLoss)&&(identical(other.maxOrderValue, maxOrderValue) || other.maxOrderValue == maxOrderValue)&&(identical(other.maxOrderQty, maxOrderQty) || other.maxOrderQty == maxOrderQty)&&(identical(other.realizedPnl, realizedPnl) || other.realizedPnl == realizedPnl)&&(identical(other.unrealizedPnl, unrealizedPnl) || other.unrealizedPnl == unrealizedPnl)&&(identical(other.totalDailyPnl, totalDailyPnl) || other.totalDailyPnl == totalDailyPnl)&&(identical(other.lossUsagePct, lossUsagePct) || other.lossUsagePct == lossUsagePct));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,killSwitchActive,killSwitchTriggeredAt,maxDailyLoss,maxOrderValue,maxOrderQty,realizedPnl,unrealizedPnl,totalDailyPnl,lossUsagePct);

@override
String toString() {
  return 'RiskStatus(killSwitchActive: $killSwitchActive, killSwitchTriggeredAt: $killSwitchTriggeredAt, maxDailyLoss: $maxDailyLoss, maxOrderValue: $maxOrderValue, maxOrderQty: $maxOrderQty, realizedPnl: $realizedPnl, unrealizedPnl: $unrealizedPnl, totalDailyPnl: $totalDailyPnl, lossUsagePct: $lossUsagePct)';
}


}

/// @nodoc
abstract mixin class _$RiskStatusCopyWith<$Res> implements $RiskStatusCopyWith<$Res> {
  factory _$RiskStatusCopyWith(_RiskStatus value, $Res Function(_RiskStatus) _then) = __$RiskStatusCopyWithImpl;
@override @useResult
$Res call({
 bool killSwitchActive, DateTime? killSwitchTriggeredAt, double maxDailyLoss, double? maxOrderValue, int? maxOrderQty, double realizedPnl, double unrealizedPnl, double totalDailyPnl, double lossUsagePct
});




}
/// @nodoc
class __$RiskStatusCopyWithImpl<$Res>
    implements _$RiskStatusCopyWith<$Res> {
  __$RiskStatusCopyWithImpl(this._self, this._then);

  final _RiskStatus _self;
  final $Res Function(_RiskStatus) _then;

/// Create a copy of RiskStatus
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? killSwitchActive = null,Object? killSwitchTriggeredAt = freezed,Object? maxDailyLoss = null,Object? maxOrderValue = freezed,Object? maxOrderQty = freezed,Object? realizedPnl = null,Object? unrealizedPnl = null,Object? totalDailyPnl = null,Object? lossUsagePct = null,}) {
  return _then(_RiskStatus(
killSwitchActive: null == killSwitchActive ? _self.killSwitchActive : killSwitchActive // ignore: cast_nullable_to_non_nullable
as bool,killSwitchTriggeredAt: freezed == killSwitchTriggeredAt ? _self.killSwitchTriggeredAt : killSwitchTriggeredAt // ignore: cast_nullable_to_non_nullable
as DateTime?,maxDailyLoss: null == maxDailyLoss ? _self.maxDailyLoss : maxDailyLoss // ignore: cast_nullable_to_non_nullable
as double,maxOrderValue: freezed == maxOrderValue ? _self.maxOrderValue : maxOrderValue // ignore: cast_nullable_to_non_nullable
as double?,maxOrderQty: freezed == maxOrderQty ? _self.maxOrderQty : maxOrderQty // ignore: cast_nullable_to_non_nullable
as int?,realizedPnl: null == realizedPnl ? _self.realizedPnl : realizedPnl // ignore: cast_nullable_to_non_nullable
as double,unrealizedPnl: null == unrealizedPnl ? _self.unrealizedPnl : unrealizedPnl // ignore: cast_nullable_to_non_nullable
as double,totalDailyPnl: null == totalDailyPnl ? _self.totalDailyPnl : totalDailyPnl // ignore: cast_nullable_to_non_nullable
as double,lossUsagePct: null == lossUsagePct ? _self.lossUsagePct : lossUsagePct // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}

// dart format on
