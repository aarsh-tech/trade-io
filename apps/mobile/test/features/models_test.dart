import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/features/market/market_models.dart';
import 'package:tradeio_mobile/features/orders/orders_models.dart';
import 'package:tradeio_mobile/features/portfolio/portfolio_models.dart';
import 'package:tradeio_mobile/shared/enums.dart';

void main() {
  group('Order.fromJson', () {
    test('parses a DB row with its strategy and enum wire values', () {
      final o = Order.fromJson({
        'id': 'o1',
        'symbol': 'RELIANCE',
        'exchange': 'NSE',
        'side': 'SELL',
        'orderType': 'SL_M',
        'productType': 'MIS',
        'qty': 10,
        'filledQty': 10,
        'price': 0,
        'avgPrice': 2511.5,
        'triggerPrice': 2490,
        'brokerOrderId': '2411100001',
        'status': 'COMPLETE',
        'isPaperTrade': false,
        'createdAt': '2026-11-10T04:05:06.000Z',
        'brokerAccountId': 'acc1',
        'execution': {
          'id': 'e1',
          'strategy': {'name': 'Stocks in Play'},
        },
      });
      expect(o.side, OrderSide.sell);
      expect(o.orderType, OrderType.slM);
      expect(o.status, OrderStatus.complete);
      expect(o.strategyName, 'Stocks in Play');
      expect(o.isAlgo, isTrue);
      expect(o.canCancel, isFalse);
      expect(o.createdAt.isUtc, isTrue);
    });
    test('an unknown status becomes null instead of throwing; open live orders can be cancelled', () {
      final o = Order.fromJson({
        'id': 'o2',
        'symbol': 'INFY',
        'side': 'BUY',
        'orderType': 'LIMIT',
        'qty': 5,
        'filledQty': 0,
        'brokerOrderId': 'b1',
        'status': 'TRIGGER PENDING',
        'createdAt': '2026-11-10T04:05:06.000Z',
      });
      expect(o.status, isNull);
      expect(o.canCancel, isFalse);
      expect(o.copyWith(status: OrderStatus.open).canCancel, isTrue);
      expect(o.copyWith(status: OrderStatus.open, isPaperTrade: true).canCancel, isFalse);
    });
  });

  group('Margins', () {
    test('available funds fall back live_balance → cash → net', () {
      Margins m(Map<String, dynamic> available, {double? net}) => Margins.fromJson({
        'equity': {
          'net': net,
          'available': available,
          'utilised': {'debits': 1200.5},
        },
      });
      expect(m({'live_balance': 50000, 'cash': 40000}, net: 1).equityAvailable, 50000);
      expect(m({'cash': 40000}, net: 1).equityAvailable, 40000);
      expect(m({}, net: 999).equityAvailable, 999);
      expect(m({}).equityUsed, 1200.5);
    });
  });

  group('MarketTick / FeedStatus', () {
    test('parses nulls for change fields and integer prices', () {
      final t = MarketTick.fromJson({
        'key': 'NSE:NIFTY 50',
        'symbol': 'NIFTY 50',
        'exchange': 'NSE',
        'ltp': 24000,
        'close': null,
        'change': null,
        'changePct': null,
        'volume': null,
        'exchangeTs': null,
        'ts': '2026-11-10T04:05:06.000Z',
        'source': 'ws',
      });
      expect(t.ltp, 24000.0);
      expect(t.changePct, isNull);
    });
    test('unknown feed state reads as closed', () {
      expect(FeedStatus.fromJson({'status': 'weird'}).status, FeedState.closed);
      expect(FeedStatus.fromJson({'status': 'connected'}).status, FeedState.connected);
    });
    test('session state has labels', () {
      expect(SessionInfo.fromJson({'state': 'pre-open'}).state.label, 'Pre-open');
      expect(SessionInfo.fromJson({'state': 'nonsense'}).state, SessionState.closed);
    });
  });

  group('BrokerPosition', () {
    test('qty 0 is closed', () {
      expect(BrokerPosition.fromJson({'symbol': 'X', 'qty': 0}).isOpen, isFalse);
      expect(BrokerPosition.fromJson({'symbol': 'X', 'qty': -5, 'avgPrice': 10, 'ltp': 9, 'pnl': 5}).isOpen, isTrue);
    });
  });
}
