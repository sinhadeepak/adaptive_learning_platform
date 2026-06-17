// Friendly error message helper.
//
// Replaces the previous pattern of showing raw `'$e'` strings (which
// surfaced gnarly Dart casts like
//   "Mock failed: type 'Null' is not a subtype of type 'List<dynamic>'"
// ). Maps the most common error shapes the app produces to a one-line
// message a student can act on. Falls back to a generic message when
// nothing matches — never the raw exception text in production.

class ErrorMessage {
  const ErrorMessage._();

  /// Resolves any error to a user-facing message. Order matters —
  /// more-specific matches first.
  static String from(Object error) {
    final raw = error.toString();

    // HTTP-pattern messages (the most common source of UI errors).
    if (raw.contains('HTTP 401')) {
      return "Looks like you're signed out. Please sign in again.";
    }
    if (raw.contains('HTTP 403')) {
      return "You don't have access to this. Contact support if you think that's wrong.";
    }
    if (raw.contains('HTTP 404')) {
      return "We couldn't find what you were looking for.";
    }
    if (raw.contains('HTTP 409')) {
      // Most 409s are "already_purchased" or session-conflict — both
      // self-explaining for the screen that ran into them.
      return raw.contains('already_purchased')
          ? 'You already own this course.'
          : 'That action is no longer available.';
    }
    if (raw.contains('HTTP 422')) {
      return 'No published questions for this topic yet.';
    }
    if (raw.contains('HTTP 5')) {
      return 'Our servers had a hiccup. Try again in a minute.';
    }

    // Dart cast errors — rare to leak now, but if one slips through
    // we'd rather show a friendly line than the type-system babble.
    if (raw.contains("type '") && raw.contains('subtype')) {
      return "Something didn't load right. Try again in a minute.";
    }

    // Network errors.
    if (raw.toLowerCase().contains('socketexception') ||
        raw.toLowerCase().contains('handshake') ||
        raw.contains('Failed host lookup')) {
      return "Couldn't reach the server. Check your connection.";
    }

    // Quiz-specific messages already friendly — pass through.
    if (raw.startsWith('No published questions') ||
        raw.startsWith("Mock blueprint isn't available") ||
        raw.startsWith('You already own')) {
      return raw;
    }

    // Last resort.
    return 'Something went wrong. Try again in a moment.';
  }
}
