import 'package:flutter/material.dart';

/// Stands in for a screen that a later phase fills in. Lives in the feature's folder's
/// place in the router so the route, tab and title are already final.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title, required this.phase});

  final String title;
  final int phase;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.construction_outlined, size: 40, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text('$title arrives in phase $phase', style: TextStyle(color: scheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
