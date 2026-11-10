import 'package:dio/dio.dart';

/// The backend wraps every successful response as `{ success: true, data: ... }`
/// (see the controllers in apps/auth-service). A few endpoints, such as
/// forgot-password, return `{ success, message }` with no `data`.
///
/// This is the one place the envelope is opened; feature APIs never touch it.
T unwrapData<T>(Response<dynamic> res) {
  final body = res.data;
  _checkFailure(body);
  final data = body is Map<String, dynamic> && body.containsKey('data') ? body['data'] : body;
  // Strategy engines return their own outcome inside the controller's data envelope.
  _checkFailure(data);
  return data as T;
}

void _checkFailure(dynamic body) {
  if (body is Map<String, dynamic> && body['success'] == false) {
    throw ApiException(body['message'] is String ? body['message'] as String : 'The request failed');
  }
}

/// Thrown by feature APIs for a response that was 2xx but not what we expected.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// True when the server answered the request (any HTTP status, or a 2xx failure envelope);
/// false when the outcome is unknown because no response arrived (timeout, connection lost).
bool serverAnswered(Object error) => error is ApiException || (error is DioException && error.response != null);

/// Human-readable text for any error a request can throw.
///
/// Port of apps/web/src/lib/api-error.ts: Nest validation errors arrive as a list of
/// messages, which are joined; a plain `message` string is used as is; anything else
/// gets [fallback]. Network failures get a fixed, friendlier line.
String apiErrorMessage(Object error, String fallback) {
  if (error is ApiException) return error.message;
  if (error is DioException) {
    const unreachable = {
      DioExceptionType.connectionTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.sendTimeout,
      DioExceptionType.connectionError,
    };
    if (unreachable.contains(error.type)) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
    if (error.type == DioExceptionType.badCertificate) {
      return "The secure connection to the server failed. Check the phone's date and time, then try again.";
    }
    if (error.type == DioExceptionType.unknown && error.response == null) {
      // dart:io socket / TLS errors land here (no internet, DNS failure, handshake failure).
      final cause = '${error.error}';
      if (cause.contains('Handshake') || cause.contains('CERTIFICATE')) {
        return "The secure connection to the server failed. Check the phone's date and time, then try again.";
      }
      return 'Cannot reach the server. Check your connection and try again.';
    }
    final data = error.response?.data;
    if (data is Map<String, dynamic>) {
      final message = data['message'];
      if (message is List) {
        final parts = message.whereType<String>().toList();
        if (parts.isNotEmpty) return parts.join(' · ');
      }
      if (message is String && message.isNotEmpty) return message;
    }
    // A reply without our JSON (e.g. a proxy error page): say which status, so it can be traced.
    final status = error.response?.statusCode;
    if (status != null) return '$fallback (server replied $status)';
  }
  return fallback;
}
