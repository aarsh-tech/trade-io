import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/utils/format.dart';

void main() {
  group('groupIndian', () {
    test('groups the last three digits, then twos', () {
      expect(groupIndian(123456.78, 2), '1,23,456.78');
      expect(groupIndian(12345678.9, 2), '1,23,45,678.90');
      expect(groupIndian(1234, 0), '1,234');
      expect(groupIndian(999, 2), '999.00');
      expect(groupIndian(0, 2), '0.00');
    });
  });

  group('formatInr', () {
    test('rupee symbol after the sign', () {
      expect(formatInr(123456.78), '₹1,23,456.78');
      expect(formatInr(-1234), '-₹1,234.00');
      expect(formatInr(500, signed: true), '+₹500.00');
    });
    test('a value that rounds to zero has no minus sign', () {
      expect(formatInr(-0.001), '₹0.00');
    });
    test('missing values show a dash', () {
      expect(formatInr(null), '—');
      expect(formatInr(double.nan), '—');
    });
  });

  group('formatPct / formatPrice', () {
    test('percent is signed by default', () {
      expect(formatPct(1.234), '+1.23%');
      expect(formatPct(-0.45), '-0.45%');
      expect(formatPct(2, signed: false), '2.00%');
    });
    test('price is unsigned by default', () {
      expect(formatPrice(1234567.5, decimals: 1), '12,34,567.5');
      expect(formatQty(150000), '1,50,000');
    });
  });
}
