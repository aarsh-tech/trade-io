import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tradeio_mobile/core/network/api_envelope.dart';

DioException badResponse(Object? body, {int status = 400}) {
  final req = RequestOptions(path: '/x');
  return DioException(
    requestOptions: req,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(requestOptions: req, statusCode: status, data: body),
  );
}

void main() {
  group('unwrapData', () {
    test('opens the { success, data } envelope', () {
      final res = Response<dynamic>(
        requestOptions: RequestOptions(path: '/x'),
        data: {
          'success': true,
          'data': {'id': '1'},
        },
      );
      expect(unwrapData<Map<String, dynamic>>(res), {'id': '1'});
    });
    test('passes a body without data through', () {
      final res = Response<dynamic>(
        requestOptions: RequestOptions(path: '/x'),
        data: {'success': true, 'message': 'sent'},
      );
      expect(unwrapData<Map<String, dynamic>>(res)['message'], 'sent');
    });
  });

  group('apiErrorMessage', () {
    test('joins Nest validation messages', () {
      final err = badResponse({
        'message': ['email must be an email', 'password should not be empty'],
        'statusCode': 400,
      });
      expect(apiErrorMessage(err, 'fallback'), 'email must be an email · password should not be empty');
    });
    test('uses a plain message string', () {
      expect(
        apiErrorMessage(badResponse({'message': 'Invalid credentials'}, status: 401), 'fallback'),
        'Invalid credentials',
      );
    });
    test('falls back when the body has no message', () {
      expect(
        apiErrorMessage(badResponse('<html>502</html>', status: 502), 'Login failed'),
        'Login failed (server replied 502)',
      );
      expect(apiErrorMessage(StateError('x'), 'Login failed'), 'Login failed');
    });
    test('names an unreachable server', () {
      final err = DioException(requestOptions: RequestOptions(path: '/x'), type: DioExceptionType.connectionError);
      expect(apiErrorMessage(err, 'fallback'), contains('Cannot reach the server'));
    });
    test('names a socket error with no response as unreachable', () {
      final err = DioException(
        requestOptions: RequestOptions(path: '/x'),
        error: 'SocketException: Failed host lookup',
      );
      expect(apiErrorMessage(err, 'fallback'), contains('Cannot reach the server'));
    });
    test('names a TLS failure', () {
      final err = DioException(
        requestOptions: RequestOptions(path: '/x'),
        error: 'HandshakeException: CERTIFICATE_VERIFY_FAILED',
      );
      expect(apiErrorMessage(err, 'fallback'), contains('secure connection'));
    });
    test('ApiException carries its own message', () {
      expect(apiErrorMessage(const ApiException('Unexpected login response'), 'fallback'), 'Unexpected login response');
    });
  });
}
