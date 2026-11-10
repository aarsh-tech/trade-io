import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../router.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../portfolio/holdings_summary.dart';
import '../../portfolio/portfolio_models.dart';
import '../../portfolio/portfolio_providers.dart';

/// The web dashboard's three funds cards: equity, commodity, holdings.
class FundsCards extends ConsumerWidget {
  const FundsCards({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final id = ref.watch(activeBrokerProvider).value?.id;
    final margins = id == null ? null : ref.watch(marginsProvider(id)).value;
    final holdings = id == null ? null : ref.watch(holdingsProvider(id));
    final h = HoldingsSummary.of(holdings?.value ?? const <Holding>[]);
    final hasHoldings = holdings?.hasValue == true && h.count > 0;

    Widget card({
      required IconData icon,
      required String title,
      required String link,
      required String primaryLabel,
      required Widget primary,
      required List<(String, String)> rows,
    }) => Panel(
      title: title,
      icon: icon,
      trailing: PanelLink(link, onTap: () => context.go(Routes.portfolio)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Caption(primaryLabel),
          const SizedBox(height: 2),
          DefaultTextStyle.merge(
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, letterSpacing: -0.2),
            child: primary,
          ),
          const SizedBox(height: 10),
          Divider(color: c.border),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final (i, r) in rows.indexed) ...[
                if (i > 0) const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Caption(r.$1),
                      Text(r.$2, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );

    final eq = margins?.equity, co = margins?.commodity;
    double? avail(MarginSegment? s) => s == null ? null : (s.available?.liveBalance ?? s.available?.cash ?? s.net ?? 0);
    return Column(
      children: [
        card(
          icon: Icons.grid_view_rounded,
          title: 'Equity',
          link: 'Funds',
          primaryLabel: 'Margin available',
          primary: Text(formatInr(margins == null ? null : avail(eq))),
          rows: [
            ('Margin used', formatInr(margins == null ? null : (eq?.utilised?.debits ?? 0))),
            ('Opening balance', formatInr(margins == null ? null : (eq?.available?.openingBalance ?? avail(eq)))),
          ],
        ),
        const SizedBox(height: AppSpace.gap),
        card(
          icon: Icons.history_rounded,
          title: 'Commodity',
          link: 'Funds',
          primaryLabel: 'Margin available',
          primary: Text(formatInr(margins == null ? null : avail(co))),
          rows: [
            ('Margin used', formatInr(margins == null ? null : (co?.utilised?.debits ?? 0))),
            ('Opening balance', formatInr(margins == null ? null : (co?.available?.openingBalance ?? avail(co)))),
          ],
        ),
        const SizedBox(height: AppSpace.gap),
        card(
          icon: Icons.pie_chart_outline_rounded,
          title: holdings?.hasValue == true ? 'Holdings (${h.count})' : 'Holdings',
          link: 'Portfolio',
          primaryLabel: 'Unrealised P&L',
          primary:
              hasHoldings
                  ? Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: formatInr(h.pnl, signed: true), style: TextStyle(color: c.pnl(h.pnl))),
                        TextSpan(
                          text: '  ${formatPct(h.pnlPct)}',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.pnl(h.pnl)),
                        ),
                      ],
                    ),
                  )
                  : const Text(empty),
          rows: [
            ('Current value', hasHoldings ? formatInr(h.current) : empty),
            ('Invested', hasHoldings ? formatInr(h.invested) : empty),
          ],
        ),
      ],
    );
  }
}
