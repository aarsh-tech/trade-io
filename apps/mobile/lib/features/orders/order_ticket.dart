import 'dart:math';

bool isTickMultiple(double value, double tick) => tick <= 0 || ((value / tick) - (value / tick).round()).abs() < 1e-6;
double snapToTick(double value, double tick) =>
    tick <= 0 ? value : double.parse(((value / tick).round() * tick).toStringAsFixed(4));
String newIdempotencyKey() {
  final random = Random.secure();
  return '${DateTime.now().microsecondsSinceEpoch}-${List.generate(16, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
}

/// The idempotency key of one submit intent. Same rule as the web's `useOrderTicket`: an
/// unchanged order retried after a lost response reuses its key (the server then replays the
/// first result instead of placing a second order); the key is dropped once the server has
/// answered, so the next submit of an identical order is a new order.
class OrderAttempt {
  String? _fingerprint;
  String? _key;

  /// The key to send for the order described by [fingerprint].
  String keyFor(String fingerprint) {
    if (_fingerprint != fingerprint || _key == null) {
      _fingerprint = fingerprint;
      _key = newIdempotencyKey();
    }
    return _key!;
  }

  /// Call after the request ends. [answered] is true for a success or a definite rejection
  /// (the server replied), false when the outcome is unknown (timeout, connection lost).
  void settle({required bool answered}) {
    if (answered) _fingerprint = _key = null;
  }
}

/// Pure rules mirrored from apps/web/src/lib/order-ticket.ts.
class TicketInput {
  const TicketInput({
    required this.side,
    required this.orderType,
    required this.qty,
    required this.price,
    required this.triggerPrice,
    required this.ltp,
    this.tickSize = 0,
    this.lotSize = 1,
    this.killSwitchActive = false,
    this.maxOrderQty,
    this.freezeLimit,
    this.maxOrderValue,
    this.availableMargin = 0,
    this.marginRequired = 0,
  });
  final String side, orderType;
  final double qty, price, triggerPrice, ltp, tickSize, availableMargin, marginRequired;
  final int lotSize;
  final bool killSwitchActive;
  final int? maxOrderQty, freezeLimit;
  final double? maxOrderValue;
  bool get hasPrice => orderType == 'LIMIT' || orderType == 'SL';
  bool get hasTrigger => orderType == 'SL' || orderType == 'SL-M';
  double get orderValue => max(0, hasPrice ? price : ltp) * max(0, qty);
  bool get needsConfirmation => orderType == 'MARKET' || orderType == 'SL-M' || orderValue >= 100000;
}

class TicketIssue {
  const TicketIssue(this.field, this.message, {this.warning = false});
  final String field, message;
  final bool warning;
}

List<TicketIssue> validateTicket(TicketInput t) {
  final issues = <TicketIssue>[];
  void error(String field, String message) => issues.add(TicketIssue(field, message));
  void warn(String field, String message) => issues.add(TicketIssue(field, message, warning: true));
  if (t.killSwitchActive) error('form', 'Kill switch is active. New orders are blocked until you reset it.');
  if (!t.qty.isFinite || t.qty < 1 || t.qty != t.qty.truncateToDouble()) {
    error('qty', 'Quantity must be a whole number of at least 1');
  } else {
    if (t.lotSize > 1 && t.qty % t.lotSize != 0) {
      error('qty', 'Quantity must be a multiple of the lot size (${t.lotSize})');
    }
    if (t.maxOrderQty != null && t.qty > t.maxOrderQty!) {
      error('qty', 'Exceeds your max order quantity of ${t.maxOrderQty}');
    } else if (t.freezeLimit != null && t.qty > t.freezeLimit!) {
      error('qty', 'Exceeds the exchange freeze limit of ${t.freezeLimit}');
    }
  }
  if (t.hasPrice) {
    if (!t.price.isFinite || t.price <= 0) {
      error('price', 'Enter a price greater than 0');
    } else if (!isTickMultiple(t.price, t.tickSize)) {
      error('price', 'Price must be a multiple of the tick size (${t.tickSize})');
    } else if (t.ltp > 0 && (t.price - t.ltp).abs() / t.ltp > 0.1) {
      warn('price', 'Price is more than 10% away from the last price');
    }
  }
  if (t.hasTrigger) {
    if (!t.triggerPrice.isFinite || t.triggerPrice <= 0) {
      error('triggerPrice', 'Enter a trigger price greater than 0');
    } else if (!isTickMultiple(t.triggerPrice, t.tickSize)) {
      error('triggerPrice', 'Trigger must be a multiple of the tick size (${t.tickSize})');
    } else if (t.orderType == 'SL' && t.price > 0) {
      if (t.side == 'BUY' && t.triggerPrice > t.price) {
        error('triggerPrice', 'For a BUY SL order the trigger must not exceed the price');
      }
      if (t.side == 'SELL' && t.triggerPrice < t.price) {
        error('triggerPrice', 'For a SELL SL order the trigger must not be below the price');
      }
    }
  }
  if (t.maxOrderValue != null && t.maxOrderValue! > 0 && t.orderValue > t.maxOrderValue!) {
    error('form', 'Order value exceeds your limit of ₹${t.maxOrderValue}');
  }
  if (t.availableMargin > 0 && t.marginRequired > t.availableMargin) {
    warn('form', 'Estimated margin required is more than your available margin');
  }
  return issues;
}

/// What the order ticket opens with when another screen sends the user to trade
/// (a mover, a holding, an intraday pick): the web's OrderWindow props.
class TicketPrefill {
  const TicketPrefill({
    required this.symbol,
    this.exchange = 'NSE',
    this.side = 'BUY',
    this.ltp,
    this.qty,
    this.price,
    this.trigger,
    this.product,
    this.orderType,
    this.note,
  });

  final String symbol;
  final String exchange;

  /// `BUY` or `SELL`.
  final String side;
  final double? ltp;
  final int? qty;
  final double? price;
  final double? trigger;

  /// `MIS` / `CNC` / `NRML`.
  final String? product;

  /// `MARKET` / `LIMIT` / `SL` / `SL-M`.
  final String? orderType;

  /// Context shown on the ticket (e.g. the pick's stop and targets).
  final String? note;
}
