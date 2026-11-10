/// Kite-style instrument name (port of `formatKiteInstrument` in
/// apps/web/src/components/dashboard/LiveAlgoPositionsCard.tsx):
/// `NIFTY2690823900PE` → `NIFTY 8th ʷ SEP 23900 PE`, `SBIN24OCT820CE` → `SBIN OCT 820 CE`,
/// `NIFTY24SEPFUT` → `NIFTY SEP FUT`; equities unchanged.
String kiteInstrumentName(String raw) {
  final sym = raw.trim().toUpperCase();
  if (sym.isEmpty) return '';
  final weekly = RegExp(r'^([A-Z]+)(\d{2})([1-9OND])(\d{2})(\d+)(CE|PE)$').firstMatch(sym);
  if (weekly != null) {
    const months = {
      '1': 'JAN', '2': 'FEB', '3': 'MAR', '4': 'APR', '5': 'MAY', '6': 'JUN', //
      '7': 'JUL', '8': 'AUG', '9': 'SEP', 'O': 'OCT', 'N': 'NOV', 'D': 'DEC',
    };
    final day = int.parse(weekly.group(4)!);
    final suffix = switch (day) {
      1 || 21 || 31 => 'st',
      2 || 22 => 'nd',
      3 || 23 => 'rd',
      _ => 'th',
    };
    return '${weekly.group(1)} $day$suffix ʷ ${months[weekly.group(3)] ?? 'EXP'} ${weekly.group(5)} ${weekly.group(6)}';
  }
  final monthly = RegExp(r'^([A-Z]+)(\d{2})([A-Z]{3})(\d+)(CE|PE)$').firstMatch(sym);
  if (monthly != null) return '${monthly.group(1)} ${monthly.group(3)} ${monthly.group(4)} ${monthly.group(5)}';
  final future = RegExp(r'^([A-Z]+)(\d{2})([A-Z]{3})FUT$').firstMatch(sym);
  if (future != null) return '${future.group(1)} ${future.group(3)} FUT';
  return sym;
}
