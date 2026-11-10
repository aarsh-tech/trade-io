import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/features/orders/order_ticket.dart';

void main() {
  TicketInput ticket({
    String side = 'BUY',
    String type = 'LIMIT',
    double qty = 75,
    double price = 100,
    double trigger = 99,
    int lot = 75,
    double tick = 0.05,
    bool killed = false,
    int? maxQty,
    int? freeze,
    double? maxValue,
  }) => TicketInput(
    side: side,
    orderType: type,
    qty: qty,
    price: price,
    triggerPrice: trigger,
    ltp: 100,
    lotSize: lot,
    tickSize: tick,
    killSwitchActive: killed,
    maxOrderQty: maxQty,
    freezeLimit: freeze,
    maxOrderValue: maxValue,
  );
  test('tick arithmetic tolerates floating point representation', () {
    expect(isTickMultiple(100.15, 0.05), isTrue);
    expect(isTickMultiple(100.13, 0.05), isFalse);
    expect(snapToTick(100.13, 0.05), 100.15);
  });
  test('quantity, lot, freeze, value and kill-switch limits block entries', () {
    expect(validateTicket(ticket()), isEmpty);
    for (final t in [
      ticket(qty: 0),
      ticket(qty: 1.5),
      ticket(qty: double.nan),
      ticket(qty: 76),
      ticket(maxQty: 50),
      ticket(freeze: 50),
      ticket(maxValue: 5000),
      ticket(killed: true),
      ticket(price: 100.13),
    ]) {
      expect(validateTicket(t).where((i) => !i.warning), isNotEmpty);
    }
    expect(
      validateTicket(ticket(qty: 100000, lot: 1)),
      isEmpty,
      reason: 'Equity quantity is unconstrained when backend limits are null',
    );
  });
  test('SL trigger direction and market confirmations match the web', () {
    expect(validateTicket(ticket(type: 'SL', trigger: 101)), isNotEmpty);
    expect(validateTicket(ticket(type: 'SL', side: 'SELL', trigger: 99)), isNotEmpty);
    expect(validateTicket(ticket(type: 'SL', side: 'SELL', trigger: 101)), isEmpty);
    expect(ticket(type: 'MARKET').needsConfirmation, isTrue);
    expect(ticket(type: 'SL-M').needsConfirmation, isTrue);
    expect(ticket(qty: 1000).needsConfirmation, isTrue);
    expect(ticket().needsConfirmation, isFalse);
    expect(newIdempotencyKey(), isNot(newIdempotencyKey()));
  });
  test('an order key is reused only while the outcome of the same order is unknown', () {
    final attempt = OrderAttempt();
    final first = attempt.keyFor('SELL 100 ITI');
    // Timeout: the retry of the same order must not become a second order.
    attempt.settle(answered: false);
    expect(attempt.keyFor('SELL 100 ITI'), first);
    // A changed order is a new intent.
    final changed = attempt.keyFor('SELL 50 ITI');
    expect(changed, isNot(first));
    // Placed: exiting the same quantity of the same stock again later is a new order.
    attempt.settle(answered: true);
    expect(attempt.keyFor('SELL 50 ITI'), isNot(changed));
  });
}
