import 'package:flutter/material.dart';

/// The web app's colour tokens (apps/web/src/app/globals.css), light and dark, so both
/// clients look the same. Values are HSL exactly as in the CSS.
Color _hsl(double h, double s, double l) => HSLColor.fromAHSL(1, h, s / 100, l / 100).toColor();

/// Trading-specific colours that Material's ColorScheme has no slot for.
/// Read them with `Theme.of(context).extension<AppColors>()!` or the `context.colors` shortcut.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.foreground,
    required this.card,
    required this.surface,
    required this.sunken,
    required this.border,
    required this.muted,
    required this.mutedForeground,
    required this.profit,
    required this.loss,
    required this.warn,
    required this.info,
    required this.buy,
    required this.sell,
    required this.signal,
    required this.logBackground,
    required this.logText,
  });

  final Color background;
  final Color foreground;
  final Color card;
  final Color surface;
  final Color sunken;
  final Color border;
  final Color muted;
  final Color mutedForeground;
  final Color profit;
  final Color loss;
  final Color warn;
  final Color info;
  final Color buy;
  final Color sell;
  final Color signal;
  final Color logBackground;
  final Color logText;

  /// Green for a gain, red for a loss, the normal text colour for zero.
  Color pnl(num value) => value > 0 ? profit : (value < 0 ? loss : foreground);

  static final light = AppColors(
    background: _hsl(216, 29.4, 96.7),
    foreground: _hsl(212, 30.6, 9.6),
    card: _hsl(0, 0, 100),
    surface: _hsl(0, 0, 100),
    sunken: _hsl(214.3, 24.1, 94.3),
    border: _hsl(213.3, 20.9, 83.1),
    muted: _hsl(214.3, 30.4, 95.5),
    mutedForeground: _hsl(214.3, 15.9, 34.5),
    profit: _hsl(154.6, 83.5, 26.1),
    loss: _hsl(352.2, 64, 46.9),
    warn: _hsl(38.6, 100, 28),
    info: _hsl(216.1, 85.4, 40.4),
    buy: _hsl(215.9, 83.1, 41.8),
    sell: _hsl(352.2, 64, 46.9),
    signal: _hsl(256.8, 55, 52.9),
    logBackground: _hsl(210, 33.3, 97.6),
    logText: _hsl(213, 26.3, 14.9),
  );

  static final dark = AppColors(
    background: _hsl(210, 21.4, 5.5),
    foreground: _hsl(213.3, 24.3, 92.7),
    card: _hsl(213.3, 20, 8.8),
    surface: _hsl(215, 20.7, 11.4),
    sunken: _hsl(216, 23.8, 4.1),
    border: _hsl(213.9, 21.1, 21.4),
    muted: _hsl(216, 21.1, 13.9),
    mutedForeground: _hsl(214.3, 17.9, 69.4),
    profit: _hsl(156.5, 60.9, 46.1),
    loss: _hsl(349.6, 89.3, 67.1),
    warn: _hsl(45.6, 91.2, 49.2),
    info: _hsl(212.5, 100, 71.4),
    buy: _hsl(213.9, 100, 64.9),
    sell: _hsl(349.6, 89.3, 67.1),
    signal: _hsl(256.4, 100, 80.6),
    logBackground: _hsl(216, 23.8, 4.1),
    logText: _hsl(214.3, 20, 86.3),
  );

  @override
  AppColors copyWith({
    Color? background,
    Color? foreground,
    Color? card,
    Color? surface,
    Color? sunken,
    Color? border,
    Color? muted,
    Color? mutedForeground,
    Color? profit,
    Color? loss,
    Color? warn,
    Color? info,
    Color? buy,
    Color? sell,
    Color? signal,
    Color? logBackground,
    Color? logText,
  }) {
    return AppColors(
      background: background ?? this.background,
      foreground: foreground ?? this.foreground,
      card: card ?? this.card,
      surface: surface ?? this.surface,
      sunken: sunken ?? this.sunken,
      border: border ?? this.border,
      muted: muted ?? this.muted,
      mutedForeground: mutedForeground ?? this.mutedForeground,
      profit: profit ?? this.profit,
      loss: loss ?? this.loss,
      warn: warn ?? this.warn,
      info: info ?? this.info,
      buy: buy ?? this.buy,
      sell: sell ?? this.sell,
      signal: signal ?? this.signal,
      logBackground: logBackground ?? this.logBackground,
      logText: logText ?? this.logText,
    );
  }

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      background: mix(background, other.background),
      foreground: mix(foreground, other.foreground),
      card: mix(card, other.card),
      surface: mix(surface, other.surface),
      sunken: mix(sunken, other.sunken),
      border: mix(border, other.border),
      muted: mix(muted, other.muted),
      mutedForeground: mix(mutedForeground, other.mutedForeground),
      profit: mix(profit, other.profit),
      loss: mix(loss, other.loss),
      warn: mix(warn, other.warn),
      info: mix(info, other.info),
      buy: mix(buy, other.buy),
      sell: mix(sell, other.sell),
      signal: mix(signal, other.signal),
      logBackground: mix(logBackground, other.logBackground),
      logText: mix(logText, other.logText),
    );
  }
}

extension AppColorsContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
}

ThemeData _theme(Brightness brightness, AppColors c, Color primary, Color onPrimary, Color destructive) {
  final scheme = ColorScheme(
    brightness: brightness,
    primary: primary,
    onPrimary: onPrimary,
    secondary: c.muted,
    onSecondary: c.foreground,
    error: destructive,
    onError: Colors.white,
    surface: c.card,
    onSurface: c.foreground,
    surfaceContainerHighest: c.muted,
    onSurfaceVariant: c.mutedForeground,
    outline: c.border,
    outlineVariant: c.border,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.background,
    cardColor: c.card,
    dividerColor: c.border,
    extensions: [c],
    appBarTheme: AppBarTheme(
      backgroundColor: c.background,
      foregroundColor: c.foreground,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: c.card,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: c.border)),
      margin: EdgeInsets.zero,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.card,
      indicatorColor: primary.withValues(alpha: 0.15),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: c.border)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
  );
}

ThemeData lightTheme() =>
    _theme(Brightness.light, AppColors.light, _hsl(215.9, 83.1, 41.8), _hsl(0, 0, 100), _hsl(352.2, 64, 46.9));

ThemeData darkTheme() =>
    _theme(Brightness.dark, AppColors.dark, _hsl(213.9, 100, 64.9), _hsl(211.2, 67.6, 7.3), _hsl(349.6, 89.3, 67.1));
