// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'strategies_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$StrategyRow {

 String get id; String get name;@JsonKey(fromJson: strategyTypeFromJson) StrategyType? get type; bool get isActive; bool get isPaperTrade; bool get autoStart; String? get brokerAccountId;@JsonKey(fromJson: configFromJson) Map<String, dynamic> get config; DateTime? get updatedAt;
/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$StrategyRowCopyWith<StrategyRow> get copyWith => _$StrategyRowCopyWithImpl<StrategyRow>(this as StrategyRow, _$identity);

  /// Serializes this StrategyRow to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is StrategyRow&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.type, type) || other.type == type)&&(identical(other.isActive, isActive) || other.isActive == isActive)&&(identical(other.isPaperTrade, isPaperTrade) || other.isPaperTrade == isPaperTrade)&&(identical(other.autoStart, autoStart) || other.autoStart == autoStart)&&(identical(other.brokerAccountId, brokerAccountId) || other.brokerAccountId == brokerAccountId)&&const DeepCollectionEquality().equals(other.config, config)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,type,isActive,isPaperTrade,autoStart,brokerAccountId,const DeepCollectionEquality().hash(config),updatedAt);

@override
String toString() {
  return 'StrategyRow(id: $id, name: $name, type: $type, isActive: $isActive, isPaperTrade: $isPaperTrade, autoStart: $autoStart, brokerAccountId: $brokerAccountId, config: $config, updatedAt: $updatedAt)';
}


}

/// @nodoc
abstract mixin class $StrategyRowCopyWith<$Res>  {
  factory $StrategyRowCopyWith(StrategyRow value, $Res Function(StrategyRow) _then) = _$StrategyRowCopyWithImpl;
@useResult
$Res call({
 String id, String name,@JsonKey(fromJson: strategyTypeFromJson) StrategyType? type, bool isActive, bool isPaperTrade, bool autoStart, String? brokerAccountId,@JsonKey(fromJson: configFromJson) Map<String, dynamic> config, DateTime? updatedAt
});




}
/// @nodoc
class _$StrategyRowCopyWithImpl<$Res>
    implements $StrategyRowCopyWith<$Res> {
  _$StrategyRowCopyWithImpl(this._self, this._then);

  final StrategyRow _self;
  final $Res Function(StrategyRow) _then;

/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? type = freezed,Object? isActive = null,Object? isPaperTrade = null,Object? autoStart = null,Object? brokerAccountId = freezed,Object? config = null,Object? updatedAt = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,type: freezed == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as StrategyType?,isActive: null == isActive ? _self.isActive : isActive // ignore: cast_nullable_to_non_nullable
as bool,isPaperTrade: null == isPaperTrade ? _self.isPaperTrade : isPaperTrade // ignore: cast_nullable_to_non_nullable
as bool,autoStart: null == autoStart ? _self.autoStart : autoStart // ignore: cast_nullable_to_non_nullable
as bool,brokerAccountId: freezed == brokerAccountId ? _self.brokerAccountId : brokerAccountId // ignore: cast_nullable_to_non_nullable
as String?,config: null == config ? _self.config : config // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,updatedAt: freezed == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [StrategyRow].
extension StrategyRowPatterns on StrategyRow {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _StrategyRow value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _StrategyRow() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _StrategyRow value)  $default,){
final _that = this;
switch (_that) {
case _StrategyRow():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _StrategyRow value)?  $default,){
final _that = this;
switch (_that) {
case _StrategyRow() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name, @JsonKey(fromJson: strategyTypeFromJson)  StrategyType? type,  bool isActive,  bool isPaperTrade,  bool autoStart,  String? brokerAccountId, @JsonKey(fromJson: configFromJson)  Map<String, dynamic> config,  DateTime? updatedAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _StrategyRow() when $default != null:
return $default(_that.id,_that.name,_that.type,_that.isActive,_that.isPaperTrade,_that.autoStart,_that.brokerAccountId,_that.config,_that.updatedAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name, @JsonKey(fromJson: strategyTypeFromJson)  StrategyType? type,  bool isActive,  bool isPaperTrade,  bool autoStart,  String? brokerAccountId, @JsonKey(fromJson: configFromJson)  Map<String, dynamic> config,  DateTime? updatedAt)  $default,) {final _that = this;
switch (_that) {
case _StrategyRow():
return $default(_that.id,_that.name,_that.type,_that.isActive,_that.isPaperTrade,_that.autoStart,_that.brokerAccountId,_that.config,_that.updatedAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name, @JsonKey(fromJson: strategyTypeFromJson)  StrategyType? type,  bool isActive,  bool isPaperTrade,  bool autoStart,  String? brokerAccountId, @JsonKey(fromJson: configFromJson)  Map<String, dynamic> config,  DateTime? updatedAt)?  $default,) {final _that = this;
switch (_that) {
case _StrategyRow() when $default != null:
return $default(_that.id,_that.name,_that.type,_that.isActive,_that.isPaperTrade,_that.autoStart,_that.brokerAccountId,_that.config,_that.updatedAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _StrategyRow implements StrategyRow {
  const _StrategyRow({required this.id, required this.name, @JsonKey(fromJson: strategyTypeFromJson) this.type, this.isActive = false, this.isPaperTrade = false, this.autoStart = false, this.brokerAccountId, @JsonKey(fromJson: configFromJson) final  Map<String, dynamic> config = const {}, this.updatedAt}): _config = config;
  factory _StrategyRow.fromJson(Map<String, dynamic> json) => _$StrategyRowFromJson(json);

@override final  String id;
@override final  String name;
@override@JsonKey(fromJson: strategyTypeFromJson) final  StrategyType? type;
@override@JsonKey() final  bool isActive;
@override@JsonKey() final  bool isPaperTrade;
@override@JsonKey() final  bool autoStart;
@override final  String? brokerAccountId;
 final  Map<String, dynamic> _config;
@override@JsonKey(fromJson: configFromJson) Map<String, dynamic> get config {
  if (_config is EqualUnmodifiableMapView) return _config;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_config);
}

@override final  DateTime? updatedAt;

/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$StrategyRowCopyWith<_StrategyRow> get copyWith => __$StrategyRowCopyWithImpl<_StrategyRow>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$StrategyRowToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _StrategyRow&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.type, type) || other.type == type)&&(identical(other.isActive, isActive) || other.isActive == isActive)&&(identical(other.isPaperTrade, isPaperTrade) || other.isPaperTrade == isPaperTrade)&&(identical(other.autoStart, autoStart) || other.autoStart == autoStart)&&(identical(other.brokerAccountId, brokerAccountId) || other.brokerAccountId == brokerAccountId)&&const DeepCollectionEquality().equals(other._config, _config)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,type,isActive,isPaperTrade,autoStart,brokerAccountId,const DeepCollectionEquality().hash(_config),updatedAt);

@override
String toString() {
  return 'StrategyRow(id: $id, name: $name, type: $type, isActive: $isActive, isPaperTrade: $isPaperTrade, autoStart: $autoStart, brokerAccountId: $brokerAccountId, config: $config, updatedAt: $updatedAt)';
}


}

/// @nodoc
abstract mixin class _$StrategyRowCopyWith<$Res> implements $StrategyRowCopyWith<$Res> {
  factory _$StrategyRowCopyWith(_StrategyRow value, $Res Function(_StrategyRow) _then) = __$StrategyRowCopyWithImpl;
@override @useResult
$Res call({
 String id, String name,@JsonKey(fromJson: strategyTypeFromJson) StrategyType? type, bool isActive, bool isPaperTrade, bool autoStart, String? brokerAccountId,@JsonKey(fromJson: configFromJson) Map<String, dynamic> config, DateTime? updatedAt
});




}
/// @nodoc
class __$StrategyRowCopyWithImpl<$Res>
    implements _$StrategyRowCopyWith<$Res> {
  __$StrategyRowCopyWithImpl(this._self, this._then);

  final _StrategyRow _self;
  final $Res Function(_StrategyRow) _then;

/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? type = freezed,Object? isActive = null,Object? isPaperTrade = null,Object? autoStart = null,Object? brokerAccountId = freezed,Object? config = null,Object? updatedAt = freezed,}) {
  return _then(_StrategyRow(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,type: freezed == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as StrategyType?,isActive: null == isActive ? _self.isActive : isActive // ignore: cast_nullable_to_non_nullable
as bool,isPaperTrade: null == isPaperTrade ? _self.isPaperTrade : isPaperTrade // ignore: cast_nullable_to_non_nullable
as bool,autoStart: null == autoStart ? _self.autoStart : autoStart // ignore: cast_nullable_to_non_nullable
as bool,brokerAccountId: freezed == brokerAccountId ? _self.brokerAccountId : brokerAccountId // ignore: cast_nullable_to_non_nullable
as String?,config: null == config ? _self._config : config // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,updatedAt: freezed == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}


/// @nodoc
mixin _$StrategyStatus {

 bool get running; bool get autoStart; List<String> get logs; Map<String, dynamic>? get state; List<Order> get orders;
/// Create a copy of StrategyStatus
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$StrategyStatusCopyWith<StrategyStatus> get copyWith => _$StrategyStatusCopyWithImpl<StrategyStatus>(this as StrategyStatus, _$identity);

  /// Serializes this StrategyStatus to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is StrategyStatus&&(identical(other.running, running) || other.running == running)&&(identical(other.autoStart, autoStart) || other.autoStart == autoStart)&&const DeepCollectionEquality().equals(other.logs, logs)&&const DeepCollectionEquality().equals(other.state, state)&&const DeepCollectionEquality().equals(other.orders, orders));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,running,autoStart,const DeepCollectionEquality().hash(logs),const DeepCollectionEquality().hash(state),const DeepCollectionEquality().hash(orders));

@override
String toString() {
  return 'StrategyStatus(running: $running, autoStart: $autoStart, logs: $logs, state: $state, orders: $orders)';
}


}

/// @nodoc
abstract mixin class $StrategyStatusCopyWith<$Res>  {
  factory $StrategyStatusCopyWith(StrategyStatus value, $Res Function(StrategyStatus) _then) = _$StrategyStatusCopyWithImpl;
@useResult
$Res call({
 bool running, bool autoStart, List<String> logs, Map<String, dynamic>? state, List<Order> orders
});




}
/// @nodoc
class _$StrategyStatusCopyWithImpl<$Res>
    implements $StrategyStatusCopyWith<$Res> {
  _$StrategyStatusCopyWithImpl(this._self, this._then);

  final StrategyStatus _self;
  final $Res Function(StrategyStatus) _then;

/// Create a copy of StrategyStatus
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? running = null,Object? autoStart = null,Object? logs = null,Object? state = freezed,Object? orders = null,}) {
  return _then(_self.copyWith(
running: null == running ? _self.running : running // ignore: cast_nullable_to_non_nullable
as bool,autoStart: null == autoStart ? _self.autoStart : autoStart // ignore: cast_nullable_to_non_nullable
as bool,logs: null == logs ? _self.logs : logs // ignore: cast_nullable_to_non_nullable
as List<String>,state: freezed == state ? _self.state : state // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,orders: null == orders ? _self.orders : orders // ignore: cast_nullable_to_non_nullable
as List<Order>,
  ));
}

}


/// Adds pattern-matching-related methods to [StrategyStatus].
extension StrategyStatusPatterns on StrategyStatus {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _StrategyStatus value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _StrategyStatus() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _StrategyStatus value)  $default,){
final _that = this;
switch (_that) {
case _StrategyStatus():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _StrategyStatus value)?  $default,){
final _that = this;
switch (_that) {
case _StrategyStatus() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool running,  bool autoStart,  List<String> logs,  Map<String, dynamic>? state,  List<Order> orders)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _StrategyStatus() when $default != null:
return $default(_that.running,_that.autoStart,_that.logs,_that.state,_that.orders);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool running,  bool autoStart,  List<String> logs,  Map<String, dynamic>? state,  List<Order> orders)  $default,) {final _that = this;
switch (_that) {
case _StrategyStatus():
return $default(_that.running,_that.autoStart,_that.logs,_that.state,_that.orders);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool running,  bool autoStart,  List<String> logs,  Map<String, dynamic>? state,  List<Order> orders)?  $default,) {final _that = this;
switch (_that) {
case _StrategyStatus() when $default != null:
return $default(_that.running,_that.autoStart,_that.logs,_that.state,_that.orders);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _StrategyStatus implements StrategyStatus {
  const _StrategyStatus({this.running = false, this.autoStart = false, final  List<String> logs = const [], final  Map<String, dynamic>? state, final  List<Order> orders = const []}): _logs = logs,_state = state,_orders = orders;
  factory _StrategyStatus.fromJson(Map<String, dynamic> json) => _$StrategyStatusFromJson(json);

@override@JsonKey() final  bool running;
@override@JsonKey() final  bool autoStart;
 final  List<String> _logs;
@override@JsonKey() List<String> get logs {
  if (_logs is EqualUnmodifiableListView) return _logs;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_logs);
}

 final  Map<String, dynamic>? _state;
@override Map<String, dynamic>? get state {
  final value = _state;
  if (value == null) return null;
  if (_state is EqualUnmodifiableMapView) return _state;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

 final  List<Order> _orders;
@override@JsonKey() List<Order> get orders {
  if (_orders is EqualUnmodifiableListView) return _orders;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_orders);
}


/// Create a copy of StrategyStatus
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$StrategyStatusCopyWith<_StrategyStatus> get copyWith => __$StrategyStatusCopyWithImpl<_StrategyStatus>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$StrategyStatusToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _StrategyStatus&&(identical(other.running, running) || other.running == running)&&(identical(other.autoStart, autoStart) || other.autoStart == autoStart)&&const DeepCollectionEquality().equals(other._logs, _logs)&&const DeepCollectionEquality().equals(other._state, _state)&&const DeepCollectionEquality().equals(other._orders, _orders));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,running,autoStart,const DeepCollectionEquality().hash(_logs),const DeepCollectionEquality().hash(_state),const DeepCollectionEquality().hash(_orders));

@override
String toString() {
  return 'StrategyStatus(running: $running, autoStart: $autoStart, logs: $logs, state: $state, orders: $orders)';
}


}

/// @nodoc
abstract mixin class _$StrategyStatusCopyWith<$Res> implements $StrategyStatusCopyWith<$Res> {
  factory _$StrategyStatusCopyWith(_StrategyStatus value, $Res Function(_StrategyStatus) _then) = __$StrategyStatusCopyWithImpl;
@override @useResult
$Res call({
 bool running, bool autoStart, List<String> logs, Map<String, dynamic>? state, List<Order> orders
});




}
/// @nodoc
class __$StrategyStatusCopyWithImpl<$Res>
    implements _$StrategyStatusCopyWith<$Res> {
  __$StrategyStatusCopyWithImpl(this._self, this._then);

  final _StrategyStatus _self;
  final $Res Function(_StrategyStatus) _then;

/// Create a copy of StrategyStatus
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? running = null,Object? autoStart = null,Object? logs = null,Object? state = freezed,Object? orders = null,}) {
  return _then(_StrategyStatus(
running: null == running ? _self.running : running // ignore: cast_nullable_to_non_nullable
as bool,autoStart: null == autoStart ? _self.autoStart : autoStart // ignore: cast_nullable_to_non_nullable
as bool,logs: null == logs ? _self._logs : logs // ignore: cast_nullable_to_non_nullable
as List<String>,state: freezed == state ? _self._state : state // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,orders: null == orders ? _self._orders : orders // ignore: cast_nullable_to_non_nullable
as List<Order>,
  ));
}


}

// dart format on
