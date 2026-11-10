import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../../core/network/api_envelope.dart';
import '../../portfolio/portfolio_providers.dart';
import '../broker_callback.dart';
import '../brokers_api.dart';
import '../brokers_providers.dart';

class BrokerLoginScreen extends ConsumerStatefulWidget {
  const BrokerLoginScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<BrokerLoginScreen> createState() => _BrokerLoginScreenState();
}

class _BrokerLoginScreenState extends ConsumerState<BrokerLoginScreen> {
  WebViewController? _controller;
  String? _error;
  bool _finishing = false;
  int _progress = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _controller = null;
      _finishing = false;
    });
    try {
      final login = await ref.read(brokersApiProvider).loginUrl(widget.id);
      final expected = loginState(login.url);
      final uri = Uri.parse(login.url);
      if (uri.scheme != 'https' || uri.host != 'kite.zerodha.com') {
        throw const ApiException('Unexpected broker login URL');
      }
      final controller = WebViewController();
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progress = p);
          },
          onNavigationRequest: (request) {
            final target = Uri.tryParse(request.url);
            if (target != null && isBrokerCallback(target)) {
              if (!_finishing && request.isMainFrame && mounted) unawaited(_finish(target, expected));
              return NavigationDecision.prevent;
            }
            return target?.scheme == 'https' ? NavigationDecision.navigate : NavigationDecision.prevent;
          },
          // Fallback: if a redirect reached the callback page without a navigation request,
          // finish from here before that page (which has no app session) does anything.
          onPageStarted: (url) {
            final target = Uri.tryParse(url);
            if (target != null && isBrokerCallback(target) && !_finishing && mounted) {
              unawaited(_finish(target, expected));
            }
          },
          onWebResourceError: (e) {
            if (e.isForMainFrame == true && mounted) {
              setState(() => _error = 'Could not load broker login. Check your connection and retry.');
            }
          },
        ),
      );
      await controller.loadRequest(uri);
      if (mounted) setState(() => _controller = controller);
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e, 'Could not open broker login'));
    }
  }

  Future<void> _finish(Uri uri, String expected) async {
    setState(() => _finishing = true);
    try {
      final token = callbackToken(uri, expected);
      await ref.read(brokersApiProvider).setSession(widget.id, token, expected);
      ref
        ..invalidate(brokersProvider)
        ..invalidate(marginsProvider(widget.id))
        ..invalidate(positionsProvider(widget.id))
        ..invalidate(holdingsProvider(widget.id));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = apiErrorMessage(e, 'Could not renew the broker session');
          _finishing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Zerodha login')),
    body:
        _error != null
            ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: _load, child: const Text('Restart login')),
                  ],
                ),
              ),
            )
            : _finishing || _controller == null
            ? const Center(child: CircularProgressIndicator())
            : Column(
              children: [
                if (_progress < 100) LinearProgressIndicator(value: _progress / 100),
                Expanded(child: WebViewWidget(controller: _controller!)),
              ],
            ),
  );
}
