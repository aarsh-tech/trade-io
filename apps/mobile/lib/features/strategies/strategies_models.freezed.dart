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

 String get id; String get name;@JsonKey(fromJson: strategyTypeFromJson) StrategyType? get type; bool get isActive; bool get isPaperTrade; bool get autoStart; String? get brokerAccountId;@JsonKey(fromJson: configFromJson) Map<String, dynamic> get config; DateTime? get updatedAt;/// Today's closed-trade P&L (absent when the strategy has not traded today).
 double? get todayPnl;/// The newest execution (`{ status, startedAt }`), null when it never ran.
 Map<String, dynamic>? get latestExecution;/// Detail only (GET /strategies/:id): last-30-day performance, past runs, the broker.
 StrategyPerformance? get performance; List<StrategyExecution> get executions; Map<String, dynamic>? get brokerAccount;
/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$StrategyRowCopyWith<StrategyRow> get copyWith => _$StrategyRowCopyWithImpl<StrategyRow>(this as StrategyRow, _$identity);

  /// Serializes this StrategyRow to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is StrategyRow&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.type, type) || other.type == type)&&(identical(other.isActive, isActive) || other.isActive == isActive)&&(identical(other.isPaperTrade, isPaperTrade) || other.isPaperTrade == isPaperTrade)&&(identical(other.autoStart, autoStart) || other.autoStart == autoStart)&&(identical(other.brokerAccountId, brokerAccountId) || other.brokerAccountId == brokerAccountId)&&const DeepCollectionEquality().equals(other.config, config)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&(identical(other.todayPnl, todayPnl) || other.todayPnl == todayPnl)&&const DeepCollectionEquality().equals(other.latestExecution, latestExecution)&&(identical(other.performance, performance) || other.performance == performance)&&const DeepCollectionEquality().equals(other.executions, executions)&&const DeepCollectionEquality().equals(other.brokerAccount, brokerAccount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,type,isActive,isPaperTrade,autoStart,brokerAccountId,const DeepCollectionEquality().hash(config),updatedAt,todayPnl,const DeepCollectionEquality().hash(latestExecution),performance,const DeepCollectionEquality().hash(executions),const DeepCollectionEquality().hash(brokerAccount));

@override
String toString() {
  return 'StrategyRow(id: $id, name: $name, type: $type, isActive: $isActive, isPaperTrade: $isPaperTrade, autoStart: $autoStart, brokerAccountId: $brokerAccountId, config: $config, updatedAt: $updatedAt, todayPnl: $todayPnl, latestExecution: $latestExecution, performance: $performance, executions: $executions, brokerAccount: $brokerAccount)';
}


}

/// @nodoc
abstract mixin class $StrategyRowCopyWith<$Res>  {
  factory $StrategyRowCopyWith(StrategyRow value, $Res Function(StrategyRow) _then) = _$StrategyRowCopyWithImpl;
@useResult
$Res call({
 String id, String name,@JsonKey(fromJson: strategyTypeFromJson) StrategyType? type, bool isActive, bool isPaperTrade, bool autoStart, String? brokerAccountId,@JsonKey(fromJson: configFromJson) Map<String, dynamic> config, DateTime? updatedAt, double? todayPnl, Map<String, dynamic>? latestExecution, StrategyPerformance? performance, List<StrategyExecution> executions, Map<String, dynamic>? brokerAccount
});


$StrategyPerformanceCopyWith<$Res>? get performance;

}
/// @nodoc
class _$StrategyRowCopyWithImpl<$Res>
    implements $StrategyRowCopyWith<$Res> {
  _$StrategyRowCopyWithImpl(this._self, this._then);

  final StrategyRow _self;
  final $Res Function(StrategyRow) _then;

/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? name = null,Object? type = freezed,Object? isActive = null,Object? isPaperTrade = null,Object? autoStart = null,Object? brokerAccountId = freezed,Object? config = null,Object? updatedAt = freezed,Object? todayPnl = freezed,Object? latestExecution = freezed,Object? performance = freezed,Object? executions = null,Object? brokerAccount = freezed,}) {
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
as DateTime?,todayPnl: freezed == todayPnl ? _self.todayPnl : todayPnl // ignore: cast_nullable_to_non_nullable
as double?,latestExecution: freezed == latestExecution ? _self.latestExecution : latestExecution // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,performance: freezed == performance ? _self.performance : performance // ignore: cast_nullable_to_non_nullable
as StrategyPerformance?,executions: null == executions ? _self.executions : executions // ignore: cast_nullable_to_non_nullable
as List<StrategyExecution>,brokerAccount: freezed == brokerAccount ? _self.brokerAccount : brokerAccount // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}
/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$StrategyPerformanceCopyWith<$Res>? get performance {
    if (_self.performance == null) {
    return null;
  }

  return $StrategyPerformanceCopyWith<$Res>(_self.performance!, (value) {
    return _then(_self.copyWith(performance: value));
  });
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String name, @JsonKey(fromJson: strategyTypeFromJson)  StrategyType? type,  bool isActive,  bool isPaperTrade,  bool autoStart,  String? brokerAccountId, @JsonKey(fromJson: configFromJson)  Map<String, dynamic> config,  DateTime? updatedAt,  double? todayPnl,  Map<String, dynamic>? latestExecution,  StrategyPerformance? performance,  List<StrategyExecution> executions,  Map<String, dynamic>? brokerAccount)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _StrategyRow() when $default != null:
return $default(_that.id,_that.name,_that.type,_that.isActive,_that.isPaperTrade,_that.autoStart,_that.brokerAccountId,_that.config,_that.updatedAt,_that.todayPnl,_that.latestExecution,_that.performance,_that.executions,_that.brokerAccount);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String name, @JsonKey(fromJson: strategyTypeFromJson)  StrategyType? type,  bool isActive,  bool isPaperTrade,  bool autoStart,  String? brokerAccountId, @JsonKey(fromJson: configFromJson)  Map<String, dynamic> config,  DateTime? updatedAt,  double? todayPnl,  Map<String, dynamic>? latestExecution,  StrategyPerformance? performance,  List<StrategyExecution> executions,  Map<String, dynamic>? brokerAccount)  $default,) {final _that = this;
switch (_that) {
case _StrategyRow():
return $default(_that.id,_that.name,_that.type,_that.isActive,_that.isPaperTrade,_that.autoStart,_that.brokerAccountId,_that.config,_that.updatedAt,_that.todayPnl,_that.latestExecution,_that.performance,_that.executions,_that.brokerAccount);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String name, @JsonKey(fromJson: strategyTypeFromJson)  StrategyType? type,  bool isActive,  bool isPaperTrade,  bool autoStart,  String? brokerAccountId, @JsonKey(fromJson: configFromJson)  Map<String, dynamic> config,  DateTime? updatedAt,  double? todayPnl,  Map<String, dynamic>? latestExecution,  StrategyPerformance? performance,  List<StrategyExecution> executions,  Map<String, dynamic>? brokerAccount)?  $default,) {final _that = this;
switch (_that) {
case _StrategyRow() when $default != null:
return $default(_that.id,_that.name,_that.type,_that.isActive,_that.isPaperTrade,_that.autoStart,_that.brokerAccountId,_that.config,_that.updatedAt,_that.todayPnl,_that.latestExecution,_that.performance,_that.executions,_that.brokerAccount);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _StrategyRow extends StrategyRow {
  const _StrategyRow({required this.id, required this.name, @JsonKey(fromJson: strategyTypeFromJson) this.type, this.isActive = false, this.isPaperTrade = false, this.autoStart = false, this.brokerAccountId, @JsonKey(fromJson: configFromJson) final  Map<String, dynamic> config = const {}, this.updatedAt, this.todayPnl, final  Map<String, dynamic>? latestExecution, this.performance, final  List<StrategyExecution> executions = const [], final  Map<String, dynamic>? brokerAccount}): _config = config,_latestExecution = latestExecution,_executions = executions,_brokerAccount = brokerAccount,super._();
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
/// Today's closed-trade P&L (absent when the strategy has not traded today).
@override final  double? todayPnl;
/// The newest execution (`{ status, startedAt }`), null when it never ran.
 final  Map<String, dynamic>? _latestExecution;
/// The newest execution (`{ status, startedAt }`), null when it never ran.
@override Map<String, dynamic>? get latestExecution {
  final value = _latestExecution;
  if (value == null) return null;
  if (_latestExecution is EqualUnmodifiableMapView) return _latestExecution;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

/// Detail only (GET /strategies/:id): last-30-day performance, past runs, the broker.
@override final  StrategyPerformance? performance;
 final  List<StrategyExecution> _executions;
@override@JsonKey() List<StrategyExecution> get executions {
  if (_executions is EqualUnmodifiableListView) return _executions;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_executions);
}

 final  Map<String, dynamic>? _brokerAccount;
@override Map<String, dynamic>? get brokerAccount {
  final value = _brokerAccount;
  if (value == null) return null;
  if (_brokerAccount is EqualUnmodifiableMapView) return _brokerAccount;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


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
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _StrategyRow&&(identical(other.id, id) || other.id == id)&&(identical(other.name, name) || other.name == name)&&(identical(other.type, type) || other.type == type)&&(identical(other.isActive, isActive) || other.isActive == isActive)&&(identical(other.isPaperTrade, isPaperTrade) || other.isPaperTrade == isPaperTrade)&&(identical(other.autoStart, autoStart) || other.autoStart == autoStart)&&(identical(other.brokerAccountId, brokerAccountId) || other.brokerAccountId == brokerAccountId)&&const DeepCollectionEquality().equals(other._config, _config)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt)&&(identical(other.todayPnl, todayPnl) || other.todayPnl == todayPnl)&&const DeepCollectionEquality().equals(other._latestExecution, _latestExecution)&&(identical(other.performance, performance) || other.performance == performance)&&const DeepCollectionEquality().equals(other._executions, _executions)&&const DeepCollectionEquality().equals(other._brokerAccount, _brokerAccount));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,name,type,isActive,isPaperTrade,autoStart,brokerAccountId,const DeepCollectionEquality().hash(_config),updatedAt,todayPnl,const DeepCollectionEquality().hash(_latestExecution),performance,const DeepCollectionEquality().hash(_executions),const DeepCollectionEquality().hash(_brokerAccount));

@override
String toString() {
  return 'StrategyRow(id: $id, name: $name, type: $type, isActive: $isActive, isPaperTrade: $isPaperTrade, autoStart: $autoStart, brokerAccountId: $brokerAccountId, config: $config, updatedAt: $updatedAt, todayPnl: $todayPnl, latestExecution: $latestExecution, performance: $performance, executions: $executions, brokerAccount: $brokerAccount)';
}


}

/// @nodoc
abstract mixin class _$StrategyRowCopyWith<$Res> implements $StrategyRowCopyWith<$Res> {
  factory _$StrategyRowCopyWith(_StrategyRow value, $Res Function(_StrategyRow) _then) = __$StrategyRowCopyWithImpl;
@override @useResult
$Res call({
 String id, String name,@JsonKey(fromJson: strategyTypeFromJson) StrategyType? type, bool isActive, bool isPaperTrade, bool autoStart, String? brokerAccountId,@JsonKey(fromJson: configFromJson) Map<String, dynamic> config, DateTime? updatedAt, double? todayPnl, Map<String, dynamic>? latestExecution, StrategyPerformance? performance, List<StrategyExecution> executions, Map<String, dynamic>? brokerAccount
});


@override $StrategyPerformanceCopyWith<$Res>? get performance;

}
/// @nodoc
class __$StrategyRowCopyWithImpl<$Res>
    implements _$StrategyRowCopyWith<$Res> {
  __$StrategyRowCopyWithImpl(this._self, this._then);

  final _StrategyRow _self;
  final $Res Function(_StrategyRow) _then;

/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? name = null,Object? type = freezed,Object? isActive = null,Object? isPaperTrade = null,Object? autoStart = null,Object? brokerAccountId = freezed,Object? config = null,Object? updatedAt = freezed,Object? todayPnl = freezed,Object? latestExecution = freezed,Object? performance = freezed,Object? executions = null,Object? brokerAccount = freezed,}) {
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
as DateTime?,todayPnl: freezed == todayPnl ? _self.todayPnl : todayPnl // ignore: cast_nullable_to_non_nullable
as double?,latestExecution: freezed == latestExecution ? _self._latestExecution : latestExecution // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,performance: freezed == performance ? _self.performance : performance // ignore: cast_nullable_to_non_nullable
as StrategyPerformance?,executions: null == executions ? _self._executions : executions // ignore: cast_nullable_to_non_nullable
as List<StrategyExecution>,brokerAccount: freezed == brokerAccount ? _self._brokerAccount : brokerAccount // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}

/// Create a copy of StrategyRow
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$StrategyPerformanceCopyWith<$Res>? get performance {
    if (_self.performance == null) {
    return null;
  }

  return $StrategyPerformanceCopyWith<$Res>(_self.performance!, (value) {
    return _then(_self.copyWith(performance: value));
  });
}
}


/// @nodoc
mixin _$StrategyPerformance {

 int get totalTrades; double get winRate; double get netPnl; double get profitFactor; double get avgProfitPerWin; int? get todayTrades; double? get todayPnl;
/// Create a copy of StrategyPerformance
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$StrategyPerformanceCopyWith<StrategyPerformance> get copyWith => _$StrategyPerformanceCopyWithImpl<StrategyPerformance>(this as StrategyPerformance, _$identity);

  /// Serializes this StrategyPerformance to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is StrategyPerformance&&(identical(other.totalTrades, totalTrades) || other.totalTrades == totalTrades)&&(identical(other.winRate, winRate) || other.winRate == winRate)&&(identical(other.netPnl, netPnl) || other.netPnl == netPnl)&&(identical(other.profitFactor, profitFactor) || other.profitFactor == profitFactor)&&(identical(other.avgProfitPerWin, avgProfitPerWin) || other.avgProfitPerWin == avgProfitPerWin)&&(identical(other.todayTrades, todayTrades) || other.todayTrades == todayTrades)&&(identical(other.todayPnl, todayPnl) || other.todayPnl == todayPnl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,totalTrades,winRate,netPnl,profitFactor,avgProfitPerWin,todayTrades,todayPnl);

@override
String toString() {
  return 'StrategyPerformance(totalTrades: $totalTrades, winRate: $winRate, netPnl: $netPnl, profitFactor: $profitFactor, avgProfitPerWin: $avgProfitPerWin, todayTrades: $todayTrades, todayPnl: $todayPnl)';
}


}

/// @nodoc
abstract mixin class $StrategyPerformanceCopyWith<$Res>  {
  factory $StrategyPerformanceCopyWith(StrategyPerformance value, $Res Function(StrategyPerformance) _then) = _$StrategyPerformanceCopyWithImpl;
@useResult
$Res call({
 int totalTrades, double winRate, double netPnl, double profitFactor, double avgProfitPerWin, int? todayTrades, double? todayPnl
});




}
/// @nodoc
class _$StrategyPerformanceCopyWithImpl<$Res>
    implements $StrategyPerformanceCopyWith<$Res> {
  _$StrategyPerformanceCopyWithImpl(this._self, this._then);

  final StrategyPerformance _self;
  final $Res Function(StrategyPerformance) _then;

/// Create a copy of StrategyPerformance
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? totalTrades = null,Object? winRate = null,Object? netPnl = null,Object? profitFactor = null,Object? avgProfitPerWin = null,Object? todayTrades = freezed,Object? todayPnl = freezed,}) {
  return _then(_self.copyWith(
totalTrades: null == totalTrades ? _self.totalTrades : totalTrades // ignore: cast_nullable_to_non_nullable
as int,winRate: null == winRate ? _self.winRate : winRate // ignore: cast_nullable_to_non_nullable
as double,netPnl: null == netPnl ? _self.netPnl : netPnl // ignore: cast_nullable_to_non_nullable
as double,profitFactor: null == profitFactor ? _self.profitFactor : profitFactor // ignore: cast_nullable_to_non_nullable
as double,avgProfitPerWin: null == avgProfitPerWin ? _self.avgProfitPerWin : avgProfitPerWin // ignore: cast_nullable_to_non_nullable
as double,todayTrades: freezed == todayTrades ? _self.todayTrades : todayTrades // ignore: cast_nullable_to_non_nullable
as int?,todayPnl: freezed == todayPnl ? _self.todayPnl : todayPnl // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [StrategyPerformance].
extension StrategyPerformancePatterns on StrategyPerformance {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _StrategyPerformance value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _StrategyPerformance() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _StrategyPerformance value)  $default,){
final _that = this;
switch (_that) {
case _StrategyPerformance():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _StrategyPerformance value)?  $default,){
final _that = this;
switch (_that) {
case _StrategyPerformance() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int totalTrades,  double winRate,  double netPnl,  double profitFactor,  double avgProfitPerWin,  int? todayTrades,  double? todayPnl)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _StrategyPerformance() when $default != null:
return $default(_that.totalTrades,_that.winRate,_that.netPnl,_that.profitFactor,_that.avgProfitPerWin,_that.todayTrades,_that.todayPnl);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int totalTrades,  double winRate,  double netPnl,  double profitFactor,  double avgProfitPerWin,  int? todayTrades,  double? todayPnl)  $default,) {final _that = this;
switch (_that) {
case _StrategyPerformance():
return $default(_that.totalTrades,_that.winRate,_that.netPnl,_that.profitFactor,_that.avgProfitPerWin,_that.todayTrades,_that.todayPnl);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int totalTrades,  double winRate,  double netPnl,  double profitFactor,  double avgProfitPerWin,  int? todayTrades,  double? todayPnl)?  $default,) {final _that = this;
switch (_that) {
case _StrategyPerformance() when $default != null:
return $default(_that.totalTrades,_that.winRate,_that.netPnl,_that.profitFactor,_that.avgProfitPerWin,_that.todayTrades,_that.todayPnl);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _StrategyPerformance implements StrategyPerformance {
  const _StrategyPerformance({this.totalTrades = 0, this.winRate = 0, this.netPnl = 0, this.profitFactor = 0, this.avgProfitPerWin = 0, this.todayTrades, this.todayPnl});
  factory _StrategyPerformance.fromJson(Map<String, dynamic> json) => _$StrategyPerformanceFromJson(json);

@override@JsonKey() final  int totalTrades;
@override@JsonKey() final  double winRate;
@override@JsonKey() final  double netPnl;
@override@JsonKey() final  double profitFactor;
@override@JsonKey() final  double avgProfitPerWin;
@override final  int? todayTrades;
@override final  double? todayPnl;

/// Create a copy of StrategyPerformance
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$StrategyPerformanceCopyWith<_StrategyPerformance> get copyWith => __$StrategyPerformanceCopyWithImpl<_StrategyPerformance>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$StrategyPerformanceToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _StrategyPerformance&&(identical(other.totalTrades, totalTrades) || other.totalTrades == totalTrades)&&(identical(other.winRate, winRate) || other.winRate == winRate)&&(identical(other.netPnl, netPnl) || other.netPnl == netPnl)&&(identical(other.profitFactor, profitFactor) || other.profitFactor == profitFactor)&&(identical(other.avgProfitPerWin, avgProfitPerWin) || other.avgProfitPerWin == avgProfitPerWin)&&(identical(other.todayTrades, todayTrades) || other.todayTrades == todayTrades)&&(identical(other.todayPnl, todayPnl) || other.todayPnl == todayPnl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,totalTrades,winRate,netPnl,profitFactor,avgProfitPerWin,todayTrades,todayPnl);

@override
String toString() {
  return 'StrategyPerformance(totalTrades: $totalTrades, winRate: $winRate, netPnl: $netPnl, profitFactor: $profitFactor, avgProfitPerWin: $avgProfitPerWin, todayTrades: $todayTrades, todayPnl: $todayPnl)';
}


}

/// @nodoc
abstract mixin class _$StrategyPerformanceCopyWith<$Res> implements $StrategyPerformanceCopyWith<$Res> {
  factory _$StrategyPerformanceCopyWith(_StrategyPerformance value, $Res Function(_StrategyPerformance) _then) = __$StrategyPerformanceCopyWithImpl;
@override @useResult
$Res call({
 int totalTrades, double winRate, double netPnl, double profitFactor, double avgProfitPerWin, int? todayTrades, double? todayPnl
});




}
/// @nodoc
class __$StrategyPerformanceCopyWithImpl<$Res>
    implements _$StrategyPerformanceCopyWith<$Res> {
  __$StrategyPerformanceCopyWithImpl(this._self, this._then);

  final _StrategyPerformance _self;
  final $Res Function(_StrategyPerformance) _then;

/// Create a copy of StrategyPerformance
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? totalTrades = null,Object? winRate = null,Object? netPnl = null,Object? profitFactor = null,Object? avgProfitPerWin = null,Object? todayTrades = freezed,Object? todayPnl = freezed,}) {
  return _then(_StrategyPerformance(
totalTrades: null == totalTrades ? _self.totalTrades : totalTrades // ignore: cast_nullable_to_non_nullable
as int,winRate: null == winRate ? _self.winRate : winRate // ignore: cast_nullable_to_non_nullable
as double,netPnl: null == netPnl ? _self.netPnl : netPnl // ignore: cast_nullable_to_non_nullable
as double,profitFactor: null == profitFactor ? _self.profitFactor : profitFactor // ignore: cast_nullable_to_non_nullable
as double,avgProfitPerWin: null == avgProfitPerWin ? _self.avgProfitPerWin : avgProfitPerWin // ignore: cast_nullable_to_non_nullable
as double,todayTrades: freezed == todayTrades ? _self.todayTrades : todayTrades // ignore: cast_nullable_to_non_nullable
as int?,todayPnl: freezed == todayPnl ? _self.todayPnl : todayPnl // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$StrategyExecution {

 String get id; String get status; DateTime? get startedAt; DateTime? get stoppedAt; String? get logs; String? get errorMsg;
/// Create a copy of StrategyExecution
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$StrategyExecutionCopyWith<StrategyExecution> get copyWith => _$StrategyExecutionCopyWithImpl<StrategyExecution>(this as StrategyExecution, _$identity);

  /// Serializes this StrategyExecution to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is StrategyExecution&&(identical(other.id, id) || other.id == id)&&(identical(other.status, status) || other.status == status)&&(identical(other.startedAt, startedAt) || other.startedAt == startedAt)&&(identical(other.stoppedAt, stoppedAt) || other.stoppedAt == stoppedAt)&&(identical(other.logs, logs) || other.logs == logs)&&(identical(other.errorMsg, errorMsg) || other.errorMsg == errorMsg));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,status,startedAt,stoppedAt,logs,errorMsg);

@override
String toString() {
  return 'StrategyExecution(id: $id, status: $status, startedAt: $startedAt, stoppedAt: $stoppedAt, logs: $logs, errorMsg: $errorMsg)';
}


}

/// @nodoc
abstract mixin class $StrategyExecutionCopyWith<$Res>  {
  factory $StrategyExecutionCopyWith(StrategyExecution value, $Res Function(StrategyExecution) _then) = _$StrategyExecutionCopyWithImpl;
@useResult
$Res call({
 String id, String status, DateTime? startedAt, DateTime? stoppedAt, String? logs, String? errorMsg
});




}
/// @nodoc
class _$StrategyExecutionCopyWithImpl<$Res>
    implements $StrategyExecutionCopyWith<$Res> {
  _$StrategyExecutionCopyWithImpl(this._self, this._then);

  final StrategyExecution _self;
  final $Res Function(StrategyExecution) _then;

/// Create a copy of StrategyExecution
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? status = null,Object? startedAt = freezed,Object? stoppedAt = freezed,Object? logs = freezed,Object? errorMsg = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,startedAt: freezed == startedAt ? _self.startedAt : startedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,stoppedAt: freezed == stoppedAt ? _self.stoppedAt : stoppedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,logs: freezed == logs ? _self.logs : logs // ignore: cast_nullable_to_non_nullable
as String?,errorMsg: freezed == errorMsg ? _self.errorMsg : errorMsg // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [StrategyExecution].
extension StrategyExecutionPatterns on StrategyExecution {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _StrategyExecution value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _StrategyExecution() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _StrategyExecution value)  $default,){
final _that = this;
switch (_that) {
case _StrategyExecution():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _StrategyExecution value)?  $default,){
final _that = this;
switch (_that) {
case _StrategyExecution() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String status,  DateTime? startedAt,  DateTime? stoppedAt,  String? logs,  String? errorMsg)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _StrategyExecution() when $default != null:
return $default(_that.id,_that.status,_that.startedAt,_that.stoppedAt,_that.logs,_that.errorMsg);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String status,  DateTime? startedAt,  DateTime? stoppedAt,  String? logs,  String? errorMsg)  $default,) {final _that = this;
switch (_that) {
case _StrategyExecution():
return $default(_that.id,_that.status,_that.startedAt,_that.stoppedAt,_that.logs,_that.errorMsg);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String status,  DateTime? startedAt,  DateTime? stoppedAt,  String? logs,  String? errorMsg)?  $default,) {final _that = this;
switch (_that) {
case _StrategyExecution() when $default != null:
return $default(_that.id,_that.status,_that.startedAt,_that.stoppedAt,_that.logs,_that.errorMsg);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _StrategyExecution extends StrategyExecution {
  const _StrategyExecution({required this.id, this.status = 'STOPPED', this.startedAt, this.stoppedAt, this.logs, this.errorMsg}): super._();
  factory _StrategyExecution.fromJson(Map<String, dynamic> json) => _$StrategyExecutionFromJson(json);

@override final  String id;
@override@JsonKey() final  String status;
@override final  DateTime? startedAt;
@override final  DateTime? stoppedAt;
@override final  String? logs;
@override final  String? errorMsg;

/// Create a copy of StrategyExecution
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$StrategyExecutionCopyWith<_StrategyExecution> get copyWith => __$StrategyExecutionCopyWithImpl<_StrategyExecution>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$StrategyExecutionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _StrategyExecution&&(identical(other.id, id) || other.id == id)&&(identical(other.status, status) || other.status == status)&&(identical(other.startedAt, startedAt) || other.startedAt == startedAt)&&(identical(other.stoppedAt, stoppedAt) || other.stoppedAt == stoppedAt)&&(identical(other.logs, logs) || other.logs == logs)&&(identical(other.errorMsg, errorMsg) || other.errorMsg == errorMsg));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,status,startedAt,stoppedAt,logs,errorMsg);

@override
String toString() {
  return 'StrategyExecution(id: $id, status: $status, startedAt: $startedAt, stoppedAt: $stoppedAt, logs: $logs, errorMsg: $errorMsg)';
}


}

/// @nodoc
abstract mixin class _$StrategyExecutionCopyWith<$Res> implements $StrategyExecutionCopyWith<$Res> {
  factory _$StrategyExecutionCopyWith(_StrategyExecution value, $Res Function(_StrategyExecution) _then) = __$StrategyExecutionCopyWithImpl;
@override @useResult
$Res call({
 String id, String status, DateTime? startedAt, DateTime? stoppedAt, String? logs, String? errorMsg
});




}
/// @nodoc
class __$StrategyExecutionCopyWithImpl<$Res>
    implements _$StrategyExecutionCopyWith<$Res> {
  __$StrategyExecutionCopyWithImpl(this._self, this._then);

  final _StrategyExecution _self;
  final $Res Function(_StrategyExecution) _then;

/// Create a copy of StrategyExecution
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? status = null,Object? startedAt = freezed,Object? stoppedAt = freezed,Object? logs = freezed,Object? errorMsg = freezed,}) {
  return _then(_StrategyExecution(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as String,startedAt: freezed == startedAt ? _self.startedAt : startedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,stoppedAt: freezed == stoppedAt ? _self.stoppedAt : stoppedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,logs: freezed == logs ? _self.logs : logs // ignore: cast_nullable_to_non_nullable
as String?,errorMsg: freezed == errorMsg ? _self.errorMsg : errorMsg // ignore: cast_nullable_to_non_nullable
as String?,
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
