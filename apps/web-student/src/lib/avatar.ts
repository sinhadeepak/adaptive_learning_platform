import { useEffect, useState } from "react";
import { auth } from "./api";

// Tiny avatar cache + pub/sub. Sidebar (and any other surface that wants
// a current avatar) call useAvatar() and re-render when the cache flips.
// Profile.tsx publishes via setCachedAvatar() after a successful upload so
// the change is reflected without an extra round-trip.

let cachedUrl: string | null | undefined = undefined; // undefined = not loaded
let loading = false;
const listeners = new Set<(v: string | null) => void>();

function notify() {
  for (const fn of listeners) fn(cachedUrl ?? null);
}

export function setCachedAvatar(url: string | null) {
  cachedUrl = url;
  notify();
}

async function loadOnce(userId: string | null) {
  if (loading || cachedUrl !== undefined) return;
  if (!userId) return;
  loading = true;
  try {
    const r = await auth.fetch(`/api/v1/profile/me`);
    if (!r.ok) {
      cachedUrl = null;
      return;
    }
    const body = (await r.json()) as { avatarUrl?: string | null };
    cachedUrl = body.avatarUrl ?? null;
  } catch {
    cachedUrl = null;
  } finally {
    loading = false;
    notify();
  }
}

/**
 * Returns the current user's avatar data URL or null if none is set.
 * First call kicks off a single fetch; subsequent calls hit the cache.
 */
export function useAvatar(userId: string | null): string | null {
  const [v, setV] = useState<string | null>(cachedUrl ?? null);
  useEffect(() => {
    listeners.add(setV);
    void loadOnce(userId);
    return () => {
      listeners.delete(setV);
    };
  }, [userId]);
  return v;
}
