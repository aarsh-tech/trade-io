import '../../core/network/api_envelope.dart';

bool isBrokerCallback(Uri uri) =>
    uri.scheme == 'https' && uri.host == 'tradeio.site' && uri.port == 443 && uri.path == '/brokers/callback';

String loginState(String url) {
  final params = Uri.parse(url).queryParameters['redirect_params'];
  final state = params == null ? null : Uri.splitQueryString(params)['state'];
  if (state == null || state.isEmpty) {
    throw const ApiException('Broker login URL is missing its state. Start login again.');
  }
  return state;
}

String callbackToken(Uri uri, String expectedState) {
  if (!isBrokerCallback(uri) || expectedState.isEmpty || uri.queryParameters['state'] != expectedState) {
    throw const ApiException('Broker login state did not match. Start login again.');
  }
  final token = uri.queryParameters['request_token'];
  if (token == null || token.isEmpty || uri.queryParameters['status'] == 'error') {
    throw const ApiException('Broker login was cancelled or failed. Start login again.');
  }
  return token;
}
