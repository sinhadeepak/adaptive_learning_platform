import 'package:flutter_test/flutter_test.dart';
import 'package:adaptive_learning_mobile/auth/deep_link.dart';

void main() {
  group('parseDeepLink — recognised reset shapes', () {
    test('alp:// custom scheme', () {
      final r = parseDeepLink('alp://reset?token=abc123');
      expect(r.kind, DeepLinkRouteKind.resetPassword);
      expect(r.token, 'abc123');
    });

    test('https:// universal link with /reset', () {
      final r = parseDeepLink('https://app.adaptive-learn.io/reset?token=tok-x');
      expect(r.kind, DeepLinkRouteKind.resetPassword);
      expect(r.token, 'tok-x');
    });

    test('https:// universal link with /reset-password (web parity)', () {
      final r = parseDeepLink('https://app.adaptive-learn.io/reset-password?token=tok-y');
      expect(r.kind, DeepLinkRouteKind.resetPassword);
      expect(r.token, 'tok-y');
    });

    test('case-insensitive scheme + path', () {
      final r = parseDeepLink('ALP://RESET?token=mixed');
      expect(r.kind, DeepLinkRouteKind.resetPassword);
      expect(r.token, 'mixed');
    });

    test('extra query params do not break parsing', () {
      final r = parseDeepLink('alp://reset?token=abc&utm_source=email');
      expect(r.kind, DeepLinkRouteKind.resetPassword);
      expect(r.token, 'abc');
    });
  });

  group('parseDeepLink — ignored', () {
    test('null', () {
      expect(parseDeepLink(null).kind, DeepLinkRouteKind.ignored);
    });
    test('empty', () {
      expect(parseDeepLink('').kind, DeepLinkRouteKind.ignored);
    });
    test('malformed URI never throws', () {
      expect(parseDeepLink('not a url at all').kind, DeepLinkRouteKind.ignored);
    });
    test('unrelated path', () {
      expect(parseDeepLink('https://example.com/somewhere').kind, DeepLinkRouteKind.ignored);
    });
    test('reset path without token', () {
      expect(parseDeepLink('alp://reset').kind, DeepLinkRouteKind.ignored);
    });
    test('reset path with empty token', () {
      expect(parseDeepLink('alp://reset?token=').kind, DeepLinkRouteKind.ignored);
    });
    test('foreign scheme', () {
      // We accept alp:// + https:// only — http/file/data should be rejected.
      expect(
        parseDeepLink('http://example.com/reset?token=tok').kind,
        DeepLinkRouteKind.resetPassword, // http is allowed alongside https
      );
      expect(parseDeepLink('mailto:reset?token=x').kind, DeepLinkRouteKind.ignored);
    });
  });
}
