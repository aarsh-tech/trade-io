import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/ui.dart';
import '../../brokers/brokers_providers.dart';
import '../../portfolio/portfolio_providers.dart';
import '../dashboard_providers.dart';

/// The web's TodaySummary: day P&L (net) with its breakdown, daily loss limit, equity funds.
class TodaySummary extends ConsumerWidget {
  const TodaySummary({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final day = ref.watch(dayTotalsProvider);
    final realised = day.realised;
    final risk = day.risk;
    final brokerId = ref.watch(activeBrokerProvider).value?.id;
    final margins = brokerId == null ? null : ref.watch(marginsProvider(brokerId)).value;
    final lossTone =
        day.lossPct >= 80
            ? c.loss
            : day.lossPct >= 50
            ? c.warn
            : c.profit;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StatTile(
          label: 'Day P&L (net)',
          icon: Icons.currency_rupee_rounded,
          value: Text(
            formatInr(day.total, signed: true),
            style: TextStyle(fontSize: 22, color: day.total == null ? c.mutedForeground : c.pnl(day.total!)),
          ),
          footer: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: KV(
                      'Realised',
                      formatInr(realised?.realizedPnl, signed: true),
                      color: realised == null ? null : c.pnl(realised.realizedPnl),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: KV(
                      'Unrealised',
                      formatInr(day.unrealised, signed: true),
                      color: day.unrealised == null ? null : c.pnl(day.unrealised!),
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(child: KV('Charges', formatInr(realised?.charges))),
                  const SizedBox(width: 16),
                  Expanded(child: KV('Trades', realised == null ? empty : '${realised.trades}')),
                ],
              ),
              KV(
                'Algo / Manual',
                realised == null
                    ? empty
                    : '${formatInr(realised.algoPnl, signed: true)} / ${formatInr(realised.manualPnl, signed: true)}',
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.gap),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: StatTile(
                  label: 'Daily loss limit',
                  icon: Icons.speed_rounded,
                  value: Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(risk == null ? empty : '${day.lossPct.toStringAsFixed(0)}%'),
                      const SizedBox(width: 6),
                      if (risk != null)
                        Flexible(
                          child: Text(
                            day.lossLevel,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.mutedForeground),
                          ),
                        ),
                    ],
                  ),
                  footer: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Meter(day.lossPct / 100, color: lossTone),
                      const SizedBox(height: 6),
                      KV('Limit', formatInr(risk?.maxDailyLoss, decimals: 0)),
                      KV(
                        'Kill switch',
                        risk == null ? empty : (risk.killSwitchActive ? 'ACTIVE' : 'Off'),
                        color: (risk?.killSwitchActive ?? false) ? c.loss : null,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: AppSpace.gap),
              Expanded(
                child: StatTile(
                  label: 'Equity funds',
                  icon: Icons.account_balance_wallet_outlined,
                  value: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(formatInr(margins?.equityAvailable)),
                  ),
                  footer: Column(
                    children: [
                      KV('Used', formatInr(margins?.equityUsed)),
                      KV('Opening', formatInr(margins?.equity?.available?.openingBalance ?? margins?.equityAvailable)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
