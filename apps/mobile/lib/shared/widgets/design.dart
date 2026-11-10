import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// The Tradeio mark: the web favicon's white bolt on a blue diagonal gradient tile
/// (apps/web/src/app/icon.svg). Same drawing as the launcher icon and the native splash,
/// so the app opens without the logo changing shape.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44});
  final double size;
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Tradeio',
    image: true,
    child: SizedBox.square(dimension: size, child: const CustomPaint(painter: _BrandMarkPainter())),
  );
}

class _BrandMarkPainter extends CustomPainter {
  const _BrandMarkPainter();

  // Same stops and path as the web icon, in its 64 x 64 viewBox.
  static const _gradient = [Color(0xff2563EB), Color(0xff3B82F6), Color(0xff1D4ED8)];
  static const _bolt = [Offset(35, 11), Offset(18, 34), Offset(33, 34), Offset(29, 53), Offset(48, 29), Offset(33, 29)];

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 64;
    final tile = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(16 * scale));
    canvas.drawRRect(
      tile,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: _gradient,
          stops: [0, 0.5, 1],
        ).createShader(Offset.zero & size),
    );
    // Optical centre: shift the bolt left by one unit, as the launcher icon does.
    final bolt = Path()..addPolygon([for (final p in _bolt) (p - const Offset(1, 0)) * scale], true);
    canvas.drawShadow(bolt, const Color(0xff0F172A), 2 * scale, false);
    canvas.drawPath(bolt, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(_BrandMarkPainter oldDelegate) => false;
}

class ToneIcon extends StatelessWidget {
  const ToneIcon(this.icon, {super.key, this.color, this.size = 32});
  final IconData icon;
  final Color? color;
  final double size;
  @override
  Widget build(BuildContext context) {
    final tone = color ?? context.colors.accentForeground;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppRadius.control),
        border: Border.all(color: tone.withValues(alpha: 0.25)),
      ),
      child: Icon(icon, size: size * 0.5, color: tone),
    );
  }
}

class SectionHeading extends StatelessWidget {
  const SectionHeading(this.title, {super.key, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 14)),
              if (subtitle != null) ...[
                const SizedBox(height: 1),
                Text(subtitle!, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11.5)),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    ),
  );
}

class InfoNote extends StatelessWidget {
  const InfoNote(this.message, {super.key, this.icon = Icons.info_outline_rounded});
  final String message;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: context.colors.muted.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(AppRadius.card),
      border: Border.all(color: context.colors.border),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: context.colors.mutedForeground),
        const SizedBox(width: 8),
        Expanded(child: Text(message, style: Theme.of(context).textTheme.bodySmall)),
      ],
    ),
  );
}
