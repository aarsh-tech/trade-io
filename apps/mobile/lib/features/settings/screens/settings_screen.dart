import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_config.dart';
import '../../../core/network/api_envelope.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/appearance_controller.dart';
import '../../../router.dart';
import '../../../shared/widgets/risk_disclosure.dart';
import '../../../shared/widgets/ui.dart';
import '../../auth/auth_api.dart';
import '../../auth/auth_models.dart';
import '../../auth/widgets/auth_layout.dart';
import '../settings_api.dart';

/// Web /settings: Profile (name, locked email) and Security (password, 2FA), plus the phone's
/// appearance and shortcuts.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

enum _Tab { profile, security }

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  _Tab _tab = _Tab.profile;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthSignedIn ? auth.user : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: AppSpace.pageInsets,
        children: [
          const PageHeader(
            'Settings',
            subtitle: 'Manage your account settings, personal details, and two-factor authentication security',
          ),
          const SizedBox(height: 12),
          SegmentTabs<_Tab>(
            options: const [
              (value: _Tab.profile, label: 'Profile', tone: null),
              (value: _Tab.security, label: 'Security & 2FA', tone: null),
            ],
            value: _tab,
            onChanged: (t) => setState(() => _tab = t),
          ),
          const SizedBox(height: 12),
          if (user == null)
            const SizedBox.shrink()
          else if (_tab == _Tab.profile) ...[
            _ProfileCard(key: ValueKey(user.id), user: user),
            const SizedBox(height: 12),
            const _AppCard(),
          ] else ...[
            const _PasswordCard(),
            const SizedBox(height: 12),
            _TwoFaCard(user: user),
          ],
        ],
      ),
    );
  }
}

class _ProfileCard extends ConsumerStatefulWidget {
  const _ProfileCard({super.key, required this.user});
  final AppUser user;
  @override
  ConsumerState<_ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends ConsumerState<_ProfileCard> {
  late final _name = TextEditingController(text: widget.user.name);
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.length < 2) return toast(context, 'Enter your full name', error: true);
    setState(() => _busy = true);
    await runWithToast(
      context,
      () async {
        final updated = await ref.read(settingsApiProvider).updateProfile(name: name);
        ref.read(authControllerProvider.notifier).updateUser({...widget.user.toJson(), ...updated});
      },
      success: 'Profile updated',
      failure: 'Could not update profile',
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Panel(
      title: 'Profile details',
      icon: Icons.person_outline_rounded,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Update your personal information.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            enabled: !_busy,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Full name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: TextEditingController(text: widget.user.email),
            enabled: false,
            style: TextStyle(fontFamily: fontMono, fontSize: 13, color: c.mutedForeground),
            decoration: InputDecoration(
              labelText: 'Email address',
              fillColor: c.muted,
              suffixIcon: Icon(Icons.lock_outline_rounded, size: 16, color: c.mutedForeground),
              helperText: 'Your account email address cannot be changed.',
            ),
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save changes')),
          ),
        ],
      ),
    );
  }
}

class _PasswordCard extends ConsumerStatefulWidget {
  const _PasswordCard();
  @override
  ConsumerState<_PasswordCard> createState() => _PasswordCardState();
}

class _PasswordCardState extends ConsumerState<_PasswordCard> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController(), _next = TextEditingController(), _confirm = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final ok = await runWithToast(
      context,
      () => ref.read(settingsApiProvider).changePassword(currentPassword: _current.text, newPassword: _next.text),
      success: 'Password updated successfully',
      failure: 'Could not update password',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      _current.clear();
      _next.clear();
      _confirm.clear();
    }
  }

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Change password',
    icon: Icons.lock_outline_rounded,
    child: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Ensure your account is using a long, random password to stay secure.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          PasswordField(
            controller: _current,
            label: 'Current password',
            enabled: !_busy,
            validator: (v) => (v == null || v.isEmpty) ? 'Enter your current password' : null,
          ),
          const SizedBox(height: 12),
          PasswordField(
            controller: _next,
            label: 'New password',
            enabled: !_busy,
            autofillHints: const [AutofillHints.newPassword],
            validator: (v) => (v == null || v.length < 8) ? 'At least 8 characters' : null,
          ),
          const SizedBox(height: 12),
          PasswordField(
            controller: _confirm,
            label: 'Confirm password',
            enabled: !_busy,
            autofillHints: const [AutofillHints.newPassword],
            validator: (v) => v != _next.text ? 'New passwords do not match' : null,
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Updating…' : 'Update password'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _TwoFaCard extends ConsumerStatefulWidget {
  const _TwoFaCard({required this.user});
  final AppUser user;
  @override
  ConsumerState<_TwoFaCard> createState() => _TwoFaCardState();
}

class _TwoFaCardState extends ConsumerState<_TwoFaCard> {
  TwoFaSetup? _setup;
  Uint8List? _qr;
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _setUser(bool enabled) =>
      ref.read(authControllerProvider.notifier).updateUser({...widget.user.toJson(), 'twoFaEnabled': enabled});

  Future<void> _start() async {
    setState(() => _busy = true);
    try {
      final setup = await ref.read(authApiProvider).setup2fa();
      final comma = setup.qrCode.indexOf(',');
      if (mounted) {
        setState(() {
          _setup = setup;
          _qr = comma < 0 ? null : base64Decode(setup.qrCode.substring(comma + 1));
        });
      }
    } catch (e) {
      if (mounted) toast(context, apiErrorMessage(e, 'Could not start 2FA setup'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().length != 6) return toast(context, 'Enter the 6-digit code', error: true);
    setState(() => _busy = true);
    final ok = await runWithToast(
      context,
      () => ref.read(authApiProvider).verify2fa(_code.text.trim()),
      success: 'Two-factor authentication enabled',
      failure: 'Invalid code',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      setState(() => _setup = null);
      _setUser(true);
    }
  }

  Future<void> _disable() async {
    final ok = await confirmAction(
      context,
      title: 'Disable 2FA?',
      message: 'Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.',
      confirmLabel: 'Disable 2FA',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    final done = await runWithToast(
      context,
      () => ref.read(authApiProvider).disable2fa(),
      success: '2FA disabled',
      failure: 'Could not disable 2FA',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (done) _setUser(false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final theme = Theme.of(context);
    Widget body;
    if (widget.user.twoFaEnabled) {
      body = Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.profitSubtle,
          borderRadius: BorderRadius.circular(AppRadius.card),
          border: Border.all(color: c.profit.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            Icon(Icons.verified_user_outlined, color: c.profit, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('2FA is enabled', style: TextStyle(fontWeight: FontWeight.w600, color: c.profit)),
                  Text('Your account is well protected.', style: TextStyle(fontSize: 12, color: c.profit)),
                ],
              ),
            ),
            ToneButton(label: 'Disable', tone: Tone.loss, busy: _busy, onPressed: _disable),
          ],
        ),
      );
    } else if (_setup == null) {
      body = Align(
        alignment: Alignment.centerLeft,
        child: FilledButton.icon(
          onPressed: _busy ? null : _start,
          icon: const Icon(Icons.key_outlined, size: 16),
          label: Text(_busy ? 'Generating…' : 'Set up 2FA'),
        ),
      );
    } else {
      body = Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.muted.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(AppRadius.card),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('1. Add Tradeio to your authenticator app', style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
            Text(
              'On this phone, copy the setup key and paste it into Google Authenticator, Authy or similar '
              '("Enter a setup key"). On another device, scan the QR code.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.fromLTRB(10, 4, 4, 4),
              decoration: BoxDecoration(
                color: c.card,
                borderRadius: BorderRadius.circular(AppRadius.control),
                border: Border.all(color: c.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: SelectableText(
                      _setup!.secret,
                      style: const TextStyle(fontFamily: fontMono, fontSize: 13, letterSpacing: 1),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Copy setup key',
                    icon: const Icon(Icons.copy_rounded, size: 17),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: _setup!.secret));
                      toast(context, 'Setup key copied');
                    },
                  ),
                ],
              ),
            ),
            if (_qr != null) ...[
              const SizedBox(height: 10),
              Center(
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppRadius.card)),
                  child: Image.memory(_qr!, width: 150, height: 150, semanticLabel: '2FA QR code'),
                ),
              ),
            ],
            const SizedBox(height: 14),
            Text('2. Enter the 6-digit code', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            TextField(
              controller: _code,
              enabled: !_busy,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              style: const TextStyle(fontFamily: fontMono, fontSize: 20, letterSpacing: 8, fontWeight: FontWeight.w500),
              decoration: const InputDecoration(hintText: '000000'),
            ),
            const SizedBox(height: 10),
            FilledButton(onPressed: _busy ? null : _verify, child: Text(_busy ? 'Verifying…' : 'Verify & enable')),
            TextButton(onPressed: _busy ? null : () => setState(() => _setup = null), child: const Text('Cancel')),
          ],
        ),
      );
    }
    return Panel(
      title: 'Two-factor authentication',
      icon: Icons.shield_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add additional security to your account using 2FA.', style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          body,
        ],
      ),
    );
  }
}

/// Phone-only settings: appearance, shortcuts, server.
class _AppCard extends ConsumerWidget {
  const _AppCard();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    Widget link(IconData icon, String label, VoidCallback onTap) => ListTile(
      leading: Icon(icon, size: 18),
      title: Text(label),
      trailing: Icon(Icons.chevron_right_rounded, size: 18, color: c.mutedForeground),
      onTap: onTap,
    );
    return Panel(
      title: 'App',
      icon: Icons.phone_android_rounded,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Caption('Appearance'),
                const SizedBox(height: 6),
                SegmentTabs<ThemeMode>(
                  options: const [
                    (value: ThemeMode.system, label: 'Auto', tone: null),
                    (value: ThemeMode.light, label: 'Light', tone: null),
                    (value: ThemeMode.dark, label: 'Dark', tone: null),
                  ],
                  value: ref.watch(appearanceProvider),
                  onChanged: (m) => ref.read(appearanceProvider.notifier).select(m).catchError((Object _) {}),
                ),
              ],
            ),
          ),
          Divider(color: c.border),
          link(Icons.power_outlined, 'Broker accounts', () => context.go(Routes.brokers)),
          Divider(color: c.border),
          link(Icons.shield_outlined, 'Risk limits & kill switch', () => context.go(Routes.risk)),
          Divider(color: c.border),
          link(Icons.gpp_maybe_outlined, 'SEBI risk disclosure', () => showRiskDisclosure(context)),
          Divider(color: c.border),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text('Server ${AppConfig.apiOrigin}', style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}
