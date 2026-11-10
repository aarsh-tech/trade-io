# Tradeio mobile (Android)

Flutter client for the Tradeio API. See [PLAN.md](PLAN.md) for the roadmap and [CLAUDE.md](CLAUDE.md) for the code layout and rules.

```
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run                                                 # against api.tradeio.site
flutter run --dart-define=API_URL=http://<lan-ip>:3002      # against a local backend
```

Checks before a commit: `flutter analyze && flutter test && dart run tool/check_enums.dart`.

Implemented: live dashboard and positions, orders and manual order entry, strategy management and console, broker linking/session renewal, risk controls, live screener, move alerts, swing scans and the P&L ledger. Open the additional tools from **More**.

Appearance: **More → Appearance** offers Auto (follow the device), Light and Dark, with a saved preference. The design system is the web's: the same colour tokens (apps/web/src/app/globals.css), bundled IBM Plex Sans/Mono, the same dense card and spacing rhythm. Fonts work offline; their SIL licence is in `assets/fonts/OFL.txt`.

Brand: the launcher icon, the Android launch screen (Android 12+ system splash and the older launch background) and the in-app splash all draw the web favicon's mark (`apps/web/src/app/icon.svg`) at the same size, so start-up has no visual jump. Android 8+ uses the vector adaptive icon in `android/app/src/main/res/mipmap-anydpi-v26`; the PNGs for older phones come from `python tool/make_icons.py`.

UI checks cover both themes on narrow phones with enlarged text. To render actual Flutter screen previews with fixture data: `flutter test test/features/screens_smoke_test.dart --dart-define=UI_PREVIEWS=true`. Images are written to `build/ui-previews`.

Android builds use JDK 17+, SDK 36 and NDK 27.0.12077973 (Gradle 8.13 / AGP 8.13.2 / Kotlin 2.2.10). For an installable test build, run `flutter build apk --debug`; the APK is in `build/app/outputs/flutter-apk/app-debug.apk`.

Cancellation needs the accompanying auth-service cancel-route change deployed. Live broker login and trading workflows need a test-account check before release; automated tests never send live trades. Production signing and push notifications remain release work.
