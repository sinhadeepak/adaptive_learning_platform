// Offline-recovery v0 for the web quiz player (Phase 6 S51, UX-32).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S51
//
// localStorage-backed queue keyed by sessionId. Each entry is one
// `POST /quiz/sessions/<id>/answers` payload that the player tried
// to send but couldn't (offline / TLS failure / etc.). On the next
// player mount — or whenever the page comes back online — `drain`
// replays the queue and surfaces a sync banner.
//
// Quiz Go's /answers endpoint is idempotent on (session_id, item_idx)
// per Sprint-1 GAP-08; re-sending a duplicate returns the same canonical
// answer record, so the queue is safe to retry aggressively.
//
// This mirrors the Dart implementation at
// `apps/mobile/lib/quiz/quiz_offline_queue.dart`. Keep them in sync.

export interface PendingAnswer {
  sessionId: string;
  itemIdx: number;
  answerIdx?: number;
  responsePayload?: unknown;
  queuedAt: number; // ms since epoch
}

export interface AnswerResponse {
  sessionId: string;
  itemIdx: number;
  isCorrect: boolean;
  correctIdx: number;
  servedCount: number;
  correctCount: number;
}

/** Pluggable storage so unit tests can avoid touching window.localStorage. */
export interface OfflineQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY_PREFIX = "quiz.offline_queue.v1.";

function storageKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

export class QuizOfflineQueue {
  private readonly storage: OfflineQueueStorage;

  constructor(storage?: OfflineQueueStorage) {
    this.storage =
      storage ??
      (typeof window !== "undefined" && window.localStorage
        ? window.localStorage
        : new MemoryStorage());
  }

  load(sessionId: string): PendingAnswer[] {
    const raw = this.storage.getItem(storageKey(sessionId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as PendingAnswer[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      // Corrupt blob — clear so the next write starts fresh.
      this.storage.removeItem(storageKey(sessionId));
      return [];
    }
  }

  enqueue(entry: PendingAnswer): void {
    const next = [...this.load(entry.sessionId), entry];
    this.storage.setItem(storageKey(entry.sessionId), JSON.stringify(next));
  }

  remove(sessionId: string, itemIdx: number): void {
    const next = this.load(sessionId).filter((e) => e.itemIdx !== itemIdx);
    if (next.length === 0) this.storage.removeItem(storageKey(sessionId));
    else this.storage.setItem(storageKey(sessionId), JSON.stringify(next));
  }

  clear(sessionId: string): void {
    this.storage.removeItem(storageKey(sessionId));
  }

  /**
   * Replay every queued answer through `send`. Stops at the first
   * failure (transient network error) and leaves the remaining entries
   * in place so the next drain picks up where we left off.
   *
   * Returns the number of entries successfully replayed.
   */
  async drain(
    sessionId: string,
    send: (entry: PendingAnswer) => Promise<AnswerResponse>,
  ): Promise<number> {
    const pending = this.load(sessionId);
    if (pending.length === 0) return 0;
    let replayed = 0;
    for (const entry of pending) {
      try {
        await send(entry);
        this.remove(sessionId, entry.itemIdx);
        replayed += 1;
      } catch {
        return replayed;
      }
    }
    return replayed;
  }
}

class MemoryStorage implements OfflineQueueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
