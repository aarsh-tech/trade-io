import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/socket/market_socket.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/appearance_controller.dart';
import '../../shared/widgets/risk_disclosure.dart';
import '../../shared/widgets/ui.dart';
import '../market/market_models.dart';
import 'nav_config.dart';

/// Bottom tabs like the web on a phone: Dashboard, Strategies, Positions, Orders, More.
/// Each tab is a go_router branch with its own stack; "More" opens the grouped menu sheet and
/// its pages live in the fifth branch, so the bar stays visible on every page.
///
/// Also keeps the market socket alive while signed in and turns order postbacks into toasts
/// (same as the web's MarketSocketProvider).
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _toastOrderUpdate(BuildContext context, OrderUpdate o) {
    final label = '${o.transactionType ?? ''} ${o.tradingsymbol ?? ''}'.trim();
    final String? text = switch (o.status) {
      'COMPLETE' => 'Order filled: $label (${o.filledQuantity ?? o.quantity ?? ''})',
      'REJECTED' => 'Order rejected: $label${o.statusMessage == null ? '' : ' - ${o.statusMessage}'}',
      _ => null,
    };
    if (text != null) toast(context, text, error: o.status == 'REJECTED');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref
      ..listen(marketSocketProvider.select((s) => s.connected), (_, __) {})
      ..listen(orderUpdateStreamProvider, (_, next) => next.whenData((o) => _toastOrderUpdate(context, o)));
    return Scaffold(
      body: shell,
      bottomNavigationBar: BottomBar(
        index: shell.currentIndex,
        onTab: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        onMore: () => showMoreSheet(context),
      ),
    );
  }
}

class BottomBar extends StatelessWidget {
  const BottomBar({super.key, required this.index, required this.onTab, required this.onMore});

  final int index;
  final ValueChanged<int> onTab;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget tab({required IconData icon, required String label, required bool active, required VoidCallback onTap}) =>
        Expanded(
          child: InkResponse(
            onTap: onTap,
            highlightShape: BoxShape.rectangle,
            child: Stack(
              alignment: Alignment.center,
              children: [
                if (active)
                  Positioned(
                    top: 0,
                    child: Container(
                      width: 32,
                      height: 2,
                      decoration: BoxDecoration(
                        color: c.primary,
                        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(2)),
                      ),
                    ),
                  ),
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon, size: 21, color: active ? c.accentForeground : c.mutedForeground),
                    const SizedBox(height: 2),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                        color: active ? c.accentForeground : c.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
    return Container(
      decoration: BoxDecoration(color: c.popover, border: Border(top: BorderSide(color: c.border))),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 56,
          child: Row(
            children: [
              for (final (i, item) in primaryNav.indexed)
                tab(icon: item.icon, label: item.label, active: index == i, onTap: () => onTab(i)),
              tab(icon: Icons.menu_rounded, label: 'More', active: index == primaryNav.length, onTap: onMore),
            ],
          ),
        ),
      ),
    );
  }
}

/// The web's "More" bottom sheet: account card, grouped pages, theme switch, disclosure, logout.
Future<void> showMoreSheet(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => const MoreMenu(sheet: true),
);

class MoreMenu extends ConsumerWidget {
  const MoreMenu({super.key, this.sheet = false});

  /// Inside the bottom sheet (closes itself on navigation) vs. the More page.
  final bool sheet;

  void _open(BuildContext context, String route) {
    final router = GoRouter.of(context);
    if (sheet) Navigator.pop(context);
    router.go(route);
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final notifier = ref.read(authControllerProvider.notifier);
    if (sheet) Navigator.pop(context);
    final ok = await confirmAction(
      context,
      title: 'Confirm logout',
      message: 'Running strategies keep running on the server. You will need to sign in again.',
      confirmLabel: 'Logout',
      destructive: true,
    );
    if (ok) await notifier.signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthSignedIn ? auth.user : null;
    final location = GoRouter.maybeOf(context)?.routerDelegate.currentConfiguration.uri.path ?? '';
    final mode = ref.watch(appearanceProvider);

    final list = ListView(
      shrinkWrap: sheet,
      padding: EdgeInsets.fromLTRB(16, sheet ? 0 : 12, 16, 20),
      children: [
        if (user != null)
          Card(
            child: InkWell(
              onTap: () => _open(context, moreNav.last.items.last.route),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: c.brandSubtle,
                      child: Text(
                        user.name.isEmpty ? 'U' : user.name[0].toUpperCase(),
                        style: TextStyle(fontWeight: FontWeight.w600, color: c.accentForeground),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                          Text(
                            user.email,
                            style: Theme.of(context).textTheme.bodySmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: c.mutedForeground),
                  ],
                ),
              ),
            ),
          ),
        for (final group in moreNav) ...[
          const SizedBox(height: 16),
          GroupLabel(group.title),
          Card(
            child: Column(
              children: [
                for (final (i, item) in group.items.indexed) ...[
                  if (i > 0) Divider(color: c.border),
                  _MenuRow(
                    item: item,
                    active: location.startsWith(item.route),
                    onTap: () => _open(context, item.route),
                  ),
                ],
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        const GroupLabel('Appearance'),
        SegmentTabs<ThemeMode>(
          options: const [
            (value: ThemeMode.system, label: 'Auto', tone: null),
            (value: ThemeMode.light, label: 'Light', tone: null),
            (value: ThemeMode.dark, label: 'Dark', tone: null),
          ],
          value: mode,
          onChanged: (m) => ref.read(appearanceProvider.notifier).select(m).catchError((Object _) {}),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: ToneButton(
                label: 'Risk disclosure',
                icon: Icons.shield_outlined,
                tone: Tone.warn,
                height: 40,
                expand: true,
                onPressed: () {
                  if (sheet) Navigator.pop(context);
                  showRiskDisclosure(context);
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ToneButton(
                label: 'Logout',
                icon: Icons.logout_rounded,
                tone: Tone.loss,
                height: 40,
                expand: true,
                onPressed: () => _signOut(context, ref),
              ),
            ),
          ],
        ),
      ],
    );
    if (!sheet) return list;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 8, 4),
            child: Row(
              children: [
                Expanded(child: Text('Menu', style: Theme.of(context).textTheme.titleSmall)),
                IconButton(
                  tooltip: 'Close menu',
                  icon: const Icon(Icons.close_rounded, size: 18),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Flexible(child: list),
        ],
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.item, required this.active, required this.onTap});
  final NavItem item;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: active ? c.brandSubtle : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          height: 46,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Icon(item.icon, size: 18, color: active ? c.accentForeground : c.mutedForeground),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item.label,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                      color: active ? c.accentForeground : c.foreground,
                    ),
                  ),
                ),
                if (item.live) ...[
                  Dot(c.profit, size: 6),
                  const SizedBox(width: 4),
                  Text('LIVE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: c.profit)),
                  const SizedBox(width: 6),
                ],
                Icon(Icons.chevron_right_rounded, size: 18, color: c.mutedForeground.withValues(alpha: 0.6)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
