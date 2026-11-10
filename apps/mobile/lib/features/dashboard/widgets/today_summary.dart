import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/pnl_text.dart';
import '../../brokers/brokers_providers.dart';
import '../../orders/orders_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../risk/risk_providers.dart';
import '../../strategies/strategies_providers.dart';

/// The four tiles at the top of the dashboard. Port of the web's TodaySummary.
class TodaySummary extends ConsumerWidget {
  const TodaySummary({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final realised = ref.watch(dayPnlProvider).value;
    final risk = ref.watch(riskStatusProvider).value;
    final strategies = ref.watch(strategiesProvider).value ?? const [];
    final brokerId = ref.watch(activeBrokerProvider).value?.id;
    final margins = brokerId == null ? null : ref.watch(marginsProvider(brokerId)).value;

    final unrealised = risk?.unrealizedPnl;
    final total = realised != null && unrealised != null ? realised.realizedPnl + unrealised : null;
    final running = strategies.where((s) => s.isActive).toList();
    final lossPct = risk?.lossUsagePct ?? 0;
    final level = lossPct >= 80 ? 'Critical' : (lossPct >= 50 ? 'Elevated' : 'Normal');
    final colors = context.colors;
    final barTone = lossPct >= 80 ? colors.loss : (lossPct >= 50 ? colors.warn : colors.profit);
    final theme = Theme.of(context);
    final big = theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount:
              MediaQuery.sizeOf(context).width < 400 || MediaQuery.textScalerOf(context).scale(1) > 1.1 ? 1 : 2,
          mainAxisExtent: 180,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
        ),
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          _Tile(
            icon: Icons.currency_rupee,
            label: 'Day P&L (net)',
            value: PnlText(total, style: big),
            footer:
                realised == null
                    ? null
                    : _Rows([
                      ('Realised', formatInr(realised.realizedPnl, signed: true)),
                      ('Unrealised', unrealised == null ? empty : formatInr(unrealised, signed: true)),
                    ]),
          ),
          _Tile(
            icon: Icons.speed_outlined,
            label: 'Daily loss limit',
            value: Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(risk == null ? empty : '${lossPct.toStringAsFixed(0)}%', style: tabular(big)),
                if (risk != null) ...[
                  const SizedBox(width: 6),
                  Text(
                    level,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
                if (risk?.killSwitchActive ?? false) ...[
                  const SizedBox(width: 6),
                  Icon(Icons.report, size: 16, color: colors.loss, semanticLabel: 'Kill switch active'),
                ],
              ],
            ),
            footer: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(
                    value: (lossPct / 100).clamp(0, 1).toDouble(),
                    minHeight: 5,
                    backgroundColor: colors.muted,
                    color: barTone,
                  ),
                ),
                if (risk != null) ...[
                  const SizedBox(height: 6),
                  _Rows([('Limit', formatInr(risk.maxDailyLoss, decimals: 0))]),
                ],
              ],
            ),
          ),
          _Tile(
            icon: Icons.account_balance_wallet_outlined,
            label: 'Equity funds',
            value: Text(margins == null ? empty : formatInr(margins.equityAvailable), style: tabular(big)),
            footer: _Rows([('Used', margins == null ? empty : formatInr(margins.equityUsed ?? 0))]),
          ),
          _Tile(
            icon: Icons.memory_outlined,
            label: 'Running strategies',
            value: Text('${running.length}', style: tabular(big)),
            footer:
                running.isEmpty
                    ? Text('None running', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant))
                    : Text(
                      running.take(2).map((s) => s.name).join(', ') +
                          (running.length > 2 ? ' +${running.length - 2}' : ''),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12),
                    ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.value, this.footer});

  final IconData icon;
  final String label;
  final Widget value;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 13, color: muted),
                const SizedBox(width: 5),
                Expanded(child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: muted))),
              ],
            ),
            const SizedBox(height: 4),
            FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: value),
            if (footer != null) ...[const Spacer(), footer!],
          ],
        ),
      ),
    );
  }
}

class _Rows extends StatelessWidget {
  const _Rows(this.rows);

  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Column(
      children: [
        for (final (label, value) in rows)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(child: Text(label, style: muted)),
              Flexible(child: Text(value, style: tabular(const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)))),
            ],
          ),
      ],
    );
  }
}
