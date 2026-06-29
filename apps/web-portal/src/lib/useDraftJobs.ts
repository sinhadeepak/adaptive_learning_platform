// useDraftJobs — polls the author's async bulk question-generation jobs and
// surfaces newly-finished ones to the in-app toaster. Mirrors web-admin's
// useResearchJobs. Tracks acknowledged jobs in localStorage so each
// completion toasts exactly once (even across a refresh / re-login).

import { useCallback, useEffect, useState } from "react";

import { aiAuthoring } from "./phase5-api";

export interface DraftJob {
  jobId: string;
  status: "pending" | "succeeded" | "failed";
  topic: string | null;
  count: number | null;
  progress: { done: number; total: number } | null;
  createdAt: string | null;
  completedAt: string | null;
}

const ACK_KEY = "vidya.bulk-draft.acknowledged";
const POLL_MS = 5000;

function loadAcked(): Set<string> {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveAcked(ids: Set<string>): void {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* storage disabled — non-fatal */
  }
}

export interface UseDraftJobs {
  pending: DraftJob[];
  unacked: DraftJob[];
  acknowledge: (jobId: string) => void;
}

export function useDraftJobs(): UseDraftJobs {
  const [jobs, setJobs] = useState<DraftJob[]>([]);
  const [acked, setAcked] = useState<Set<string>>(() => loadAcked());

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const { jobs: list } = await aiAuthoring.listBulkJobs();
        if (!cancelled) setJobs(list ?? []);
      } catch {
        /* transient — keep last list, retry next tick */
      }
      if (!cancelled) timer = window.setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const acknowledge = useCallback((jobId: string) => {
    setAcked((prev) => {
      const next = new Set(prev);
      next.add(jobId);
      saveAcked(next);
      return next;
    });
  }, []);

  const pending = jobs.filter((j) => j.status === "pending");
  const unacked = jobs.filter((j) => j.status !== "pending" && !acked.has(j.jobId));

  return { pending, unacked, acknowledge };
}
