import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/ui.dart';
import '../../portfolio/live_pnl.dart';
import '../algo_positions.dart';
import '../instrument_name.dart';

/// One position, Kite style, in two dense lines:
///   [MIS] RELIANCE NSE ●                     +1,250.00
///   100 × 2,400.00                 LTP 2,412.50  +0.52%   [Exit]
class PositionRow extends StatelessWidget {
  const PositionRow({super.key, required this.row, this.onExit, this.busy = false});

  final LivePosition row;
  final VoidCallback? onExit;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = row.position;
    final productTone = switch (p.product) {
      'MIS' => Tone.brand,
      paperProduct => Tone.warn,
      _ => Tone.signal,
    };
    final pnlColor = c.pnl(row.pnl);
    const num = [FontFeature.tabularFigures()];
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Pill(p.product, tone: productTone),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        kiteInstrumentName(p.symbol),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(exchangeOf(p), style: TextStyle(fontSize: 10, color: c.mutedForeground)),
                    if (row.hasLiveTick) ...[const SizedBox(width: 4), Dot(c.profit, size: 5)],
                  ],
                ),
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(
                    style: TextStyle(fontSize: 11.5, color: c.mutedForeground, fontFeatures: num),
                    children: [
                      TextSpan(
                        text: row.isOpen ? '${p.qty > 0 ? '+' : ''}${p.qty}' : '0',
                        style: TextStyle(fontWeight: FontWeight.w600, color: c.accentForeground),
                      ),
                      TextSpan(text: ' × ${formatPrice(p.avgPrice)}'),
                      const TextSpan(text: '   LTP '),
                      TextSpan(
                        text: formatPrice(row.ltp),
                        style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatPrice(row.pnl, signed: true),
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: pnlColor, fontFeatures: num),
              ),
              const SizedBox(height: 2),
              Text(
                row.isOpen ? formatPct(row.pnlPct) : 'Closed',
                style: TextStyle(
                  fontSize: 11,
                  color: row.isOpen ? c.pnl(row.pnlPct) : c.mutedForeground,
                  fontFeatures: num,
                ),
              ),
            ],
          ),
          if (onExit != null && row.isOpen) ...[
            const SizedBox(width: 8),
            ToneButton(label: 'Exit', tone: Tone.loss, height: 30, busy: busy, onPressed: onExit),
          ],
        ],
      ),
    );
  }
}
