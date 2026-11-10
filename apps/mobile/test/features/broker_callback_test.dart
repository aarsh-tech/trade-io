import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/network/api_envelope.dart';
import 'package:tradeio_mobile/features/brokers/broker_callback.dart';

void main() {
  test('extracts the signed state and validates the exact HTTPS callback', () {
    final url = Uri.https('kite.zerodha.com', '/connect/login', {'redirect_params': 'state=signed.state'}).toString();
    expect(loginState(url), 'signed.state');
    expect(
      callbackToken(
        Uri.parse('https://tradeio.site/brokers/callback?request_token=token&state=signed.state'),
        'signed.state',
      ),
      'token',
    );
  });
  test('refuses wrong host, scheme, port, path, state and missing tokens', () {
    for (final url in [
      'http://tradeio.site/brokers/callback?request_token=t&state=s',
      'https://tradeio.site.evil.example/brokers/callback?request_token=t&state=s',
      'https://tradeio.site:444/brokers/callback?request_token=t&state=s',
      'https://tradeio.site/other?request_token=t&state=s',
      'https://tradeio.site/brokers/callback?request_token=t&state=wrong',
      'https://tradeio.site/brokers/callback?state=s',
    ]) {
      expect(() => callbackToken(Uri.parse(url), 's'), throwsA(isA<ApiException>()));
    }
  });
}
