import 'package:flutter/material.dart';

import '../../home/app_chrome.dart';
import '../../home/home_shell.dart';

/// The More tab as a page (the bar's More button opens the same menu as a sheet).
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) => const TabScaffold(title: 'Menu', body: MoreMenu());
}
