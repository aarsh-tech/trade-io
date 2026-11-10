import 'package:dio/dio.dart';

/// The backend wraps every successful response as `{ success: true, data: ... }`
/// (see the controllers in apps/auth-service). A few endpoints, such as
/// forgot-password, return `{ success, message }` with no `data`.
///
/// This is the one place the envelope is opened; feature APIs never touch it.
T unwrapData<T>(Response<dynamic> res) {
  final body = res.data;
  if (body is Map<String, dynamic> && body.containsKey('data')) {
    return body['data'] as T;
  }
  return body as T;
}

/// Thrown by feature APIs for a response that was 2xx but not what we expected.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

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
    final data = error.response?.data;
    if (data is Map<String, dynamic>) {
      final message = data['message'];
      if (message is List) {
        final parts = message.whereType<String>().toList();
        if (parts.isNotEmpty) return parts.join(' · ');
      }
      if (message is String && message.isNotEmpty) return message;
    }
  }
  return fallback;
}
