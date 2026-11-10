// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'orders_models.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Order {

 String get id; String get symbol; String get exchange;@JsonKey(fromJson: orderSideFromJson) OrderSide? get side;@JsonKey(fromJson: orderTypeFromJson) OrderType? get orderType;@JsonKey(fromJson: productTypeFromJson) ProductType? get productType; int get qty; int get filledQty; double? get price; double? get avgPrice; double? get triggerPrice; String? get brokerOrderId;@JsonKey(fromJson: orderStatusFromJson) OrderStatus? get status; bool get isPaperTrade; DateTime get createdAt; String? get brokerAccountId; OrderExecution? get execution;
/// Create a copy of Order
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrderCopyWith<Order> get copyWith => _$OrderCopyWithImpl<Order>(this as Order, _$identity);

  /// Serializes this Order to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Order&&(identical(other.id, id) || other.id == id)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.side, side) || other.side == side)&&(identical(other.orderType, orderType) || other.orderType == orderType)&&(identical(other.productType, productType) || other.productType == productType)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.filledQty, filledQty) || other.filledQty == filledQty)&&(identical(other.price, price) || other.price == price)&&(identical(other.avgPrice, avgPrice) || other.avgPrice == avgPrice)&&(identical(other.triggerPrice, triggerPrice) || other.triggerPrice == triggerPrice)&&(identical(other.brokerOrderId, brokerOrderId) || other.brokerOrderId == brokerOrderId)&&(identical(other.status, status) || other.status == status)&&(identical(other.isPaperTrade, isPaperTrade) || other.isPaperTrade == isPaperTrade)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.brokerAccountId, brokerAccountId) || other.brokerAccountId == brokerAccountId)&&(identical(other.execution, execution) || other.execution == execution));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,symbol,exchange,side,orderType,productType,qty,filledQty,price,avgPrice,triggerPrice,brokerOrderId,status,isPaperTrade,createdAt,brokerAccountId,execution);

@override
String toString() {
  return 'Order(id: $id, symbol: $symbol, exchange: $exchange, side: $side, orderType: $orderType, productType: $productType, qty: $qty, filledQty: $filledQty, price: $price, avgPrice: $avgPrice, triggerPrice: $triggerPrice, brokerOrderId: $brokerOrderId, status: $status, isPaperTrade: $isPaperTrade, createdAt: $createdAt, brokerAccountId: $brokerAccountId, execution: $execution)';
}


}

/// @nodoc
abstract mixin class $OrderCopyWith<$Res>  {
  factory $OrderCopyWith(Order value, $Res Function(Order) _then) = _$OrderCopyWithImpl;
@useResult
$Res call({
 String id, String symbol, String exchange,@JsonKey(fromJson: orderSideFromJson) OrderSide? side,@JsonKey(fromJson: orderTypeFromJson) OrderType? orderType,@JsonKey(fromJson: productTypeFromJson) ProductType? productType, int qty, int filledQty, double? price, double? avgPrice, double? triggerPrice, String? brokerOrderId,@JsonKey(fromJson: orderStatusFromJson) OrderStatus? status, bool isPaperTrade, DateTime createdAt, String? brokerAccountId, OrderExecution? execution
});


$OrderExecutionCopyWith<$Res>? get execution;

}
/// @nodoc
class _$OrderCopyWithImpl<$Res>
    implements $OrderCopyWith<$Res> {
  _$OrderCopyWithImpl(this._self, this._then);

  final Order _self;
  final $Res Function(Order) _then;

/// Create a copy of Order
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? symbol = null,Object? exchange = null,Object? side = freezed,Object? orderType = freezed,Object? productType = freezed,Object? qty = null,Object? filledQty = null,Object? price = freezed,Object? avgPrice = freezed,Object? triggerPrice = freezed,Object? brokerOrderId = freezed,Object? status = freezed,Object? isPaperTrade = null,Object? createdAt = null,Object? brokerAccountId = freezed,Object? execution = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,side: freezed == side ? _self.side : side // ignore: cast_nullable_to_non_nullable
as OrderSide?,orderType: freezed == orderType ? _self.orderType : orderType // ignore: cast_nullable_to_non_nullable
as OrderType?,productType: freezed == productType ? _self.productType : productType // ignore: cast_nullable_to_non_nullable
as ProductType?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,filledQty: null == filledQty ? _self.filledQty : filledQty // ignore: cast_nullable_to_non_nullable
as int,price: freezed == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double?,avgPrice: freezed == avgPrice ? _self.avgPrice : avgPrice // ignore: cast_nullable_to_non_nullable
as double?,triggerPrice: freezed == triggerPrice ? _self.triggerPrice : triggerPrice // ignore: cast_nullable_to_non_nullable
as double?,brokerOrderId: freezed == brokerOrderId ? _self.brokerOrderId : brokerOrderId // ignore: cast_nullable_to_non_nullable
as String?,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as OrderStatus?,isPaperTrade: null == isPaperTrade ? _self.isPaperTrade : isPaperTrade // ignore: cast_nullable_to_non_nullable
as bool,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,brokerAccountId: freezed == brokerAccountId ? _self.brokerAccountId : brokerAccountId // ignore: cast_nullable_to_non_nullable
as String?,execution: freezed == execution ? _self.execution : execution // ignore: cast_nullable_to_non_nullable
as OrderExecution?,
  ));
}
/// Create a copy of Order
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OrderExecutionCopyWith<$Res>? get execution {
    if (_self.execution == null) {
    return null;
  }

  return $OrderExecutionCopyWith<$Res>(_self.execution!, (value) {
    return _then(_self.copyWith(execution: value));
  });
}
}


/// Adds pattern-matching-related methods to [Order].
extension OrderPatterns on Order {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Order value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Order() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Order value)  $default,){
final _that = this;
switch (_that) {
case _Order():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Order value)?  $default,){
final _that = this;
switch (_that) {
case _Order() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String symbol,  String exchange, @JsonKey(fromJson: orderSideFromJson)  OrderSide? side, @JsonKey(fromJson: orderTypeFromJson)  OrderType? orderType, @JsonKey(fromJson: productTypeFromJson)  ProductType? productType,  int qty,  int filledQty,  double? price,  double? avgPrice,  double? triggerPrice,  String? brokerOrderId, @JsonKey(fromJson: orderStatusFromJson)  OrderStatus? status,  bool isPaperTrade,  DateTime createdAt,  String? brokerAccountId,  OrderExecution? execution)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Order() when $default != null:
return $default(_that.id,_that.symbol,_that.exchange,_that.side,_that.orderType,_that.productType,_that.qty,_that.filledQty,_that.price,_that.avgPrice,_that.triggerPrice,_that.brokerOrderId,_that.status,_that.isPaperTrade,_that.createdAt,_that.brokerAccountId,_that.execution);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String symbol,  String exchange, @JsonKey(fromJson: orderSideFromJson)  OrderSide? side, @JsonKey(fromJson: orderTypeFromJson)  OrderType? orderType, @JsonKey(fromJson: productTypeFromJson)  ProductType? productType,  int qty,  int filledQty,  double? price,  double? avgPrice,  double? triggerPrice,  String? brokerOrderId, @JsonKey(fromJson: orderStatusFromJson)  OrderStatus? status,  bool isPaperTrade,  DateTime createdAt,  String? brokerAccountId,  OrderExecution? execution)  $default,) {final _that = this;
switch (_that) {
case _Order():
return $default(_that.id,_that.symbol,_that.exchange,_that.side,_that.orderType,_that.productType,_that.qty,_that.filledQty,_that.price,_that.avgPrice,_that.triggerPrice,_that.brokerOrderId,_that.status,_that.isPaperTrade,_that.createdAt,_that.brokerAccountId,_that.execution);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String symbol,  String exchange, @JsonKey(fromJson: orderSideFromJson)  OrderSide? side, @JsonKey(fromJson: orderTypeFromJson)  OrderType? orderType, @JsonKey(fromJson: productTypeFromJson)  ProductType? productType,  int qty,  int filledQty,  double? price,  double? avgPrice,  double? triggerPrice,  String? brokerOrderId, @JsonKey(fromJson: orderStatusFromJson)  OrderStatus? status,  bool isPaperTrade,  DateTime createdAt,  String? brokerAccountId,  OrderExecution? execution)?  $default,) {final _that = this;
switch (_that) {
case _Order() when $default != null:
return $default(_that.id,_that.symbol,_that.exchange,_that.side,_that.orderType,_that.productType,_that.qty,_that.filledQty,_that.price,_that.avgPrice,_that.triggerPrice,_that.brokerOrderId,_that.status,_that.isPaperTrade,_that.createdAt,_that.brokerAccountId,_that.execution);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Order extends Order {
  const _Order({required this.id, required this.symbol, this.exchange = 'NSE', @JsonKey(fromJson: orderSideFromJson) this.side, @JsonKey(fromJson: orderTypeFromJson) this.orderType, @JsonKey(fromJson: productTypeFromJson) this.productType, this.qty = 0, this.filledQty = 0, this.price, this.avgPrice, this.triggerPrice, this.brokerOrderId, @JsonKey(fromJson: orderStatusFromJson) this.status, this.isPaperTrade = false, required this.createdAt, this.brokerAccountId, this.execution}): super._();
  factory _Order.fromJson(Map<String, dynamic> json) => _$OrderFromJson(json);

@override final  String id;
@override final  String symbol;
@override@JsonKey() final  String exchange;
@override@JsonKey(fromJson: orderSideFromJson) final  OrderSide? side;
@override@JsonKey(fromJson: orderTypeFromJson) final  OrderType? orderType;
@override@JsonKey(fromJson: productTypeFromJson) final  ProductType? productType;
@override@JsonKey() final  int qty;
@override@JsonKey() final  int filledQty;
@override final  double? price;
@override final  double? avgPrice;
@override final  double? triggerPrice;
@override final  String? brokerOrderId;
@override@JsonKey(fromJson: orderStatusFromJson) final  OrderStatus? status;
@override@JsonKey() final  bool isPaperTrade;
@override final  DateTime createdAt;
@override final  String? brokerAccountId;
@override final  OrderExecution? execution;

/// Create a copy of Order
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrderCopyWith<_Order> get copyWith => __$OrderCopyWithImpl<_Order>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrderToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Order&&(identical(other.id, id) || other.id == id)&&(identical(other.symbol, symbol) || other.symbol == symbol)&&(identical(other.exchange, exchange) || other.exchange == exchange)&&(identical(other.side, side) || other.side == side)&&(identical(other.orderType, orderType) || other.orderType == orderType)&&(identical(other.productType, productType) || other.productType == productType)&&(identical(other.qty, qty) || other.qty == qty)&&(identical(other.filledQty, filledQty) || other.filledQty == filledQty)&&(identical(other.price, price) || other.price == price)&&(identical(other.avgPrice, avgPrice) || other.avgPrice == avgPrice)&&(identical(other.triggerPrice, triggerPrice) || other.triggerPrice == triggerPrice)&&(identical(other.brokerOrderId, brokerOrderId) || other.brokerOrderId == brokerOrderId)&&(identical(other.status, status) || other.status == status)&&(identical(other.isPaperTrade, isPaperTrade) || other.isPaperTrade == isPaperTrade)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.brokerAccountId, brokerAccountId) || other.brokerAccountId == brokerAccountId)&&(identical(other.execution, execution) || other.execution == execution));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,symbol,exchange,side,orderType,productType,qty,filledQty,price,avgPrice,triggerPrice,brokerOrderId,status,isPaperTrade,createdAt,brokerAccountId,execution);

@override
String toString() {
  return 'Order(id: $id, symbol: $symbol, exchange: $exchange, side: $side, orderType: $orderType, productType: $productType, qty: $qty, filledQty: $filledQty, price: $price, avgPrice: $avgPrice, triggerPrice: $triggerPrice, brokerOrderId: $brokerOrderId, status: $status, isPaperTrade: $isPaperTrade, createdAt: $createdAt, brokerAccountId: $brokerAccountId, execution: $execution)';
}


}

/// @nodoc
abstract mixin class _$OrderCopyWith<$Res> implements $OrderCopyWith<$Res> {
  factory _$OrderCopyWith(_Order value, $Res Function(_Order) _then) = __$OrderCopyWithImpl;
@override @useResult
$Res call({
 String id, String symbol, String exchange,@JsonKey(fromJson: orderSideFromJson) OrderSide? side,@JsonKey(fromJson: orderTypeFromJson) OrderType? orderType,@JsonKey(fromJson: productTypeFromJson) ProductType? productType, int qty, int filledQty, double? price, double? avgPrice, double? triggerPrice, String? brokerOrderId,@JsonKey(fromJson: orderStatusFromJson) OrderStatus? status, bool isPaperTrade, DateTime createdAt, String? brokerAccountId, OrderExecution? execution
});


@override $OrderExecutionCopyWith<$Res>? get execution;

}
/// @nodoc
class __$OrderCopyWithImpl<$Res>
    implements _$OrderCopyWith<$Res> {
  __$OrderCopyWithImpl(this._self, this._then);

  final _Order _self;
  final $Res Function(_Order) _then;

/// Create a copy of Order
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? symbol = null,Object? exchange = null,Object? side = freezed,Object? orderType = freezed,Object? productType = freezed,Object? qty = null,Object? filledQty = null,Object? price = freezed,Object? avgPrice = freezed,Object? triggerPrice = freezed,Object? brokerOrderId = freezed,Object? status = freezed,Object? isPaperTrade = null,Object? createdAt = null,Object? brokerAccountId = freezed,Object? execution = freezed,}) {
  return _then(_Order(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,symbol: null == symbol ? _self.symbol : symbol // ignore: cast_nullable_to_non_nullable
as String,exchange: null == exchange ? _self.exchange : exchange // ignore: cast_nullable_to_non_nullable
as String,side: freezed == side ? _self.side : side // ignore: cast_nullable_to_non_nullable
as OrderSide?,orderType: freezed == orderType ? _self.orderType : orderType // ignore: cast_nullable_to_non_nullable
as OrderType?,productType: freezed == productType ? _self.productType : productType // ignore: cast_nullable_to_non_nullable
as ProductType?,qty: null == qty ? _self.qty : qty // ignore: cast_nullable_to_non_nullable
as int,filledQty: null == filledQty ? _self.filledQty : filledQty // ignore: cast_nullable_to_non_nullable
as int,price: freezed == price ? _self.price : price // ignore: cast_nullable_to_non_nullable
as double?,avgPrice: freezed == avgPrice ? _self.avgPrice : avgPrice // ignore: cast_nullable_to_non_nullable
as double?,triggerPrice: freezed == triggerPrice ? _self.triggerPrice : triggerPrice // ignore: cast_nullable_to_non_nullable
as double?,brokerOrderId: freezed == brokerOrderId ? _self.brokerOrderId : brokerOrderId // ignore: cast_nullable_to_non_nullable
as String?,status: freezed == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as OrderStatus?,isPaperTrade: null == isPaperTrade ? _self.isPaperTrade : isPaperTrade // ignore: cast_nullable_to_non_nullable
as bool,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,brokerAccountId: freezed == brokerAccountId ? _self.brokerAccountId : brokerAccountId // ignore: cast_nullable_to_non_nullable
as String?,execution: freezed == execution ? _self.execution : execution // ignore: cast_nullable_to_non_nullable
as OrderExecution?,
  ));
}

/// Create a copy of Order
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OrderExecutionCopyWith<$Res>? get execution {
    if (_self.execution == null) {
    return null;
  }

  return $OrderExecutionCopyWith<$Res>(_self.execution!, (value) {
    return _then(_self.copyWith(execution: value));
  });
}
}


/// @nodoc
mixin _$OrderExecution {

 String? get id; OrderStrategyRef? get strategy;
/// Create a copy of OrderExecution
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrderExecutionCopyWith<OrderExecution> get copyWith => _$OrderExecutionCopyWithImpl<OrderExecution>(this as OrderExecution, _$identity);

  /// Serializes this OrderExecution to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OrderExecution&&(identical(other.id, id) || other.id == id)&&(identical(other.strategy, strategy) || other.strategy == strategy));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,strategy);

@override
String toString() {
  return 'OrderExecution(id: $id, strategy: $strategy)';
}


}

/// @nodoc
abstract mixin class $OrderExecutionCopyWith<$Res>  {
  factory $OrderExecutionCopyWith(OrderExecution value, $Res Function(OrderExecution) _then) = _$OrderExecutionCopyWithImpl;
@useResult
$Res call({
 String? id, OrderStrategyRef? strategy
});


$OrderStrategyRefCopyWith<$Res>? get strategy;

}
/// @nodoc
class _$OrderExecutionCopyWithImpl<$Res>
    implements $OrderExecutionCopyWith<$Res> {
  _$OrderExecutionCopyWithImpl(this._self, this._then);

  final OrderExecution _self;
  final $Res Function(OrderExecution) _then;

/// Create a copy of OrderExecution
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = freezed,Object? strategy = freezed,}) {
  return _then(_self.copyWith(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,strategy: freezed == strategy ? _self.strategy : strategy // ignore: cast_nullable_to_non_nullable
as OrderStrategyRef?,
  ));
}
/// Create a copy of OrderExecution
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OrderStrategyRefCopyWith<$Res>? get strategy {
    if (_self.strategy == null) {
    return null;
  }

  return $OrderStrategyRefCopyWith<$Res>(_self.strategy!, (value) {
    return _then(_self.copyWith(strategy: value));
  });
}
}


/// Adds pattern-matching-related methods to [OrderExecution].
extension OrderExecutionPatterns on OrderExecution {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OrderExecution value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OrderExecution() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OrderExecution value)  $default,){
final _that = this;
switch (_that) {
case _OrderExecution():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OrderExecution value)?  $default,){
final _that = this;
switch (_that) {
case _OrderExecution() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? id,  OrderStrategyRef? strategy)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OrderExecution() when $default != null:
return $default(_that.id,_that.strategy);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? id,  OrderStrategyRef? strategy)  $default,) {final _that = this;
switch (_that) {
case _OrderExecution():
return $default(_that.id,_that.strategy);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? id,  OrderStrategyRef? strategy)?  $default,) {final _that = this;
switch (_that) {
case _OrderExecution() when $default != null:
return $default(_that.id,_that.strategy);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OrderExecution implements OrderExecution {
  const _OrderExecution({this.id, this.strategy});
  factory _OrderExecution.fromJson(Map<String, dynamic> json) => _$OrderExecutionFromJson(json);

@override final  String? id;
@override final  OrderStrategyRef? strategy;

/// Create a copy of OrderExecution
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrderExecutionCopyWith<_OrderExecution> get copyWith => __$OrderExecutionCopyWithImpl<_OrderExecution>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrderExecutionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OrderExecution&&(identical(other.id, id) || other.id == id)&&(identical(other.strategy, strategy) || other.strategy == strategy));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,strategy);

@override
String toString() {
  return 'OrderExecution(id: $id, strategy: $strategy)';
}


}

/// @nodoc
abstract mixin class _$OrderExecutionCopyWith<$Res> implements $OrderExecutionCopyWith<$Res> {
  factory _$OrderExecutionCopyWith(_OrderExecution value, $Res Function(_OrderExecution) _then) = __$OrderExecutionCopyWithImpl;
@override @useResult
$Res call({
 String? id, OrderStrategyRef? strategy
});


@override $OrderStrategyRefCopyWith<$Res>? get strategy;

}
/// @nodoc
class __$OrderExecutionCopyWithImpl<$Res>
    implements _$OrderExecutionCopyWith<$Res> {
  __$OrderExecutionCopyWithImpl(this._self, this._then);

  final _OrderExecution _self;
  final $Res Function(_OrderExecution) _then;

/// Create a copy of OrderExecution
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = freezed,Object? strategy = freezed,}) {
  return _then(_OrderExecution(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,strategy: freezed == strategy ? _self.strategy : strategy // ignore: cast_nullable_to_non_nullable
as OrderStrategyRef?,
  ));
}

/// Create a copy of OrderExecution
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$OrderStrategyRefCopyWith<$Res>? get strategy {
    if (_self.strategy == null) {
    return null;
  }

  return $OrderStrategyRefCopyWith<$Res>(_self.strategy!, (value) {
    return _then(_self.copyWith(strategy: value));
  });
}
}


/// @nodoc
mixin _$OrderStrategyRef {

 String get name;
/// Create a copy of OrderStrategyRef
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OrderStrategyRefCopyWith<OrderStrategyRef> get copyWith => _$OrderStrategyRefCopyWithImpl<OrderStrategyRef>(this as OrderStrategyRef, _$identity);

  /// Serializes this OrderStrategyRef to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OrderStrategyRef&&(identical(other.name, name) || other.name == name));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name);

@override
String toString() {
  return 'OrderStrategyRef(name: $name)';
}


}

/// @nodoc
abstract mixin class $OrderStrategyRefCopyWith<$Res>  {
  factory $OrderStrategyRefCopyWith(OrderStrategyRef value, $Res Function(OrderStrategyRef) _then) = _$OrderStrategyRefCopyWithImpl;
@useResult
$Res call({
 String name
});




}
/// @nodoc
class _$OrderStrategyRefCopyWithImpl<$Res>
    implements $OrderStrategyRefCopyWith<$Res> {
  _$OrderStrategyRefCopyWithImpl(this._self, this._then);

  final OrderStrategyRef _self;
  final $Res Function(OrderStrategyRef) _then;

/// Create a copy of OrderStrategyRef
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? name = null,}) {
  return _then(_self.copyWith(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [OrderStrategyRef].
extension OrderStrategyRefPatterns on OrderStrategyRef {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OrderStrategyRef value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OrderStrategyRef() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OrderStrategyRef value)  $default,){
final _that = this;
switch (_that) {
case _OrderStrategyRef():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OrderStrategyRef value)?  $default,){
final _that = this;
switch (_that) {
case _OrderStrategyRef() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String name)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OrderStrategyRef() when $default != null:
return $default(_that.name);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String name)  $default,) {final _that = this;
switch (_that) {
case _OrderStrategyRef():
return $default(_that.name);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String name)?  $default,) {final _that = this;
switch (_that) {
case _OrderStrategyRef() when $default != null:
return $default(_that.name);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OrderStrategyRef implements OrderStrategyRef {
  const _OrderStrategyRef({required this.name});
  factory _OrderStrategyRef.fromJson(Map<String, dynamic> json) => _$OrderStrategyRefFromJson(json);

@override final  String name;

/// Create a copy of OrderStrategyRef
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OrderStrategyRefCopyWith<_OrderStrategyRef> get copyWith => __$OrderStrategyRefCopyWithImpl<_OrderStrategyRef>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OrderStrategyRefToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OrderStrategyRef&&(identical(other.name, name) || other.name == name));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,name);

@override
String toString() {
  return 'OrderStrategyRef(name: $name)';
}


}

/// @nodoc
abstract mixin class _$OrderStrategyRefCopyWith<$Res> implements $OrderStrategyRefCopyWith<$Res> {
  factory _$OrderStrategyRefCopyWith(_OrderStrategyRef value, $Res Function(_OrderStrategyRef) _then) = __$OrderStrategyRefCopyWithImpl;
@override @useResult
$Res call({
 String name
});




}
/// @nodoc
class __$OrderStrategyRefCopyWithImpl<$Res>
    implements _$OrderStrategyRefCopyWith<$Res> {
  __$OrderStrategyRefCopyWithImpl(this._self, this._then);

  final _OrderStrategyRef _self;
  final $Res Function(_OrderStrategyRef) _then;

/// Create a copy of OrderStrategyRef
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? name = null,}) {
  return _then(_OrderStrategyRef(
name: null == name ? _self.name : name // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$DayPnl {

 String get date; double get realizedPnl; double get grossPnl; double get charges; double get algoPnl; double get manualPnl; int get trades;
/// Create a copy of DayPnl
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DayPnlCopyWith<DayPnl> get copyWith => _$DayPnlCopyWithImpl<DayPnl>(this as DayPnl, _$identity);

  /// Serializes this DayPnl to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DayPnl&&(identical(other.date, date) || other.date == date)&&(identical(other.realizedPnl, realizedPnl) || other.realizedPnl == realizedPnl)&&(identical(other.grossPnl, grossPnl) || other.grossPnl == grossPnl)&&(identical(other.charges, charges) || other.charges == charges)&&(identical(other.algoPnl, algoPnl) || other.algoPnl == algoPnl)&&(identical(other.manualPnl, manualPnl) || other.manualPnl == manualPnl)&&(identical(other.trades, trades) || other.trades == trades));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,realizedPnl,grossPnl,charges,algoPnl,manualPnl,trades);

@override
String toString() {
  return 'DayPnl(date: $date, realizedPnl: $realizedPnl, grossPnl: $grossPnl, charges: $charges, algoPnl: $algoPnl, manualPnl: $manualPnl, trades: $trades)';
}


}

/// @nodoc
abstract mixin class $DayPnlCopyWith<$Res>  {
  factory $DayPnlCopyWith(DayPnl value, $Res Function(DayPnl) _then) = _$DayPnlCopyWithImpl;
@useResult
$Res call({
 String date, double realizedPnl, double grossPnl, double charges, double algoPnl, double manualPnl, int trades
});




}
/// @nodoc
class _$DayPnlCopyWithImpl<$Res>
    implements $DayPnlCopyWith<$Res> {
  _$DayPnlCopyWithImpl(this._self, this._then);

  final DayPnl _self;
  final $Res Function(DayPnl) _then;

/// Create a copy of DayPnl
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? date = null,Object? realizedPnl = null,Object? grossPnl = null,Object? charges = null,Object? algoPnl = null,Object? manualPnl = null,Object? trades = null,}) {
  return _then(_self.copyWith(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,realizedPnl: null == realizedPnl ? _self.realizedPnl : realizedPnl // ignore: cast_nullable_to_non_nullable
as double,grossPnl: null == grossPnl ? _self.grossPnl : grossPnl // ignore: cast_nullable_to_non_nullable
as double,charges: null == charges ? _self.charges : charges // ignore: cast_nullable_to_non_nullable
as double,algoPnl: null == algoPnl ? _self.algoPnl : algoPnl // ignore: cast_nullable_to_non_nullable
as double,manualPnl: null == manualPnl ? _self.manualPnl : manualPnl // ignore: cast_nullable_to_non_nullable
as double,trades: null == trades ? _self.trades : trades // ignore: cast_nullable_to_non_nullable
as int,
  ));
}

}


/// Adds pattern-matching-related methods to [DayPnl].
extension DayPnlPatterns on DayPnl {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DayPnl value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DayPnl() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DayPnl value)  $default,){
final _that = this;
switch (_that) {
case _DayPnl():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DayPnl value)?  $default,){
final _that = this;
switch (_that) {
case _DayPnl() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String date,  double realizedPnl,  double grossPnl,  double charges,  double algoPnl,  double manualPnl,  int trades)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DayPnl() when $default != null:
return $default(_that.date,_that.realizedPnl,_that.grossPnl,_that.charges,_that.algoPnl,_that.manualPnl,_that.trades);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String date,  double realizedPnl,  double grossPnl,  double charges,  double algoPnl,  double manualPnl,  int trades)  $default,) {final _that = this;
switch (_that) {
case _DayPnl():
return $default(_that.date,_that.realizedPnl,_that.grossPnl,_that.charges,_that.algoPnl,_that.manualPnl,_that.trades);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String date,  double realizedPnl,  double grossPnl,  double charges,  double algoPnl,  double manualPnl,  int trades)?  $default,) {final _that = this;
switch (_that) {
case _DayPnl() when $default != null:
return $default(_that.date,_that.realizedPnl,_that.grossPnl,_that.charges,_that.algoPnl,_that.manualPnl,_that.trades);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DayPnl implements DayPnl {
  const _DayPnl({required this.date, this.realizedPnl = 0, this.grossPnl = 0, this.charges = 0, this.algoPnl = 0, this.manualPnl = 0, this.trades = 0});
  factory _DayPnl.fromJson(Map<String, dynamic> json) => _$DayPnlFromJson(json);

@override final  String date;
@override@JsonKey() final  double realizedPnl;
@override@JsonKey() final  double grossPnl;
@override@JsonKey() final  double charges;
@override@JsonKey() final  double algoPnl;
@override@JsonKey() final  double manualPnl;
@override@JsonKey() final  int trades;

/// Create a copy of DayPnl
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DayPnlCopyWith<_DayPnl> get copyWith => __$DayPnlCopyWithImpl<_DayPnl>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DayPnlToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DayPnl&&(identical(other.date, date) || other.date == date)&&(identical(other.realizedPnl, realizedPnl) || other.realizedPnl == realizedPnl)&&(identical(other.grossPnl, grossPnl) || other.grossPnl == grossPnl)&&(identical(other.charges, charges) || other.charges == charges)&&(identical(other.algoPnl, algoPnl) || other.algoPnl == algoPnl)&&(identical(other.manualPnl, manualPnl) || other.manualPnl == manualPnl)&&(identical(other.trades, trades) || other.trades == trades));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,date,realizedPnl,grossPnl,charges,algoPnl,manualPnl,trades);

@override
String toString() {
  return 'DayPnl(date: $date, realizedPnl: $realizedPnl, grossPnl: $grossPnl, charges: $charges, algoPnl: $algoPnl, manualPnl: $manualPnl, trades: $trades)';
}


}

/// @nodoc
abstract mixin class _$DayPnlCopyWith<$Res> implements $DayPnlCopyWith<$Res> {
  factory _$DayPnlCopyWith(_DayPnl value, $Res Function(_DayPnl) _then) = __$DayPnlCopyWithImpl;
@override @useResult
$Res call({
 String date, double realizedPnl, double grossPnl, double charges, double algoPnl, double manualPnl, int trades
});




}
/// @nodoc
class __$DayPnlCopyWithImpl<$Res>
    implements _$DayPnlCopyWith<$Res> {
  __$DayPnlCopyWithImpl(this._self, this._then);

  final _DayPnl _self;
  final $Res Function(_DayPnl) _then;

/// Create a copy of DayPnl
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? date = null,Object? realizedPnl = null,Object? grossPnl = null,Object? charges = null,Object? algoPnl = null,Object? manualPnl = null,Object? trades = null,}) {
  return _then(_DayPnl(
date: null == date ? _self.date : date // ignore: cast_nullable_to_non_nullable
as String,realizedPnl: null == realizedPnl ? _self.realizedPnl : realizedPnl // ignore: cast_nullable_to_non_nullable
as double,grossPnl: null == grossPnl ? _self.grossPnl : grossPnl // ignore: cast_nullable_to_non_nullable
as double,charges: null == charges ? _self.charges : charges // ignore: cast_nullable_to_non_nullable
as double,algoPnl: null == algoPnl ? _self.algoPnl : algoPnl // ignore: cast_nullable_to_non_nullable
as double,manualPnl: null == manualPnl ? _self.manualPnl : manualPnl // ignore: cast_nullable_to_non_nullable
as double,trades: null == trades ? _self.trades : trades // ignore: cast_nullable_to_non_nullable
as int,
  ));
}


}


/// @nodoc
mixin _$SyncResult {

 String? get message;
/// Create a copy of SyncResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SyncResultCopyWith<SyncResult> get copyWith => _$SyncResultCopyWithImpl<SyncResult>(this as SyncResult, _$identity);

  /// Serializes this SyncResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SyncResult&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'SyncResult(message: $message)';
}


}

/// @nodoc
abstract mixin class $SyncResultCopyWith<$Res>  {
  factory $SyncResultCopyWith(SyncResult value, $Res Function(SyncResult) _then) = _$SyncResultCopyWithImpl;
@useResult
$Res call({
 String? message
});




}
/// @nodoc
class _$SyncResultCopyWithImpl<$Res>
    implements $SyncResultCopyWith<$Res> {
  _$SyncResultCopyWithImpl(this._self, this._then);

  final SyncResult _self;
  final $Res Function(SyncResult) _then;

/// Create a copy of SyncResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? message = freezed,}) {
  return _then(_self.copyWith(
message: freezed == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [SyncResult].
extension SyncResultPatterns on SyncResult {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SyncResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SyncResult() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SyncResult value)  $default,){
final _that = this;
switch (_that) {
case _SyncResult():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SyncResult value)?  $default,){
final _that = this;
switch (_that) {
case _SyncResult() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? message)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SyncResult() when $default != null:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? message)  $default,) {final _that = this;
switch (_that) {
case _SyncResult():
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? message)?  $default,) {final _that = this;
switch (_that) {
case _SyncResult() when $default != null:
return $default(_that.message);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SyncResult implements SyncResult {
  const _SyncResult({this.message});
  factory _SyncResult.fromJson(Map<String, dynamic> json) => _$SyncResultFromJson(json);

@override final  String? message;

/// Create a copy of SyncResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SyncResultCopyWith<_SyncResult> get copyWith => __$SyncResultCopyWithImpl<_SyncResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SyncResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SyncResult&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'SyncResult(message: $message)';
}


}

/// @nodoc
abstract mixin class _$SyncResultCopyWith<$Res> implements $SyncResultCopyWith<$Res> {
  factory _$SyncResultCopyWith(_SyncResult value, $Res Function(_SyncResult) _then) = __$SyncResultCopyWithImpl;
@override @useResult
$Res call({
 String? message
});




}
/// @nodoc
class __$SyncResultCopyWithImpl<$Res>
    implements _$SyncResultCopyWith<$Res> {
  __$SyncResultCopyWithImpl(this._self, this._then);

  final _SyncResult _self;
  final $Res Function(_SyncResult) _then;

/// Create a copy of SyncResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? message = freezed,}) {
  return _then(_SyncResult(
message: freezed == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
