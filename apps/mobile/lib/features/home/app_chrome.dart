import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/socket/market_socket.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/format.dart';
import '../../router.dart';
import '../../shared/widgets/ui.dart';
import '../brokers/kite_session.dart';
import '../dashboard/dashboard_providers.dart';
import '../market/market_models.dart';
import '../market/market_providers.dart';
import '../risk/risk_providers.dart';

/// Scaffold for the top-level pages: the web's mobile top bar (brand + page title, Kite session
/// button, avatar) with the status strip under it (feed, market, Kite token, day P&L).
class TabScaffold extends StatelessWidget {
  const TabScaffold({super.key, required this.title, required this.body, this.floatingActionButton});

  final String title;
  final Widget body;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: TopBar(title: title), body: body, floatingActionButton: floatingActionButton);
}

class TopBar extends ConsumerWidget implements PreferredSizeWidget {
  const TopBar({super.key, required this.title});

  final String title;

  @override
  Size get preferredSize => const Size.fromHeight(52 + StatusStrip.height);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final kite = ref.watch(kiteSessionProvider);
    final killActive = ref.watch(riskStatusProvider.select((r) => r.value?.killSwitchActive ?? false));
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthSignedIn ? auth.user : null;
    final connected = kite?.connected ?? false;
    final kiteTone = connected ? Tone.profit : Tone.warn;
    return AppBar(
      toolbarHeight: 52,
      titleSpacing: AppSpace.page,
      title: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(AppRadius.control)),
            child: Icon(Icons.bolt_rounded, size: 17, color: c.onPrimary),
          ),
          const SizedBox(width: 9),
          Flexible(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis)),
          if (killActive) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => context.go(Routes.risk),
              child: const Pill('Kill ON', tone: Tone.loss, solid: true, icon: Icons.report_outlined),
            ),
          ],
        ],
      ),
      actions: [
        if (kite != null)
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: Material(
              color: kiteTone.bg(c),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.control),
                side: BorderSide(color: kiteTone.line(c)),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadius.control),
                onTap: () => showKiteSheet(context),
                child: Container(
                  height: 32,
                  padding: const EdgeInsets.symmetric(horizontal: 9),
                  child: Row(
                    children: [
                      Dot(kiteTone.fg(c), size: 6),
                      const SizedBox(width: 6),
                      Text(
                        connected ? 'Connected' : 'Kite login',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kiteTone.fg(c)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(right: AppSpace.page),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => context.go(Routes.settings),
            child: CircleAvatar(
              radius: 16,
              backgroundColor: c.brandSubtle,
              child: Text(
                (user?.name.isNotEmpty ?? false) ? user!.name[0].toUpperCase() : 'U',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.accentForeground),
              ),
            ),
          ),
        ),
      ],
      bottom: const StatusStrip(),
    );
  }
}

/// One scrollable line of live state, like the web's StatusBar.
class StatusStrip extends ConsumerWidget implements PreferredSizeWidget {
  const StatusStrip({super.key});

  static const height = 30.0;

  @override
  Size get preferredSize => const Size.fromHeight(height);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final socketUp = ref.watch(marketSocketProvider.select((s) => s.connected));
    final feed = ref.watch(marketSocketProvider.select((s) => s.feed.status));
    final session = ref.watch(sessionProvider).value;
    final kite = ref.watch(kiteSessionProvider);
    final day = ref.watch(dayTotalsProvider);
    final killActive = day.risk?.killSwitchActive ?? false;
    final now = ref.watch(clockProvider).value ?? DateTime.now();

    final (feedLabel, feedColor) =
        !socketUp
            ? ('Disconnected', c.loss)
            : switch (feed) {
              FeedState.connected => ('Live', c.profit),
              FeedState.stale => ('Delayed', c.warn),
              FeedState.closed => ('Feed closed', c.subtle),
            };
    final marketLive = session?.state == SessionState.open || session?.state == SessionState.preOpen;
    final nextOpen = session?.nextOpenAt;
    const small = TextStyle(fontSize: 11.5);

    Widget gap() => const SizedBox(width: 16);
    return Container(
      height: height,
      decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.page),
              child: DefaultTextStyle.merge(
                style: small.copyWith(color: c.mutedForeground),
                child: Row(
                  children: [
                    Dot(feedColor),
                    const SizedBox(width: 6),
                    Text(feedLabel, style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground)),
                    gap(),
                    Text(
                      session?.state.label ?? 'Market —',
                      style: TextStyle(fontWeight: FontWeight.w500, color: marketLive ? c.profit : c.foreground),
                    ),
                    if (session != null && !marketLive && nextOpen != null)
                      Text(' · opens in ${formatCountdown(nextOpen.difference(now))}'),
                    gap(),
                    Icon(Icons.key_outlined, size: 13, color: c.mutedForeground),
                    const SizedBox(width: 4),
                    switch (kite?.state) {
                      null || KiteTokenState.none => const Text('No broker'),
                      KiteTokenState.ok => Text('Kite ${formatCountdown(kite!.remaining!)} left'),
                      KiteTokenState.soon => Text(
                        'Kite expires in ${formatCountdown(kite!.remaining!)}',
                        style: TextStyle(color: c.warn, fontWeight: FontWeight.w600),
                      ),
                      KiteTokenState.expired => GestureDetector(
                        onTap: () => showKiteSheet(context),
                        child: Text(
                          'Kite session expired · Login',
                          style: TextStyle(color: c.loss, fontWeight: FontWeight.w600),
                        ),
                      ),
                    },
                    if (killActive) ...[
                      gap(),
                      Icon(Icons.report_outlined, size: 13, color: c.loss),
                      const SizedBox(width: 3),
                      Text('Kill switch ON', style: TextStyle(color: c.loss, fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
              ),
            ),
          ),
          InkWell(
            onTap: () => context.go(Routes.positions),
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 0, AppSpace.page, 0),
              alignment: Alignment.center,
              decoration: BoxDecoration(border: Border(left: BorderSide(color: c.border))),
              child: Text.rich(
                TextSpan(
                  style: small.copyWith(color: c.mutedForeground),
                  children: [
                    const TextSpan(text: 'Day P&L '),
                    TextSpan(
                      text: formatInr(day.total, signed: true),
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: day.total == null ? c.mutedForeground : c.pnl(day.total!),
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The web's broker-session modal: token state, daily login, manage accounts.
Future<void> showKiteSheet(BuildContext context) =>
    showModalBottomSheet<void>(context: context, useSafeArea: true, builder: (_) => const _KiteSheet());

class _KiteSheet extends ConsumerWidget {
  const _KiteSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final kite = ref.watch(kiteSessionProvider);
    final account = kite?.account;
    final (String headline, String detail, Tone tone) = switch (kite?.state) {
      null || KiteTokenState.none => (
        'No Zerodha account linked',
        'Link your Kite API app once; after that you only need the daily login.',
        Tone.warn,
      ),
      KiteTokenState.ok => (
        'Kite connected',
        'Session valid for ${formatCountdown(kite!.remaining!)}. Zerodha tokens expire daily at 06:00 IST.',
        Tone.profit,
      ),
      KiteTokenState.soon => (
        'Kite session ends soon',
        'Expires in ${formatCountdown(kite!.remaining!)}. Log in again to keep strategies trading.',
        Tone.warn,
      ),
      KiteTokenState.expired => (
        'Kite session expired',
        'Zerodha requires a fresh login every day. Strategies cannot place orders until you log in.',
        Tone.loss,
      ),
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: tone.bg(c),
                  borderRadius: BorderRadius.circular(AppRadius.card),
                  border: Border.all(color: tone.line(c)),
                ),
                child: Icon(Icons.bolt_rounded, color: tone.fg(c), size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Zerodha Kite · daily login', style: Theme.of(context).textTheme.titleSmall),
                    if (account != null)
                      Text('Client ${account.clientId ?? '—'}', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Notice(detail, title: headline, tone: tone),
          const SizedBox(height: 14),
          if (account != null)
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(context);
                context.push(Routes.brokerLogin(account.id));
              },
              icon: const Icon(Icons.login_rounded, size: 18),
              label: Text(kite!.connected ? 'Log in again' : 'Daily login'),
            ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () {
              Navigator.pop(context);
              context.go(Routes.brokers);
            },
            child: Text(account == null ? 'Link Zerodha account' : 'Manage broker accounts'),
          ),
        ],
      ),
    );
  }
}
