import 'package:intl/intl.dart';

/// The server buckets trading days in IST, independent of the phone's time zone.
DateTime marketTime(DateTime instant) => instant.toUtc().add(const Duration(hours: 5, minutes: 30));
bool isSameMarketDay(DateTime a, DateTime b) {
  final x = marketTime(a), y = marketTime(b);
  return x.year == y.year && x.month == y.month && x.day == y.day;
}

final _stamp = DateFormat('dd MMM, HH:mm');

/// `10 Nov, 14:05 IST` for an ISO timestamp from the server; the text itself when unreadable.
String formatMarketTimestamp(String iso) {
  final parsed = DateTime.tryParse(iso);
  return parsed == null ? iso : '${_stamp.format(marketTime(parsed))} IST';
}
