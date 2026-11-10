/// The one place numbers are formatted for display. Port of apps/web/src/lib/format.ts:
/// Indian digit grouping (1,23,456.78), fixed decimals so columns line up, and "—" for a
/// missing value. Hand-rolled grouping, so it needs no locale data and is unit-tested.
library;

const String empty = '—';

bool _finite(num? v) => v != null && v.isFinite;

/// `12345678.9` → `1,23,45,678.90` (last group of three, then twos).
String groupIndian(double absValue, int decimals) {
  final fixed = absValue.toStringAsFixed(decimals);
  final dot = fixed.indexOf('.');
  final intPart = dot == -1 ? fixed : fixed.substring(0, dot);
  final fracPart = dot == -1 ? '' : fixed.substring(dot);
  if (intPart.length <= 3) return '$intPart$fracPart';
  final last3 = intPart.substring(intPart.length - 3);
  var rest = intPart.substring(0, intPart.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '${groups.join(',')},$last3$fracPart';
}

/// `₹1,23,456.78`; negatives as `-₹1,234.00` (sign before the symbol). A value that rounds to
/// zero never shows a minus sign. [signed] adds `+` to positives (use for P&L and changes).
String formatInr(num? value, {int decimals = 2, bool signed = false}) {
  if (!_finite(value)) return empty;
  final body = groupIndian(value!.abs().toDouble(), decimals);
  final isZero = !body.contains(RegExp('[1-9]'));
  final sign = value < 0 && !isZero ? '-' : (signed && value > 0 ? '+' : '');
  return '$sign₹$body';
}

/// Grouped number without a currency symbol (prices, index levels).
String formatPrice(num? value, {int decimals = 2, bool signed = false}) {
  if (!_finite(value)) return empty;
  final body = groupIndian(value!.abs().toDouble(), decimals);
  final sign = value < 0 ? '-' : (signed && value > 0 ? '+' : '');
  return '$sign$body';
}

/// `+1.23%` / `-0.45%` (a percent value, not a fraction). Positives are signed by default.
String formatPct(num? value, {int decimals = 2, bool signed = true}) {
  if (!_finite(value)) return empty;
  return '${formatPrice(value, decimals: decimals, signed: signed)}%';
}

/// Plain integer with grouping, for quantities.
String formatQty(num? value) => formatPrice(value, decimals: 0);
