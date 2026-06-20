/**
 * session-start.ts
 *
 * Shared helper for reading the student's preferred content language and
 * injecting it into the POST /api/v1/quiz/sessions/start body.
 *
 * Instead of issuing a fresh /profile/me fetch on every practice start, we
 * look up a lightweight in-memory cache that the profile page already
 * populates.  If the cache is cold (first visit, hard refresh) we fire a
 * single fetch and warm it so subsequent calls are instant.
 */

import { auth } from "./api";

interface ProfilePreferences {
  contentLanguage?: string;
}

let _cached: string | undefined | null = undefined; // undefined = unknown, null = fetched, no value

/**
 * Return the student's contentLanguage preference, fetching /profile/me at
 * most once per page load.  Returns undefined when the student has not set a
 * preference or when the fetch fails (so callers can omit the field silently).
 */
export async function getContentLanguage(): Promise<string | undefined> {
  if (_cached !== undefined) {
    return _cached ?? undefined;
  }
  try {
    const r = await auth.fetch("/api/v1/profile/me");
    if (r.ok) {
      const body = (await r.json()) as { preferences?: ProfilePreferences };
      _cached = body.preferences?.contentLanguage ?? null;
    } else {
      _cached = null;
    }
  } catch {
    _cached = null;
  }
  return _cached ?? undefined;
}

/**
 * Build the language field fragment for a sessions/start body.
 * Returns `{ language: "<code>" }` when a non-empty preference exists, or
 * `{}` when the student hasn't set one.
 */
export async function contentLanguageField(): Promise<{ language?: string }> {
  const lang = await getContentLanguage();
  return lang ? { language: lang } : {};
}

/** Reset the in-memory cache — primarily for unit tests. */
export function _resetContentLanguageCache() {
  _cached = undefined;
}
