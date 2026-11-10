import 'package:flutter/material.dart';

import '../../router.dart';

/// One source for the bottom bar and the More sheet, in the web's order
/// (apps/web/src/components/layout/nav-config.ts).
class NavItem {
  const NavItem(this.route, this.label, this.icon, {this.live = false, this.hint});
  final String route;
  final String label;
  final IconData icon;
  final bool live;
  final String? hint;
}

class NavGroup {
  const NavGroup(this.title, this.items);
  final String title;
  final List<NavItem> items;
}

/// Bottom tabs, same as the web's MOBILE_PRIMARY_HREFS; the 5th tab opens the More sheet.
const primaryNav = [
  NavItem(Routes.dashboard, 'Dashboard', Icons.space_dashboard_outlined),
  NavItem(Routes.strategies, 'Strategies', Icons.trending_up_rounded),
  NavItem(Routes.positions, 'Positions', Icons.show_chart_rounded),
  NavItem(Routes.orders, 'Orders', Icons.receipt_long_outlined),
];

/// Everything else, grouped like the web sidebar.
const moreNav = [
  NavGroup('Trade', [
    NavItem(Routes.portfolio, 'Portfolio', Icons.account_balance_wallet_outlined, hint: 'Holdings, funds & positions'),
  ]),
  NavGroup('Automate', [
    NavItem(Routes.brokers, 'Brokers', Icons.power_outlined, hint: 'Zerodha accounts & daily login'),
    NavItem(Routes.risk, 'Risk & kill switch', Icons.shield_outlined, hint: 'Loss limits & emergency stop'),
  ]),
  NavGroup('Discover', [
    NavItem(Routes.screener, 'OHL Screener', Icons.manage_search_rounded, live: true),
    NavItem(Routes.moveAlerts, 'Move Alerts', Icons.notifications_active_outlined, live: true),
    NavItem(Routes.swing, 'Swing Scanner', Icons.layers_outlined),
    NavItem(Routes.picks, 'Intraday Picks', Icons.bolt_outlined),
  ]),
  NavGroup('Reports', [
    NavItem(Routes.ledger, 'P&L Ledger', Icons.menu_book_outlined),
    NavItem(Routes.settings, 'Settings', Icons.settings_outlined),
  ]),
];
