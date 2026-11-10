import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The web app's design system (apps/web/src/app/globals.css) for Flutter: same colour tokens,
/// same IBM Plex type, same dense broker-terminal rhythm as the web on a phone.

/// Colour tokens with no Material ColorScheme slot. Read them with `context.colors`.
/// Each value is the web token of the same name converted from HSL.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.foreground,
    required this.card,
    required this.popover,
    required this.surface,
    required this.sunken,
    required this.border,
    required this.lineSubtle,
    required this.input,
    required this.muted,
    required this.mutedForeground,
    required this.subtle,
    required this.primary,
    required this.onPrimary,
    required this.brandSubtle,
    required this.accentForeground,
    required this.profit,
    required this.loss,
    required this.warn,
    required this.info,
    required this.signal,
    required this.profitSubtle,
    required this.lossSubtle,
    required this.warnSubtle,
    required this.signalSubtle,
    required this.onProfit,
    required this.onLoss,
    required this.onWarn,
    required this.buy,
    required this.sell,
    required this.scrim,
    required this.logBackground,
    required this.logText,
    required this.logTime,
  });

  final Color background;
  final Color foreground;
  final Color card;
  final Color popover;
  final Color surface;
  final Color sunken;
  final Color border;
  final Color lineSubtle;
  final Color input;
  final Color muted;
  final Color mutedForeground;
  final Color subtle;
  final Color primary;
  final Color onPrimary;
  final Color brandSubtle;
  final Color accentForeground;
  final Color profit;
  final Color loss;
  final Color warn;
  final Color info;
  final Color signal;
  final Color profitSubtle;
  final Color lossSubtle;
  final Color warnSubtle;
  final Color signalSubtle;
  final Color onProfit;
  final Color onLoss;
  final Color onWarn;
  final Color buy;
  final Color sell;
  final Color scrim;
  final Color logBackground;
  final Color logText;
  final Color logTime;

  /// Green for a gain, red for a loss, the normal text colour for zero.
  Color pnl(num value) => value > 0 ? profit : (value < 0 ? loss : foreground);

  static const light = AppColors(
    background: Color(0xffF4F6F9),
    foreground: Color(0xff111820),
    card: Color(0xffFFFFFF),
    popover: Color(0xffFFFFFF),
    surface: Color(0xffFFFFFF),
    sunken: Color(0xffEDF0F4),
    border: Color(0xffCBD3DD),
    lineSubtle: Color(0xffE3E8EE),
    input: Color(0xff7B8898),
    muted: Color(0xffF0F3F7),
    mutedForeground: Color(0xff4A5666),
    subtle: Color(0xff5B6776),
    primary: Color(0xff1259C3),
    onPrimary: Color(0xffFFFFFF),
    brandSubtle: Color(0xffE6F0FE),
    accentForeground: Color(0xff0F55BF),
    profit: Color(0xff0B7A4B),
    loss: Color(0xffC42B3F),
    warn: Color(0xff8F5C00),
    info: Color(0xff0F55BF),
    signal: Color(0xff6A45C9),
    profitSubtle: Color(0xffE1F4EB),
    lossSubtle: Color(0xffFBE7EA),
    warnSubtle: Color(0xffFFF3D6),
    signalSubtle: Color(0xffEFE9FC),
    onProfit: Color(0xffFFFFFF),
    onLoss: Color(0xffFFFFFF),
    onWarn: Color(0xffFFFFFF),
    buy: Color(0xff1259C3),
    sell: Color(0xffC42B3F),
    scrim: Color(0xff0F172A),
    logBackground: Color(0xffF7F9FB),
    logText: Color(0xff1C2530),
    logTime: Color(0xff5B6776),
  );

  static const dark = AppColors(
    background: Color(0xff0B0E11),
    foreground: Color(0xffE8ECF1),
    card: Color(0xff12161B),
    popover: Color(0xff171C23),
    surface: Color(0xff171C23),
    sunken: Color(0xff080A0D),
    border: Color(0xff2B3542),
    lineSubtle: Color(0xff1F2630),
    input: Color(0xff5A6B80),
    muted: Color(0xff1C222B),
    mutedForeground: Color(0xffA3AFBF),
    subtle: Color(0xff8592A3),
    primary: Color(0xff4C9AFF),
    onPrimary: Color(0xff06121F),
    brandSubtle: Color(0xff12263F),
    accentForeground: Color(0xff6DB0FF),
    profit: Color(0xff2EBD85),
    loss: Color(0xffF6607A),
    warn: Color(0xffF0B90B),
    info: Color(0xff6DB0FF),
    signal: Color(0xffB79CFF),
    profitSubtle: Color(0xff0F2A22),
    lossSubtle: Color(0xff2E141C),
    warnSubtle: Color(0xff2B2308),
    signalSubtle: Color(0xff221A3A),
    onProfit: Color(0xff04150E),
    onLoss: Color(0xff1A0509),
    onWarn: Color(0xff1A1300),
    buy: Color(0xff4C9AFF),
    sell: Color(0xffF6607A),
    scrim: Color(0xff000000),
    logBackground: Color(0xff080A0D),
    logText: Color(0xffD5DBE3),
    logTime: Color(0xff8592A3),
  );

  List<Color> get _all => [
    background, foreground, card, popover, surface, sunken, border, lineSubtle, input, muted, //
    mutedForeground, subtle, primary, onPrimary, brandSubtle, accentForeground, profit, loss, warn, info,
    signal, profitSubtle, lossSubtle, warnSubtle, signalSubtle, onProfit, onLoss, onWarn, buy, sell,
    scrim, logBackground, logText, logTime,
  ];

  static AppColors _fromList(List<Color> c) => AppColors(
    background: c[0],
    foreground: c[1],
    card: c[2],
    popover: c[3],
    surface: c[4],
    sunken: c[5],
    border: c[6],
    lineSubtle: c[7],
    input: c[8],
    muted: c[9],
    mutedForeground: c[10],
    subtle: c[11],
    primary: c[12],
    onPrimary: c[13],
    brandSubtle: c[14],
    accentForeground: c[15],
    profit: c[16],
    loss: c[17],
    warn: c[18],
    info: c[19],
    signal: c[20],
    profitSubtle: c[21],
    lossSubtle: c[22],
    warnSubtle: c[23],
    signalSubtle: c[24],
    onProfit: c[25],
    onLoss: c[26],
    onWarn: c[27],
    buy: c[28],
    sell: c[29],
    scrim: c[30],
    logBackground: c[31],
    logText: c[32],
    logTime: c[33],
  );

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    final a = _all, b = other._all;
    return _fromList([for (var i = 0; i < a.length; i++) Color.lerp(a[i], b[i], t)!]);
  }
}

extension AppColorsContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
}

/// Spacing of the web's phone layout: 12 px page gutter (px-3), 12 px between blocks (space-y-3).
abstract final class AppSpace {
  static const page = 12.0;
  static const gap = 12.0;
  static const card = 12.0;
  static const pageInsets = EdgeInsets.fromLTRB(page, page, page, 24);
}

/// Corner radii: 8 for cards and sheets' inner blocks (rounded-lg), 6 for controls (rounded-md).
abstract final class AppRadius {
  static const card = 8.0;
  static const control = 6.0;
}

const fontSans = 'IBMPlexSans';
const fontMono = 'IBMPlexMono';
const _tnum = [FontFeature.tabularFigures()];

ThemeData _theme(Brightness brightness, AppColors c) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(seedColor: c.primary, brightness: brightness).copyWith(
    primary: c.primary,
    onPrimary: c.onPrimary,
    primaryContainer: c.brandSubtle,
    onPrimaryContainer: c.accentForeground,
    secondary: c.info,
    secondaryContainer: c.muted,
    onSecondaryContainer: c.foreground,
    error: c.loss,
    onError: c.onLoss,
    surface: c.card,
    onSurface: c.foreground,
    surfaceContainerLowest: c.card,
    surfaceContainerLow: c.card,
    surfaceContainer: c.popover,
    surfaceContainerHigh: c.popover,
    surfaceContainerHighest: c.muted,
    onSurfaceVariant: c.mutedForeground,
    outline: c.border,
    outlineVariant: c.lineSubtle,
    scrim: c.scrim,
  );
  TextStyle t(double size, double height, FontWeight w, Color color, {double ls = 0}) => TextStyle(
    fontFamily: fontSans,
    fontSize: size,
    height: height / size,
    fontWeight: w,
    letterSpacing: ls,
    color: color,
    fontFeatures: _tnum,
  );
  final control = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control));
  final buttonText = t(13, 18, FontWeight.w600, c.foreground);
  return ThemeData(
    useMaterial3: true,
    fontFamily: fontSans,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.background,
    canvasColor: c.background,
    cardColor: c.card,
    dividerColor: c.border,
    splashFactory: InkSparkle.splashFactory,
    visualDensity: VisualDensity.compact,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    extensions: [c],
    // Web scale: body 13/20, small 11–12, titles 14–18, figures 20–22, all with tabular numbers.
    textTheme: TextTheme(
      displaySmall: t(28, 34, FontWeight.w600, c.foreground, ls: -0.5),
      headlineLarge: t(24, 30, FontWeight.w600, c.foreground, ls: -0.4),
      headlineMedium: t(22, 28, FontWeight.w600, c.foreground, ls: -0.3),
      headlineSmall: t(20, 26, FontWeight.w600, c.foreground, ls: -0.2),
      titleLarge: t(17, 24, FontWeight.w600, c.foreground, ls: -0.2),
      titleMedium: t(15, 22, FontWeight.w600, c.foreground),
      titleSmall: t(13, 18, FontWeight.w600, c.foreground),
      bodyLarge: t(14, 21, FontWeight.w400, c.foreground),
      bodyMedium: t(13, 20, FontWeight.w400, c.foreground),
      bodySmall: t(12, 17, FontWeight.w400, c.mutedForeground),
      labelLarge: t(13, 18, FontWeight.w600, c.foreground),
      labelMedium: t(11, 15, FontWeight.w500, c.mutedForeground),
      labelSmall: t(10, 14, FontWeight.w600, c.mutedForeground, ls: 0.4),
    ),
    iconTheme: IconThemeData(color: c.mutedForeground, size: 18),
    appBarTheme: AppBarTheme(
      backgroundColor: c.popover,
      foregroundColor: c.foreground,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: AppSpace.page,
      toolbarHeight: 52,
      shape: Border(bottom: BorderSide(color: c.border)),
      iconTheme: IconThemeData(color: c.foreground, size: 20),
      actionsIconTheme: IconThemeData(color: c.mutedForeground, size: 20),
      titleTextStyle: t(15, 20, FontWeight.w600, c.foreground),
      systemOverlayStyle: (dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: c.popover,
      ),
    ),
    cardTheme: CardThemeData(
      color: c.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.card,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      labelStyle: t(13, 18, FontWeight.w400, c.mutedForeground),
      floatingLabelStyle: t(12, 16, FontWeight.w500, c.accentForeground),
      hintStyle: t(13, 18, FontWeight.w400, c.subtle),
      helperStyle: t(11, 15, FontWeight.w400, c.mutedForeground),
      errorStyle: t(11, 15, FontWeight.w500, c.loss),
      prefixIconColor: c.mutedForeground,
      suffixIconColor: c.mutedForeground,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: c.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: c.border),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: c.lineSubtle),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: c.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: c.loss),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide(color: c.loss, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 40),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        shape: control,
        elevation: 0,
        textStyle: buttonText,
        backgroundColor: c.primary,
        foregroundColor: c.onPrimary,
        disabledBackgroundColor: c.muted,
        disabledForegroundColor: c.subtle,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(40, 40),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        shape: control,
        side: BorderSide(color: c.border),
        foregroundColor: c.foreground,
        backgroundColor: c.card,
        textStyle: buttonText,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(40, 36),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        shape: control,
        foregroundColor: c.accentForeground,
        textStyle: buttonText,
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(foregroundColor: c.mutedForeground, minimumSize: const Size(40, 40)),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        visualDensity: VisualDensity.compact,
        side: WidgetStatePropertyAll(BorderSide(color: c.border)),
        textStyle: WidgetStatePropertyAll(t(12, 16, FontWeight.w600, c.foreground)),
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.brandSubtle : c.card,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accentForeground : c.mutedForeground,
        ),
        shape: WidgetStatePropertyAll(control),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.card,
      selectedColor: c.brandSubtle,
      side: BorderSide(color: c.border),
      shape: control,
      showCheckmark: false,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      labelStyle: t(12, 16, FontWeight.w500, c.foreground),
      secondaryLabelStyle: t(12, 16, FontWeight.w600, c.accentForeground),
    ),
    listTileTheme: ListTileThemeData(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      minVerticalPadding: 8,
      horizontalTitleGap: 10,
      minLeadingWidth: 20,
      iconColor: c.mutedForeground,
      titleTextStyle: t(13, 18, FontWeight.w500, c.foreground),
      subtitleTextStyle: t(11, 15, FontWeight.w400, c.mutedForeground),
    ),
    expansionTileTheme: ExpansionTileThemeData(
      tilePadding: const EdgeInsets.symmetric(horizontal: 12),
      childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      shape: const Border(),
      collapsedShape: const Border(),
      iconColor: c.accentForeground,
      collapsedIconColor: c.mutedForeground,
    ),
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    dialogTheme: DialogThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: c.border),
      ),
      titleTextStyle: t(15, 22, FontWeight.w600, c.foreground),
      contentTextStyle: t(13, 20, FontWeight.w400, c.mutedForeground),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: c.border,
      dragHandleSize: const Size(36, 4),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.card))),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.foreground,
      contentTextStyle: t(13, 18, FontWeight.w500, c.background),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.card)),
      insetPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: c.foreground, borderRadius: BorderRadius.circular(AppRadius.control)),
      textStyle: t(11, 15, FontWeight.w500, c.background),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary, linearTrackColor: c.muted, linearMinHeight: 4),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: c.primary,
      foregroundColor: c.onPrimary,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.card)),
      extendedTextStyle: buttonText,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.onPrimary : c.subtle),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.primary : c.muted),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? c.primary : c.border,
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      side: BorderSide(color: c.input, width: 1.5),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: c.foreground,
      unselectedLabelColor: c.mutedForeground,
      indicatorColor: c.primary,
      dividerColor: c.border,
      labelStyle: t(13, 18, FontWeight.w600, c.foreground),
      unselectedLabelStyle: t(13, 18, FontWeight.w500, c.mutedForeground),
      tabAlignment: TabAlignment.start,
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: c.popover,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.card),
        side: BorderSide(color: c.border),
      ),
      textStyle: t(13, 18, FontWeight.w400, c.foreground),
    ),
    dropdownMenuTheme: DropdownMenuThemeData(textStyle: t(13, 18, FontWeight.w400, c.foreground)),
    textSelectionTheme: TextSelectionThemeData(cursorColor: c.primary),
  );
}

ThemeData lightTheme() => _theme(Brightness.light, AppColors.light);
ThemeData darkTheme() => _theme(Brightness.dark, AppColors.dark);
