// Resolves user ids → {displayName, email} for surfaces that would
// otherwise show raw UUIDs (Leaderboards, Friends, Clans, …).
//
// Batches all ids passed in a single POST /auth/users/lookup call.
// Caches results in module-level memory for the page lifetime so the
// same ids in two surfaces don't refetch.

import { useEffect, useState } from "react";
import { auth } from "./api";

export interface UserInfo {
  userId: string;
  displayName: string;
  email: string;
}

const cache = new Map<string, UserInfo>();
const inflight = new Map<string, Promise<void>>();

async function fetchBatch(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const r = await auth.fetch("/api/v1/auth/users/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIds: ids }),
  });
  if (!r.ok) return;
  const body = (await r.json()) as { users: UserInfo[] };
  for (const u of body.users) cache.set(u.userId, u);
}

// formatUser → "Display Name (email@x.com)" or a fallback like
// "b7a9cf33…" when nothing is cached yet (keeps tables stable while
// the lookup is in flight).
export function formatUser(userId: string, info?: UserInfo): string {
  if (info) return `${info.displayName} (${info.email})`;
  return userId.length > 12 ? userId.slice(0, 8) + "…" : userId;
}

// React hook — pass a list of ids, get back a Record id→UserInfo as
// the batch resolves. Re-runs when the id set actually changes.
export function useUserDirectory(ids: string[]): Record<string, UserInfo> {
  const key = ids.slice().sort().join("|");
  const [dir, setDir] = useState<Record<string, UserInfo>>(() => {
    const out: Record<string, UserInfo> = {};
    for (const id of ids) {
      const hit = cache.get(id);
      if (hit) out[id] = hit;
    }
    return out;
  });

  useEffect(() => {
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) {
      const out: Record<string, UserInfo> = {};
      for (const id of ids) {
        const hit = cache.get(id);
        if (hit) out[id] = hit;
      }
      setDir(out);
      return;
    }
    // De-dupe in-flight batches for the same id set.
    const batchKey = missing.slice().sort().join("|");
    let p = inflight.get(batchKey);
    if (!p) {
      p = fetchBatch(missing).finally(() => inflight.delete(batchKey));
      inflight.set(batchKey, p);
    }
    let alive = true;
    p.then(() => {
      if (!alive) return;
      const out: Record<string, UserInfo> = {};
      for (const id of ids) {
        const hit = cache.get(id);
        if (hit) out[id] = hit;
      }
      setDir(out);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return dir;
}
