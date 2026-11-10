// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ledger_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$LedgerData {

 LedgerSummary get summary; LedgerPagination get pagination; List<LedgerDay> get dailyLedger; List<ClosedTrade> get closedTrades;
/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LedgerDataCopyWith<LedgerData> get copyWith => _$LedgerDataCopyWithImpl<LedgerData>(this as LedgerData, _$identity);

  /// Serializes this LedgerData to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is LedgerData&&(identical(other.summary, summary) || other.summary == summary)&&(identical(other.pagination, pagination) || other.pagination == pagination)&&const DeepCollectionEquality().equals(other.dailyLedger, dailyLedger)&&const DeepCollectionEquality().equals(other.closedTrades, closedTrades));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,summary,pagination,const DeepCollectionEquality().hash(dailyLedger),const DeepCollectionEquality().hash(closedTrades));

@override
String toString() {
  return 'LedgerData(summary: $summary, pagination: $pagination, dailyLedger: $dailyLedger, closedTrades: $closedTrades)';
}


}

/// @nodoc
abstract mixin class $LedgerDataCopyWith<$Res>  {
  factory $LedgerDataCopyWith(LedgerData value, $Res Function(LedgerData) _then) = _$LedgerDataCopyWithImpl;
@useResult
$Res call({
 LedgerSummary summary, LedgerPagination pagination, List<LedgerDay> dailyLedger, List<ClosedTrade> closedTrades
});


$LedgerSummaryCopyWith<$Res> get summary;$LedgerPaginationCopyWith<$Res> get pagination;

}
/// @nodoc
class _$LedgerDataCopyWithImpl<$Res>
    implements $LedgerDataCopyWith<$Res> {
  _$LedgerDataCopyWithImpl(this._self, this._then);

  final LedgerData _self;
  final $Res Function(LedgerData) _then;

/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? summary = null,Object? pagination = null,Object? dailyLedger = null,Object? closedTrades = null,}) {
  return _then(_self.copyWith(
summary: null == summary ? _self.summary : summary // ignore: cast_nullable_to_non_nullable
as LedgerSummary,pagination: null == pagination ? _self.pagination : pagination // ignore: cast_nullable_to_non_nullable
as LedgerPagination,dailyLedger: null == dailyLedger ? _self.dailyLedger : dailyLedger // ignore: cast_nullable_to_non_nullable
as List<LedgerDay>,closedTrades: null == closedTrades ? _self.closedTrades : closedTrades // ignore: cast_nullable_to_non_nullable
as List<ClosedTrade>,
  ));
}
/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$LedgerSummaryCopyWith<$Res> get summary {
  
  return $LedgerSummaryCopyWith<$Res>(_self.summary, (value) {
    return _then(_self.copyWith(summary: value));
  });
}/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$LedgerPaginationCopyWith<$Res> get pagination {
  
  return $LedgerPaginationCopyWith<$Res>(_self.pagination, (value) {
    return _then(_self.copyWith(pagination: value));
  });
}
}


/// Adds pattern-matching-related methods to [LedgerData].
extension LedgerDataPatterns on LedgerData {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _LedgerData value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _LedgerData() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _LedgerData value)  $default,){
final _that = this;
switch (_that) {
case _LedgerData():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _LedgerData value)?  $default,){
final _that = this;
switch (_that) {
case _LedgerData() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( LedgerSummary summary,  LedgerPagination pagination,  List<LedgerDay> dailyLedger,  List<ClosedTrade> closedTrades)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _LedgerData() when $default != null:
return $default(_that.summary,_that.pagination,_that.dailyLedger,_that.closedTrades);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( LedgerSummary summary,  LedgerPagination pagination,  List<LedgerDay> dailyLedger,  List<ClosedTrade> closedTrades)  $default,) {final _that = this;
switch (_that) {
case _LedgerData():
return $default(_that.summary,_that.pagination,_that.dailyLedger,_that.closedTrades);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( LedgerSummary summary,  LedgerPagination pagination,  List<LedgerDay> dailyLedger,  List<ClosedTrade> closedTrades)?  $default,) {final _that = this;
switch (_that) {
case _LedgerData() when $default != null:
return $default(_that.summary,_that.pagination,_that.dailyLedger,_that.closedTrades);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _LedgerData implements LedgerData {
  const _LedgerData({required this.summary, required this.pagination, final  List<LedgerDay> dailyLedger = const [], final  List<ClosedTrade> closedTrades = const []}): _dailyLedger = dailyLedger,_closedTrades = closedTrades;
  factory _LedgerData.fromJson(Map<String, dynamic> json) => _$LedgerDataFromJson(json);

@override final  LedgerSummary summary;
@override final  LedgerPagination pagination;
 final  List<LedgerDay> _dailyLedger;
@override@JsonKey() List<LedgerDay> get dailyLedger {
  if (_dailyLedger is EqualUnmodifiableListView) return _dailyLedger;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_dailyLedger);
}

 final  List<ClosedTrade> _closedTrades;
@override@JsonKey() List<ClosedTrade> get closedTrades {
  if (_closedTrades is EqualUnmodifiableListView) return _closedTrades;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_closedTrades);
}


/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LedgerDataCopyWith<_LedgerData> get copyWith => __$LedgerDataCopyWithImpl<_LedgerData>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LedgerDataToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _LedgerData&&(identical(other.summary, summary) || other.summary == summary)&&(identical(other.pagination, pagination) || other.pagination == pagination)&&const DeepCollectionEquality().equals(other._dailyLedger, _dailyLedger)&&const DeepCollectionEquality().equals(other._closedTrades, _closedTrades));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,summary,pagination,const DeepCollectionEquality().hash(_dailyLedger),const DeepCollectionEquality().hash(_closedTrades));

@override
String toString() {
  return 'LedgerData(summary: $summary, pagination: $pagination, dailyLedger: $dailyLedger, closedTrades: $closedTrades)';
}


}

/// @nodoc
abstract mixin class _$LedgerDataCopyWith<$Res> implements $LedgerDataCopyWith<$Res> {
  factory _$LedgerDataCopyWith(_LedgerData value, $Res Function(_LedgerData) _then) = __$LedgerDataCopyWithImpl;
@override @useResult
$Res call({
 LedgerSummary summary, LedgerPagination pagination, List<LedgerDay> dailyLedger, List<ClosedTrade> closedTrades
});


@override $LedgerSummaryCopyWith<$Res> get summary;@override $LedgerPaginationCopyWith<$Res> get pagination;

}
/// @nodoc
class __$LedgerDataCopyWithImpl<$Res>
    implements _$LedgerDataCopyWith<$Res> {
  __$LedgerDataCopyWithImpl(this._self, this._then);

  final _LedgerData _self;
  final $Res Function(_LedgerData) _then;

/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? summary = null,Object? pagination = null,Object? dailyLedger = null,Object? closedTrades = null,}) {
  return _then(_LedgerData(
summary: null == summary ? _self.summary : summary // ignore: cast_nullable_to_non_nullable
as LedgerSummary,pagination: null == pagination ? _self.pagination : pagination // ignore: cast_nullable_to_non_nullable
as LedgerPagination,dailyLedger: null == dailyLedger ? _self._dailyLedger : dailyLedger // ignore: cast_nullable_to_non_nullable
as List<LedgerDay>,closedTrades: null == closedTrades ? _self._closedTrades : closedTrades // ignore: cast_nullable_to_non_nullable
as List<ClosedTrade>,
  ));
}

/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$LedgerSummaryCopyWith<$Res> get summary {
  
  return $LedgerSummaryCopyWith<$Res>(_self.summary, (value) {
    return _then(_self.copyWith(summary: value));
  });
}/// Create a copy of LedgerData
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$LedgerPaginationCopyWith<$Res> get pagination {
  
  return $LedgerPaginationCopyWith<$Res>(_self.pagination, (value) {
    return _then(_self.copyWith(pagination: value));
  });
}
}


/// @nodoc
mixin _$LedgerSummary {

 double get totalRealizedPnl; double get totalGrossPnl; double get totalCharges; int get totalTrades; double get winRate; int get estimatedChargeTrades;
/// Create a copy of LedgerSummary
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LedgerSummaryCopyWith<LedgerSummary> get copyWith => _$LedgerSummaryCopyWithImpl<LedgerSummary>(this as LedgerSummary, _$identity);

  /// Serializes this LedgerSummary to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is LedgerSummary&&(identical(other.totalRealizedPnl, totalRealizedPnl) || other.totalRealizedPnl == totalRealizedPnl)&&(identical(other.totalGrossPnl, totalGrossPnl) || other.totalGrossPnl == totalGrossPnl)&&(identical(other.totalCharges, totalCharges) || other.totalCharges == totalCharges)&&(identical(other.totalTrades, totalTrades) || other.totalTrades == totalTrades)&&(identical(other.winRate, winRate) || other.winRate == winRate)&&(identical(other.estimatedChargeTrades, estimatedChargeTrades) || other.estimatedChargeTrades == estimatedChargeTrades));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,totalRealizedPnl,totalGrossPnl,totalCharges,totalTrades,winRate,estimatedChargeTrades);

@override
String toString() {
  return 'LedgerSummary(totalRealizedPnl: $totalRealizedPnl, totalGrossPnl: $totalGrossPnl, totalCharges: $totalCharges, totalTrades: $totalTrades, winRate: $winRate, estimatedChargeTrades: $estimatedChargeTrades)';
}


}

/// @nodoc
abstract mixin class $LedgerSummaryCopyWith<$Res>  {
  factory $LedgerSummaryCopyWith(LedgerSummary value, $Res Function(LedgerSummary) _then) = _$LedgerSummaryCopyWithImpl;
@useResult
$Res call({
 double totalRealizedPnl, double totalGrossPnl, double totalCharges, int totalTrades, double winRate, int estimatedChargeTrades
});




}
/// @nodoc
class _$LedgerSummaryCopyWithImpl<$Res>
    implements $LedgerSummaryCopyWith<$Res> {
  _$LedgerSummaryCopyWithImpl(this._self, this._then);

  final LedgerSummary _self;
  final $Res Function(LedgerSummary) _then;

/// Create a copy of LedgerSummary
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? totalRealizedPnl = null,Object? totalGrossPnl = null,Object? totalCharges = null,Object? totalTrades = null,Object? winRate = null,Object? estimatedChargeTrades = null,}) {
  return _then(_self.copyWith(
totalRealizedPnl: null == totalRealizedPnl ? _self.totalRealizedPnl : totalRealizedPnl // ignore: cast_nullable_to_non_nullable
as double,totalGrossPnl: null == totalGrossPnl ? _self.totalGrossPnl : totalGrossPnl // ignore: cast_nullable_to_non_nullable
as double,totalCharges: null == totalCharges ? _self.totalCharges : totalCharges // ignore: cast_nullable_to_non_nullable
as double,totalTrades: null == totalTrades ? _self.totalTrades : totalTrades // ignore: cast_nullable_to_non_nullable
as int,winRate: null == winRate ? _self.winRate : winRate // ignore: cast_nullable_to_non_nullable
as double,estimatedChargeTrades: null == estimatedChargeTrades ? _self.estimatedChargeTrades : estimatedChargeTrades // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [LedgerSummary].
extension LedgerSummaryPatterns on LedgerSummary {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _LedgerSummary value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _LedgerSummary() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _LedgerSummary value)  $default,){
final _that = this;
switch (_that) {
case _LedgerSummary():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _LedgerSummary value)?  $default,){
final _that = this;
switch (_that) {
case _LedgerSummary() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double totalRealizedPnl,  double totalGrossPnl,  double totalCharges,  int totalTrades,  double winRate,  int estimatedChargeTrades)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _LedgerSummary() when $default != null:
return $default(_that.totalRealizedPnl,_that.totalGrossPnl,_that.totalCharges,_that.totalTrades,_that.winRate,_that.estimatedChargeTrades);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double totalRealizedPnl,  double totalGrossPnl,  double totalCharges,  int totalTrades,  double winRate,  int estimatedChargeTrades)  $default,) {final _that = this;
switch (_that) {
case _LedgerSummary():
return $default(_that.totalRealizedPnl,_that.totalGrossPnl,_that.totalCharges,_that.totalTrades,_that.winRate,_that.estimatedChargeTrades);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double totalRealizedPnl,  double totalGrossPnl,  double totalCharges,  int totalTrades,  double winRate,  int estimatedChargeTrades)?  $default,) {final _that = this;
switch (_that) {
case _LedgerSummary() when $default != null:
return $default(_that.totalRealizedPnl,_that.totalGrossPnl,_that.totalCharges,_that.totalTrades,_that.winRate,_that.estimatedChargeTrades);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _LedgerSummary implements LedgerSummary {
  const _LedgerSummary({this.totalRealizedPnl = 0, this.totalGrossPnl = 0, this.totalCharges = 0, this.totalTrades = 0, this.winRate = 0, this.estimatedChargeTrades = 0});
  factory _LedgerSummary.fromJson(Map<String, dynamic> json) => _$LedgerSummaryFromJson(json);

@override@JsonKey() final  double totalRealizedPnl;
@override@JsonKey() final  double totalGrossPnl;
@override@JsonKey() final  double totalCharges;
@override@JsonKey() final  int totalTrades;
@override@JsonKey() final  double winRate;
@override@JsonKey() final  int estimatedChargeTrades;

/// Create a copy of LedgerSummary
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LedgerSummaryCopyWith<_LedgerSummary> get copyWith => __$LedgerSummaryCopyWithImpl<_LedgerSummary>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LedgerSummaryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _LedgerSummary&&(identical(other.totalRealizedPnl, totalRealizedPnl) || other.totalRealizedPnl == totalRealizedPnl)&&(identical(other.totalGrossPnl, totalGrossPnl) || other.totalGrossPnl == totalGrossPnl)&&(identical(other.totalCharges, totalCharges) || other.totalCharges == totalCharges)&&(identical(other.totalTrades, totalTrades) || other.totalTrades == totalTrades)&&(identical(other.winRate, winRate) || other.winRate == winRate)&&(identical(other.estimatedChargeTrades, estimatedChargeTrades) || other.estimatedChargeTrades == estimatedChargeTrades));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,totalRealizedPnl,totalGrossPnl,totalCharges,totalTrades,winRate,estimatedChargeTrades);

@override
String toString() {
  return 'LedgerSummary(totalRealizedPnl: $totalRealizedPnl, totalGrossPnl: $totalGrossPnl, totalCharges: $totalCharges, totalTrades: $totalTrades, winRate: $winRate, estimatedChargeTrades: $estimatedChargeTrades)';
}


}

/// @nodoc
abstract mixin class _$LedgerSummaryCopyWith<$Res> implements $LedgerSummaryCopyWith<$Res> {
  factory _$LedgerSummaryCopyWith(_LedgerSummary value, $Res Function(_LedgerSummary) _then) = __$LedgerSummaryCopyWithImpl;
@override @useResult
$Res call({
 double totalRealizedPnl, double totalGrossPnl, double totalCharges, int totalTrades, double winRate, int estimatedChargeTrades
});




}
/// @nodoc
class __$LedgerSummaryCopyWithImpl<$Res>
    implements _$LedgerSummaryCopyWith<$Res> {
  __$LedgerSummaryCopyWithImpl(this._self, this._then);

  final _LedgerSummary _self;
  final $Res Function(_LedgerSummary) _then;

/// Create a copy of LedgerSummary
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? totalRealizedPnl = null,Object? totalGrossPnl = null,Object? totalCharges = null,Object? totalTrades = null,Object? winRate = null,Object? estimatedChargeTrades = null,}) {
  return _then(_LedgerSummary(
totalRealizedPnl: null == totalRealizedPnl ? _self.totalRealizedPnl : totalRealizedPnl // ignore: cast_nullable_to_non_nullable
as double,totalGrossPnl: null == totalGrossPnl ? _self.totalGrossPnl : totalGrossPnl // ignore: cast_nullable_to_non_nullable
as double,totalCharges: null == totalCharges ? _self.totalCharges : totalCharges // ignore: cast_nullable_to_non_nullable
as double,totalTrades: null == totalTrades ? _self.totalTrades : totalTrades // ignore: cast_nullable_to_non_nullable
as int,winRate: null == winRate ? _self.winRate : winRate // ignore: cast_nullable_to_non_nullable
as double,estimatedChargeTrades: null == estimatedChargeTrades ? _self.estimatedChargeTrades : estimatedChargeTrades // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$LedgerPagination {

 int get page; int get totalPages; int get total;
/// Create a copy of LedgerPagination
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LedgerPaginationCopyWith<LedgerPagination> get copyWith => _$LedgerPaginationCopyWithImpl<LedgerPagination>(this as LedgerPagination, _$identity);

  /// Serializes this LedgerPagination to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is LedgerPagination&&(identical(other.page, page) || other.page == page)&&(identical(other.totalPages, totalPages) || other.totalPages == totalPages)&&(identical(other.total, total) || other.total == total));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,page,totalPages,total);

@override
String toString() {
  return 'LedgerPagination(page: $page, totalPages: $totalPages, total: $total)';
}


}

/// @nodoc
abstract mixin class $LedgerPaginationCopyWith<$Res>  {
  factory $LedgerPaginationCopyWith(LedgerPagination value, $Res Function(LedgerPagination) _then) = _$LedgerPaginationCopyWithImpl;
@useResult
$Res call({
 int page, int totalPages, int total
});




}
/// @nodoc
class _$LedgerPaginationCopyWithImpl<$Res>
    implements $LedgerPaginationCopyWith<$Res> {
  _$LedgerPaginationCopyWithImpl(this._self, this._then);

  final LedgerPagination _self;
  final $Res Function(LedgerPagination) _then;

/// Create a copy of LedgerPagination
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? page = null,Object? totalPages = null,Object? total = null,}) {
  return _then(_self.copyWith(
page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,totalPages: null == totalPages ? _self.totalPages : totalPages // ignore: cast_nullable_to_non_nullable
as int,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [LedgerPagination].
extension LedgerPaginationPatterns on LedgerPagination {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _LedgerPagination value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _LedgerPagination() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _LedgerPagination value)  $default,){
final _that = this;
switch (_that) {
case _LedgerPagination():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _LedgerPagination value)?  $default,){
final _that = this;
switch (_that) {
case _LedgerPagination() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int page,  int totalPages,  int total)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _LedgerPagination() when $default != null:
return $default(_that.page,_that.totalPages,_that.total);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int page,  int totalPages,  int total)  $default,) {final _that = this;
switch (_that) {
case _LedgerPagination():
return $default(_that.page,_that.totalPages,_that.total);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int page,  int totalPages,  int total)?  $default,) {final _that = this;
switch (_that) {
case _LedgerPagination() when $default != null:
return $default(_that.page,_that.totalPages,_that.total);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _LedgerPagination implements LedgerPagination {
  const _LedgerPagination({this.page = 1, this.totalPages = 1, this.total = 0});
  factory _LedgerPagination.fromJson(Map<String, dynamic> json) => _$LedgerPaginationFromJson(json);

@override@JsonKey() final  int page;
@override@JsonKey() final  int totalPages;
@override@JsonKey() final  int total;

/// Create a copy of LedgerPagination
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LedgerPaginationCopyWith<_LedgerPagination> get copyWith => __$LedgerPaginationCopyWithImpl<_LedgerPagination>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LedgerPaginationToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _LedgerPagination&&(identical(other.page, page) || other.page == page)&&(identical(other.totalPages, totalPages) || other.totalPages == totalPages)&&(identical(other.total, total) || other.total == total));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,page,totalPages,total);

@override
String toString() {
  return 'LedgerPagination(page: $page, totalPages: $totalPages, total: $total)';
}


}

/// @nodoc
abstract mixin class _$LedgerPaginationCopyWith<$Res> implements $LedgerPaginationCopyWith<$Res> {
  factory _$LedgerPaginationCopyWith(_LedgerPagination value, $Res Function(_LedgerPagination) _then) = __$LedgerPaginationCopyWithImpl;
@override @useResult
$Res call({
 int page, int totalPages, int total
});




}
/// @nodoc
class __$LedgerPaginationCopyWithImpl<$Res>
    implements _$LedgerPaginationCopyWith<$Res> {
  __$LedgerPaginationCopyWithImpl(this._self, this._then);

  final _LedgerPagination _self;
  final $Res Function(_LedgerPagination) _then;

/// Create a copy of LedgerPagination
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? page = null,Object? totalPages = null,Object? total = null,}) {
  return _then(_LedgerPagination(
page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,totalPages: null == totalPages ? _self.totalPages : totalPages // ignore: cast_nullable_to_non_nullable
as int,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$LedgerDay {

 String get date; String get formattedDate; int get tradesCount; double get pnl; double get charges; double get cumulativePnl;
/// Create a copy of LedgerDay
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$LedgerDayCopyWith<LedgerDay> get copyWith => _$LedgerDayCopyWithImpl<LedgerDay>(this as LedgerDay, _$identity);

  /// Serializes this LedgerDay to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is LedgerDay&&(identical(other.date, date) || other.date == date)&&(identical(other.formattedDate, formattedDate) || other.formattedDate == formattedDate)&&(identical(other.tradesCount, tradesCount) || other.tradesCount == tradesCount)&&(identical(other.pnl, pnl) || other.pnl == pnl)&&(identical(other.charges, charges) || other.charges == charges)&&(identical(other.cumulativePnl, cumulativePnl) || other.cumulativePnl == cumulativePnl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,formattedDate,tradesCount,pnl,charges,cumulativePnl);

@override
String toString() {
  return 'LedgerDay(date: $date, formattedDate: $formattedDate, tradesCount: $tradesCount, pnl: $pnl, charges: $charges, cumulativePnl: $cumulativePnl)';
}


}

/// @nodoc
abstract mixin class $LedgerDayCopyWith<$Res>  {
  factory $LedgerDayCopyWith(LedgerDay value, $Res Function(LedgerDay) _then) = _$LedgerDayCopyWithImpl;
@useResult
$Res call({
 String date, String formattedDate, int tradesCount, double pnl, double charges, double cumulativePnl
});




}
/// @nodoc
class _$LedgerDayCopyWithImpl<$Res>
    implements $LedgerDayCopyWith<$Res> {
  _$LedgerDayCopyWithImpl(this._self, this._then);

  final LedgerDay _self;
  final $Res Function(LedgerDay) _then;

/// Create a copy of LedgerDay
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? date = null,Object? formattedDate = null,Object? tradesCount = null,Object? pnl = null,Object? charges = null,Object? cumulativePnl = null,}) {
  return _then(_self.copyWith(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,formattedDate: null == formattedDate ? _self.formattedDate : formattedDate // ignore: cast_nullable_to_non_nullable
as String,tradesCount: null == tradesCount ? _self.tradesCount : tradesCount // ignore: cast_nullable_to_non_nullable
as int,pnl: null == pnl ? _self.pnl : pnl // ignore: cast_nullable_to_non_nullable
as double,charges: null == charges ? _self.charges : charges // ignore: cast_nullable_to_non_nullable
as double,cumulativePnl: null == cumulativePnl ? _self.cumulativePnl : cumulativePnl // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [LedgerDay].
extension LedgerDayPatterns on LedgerDay {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _LedgerDay value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _LedgerDay() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _LedgerDay value)  $default,){
final _that = this;
switch (_that) {
case _LedgerDay():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _LedgerDay value)?  $default,){
final _that = this;
switch (_that) {
case _LedgerDay() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String date,  String formattedDate,  int tradesCount,  double pnl,  double charges,  double cumulativePnl)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _LedgerDay() when $default != null:
return $default(_that.date,_that.formattedDate,_that.tradesCount,_that.pnl,_that.charges,_that.cumulativePnl);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String date,  String formattedDate,  int tradesCount,  double pnl,  double charges,  double cumulativePnl)  $default,) {final _that = this;
switch (_that) {
case _LedgerDay():
return $default(_that.date,_that.formattedDate,_that.tradesCount,_that.pnl,_that.charges,_that.cumulativePnl);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String date,  String formattedDate,  int tradesCount,  double pnl,  double charges,  double cumulativePnl)?  $default,) {final _that = this;
switch (_that) {
case _LedgerDay() when $default != null:
return $default(_that.date,_that.formattedDate,_that.tradesCount,_that.pnl,_that.charges,_that.cumulativePnl);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _LedgerDay implements LedgerDay {
  const _LedgerDay({required this.date, this.formattedDate = '', this.tradesCount = 0, this.pnl = 0, this.charges = 0, this.cumulativePnl = 0});
  factory _LedgerDay.fromJson(Map<String, dynamic> json) => _$LedgerDayFromJson(json);

@override final  String date;
@override@JsonKey() final  String formattedDate;
@override@JsonKey() final  int tradesCount;
@override@JsonKey() final  double pnl;
@override@JsonKey() final  double charges;
@override@JsonKey() final  double cumulativePnl;

/// Create a copy of LedgerDay
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$LedgerDayCopyWith<_LedgerDay> get copyWith => __$LedgerDayCopyWithImpl<_LedgerDay>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$LedgerDayToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _LedgerDay&&(identical(other.date, date) || other.date == date)&&(identical(other.formattedDate, formattedDate) || other.formattedDate == formattedDate)&&(identical(other.tradesCount, tradesCount) || other.tradesCount == tradesCount)&&(identical(other.pnl, pnl) || other.pnl == pnl)&&(identical(other.charges, charges) || other.charges == charges)&&(identical(other.cumulativePnl, cumulativePnl) || other.cumulativePnl == cumulativePnl));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,formattedDate,tradesCount,pnl,charges,cumulativePnl);

@override
String toString() {
  return 'LedgerDay(date: $date, formattedDate: $formattedDate, tradesCount: $tradesCount, pnl: $pnl, charges: $charges, cumulativePnl: $cumulativePnl)';
}


}

/// @nodoc
abstract mixin class _$LedgerDayCopyWith<$Res> implements $LedgerDayCopyWith<$Res> {
  factory _$LedgerDayCopyWith(_LedgerDay value, $Res Function(_LedgerDay) _then) = __$LedgerDayCopyWithImpl;
@override @useResult
$Res call({
 String date, String formattedDate, int tradesCount, double pnl, double charges, double cumulativePnl
});




}
/// @nodoc
class __$LedgerDayCopyWithImpl<$Res>
    implements _$LedgerDayCopyWith<$Res> {
  __$LedgerDayCopyWithImpl(this._self, this._then);

  final _LedgerDay _self;
  final $Res Function(_LedgerDay) _then;

/// Create a copy of LedgerDay
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? date = null,Object? formattedDate = null,Object? tradesCount = null,Object? pnl = null,Object? charges = null,Object? cumulativePnl = null,}) {
  return _then(_LedgerDay(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,formattedDate: null == formattedDate ? _self.formattedDate : formattedDate // ignore: cast_nullable_to_non_nullable
as String,tradesCount: null == tradesCount ? _self.tradesCount : tradesCount // ignore: cast_nullable_to_non_nullable
as int,pnl: null == pnl ? _self.pnl : pnl // ignore: cast_nullable_to_non_nullable
as double,charges: null == charges ? _self.charges : charges // ignore: cast_nullable_to_non_nullable
as double,cumulativePnl: null == cumulativePnl ? _self.cumulativePnl : cumulativePnl // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$ClosedTrade {

 String get id; String get symbol; String get date; int get qty; String get side; double get entryPrice; double get exitPrice; double get realizedPnl; double get grossPnl; double get charges; bool get chargesExact; String? get strategyName;
/// Create a copy of ClosedTrade
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ClosedTradeCopyWith<ClosedTrade> get copyWith => _$ClosedTradeCopyWithImpl<ClosedTrade>(this as ClosedTrade, _$identity);

  /// Serializes this ClosedTrade to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ClosedTrade&&(identical(other.id, id) || other.id == id)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.date, date) || other.date == date)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.side, side) || other.side == side)&&(identical(other.entryPrice, entryPrice) || other.entryPrice == entryPrice)&&(identical(other.exitPrice, exitPrice) || other.exitPrice == exitPrice)&&(identical(other.realizedPnl, realizedPnl) || other.realizedPnl == realizedPnl)&&(identical(other.grossPnl, grossPnl) || other.grossPnl == grossPnl)&&(identical(other.charges, charges) || other.charges == charges)&&(identical(other.chargesExact, chargesExact) || other.chargesExact == chargesExact)&&(identical(other.strategyName, strategyName) || other.strategyName == strategyName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,symbol,date,qty,side,entryPrice,exitPrice,realizedPnl,grossPnl,charges,chargesExact,strategyName);

@override
String toString() {
  return 'ClosedTrade(id: $id, symbol: $symbol, date: $date, qty: $qty, side: $side, entryPrice: $entryPrice, exitPrice: $exitPrice, realizedPnl: $realizedPnl, grossPnl: $grossPnl, charges: $charges, chargesExact: $chargesExact, strategyName: $strategyName)';
}


}

/// @nodoc
abstract mixin class $ClosedTradeCopyWith<$Res>  {
  factory $ClosedTradeCopyWith(ClosedTrade value, $Res Function(ClosedTrade) _then) = _$ClosedTradeCopyWithImpl;
@useResult
$Res call({
 String id, String symbol, String date, int qty, String side, double entryPrice, double exitPrice, double realizedPnl, double grossPnl, double charges, bool chargesExact, String? strategyName
});




}
/// @nodoc
class _$ClosedTradeCopyWithImpl<$Res>
    implements $ClosedTradeCopyWith<$Res> {
  _$ClosedTradeCopyWithImpl(this._self, this._then);

  final ClosedTrade _self;
  final $Res Function(ClosedTrade) _then;

/// Create a copy of ClosedTrade
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? symbol = null,Object? date = null,Object? qty = null,Object? side = null,Object? entryPrice = null,Object? exitPrice = null,Object? realizedPnl = null,Object? grossPnl = null,Object? charges = null,Object? chargesExact = null,Object? strategyName = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,side: null == side ? _self.side : side // ignore: cast_nullable_to_non_nullable
as String,entryPrice: null == entryPrice ? _self.entryPrice : entryPrice // ignore: cast_nullable_to_non_nullable
as double,exitPrice: null == exitPrice ? _self.exitPrice : exitPrice // ignore: cast_nullable_to_non_nullable
as double,realizedPnl: null == realizedPnl ? _self.realizedPnl : realizedPnl // ignore: cast_nullable_to_non_nullable
as double,grossPnl: null == grossPnl ? _self.grossPnl : grossPnl // ignore: cast_nullable_to_non_nullable
as double,charges: null == charges ? _self.charges : charges // ignore: cast_nullable_to_non_nullable
as double,chargesExact: null == chargesExact ? _self.chargesExact : chargesExact // ignore: cast_nullable_to_non_nullable
as bool,strategyName: freezed == strategyName ? _self.strategyName : strategyName // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ClosedTrade].
extension ClosedTradePatterns on ClosedTrade {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ClosedTrade value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ClosedTrade() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ClosedTrade value)  $default,){
final _that = this;
switch (_that) {
case _ClosedTrade():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ClosedTrade value)?  $default,){
final _that = this;
switch (_that) {
case _ClosedTrade() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String symbol,  String date,  int qty,  String side,  double entryPrice,  double exitPrice,  double realizedPnl,  double grossPnl,  double charges,  bool chargesExact,  String? strategyName)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ClosedTrade() when $default != null:
return $default(_that.id,_that.symbol,_that.date,_that.qty,_that.side,_that.entryPrice,_that.exitPrice,_that.realizedPnl,_that.grossPnl,_that.charges,_that.chargesExact,_that.strategyName);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String symbol,  String date,  int qty,  String side,  double entryPrice,  double exitPrice,  double realizedPnl,  double grossPnl,  double charges,  bool chargesExact,  String? strategyName)  $default,) {final _that = this;
switch (_that) {
case _ClosedTrade():
return $default(_that.id,_that.symbol,_that.date,_that.qty,_that.side,_that.entryPrice,_that.exitPrice,_that.realizedPnl,_that.grossPnl,_that.charges,_that.chargesExact,_that.strategyName);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String symbol,  String date,  int qty,  String side,  double entryPrice,  double exitPrice,  double realizedPnl,  double grossPnl,  double charges,  bool chargesExact,  String? strategyName)?  $default,) {final _that = this;
switch (_that) {
case _ClosedTrade() when $default != null:
return $default(_that.id,_that.symbol,_that.date,_that.qty,_that.side,_that.entryPrice,_that.exitPrice,_that.realizedPnl,_that.grossPnl,_that.charges,_that.chargesExact,_that.strategyName);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ClosedTrade implements ClosedTrade {
  const _ClosedTrade({required this.id, required this.symbol, required this.date, this.qty = 0, this.side = '', this.entryPrice = 0, this.exitPrice = 0, this.realizedPnl = 0, this.grossPnl = 0, this.charges = 0, this.chargesExact = false, this.strategyName});
  factory _ClosedTrade.fromJson(Map<String, dynamic> json) => _$ClosedTradeFromJson(json);

@override final  String id;
@override final  String symbol;
@override final  String date;
@override@JsonKey() final  int qty;
@override@JsonKey() final  String side;
@override@JsonKey() final  double entryPrice;
@override@JsonKey() final  double exitPrice;
@override@JsonKey() final  double realizedPnl;
@override@JsonKey() final  double grossPnl;
@override@JsonKey() final  double charges;
@override@JsonKey() final  bool chargesExact;
@override final  String? strategyName;

/// Create a copy of ClosedTrade
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ClosedTradeCopyWith<_ClosedTrade> get copyWith => __$ClosedTradeCopyWithImpl<_ClosedTrade>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ClosedTradeToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ClosedTrade&&(identical(other.id, id) || other.id == id)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.date, date) || other.date == date)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.side, side) || other.side == side)&&(identical(other.entryPrice, entryPrice) || other.entryPrice == entryPrice)&&(identical(other.exitPrice, exitPrice) || other.exitPrice == exitPrice)&&(identical(other.realizedPnl, realizedPnl) || other.realizedPnl == realizedPnl)&&(identical(other.grossPnl, grossPnl) || other.grossPnl == grossPnl)&&(identical(other.charges, charges) || other.charges == charges)&&(identical(other.chargesExact, chargesExact) || other.chargesExact == chargesExact)&&(identical(other.strategyName, strategyName) || other.strategyName == strategyName));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,symbol,date,qty,side,entryPrice,exitPrice,realizedPnl,grossPnl,charges,chargesExact,strategyName);

@override
String toString() {
  return 'ClosedTrade(id: $id, symbol: $symbol, date: $date, qty: $qty, side: $side, entryPrice: $entryPrice, exitPrice: $exitPrice, realizedPnl: $realizedPnl, grossPnl: $grossPnl, charges: $charges, chargesExact: $chargesExact, strategyName: $strategyName)';
}


}

/// @nodoc
abstract mixin class _$ClosedTradeCopyWith<$Res> implements $ClosedTradeCopyWith<$Res> {
  factory _$ClosedTradeCopyWith(_ClosedTrade value, $Res Function(_ClosedTrade) _then) = __$ClosedTradeCopyWithImpl;
@override @useResult
$Res call({
 String id, String symbol, String date, int qty, String side, double entryPrice, double exitPrice, double realizedPnl, double grossPnl, double charges, bool chargesExact, String? strategyName
});




}
/// @nodoc
class __$ClosedTradeCopyWithImpl<$Res>
    implements _$ClosedTradeCopyWith<$Res> {
  __$ClosedTradeCopyWithImpl(this._self, this._then);

  final _ClosedTrade _self;
  final $Res Function(_ClosedTrade) _then;

/// Create a copy of ClosedTrade
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? symbol = null,Object? date = null,Object? qty = null,Object? side = null,Object? entryPrice = null,Object? exitPrice = null,Object? realizedPnl = null,Object? grossPnl = null,Object? charges = null,Object? chargesExact = null,Object? strategyName = freezed,}) {
  return _then(_ClosedTrade(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,side: null == side ? _self.side : side // ignore: cast_nullable_to_non_nullable
as String,entryPrice: null == entryPrice ? _self.entryPrice : entryPrice // ignore: cast_nullable_to_non_nullable
as double,exitPrice: null == exitPrice ? _self.exitPrice : exitPrice // ignore: cast_nullable_to_non_nullable
as double,realizedPnl: null == realizedPnl ? _self.realizedPnl : realizedPnl // ignore: cast_nullable_to_non_nullable
as double,grossPnl: null == grossPnl ? _self.grossPnl : grossPnl // ignore: cast_nullable_to_non_nullable
as double,charges: null == charges ? _self.charges : charges // ignore: cast_nullable_to_non_nullable
as double,chargesExact: null == chargesExact ? _self.chargesExact : chargesExact // ignore: cast_nullable_to_non_nullable
as bool,strategyName: freezed == strategyName ? _self.strategyName : strategyName // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
