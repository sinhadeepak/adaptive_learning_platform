// content_language_helper.dart
//
// Mirrors apps/web-student/src/lib/session-start.ts
//
// Reads the student's preferred content (question) language and returns the
// `language` field fragment to inject into POST /quiz/sessions/start bodies.
//
// To avoid a /profile/me round-trip on every practice start, the value is
// cached in memory for the lifetime of the process. The cache is cold-started
// on first use and stays warm across sessions within the same app run.

import '../api/api_client.dart';

String? _cached; // null = unknown, '' or a code = fetched value
bool _fetched = false;

/// Returns the student's contentLanguage preference by fetching /profile/me
/// at most once per app session. Returns null when not set or on error
/// (callers should omit the `language` key silently in that case).
Future<String?> getContentLanguage(ApiClient api) async {
  if (_fetched) return _cached;
  try {
    final profile = await api.getProfile();
    final lang = profile?.contentLanguage;
    // 'en' is the default — treat it the same as any other value so the
    // backend can enforce its own English-is-default short-circuit.
    _cached = (lang != null && lang.isNotEmpty) ? lang : null;
  } catch (_) {
    _cached = null;
  }
  _fetched = true;
  return _cached;
}

/// Warm the cache without waiting for the result. Call this on screens that
/// know a practice session will be started shortly (e.g. Practice tab mount).
void prefetchContentLanguage(ApiClient api) {
  if (!_fetched) {
    getContentLanguage(api); // fire-and-forget
  }
}

/// Build the language fragment for a sessions/start body.
/// Returns `{'language': '<code>'}` when a preference is set, or `{}`.
Future<Map<String, dynamic>> contentLanguageField(ApiClient api) async {
  final lang = await getContentLanguage(api);
  return lang != null ? {'language': lang} : const {};
}

/// Reset the in-memory cache. Exposed for unit tests.
void resetContentLanguageCache() {
  _cached = null;
  _fetched = false;
}
