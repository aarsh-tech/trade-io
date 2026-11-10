// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'brokers_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$BrokerLogin {

 String get url;
/// Create a copy of BrokerLogin
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BrokerLoginCopyWith<BrokerLogin> get copyWith => _$BrokerLoginCopyWithImpl<BrokerLogin>(this as BrokerLogin, _$identity);

  /// Serializes this BrokerLogin to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BrokerLogin&&(identical(other.url, url) || other.url == url));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,url);

@override
String toString() {
  return 'BrokerLogin(url: $url)';
}


}

/// @nodoc
abstract mixin class $BrokerLoginCopyWith<$Res>  {
  factory $BrokerLoginCopyWith(BrokerLogin value, $Res Function(BrokerLogin) _then) = _$BrokerLoginCopyWithImpl;
@useResult
$Res call({
 String url
});




}
/// @nodoc
class _$BrokerLoginCopyWithImpl<$Res>
    implements $BrokerLoginCopyWith<$Res> {
  _$BrokerLoginCopyWithImpl(this._self, this._then);

  final BrokerLogin _self;
  final $Res Function(BrokerLogin) _then;

/// Create a copy of BrokerLogin
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? url = null,}) {
  return _then(_self.copyWith(
url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [BrokerLogin].
extension BrokerLoginPatterns on BrokerLogin {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BrokerLogin value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BrokerLogin() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BrokerLogin value)  $default,){
final _that = this;
switch (_that) {
case _BrokerLogin():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BrokerLogin value)?  $default,){
final _that = this;
switch (_that) {
case _BrokerLogin() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String url)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BrokerLogin() when $default != null:
return $default(_that.url);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String url)  $default,) {final _that = this;
switch (_that) {
case _BrokerLogin():
return $default(_that.url);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String url)?  $default,) {final _that = this;
switch (_that) {
case _BrokerLogin() when $default != null:
return $default(_that.url);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BrokerLogin implements BrokerLogin {
  const _BrokerLogin({required this.url});
  factory _BrokerLogin.fromJson(Map<String, dynamic> json) => _$BrokerLoginFromJson(json);

@override final  String url;

/// Create a copy of BrokerLogin
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BrokerLoginCopyWith<_BrokerLogin> get copyWith => __$BrokerLoginCopyWithImpl<_BrokerLogin>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BrokerLoginToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BrokerLogin&&(identical(other.url, url) || other.url == url));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,url);

@override
String toString() {
  return 'BrokerLogin(url: $url)';
}


}

/// @nodoc
abstract mixin class _$BrokerLoginCopyWith<$Res> implements $BrokerLoginCopyWith<$Res> {
  factory _$BrokerLoginCopyWith(_BrokerLogin value, $Res Function(_BrokerLogin) _then) = __$BrokerLoginCopyWithImpl;
@override @useResult
$Res call({
 String url
});




}
/// @nodoc
class __$BrokerLoginCopyWithImpl<$Res>
    implements _$BrokerLoginCopyWith<$Res> {
  __$BrokerLoginCopyWithImpl(this._self, this._then);

  final _BrokerLogin _self;
  final $Res Function(_BrokerLogin) _then;

/// Create a copy of BrokerLogin
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? url = null,}) {
  return _then(_BrokerLogin(
url: null == url ? _self.url : url // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$BrokerAccount {

 String get id;@JsonKey(fromJson: brokerTypeFromJson) BrokerType? get broker; String? get clientId; bool get isActive; DateTime? get tokenExpiry;/// `HEALTHY` or `EXPIRED` (server-side enum; kept as text so a new value can't break parsing).
 String? get tokenHealth; DateTime? get createdAt;
/// Create a copy of BrokerAccount
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BrokerAccountCopyWith<BrokerAccount> get copyWith => _$BrokerAccountCopyWithImpl<BrokerAccount>(this as BrokerAccount, _$identity);

  /// Serializes this BrokerAccount to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BrokerAccount&&(identical(other.id, id) || other.id == id)&&(identical(other.broker, broker) || other.broker == broker)&&(identical(other.clientId, clientId) || other.clientId == clientId)&&(identical(other.isActive, isActive) || other.isActive == isActive)&&(identical(other.tokenExpiry, tokenExpiry) || other.tokenExpiry == tokenExpiry)&&(identical(other.tokenHealth, tokenHealth) || other.tokenHealth == tokenHealth)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,broker,clientId,isActive,tokenExpiry,tokenHealth,createdAt);

@override
String toString() {
  return 'BrokerAccount(id: $id, broker: $broker, clientId: $clientId, isActive: $isActive, tokenExpiry: $tokenExpiry, tokenHealth: $tokenHealth, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class $BrokerAccountCopyWith<$Res>  {
  factory $BrokerAccountCopyWith(BrokerAccount value, $Res Function(BrokerAccount) _then) = _$BrokerAccountCopyWithImpl;
@useResult
$Res call({
 String id,@JsonKey(fromJson: brokerTypeFromJson) BrokerType? broker, String? clientId, bool isActive, DateTime? tokenExpiry, String? tokenHealth, DateTime? createdAt
});




}
/// @nodoc
class _$BrokerAccountCopyWithImpl<$Res>
    implements $BrokerAccountCopyWith<$Res> {
  _$BrokerAccountCopyWithImpl(this._self, this._then);

  final BrokerAccount _self;
  final $Res Function(BrokerAccount) _then;

/// Create a copy of BrokerAccount
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? broker = freezed,Object? clientId = freezed,Object? isActive = null,Object? tokenExpiry = freezed,Object? tokenHealth = freezed,Object? createdAt = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,broker: freezed == broker ? _self.broker : broker // ignore: cast_nullable_to_non_nullable
as BrokerType?,clientId: freezed == clientId ? _self.clientId : clientId // ignore: cast_nullable_to_non_nullable
as String?,isActive: null == isActive ? _self.isActive : isActive // ignore: cast_nullable_to_non_nullable
as bool,tokenExpiry: freezed == tokenExpiry ? _self.tokenExpiry : tokenExpiry // ignore: cast_nullable_to_non_nullable
as DateTime?,tokenHealth: freezed == tokenHealth ? _self.tokenHealth : tokenHealth // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

}


/// Adds pattern-matching-related methods to [BrokerAccount].
extension BrokerAccountPatterns on BrokerAccount {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BrokerAccount value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BrokerAccount() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BrokerAccount value)  $default,){
final _that = this;
switch (_that) {
case _BrokerAccount():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BrokerAccount value)?  $default,){
final _that = this;
switch (_that) {
case _BrokerAccount() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id, @JsonKey(fromJson: brokerTypeFromJson)  BrokerType? broker,  String? clientId,  bool isActive,  DateTime? tokenExpiry,  String? tokenHealth,  DateTime? createdAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BrokerAccount() when $default != null:
return $default(_that.id,_that.broker,_that.clientId,_that.isActive,_that.tokenExpiry,_that.tokenHealth,_that.createdAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id, @JsonKey(fromJson: brokerTypeFromJson)  BrokerType? broker,  String? clientId,  bool isActive,  DateTime? tokenExpiry,  String? tokenHealth,  DateTime? createdAt)  $default,) {final _that = this;
switch (_that) {
case _BrokerAccount():
return $default(_that.id,_that.broker,_that.clientId,_that.isActive,_that.tokenExpiry,_that.tokenHealth,_that.createdAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id, @JsonKey(fromJson: brokerTypeFromJson)  BrokerType? broker,  String? clientId,  bool isActive,  DateTime? tokenExpiry,  String? tokenHealth,  DateTime? createdAt)?  $default,) {final _that = this;
switch (_that) {
case _BrokerAccount() when $default != null:
return $default(_that.id,_that.broker,_that.clientId,_that.isActive,_that.tokenExpiry,_that.tokenHealth,_that.createdAt);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BrokerAccount extends BrokerAccount {
  const _BrokerAccount({required this.id, @JsonKey(fromJson: brokerTypeFromJson) this.broker, this.clientId, this.isActive = false, this.tokenExpiry, this.tokenHealth, this.createdAt}): super._();
  factory _BrokerAccount.fromJson(Map<String, dynamic> json) => _$BrokerAccountFromJson(json);

@override final  String id;
@override@JsonKey(fromJson: brokerTypeFromJson) final  BrokerType? broker;
@override final  String? clientId;
@override@JsonKey() final  bool isActive;
@override final  DateTime? tokenExpiry;
/// `HEALTHY` or `EXPIRED` (server-side enum; kept as text so a new value can't break parsing).
@override final  String? tokenHealth;
@override final  DateTime? createdAt;

/// Create a copy of BrokerAccount
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BrokerAccountCopyWith<_BrokerAccount> get copyWith => __$BrokerAccountCopyWithImpl<_BrokerAccount>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BrokerAccountToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BrokerAccount&&(identical(other.id, id) || other.id == id)&&(identical(other.broker, broker) || other.broker == broker)&&(identical(other.clientId, clientId) || other.clientId == clientId)&&(identical(other.isActive, isActive) || other.isActive == isActive)&&(identical(other.tokenExpiry, tokenExpiry) || other.tokenExpiry == tokenExpiry)&&(identical(other.tokenHealth, tokenHealth) || other.tokenHealth == tokenHealth)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,broker,clientId,isActive,tokenExpiry,tokenHealth,createdAt);

@override
String toString() {
  return 'BrokerAccount(id: $id, broker: $broker, clientId: $clientId, isActive: $isActive, tokenExpiry: $tokenExpiry, tokenHealth: $tokenHealth, createdAt: $createdAt)';
}


}

/// @nodoc
abstract mixin class _$BrokerAccountCopyWith<$Res> implements $BrokerAccountCopyWith<$Res> {
  factory _$BrokerAccountCopyWith(_BrokerAccount value, $Res Function(_BrokerAccount) _then) = __$BrokerAccountCopyWithImpl;
@override @useResult
$Res call({
 String id,@JsonKey(fromJson: brokerTypeFromJson) BrokerType? broker, String? clientId, bool isActive, DateTime? tokenExpiry, String? tokenHealth, DateTime? createdAt
});




}
/// @nodoc
class __$BrokerAccountCopyWithImpl<$Res>
    implements _$BrokerAccountCopyWith<$Res> {
  __$BrokerAccountCopyWithImpl(this._self, this._then);

  final _BrokerAccount _self;
  final $Res Function(_BrokerAccount) _then;

/// Create a copy of BrokerAccount
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? broker = freezed,Object? clientId = freezed,Object? isActive = null,Object? tokenExpiry = freezed,Object? tokenHealth = freezed,Object? createdAt = freezed,}) {
  return _then(_BrokerAccount(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,broker: freezed == broker ? _self.broker : broker // ignore: cast_nullable_to_non_nullable
as BrokerType?,clientId: freezed == clientId ? _self.clientId : clientId // ignore: cast_nullable_to_non_nullable
as String?,isActive: null == isActive ? _self.isActive : isActive // ignore: cast_nullable_to_non_nullable
as bool,tokenExpiry: freezed == tokenExpiry ? _self.tokenExpiry : tokenExpiry // ignore: cast_nullable_to_non_nullable
as DateTime?,tokenHealth: freezed == tokenHealth ? _self.tokenHealth : tokenHealth // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}


}

// dart format on
