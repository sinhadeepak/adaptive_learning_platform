// Unit tests for QuizOfflineQueue (Phase 6 S51, UX-32 v0).
//
// Uses the queue's injectable storage so we don't touch
// window.localStorage in unit tests. Mirrors the Dart test coverage
// at apps/mobile/test/quiz_offline_queue_test.dart.

import { beforeEach, describe, expect, test } from "vitest";

import {
  QuizOfflineQueue,
  type OfflineQueueStorage,
  type PendingAnswer,
  type AnswerResponse,
} from "./quiz-offline-queue";

class MemoryStorage implements OfflineQueueStorage {
  store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const SESS_A = "sess-a";
const SESS_B = "sess-b";

let storage: MemoryStorage;
let queue: QuizOfflineQueue;

beforeEach(() => {
  storage = new MemoryStorage();
  queue = new QuizOfflineQueue(storage);
});

describe("QuizOfflineQueue (in-memory)", () => {
  test("load returns empty when nothing queued", () => {
    expect(queue.load(SESS_A)).toEqual([]);
  });

  test("enqueue + load round-trips a PendingAnswer", () => {
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 0,
      answerIdx: 2,
      queuedAt: 1700000000,
    });
    const loaded = queue.load(SESS_A);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].itemIdx).toBe(0);
    expect(loaded[0].answerIdx).toBe(2);
    // And the second session is independent.
    expect(queue.load(SESS_B)).toEqual([]);
  });

  test("responsePayload survives the round-trip", () => {
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 7,
      responsePayload: { answer: 9.81, units: "m/s^2" },
      queuedAt: 1,
    });
    expect(queue.load(SESS_A)[0].responsePayload).toEqual({
      answer: 9.81,
      units: "m/s^2",
    });
  });

  test("remove deletes by itemIdx and clears the blob when empty", () => {
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 1,
      answerIdx: 0,
      queuedAt: 1,
    });
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 2,
      answerIdx: 1,
      queuedAt: 2,
    });
    queue.remove(SESS_A, 1);
    expect(queue.load(SESS_A).map((e) => e.itemIdx)).toEqual([2]);
    queue.remove(SESS_A, 2);
    expect(queue.load(SESS_A)).toEqual([]);
    expect(storage.store.has(`quiz.offline_queue.v1.${SESS_A}`)).toBe(false);
  });

  test("clear wipes a single session", () => {
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 0,
      answerIdx: 0,
      queuedAt: 1,
    });
    queue.enqueue({
      sessionId: SESS_B,
      itemIdx: 0,
      answerIdx: 0,
      queuedAt: 1,
    });
    queue.clear(SESS_A);
    expect(queue.load(SESS_A)).toEqual([]);
    expect(queue.load(SESS_B)).toHaveLength(1);
  });

  test("load tolerates a corrupted blob and clears it", () => {
    storage.setItem(`quiz.offline_queue.v1.${SESS_A}`, "{not-json");
    expect(queue.load(SESS_A)).toEqual([]);
    expect(storage.store.size).toBe(0);
  });
});

describe("QuizOfflineQueue.drain", () => {
  function makeAnswerResponse(p: PendingAnswer): AnswerResponse {
    return {
      sessionId: p.sessionId,
      itemIdx: p.itemIdx,
      isCorrect: true,
      correctIdx: 0,
      servedCount: 1,
      correctCount: 1,
    };
  }

  test("replays every queued answer when the server is reachable", async () => {
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 0,
      answerIdx: 1,
      queuedAt: 1,
    });
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 1,
      answerIdx: 2,
      queuedAt: 2,
    });
    const calls: PendingAnswer[] = [];
    const replayed = await queue.drain(SESS_A, async (entry) => {
      calls.push(entry);
      return makeAnswerResponse(entry);
    });
    expect(replayed).toBe(2);
    expect(calls.map((c) => c.itemIdx)).toEqual([0, 1]);
    expect(queue.load(SESS_A)).toEqual([]);
  });

  test("stops at the first failure and leaves remaining entries", async () => {
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 0,
      answerIdx: 1,
      queuedAt: 1,
    });
    queue.enqueue({
      sessionId: SESS_A,
      itemIdx: 1,
      answerIdx: 2,
      queuedAt: 2,
    });
    let calls = 0;
    const replayed = await queue.drain(SESS_A, async (entry) => {
      calls += 1;
      if (calls === 1) return makeAnswerResponse(entry);
      throw new Error("offline");
    });
    expect(replayed).toBe(1);
    const remaining = queue.load(SESS_A);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].itemIdx).toBe(1);
  });
});
