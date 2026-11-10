# Tradeio mobile (Android)

Flutter client for the Tradeio API. See [PLAN.md](PLAN.md) for the roadmap and [CLAUDE.md](CLAUDE.md) for the code layout and rules.

```
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run                                                 # against api.tradeio.site
flutter run --dart-define=API_URL=http://<lan-ip>:3002      # against a local backend
```

Checks before a commit: `flutter analyze && flutter test && dart run tool/check_enums.dart`.
