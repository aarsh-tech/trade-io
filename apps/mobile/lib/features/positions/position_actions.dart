import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_envelope.dart';
import '../../shared/widgets/ui.dart';
import '../brokers/brokers_api.dart';
import '../orders/order_ticket.dart';
import '../orders/orders_providers.dart';
import '../portfolio/live_pnl.dart';
import '../portfolio/portfolio_models.dart';
import '../portfolio/portfolio_providers.dart';
import '../strategies/strategies_api.dart';
import '../strategies/strategies_providers.dart';
import 'algo_positions.dart';

/// The MARKET order that closes [p] (opposite side, same product, absolute quantity).
Map<String, dynamic> exitOrderFor(BrokerPosition p) => {
  'symbol': p.symbol,
  'exchange': exchangeOf(p),
  'side': p.qty > 0 ? 'SELL' : 'BUY',
  'product': p.product,
  'orderType': 'MARKET',
  'qty': p.qty.abs(),
  'price': 0,
};

/// Idempotency keys per position, so a retry after an unknown outcome reuses its key and a new
/// exit after a confirmed one gets a fresh key (the web's useOrderTicket rule).
final _exitAttempts = <String, OrderAttempt>{};

/// Confirms, then squares off one position: a broker MARKET exit, or for a paper position the
/// running strategies' own square-off (same as the web).
Future<void> squareOffPosition(
  BuildContext context,
  WidgetRef ref, {
  String? accountId,
  required BrokerPosition p,
}) async {
  final paper = isPaper(p);
  final exitSide = p.qty > 0 ? 'SELL' : 'BUY';
  final ok = await confirmAction(
    context,
    title: 'Square off ${p.symbol}?',
    message:
        paper
            ? 'Asks the running strategies to close their paper trade in ${p.symbol}.'
            : 'Places a MARKET $exitSide for ${p.qty.abs()} (${p.product}) at your broker.',
    confirmLabel: 'Square off',
    destructive: true,
  );
  if (!ok || !context.mounted) return;
  if (paper) {
    await runWithToast(
      context,
      () async {
        final running = (ref.read(strategiesProvider).value ?? const []).where((s) => s.isActive);
        for (final s in running) {
          await ref.read(strategiesApiProvider).squareOff(s.id).catchError((Object _) {});
        }
        ref.invalidate(strategiesProvider);
      },
      success: 'Square-off sent for ${p.symbol}',
      failure: 'Could not square off',
    );
    return;
  }
  if (accountId == null) return toast(context, 'No broker account linked', error: true);
  final body = exitOrderFor(p);
  final attempt = _exitAttempts.putIfAbsent('$accountId:${exchangeOf(p)}:${p.symbol}:${p.product}', OrderAttempt.new);
  final key = attempt.keyFor('$accountId:$body');
  await runWithToast(
    context,
    () async {
      try {
        await ref.read(brokersApiProvider).placeOrder(accountId, body, idempotencyKey: key);
        attempt.settle(answered: true);
      } catch (e) {
        attempt.settle(answered: serverAnswered(e));
        rethrow;
      }
      ref
        ..invalidate(positionsProvider(accountId))
        ..invalidate(ordersProvider);
    },
    success: 'Exit order placed: $exitSide ${p.qty.abs()} ${p.symbol}',
    failure: 'Could not confirm the exit order. Check Orders before trying again.',
  );
}

/// Squares off everything: each running strategy, then a MARKET exit per open broker position.
Future<void> squareOffAll(
  BuildContext context,
  WidgetRef ref, {
  String? accountId,
  required List<BrokerPosition> open,
}) async {
  final ok = await confirmAction(
    context,
    title: 'Square off all positions?',
    message:
        'Places MARKET exit orders for all ${open.length} open position(s) and squares off the running strategies.',
    confirmLabel: 'Square off all',
    destructive: true,
  );
  if (!ok || !context.mounted) return;
  var placed = 0, failed = 0;
  Future<void> exitAll() async {
    final running = (ref.read(strategiesProvider).value ?? const []).where((s) => s.isActive);
    for (final s in running) {
      await ref.read(strategiesApiProvider).squareOff(s.id).catchError((Object _) {});
    }
    if (accountId != null) {
      for (final p in open.where((p) => !isPaper(p))) {
        try {
          await ref.read(brokersApiProvider).placeOrder(accountId, exitOrderFor(p));
          placed++;
        } catch (_) {
          failed++;
        }
      }
      ref.invalidate(positionsProvider(accountId));
    }
    ref
      ..invalidate(ordersProvider)
      ..invalidate(strategiesProvider);
  }

  await runWithToast(context, exitAll, failure: 'Error during square-off');
  if (context.mounted) {
    toast(
      context,
      failed == 0
          ? 'Square-off sent ($placed exit orders)'
          : '$placed exit orders placed, $failed failed. Check Orders.',
      error: failed > 0,
    );
  }
}
