# apps/mobile — Tradeio Android app (Flutter)

Same backend, same API calls as apps/web. The backend (apps/auth-service) is the source of truth; this app never gets its own endpoints or its own business rules.

## Commands (run from apps/mobile)

```
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # after editing any *_models.dart
flutter analyze && flutter test && dart run tool/check_enums.dart
flutter run                                                 # production API
flutter run --dart-define=API_URL=http://192.168.1.5:3002   # backend on the LAN (debug builds allow http)
flutter build apk --release
```

## Layout

```
lib/
  main.dart, app.dart, router.dart        # entry, MaterialApp.router, all routes (Routes constants)
  core/
    config/app_config.dart                # API_URL dart-define → REST + socket base URLs
    network/api_client.dart               # dio + Bearer + single-flight refresh + retry (port of web api.ts)
    network/api_envelope.dart             # unwrapData() opens { success, data }; apiErrorMessage()
    auth/token_store.dart                 # secure storage for the JWTs + last user
    auth/auth_controller.dart             # AuthState (unknown / signedOut / signedIn), apiClientProvider
    socket/authed_socket.dart             # socket.io namespace connection that refreshes + reconnects
    theme/app_theme.dart                  # the web's design tokens (globals.css) + IBM Plex; AppColors (context.colors), AppSpace, AppRadius
    theme/appearance_controller.dart      # saved Auto / Light / Dark preference
    utils/format.dart                     # ₹ / % / qty formatting (port of web format.ts)
  shared/
    enums.dart                            # mirror of packages/shared-types enums (@JsonValue = wire value)
    widgets/ui.dart                       # web building blocks: Panel, Pill, StatTile, StatStrip, SegmentTabs, ToneButton, Notice, confirmAction, toast
    widgets/                              # other widgets used by more than one feature
  features/<name>/
    <name>_api.dart                       # the endpoints; method names match api.ts (strategyApi.start → StrategiesApi.start)
    <name>_models.dart                    # freezed + json_serializable models
    <name>_providers.dart                 # Riverpod providers (server cache, polling, local state)
    screens/, widgets/                    # UI only; no HTTP, no JSON, no maths here
test/                                     # mirrors lib/; every ported pure function has a test
tool/check_enums.dart                     # fails when enums.dart drifts from shared-types
tool/make_icons.py                        # legacy launcher PNGs from the brand mark (python, Pillow)
```

## Rules

- **One endpoint, two clients.** A backend route change is finished only when `apps/web/src/lib/api.ts` and the matching `<feature>_api.dart` are updated in the same commit.
- **Open the envelope once.** Feature APIs call `unwrapData<T>(res)`; nothing else touches `success`/`data`.
- **Models are generated.** Data shapes are `@freezed` classes with `fromJson`; never hand-write `Map` parsing in a screen. Enums use `@JsonValue` strings from `shared/enums.dart`.
- **Widgets don't compute.** Money/P&L maths and formatting live in `core/utils` or the feature's providers, with tests. Screens only lay out values.
- **Every screen follows the system theme.** Use `Theme.of(context)` and `context.colors`; no hard-coded colours.
- **Look like the web on a phone.** Build screens from `shared/widgets/ui.dart`; navigation lives in `features/home/nav_config.dart` (same order as the web's nav-config.ts). A new web page needs its mobile screen and a `moreNav` entry.
- **The strategy wizard is a port.** `strategy_form.dart` mirrors the web's form-defaults / build-config / strategy-types; `test/features/strategy_form_test.dart` checks it against `defaultStrategyConfig`.
- **Live data over polling.** Where the backend pushes a socket event (`ticks`, `order_update`, `strategy-event`), providers refresh on the event; any timer is a slow fallback that pauses while the app is in the background.
- **Riverpod 3, go_router 17, freezed 3, dio 5.** Check the installed version in pubspec.lock before using an API from memory.
- Routes are constants in `router.dart`; navigate with `context.go(Routes.x)`, never a string literal.
- Never commit or push without asking.

## Backend facts this app relies on

- Login: `POST /auth/login` → `{ requireTotp: true }` when 2FA is on and no code was sent, else `{ user, accessToken, refreshToken }`.
- Access token lasts 8h; `POST /auth/refresh { refreshToken }` returns new tokens (+ user). Refresh only when near expiry.
- Sockets: `/market` (events `ticks`, `feed:status`, `order_update`; emit `subscribe {symbols}`) and `/strategy` (emit `subscribe {strategyId}`; event `strategy-event {logs,state,orders}`). Handshake `auth: { token }`.
- `AuthController` calls the API only through `sessionApiClientProvider`. `apiClientProvider` (and every `*ApiProvider` built on it, including `authApiProvider`) watches the auth state, so reading one from the controller is a Riverpod 3 `CircularDependencyError`: that bug made sign-in fail on the phone. `test/core/auth/auth_controller_test.dart` guards it.
- No Android backup (`allowBackup="false"` + data_extraction_rules): the Keystore key that encrypts the saved session can't be restored, so a restored copy breaks sign-in. `TokenStore` also treats any storage error as "no session" and keeps tokens in memory when a write fails.
- Zerodha login redirects to `https://tradeio.site/brokers/callback?request_token=…&state=…`; the app intercepts that URL in a webview and calls `POST /brokers/:id/session`.
