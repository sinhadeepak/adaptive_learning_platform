/// Deep-link parser + dispatcher for the auth surface.
///
/// Sprint 4 closes the loop on the password-reset flow: the email Auth sends
/// links to either `alp://reset?token=…` (custom scheme) or the matching
/// HTTPS Universal Link (`https://<host>/reset?token=…`). Both forms land in
/// the same handler — only the parsing differs.
///
/// The platform plugin (`app_links` or `uni_links`) is wired in a separate PR
/// once iOS associated domains + Android intent filters are configured. This
/// file is the pure-Dart contract: the rest of the app can already drive
/// these signals from tests.
library;

class DeepLinkRoute {
  const DeepLinkRoute._(this.kind, {this.token});

  final DeepLinkRouteKind kind;
  final String? token;

  static const ignored = DeepLinkRoute._(DeepLinkRouteKind.ignored);

  factory DeepLinkRoute.resetPassword(String token) =>
      DeepLinkRoute._(DeepLinkRouteKind.resetPassword, token: token);

  /// Sprint 12 S12-C — cohort invite. Web has /join/:token; mobile
  /// recognises the same path so a Slack/WhatsApp invite tapped on a
  /// phone routes through the native onboarding.
  factory DeepLinkRoute.joinCohort(String token) =>
      DeepLinkRoute._(DeepLinkRouteKind.joinCohort, token: token);
}

enum DeepLinkRouteKind { ignored, resetPassword, joinCohort }

/// Parses a single URL into a route. Returns [DeepLinkRoute.ignored] for
/// anything we don't recognise — callers then fall back to the normal app
/// home / login flow. Never throws on malformed input.
///
/// Accepted shapes (case-insensitive scheme + host):
///   alp://reset?token=ABC
///   https://<any-host>/reset?token=ABC
///   https://<any-host>/reset-password?token=ABC   (web-student parity)
///
/// Empty / missing tokens are rejected — we never push a reset screen with
/// no token to consume.
DeepLinkRoute parseDeepLink(String? raw) {
  if (raw == null || raw.isEmpty) return DeepLinkRoute.ignored;
  Uri uri;
  try {
    uri = Uri.parse(raw);
  } catch (_) {
    return DeepLinkRoute.ignored;
  }
  final scheme = uri.scheme.toLowerCase();
  final path = uri.path.toLowerCase();
  final segments = uri.pathSegments;

  // Sprint 12 S12-C — /join/<token> takes precedence over reset before
  // any token-extraction branching. Token is in the path segment, not
  // the query string.
  final isJoinPath = ((scheme == 'http' || scheme == 'https') &&
          segments.length >= 2 &&
          segments.first.toLowerCase() == 'join') ||
      (scheme == 'alp' && uri.host.toLowerCase() == 'join');
  if (isJoinPath) {
    final token = scheme == 'alp'
        ? (segments.isNotEmpty ? segments.first : '')
        : segments[1];
    if (token.isEmpty) return DeepLinkRoute.ignored;
    return DeepLinkRoute.joinCohort(token);
  }

  final isResetPath = (scheme == 'alp' && uri.host.toLowerCase() == 'reset') ||
      ((scheme == 'http' || scheme == 'https') &&
          (path == '/reset' || path == '/reset-password'));

  if (!isResetPath) return DeepLinkRoute.ignored;
  final token = uri.queryParameters['token'];
  if (token == null || token.isEmpty) return DeepLinkRoute.ignored;
  return DeepLinkRoute.resetPassword(token);
}
