import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'ui.dart';

/// SEBI risk disclosure on derivatives (same text as apps/web/.../risk-disclosure-modal.tsx).
Future<void> showRiskDisclosure(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => const _RiskDisclosure(),
);

class _RiskDisclosure extends StatelessWidget {
  const _RiskDisclosure();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final theme = Theme.of(context);
    Widget stat(String value, String label, String note) => Expanded(
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: c.lossSubtle,
          borderRadius: BorderRadius.circular(AppRadius.control),
          border: Border.all(color: c.loss.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.loss)),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: c.foreground),
            ),
            Text(note, textAlign: TextAlign.center, style: TextStyle(fontSize: 9.5, color: c.mutedForeground)),
          ],
        ),
      ),
    );
    Widget bullet(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 7, right: 8), child: Dot(c.mutedForeground, size: 4)),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5, height: 1.45))),
        ],
      ),
    );
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder:
          (context, scroll) => ListView(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              Row(
                children: [
                  Icon(Icons.shield_outlined, color: c.warn, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Pill('SEBI mandated disclosure', tone: Tone.warn),
                        const SizedBox(height: 4),
                        Text('Risk disclosures on derivatives', style: theme.textTheme.titleMedium),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  stat('9 / 10', 'Loss makers', '~93% F&O retail traders'),
                  const SizedBox(width: 6),
                  stat('₹50,000+', 'Avg net loss', 'Up to ₹1.1L in 3-yr study'),
                  const SizedBox(width: 6),
                  stat('28%', 'Trading costs', 'Over and above losses'),
                ],
              ),
              const SizedBox(height: 14),
              Text('Official SEBI study findings', style: theme.textTheme.titleSmall),
              const SizedBox(height: 6),
              bullet('9 out of 10 individual traders in equity Futures and Options (F&O) Segment incurred net losses.'),
              bullet(
                'On an average, loss makers registered net trading loss close to ₹50,000. Over 3-year aggregated SEBI data, average net loss per individual trader exceeded ₹1,10,000.',
              ),
              bullet(
                'Over and above the net trading losses incurred, loss makers expended an additional 28% of net trading losses as transaction costs (brokerage, exchange turnover charges, and STT).',
              ),
              bullet(
                'Those making net trading profits incurred between 15% to 50% of such profits as transaction costs.',
              ),
              Text(
                'Source: SEBI study on "Analysis of Profit and Loss of Individual Traders dealing in equity Futures and Options (F&O) Segment".',
                style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
              ),
              const SizedBox(height: 14),
              Text('Algorithmic execution & system notice', style: theme.textTheme.titleSmall),
              const SizedBox(height: 6),
              bullet(
                'Automated order routing: algorithmic strategies place market/limit orders via broker APIs based on pre-set triggers. Execution may be subject to network latency, market volatility, or exchange rate throttling.',
              ),
              bullet(
                'No guaranteed returns: past performance, simulated paper trading, and backtest metrics do not guarantee future profitability.',
              ),
              bullet(
                'Capital discipline: derivative trading involves substantial financial risk. Never trade with borrowed funds or capital you cannot afford to lose. Always configure strictly enforced stop-loss limits.',
              ),
              const SizedBox(height: 12),
              FilledButton(onPressed: () => Navigator.pop(context), child: const Text('I understand')),
            ],
          ),
    );
  }
}
