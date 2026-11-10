import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/utils/market_time.dart';

void main() {
  test('uses IST dates across UTC midnight and the IST month boundary', () {
    final a = DateTime.parse('2026-11-30T20:00:00Z');
    expect(marketTime(a).month, 12);
    expect(isSameMarketDay(a, DateTime.parse('2026-12-01T01:00:00Z')), isTrue);
    expect(isSameMarketDay(a, DateTime.parse('2026-11-30T18:00:00Z')), isFalse);
  });
  test('formats server timestamps in IST and passes unreadable text through', () {
    expect(formatMarketTimestamp('2026-11-10T08:35:00.000Z'), '10 Nov, 14:05 IST');
    expect(formatMarketTimestamp('not a date'), 'not a date');
  });
}
