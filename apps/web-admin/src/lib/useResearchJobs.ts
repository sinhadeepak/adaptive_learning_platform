// useResearchJobs — polls the admin's async exam-builder research jobs and
// surfaces newly-finished ones to the in-app toaster.
//
// The "Add new Exam" research call runs as a background job (see
// services/learning exam_builder). This hook polls
// GET /admin/exam-builder/research/jobs every few seconds and tracks which
// finished jobs have already been shown (localStorage), so each completion
// toasts exactly once — even across a page refresh or re-login.

import { useCallback, useEffect, useRef, useState } from "react";

import { auth } from "./api";
import { env } from "./env";

export interface ResearchJob {
  jobId: string;
  status: "pending" | "succeeded" | "failed";
  examCode: string | null;
  examName: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

const ACK_KEY = "vidya.exam-research.acknowledged";
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
    // Cap the stored set so it can't grow unbounded.
    const arr = [...ids].slice(-200);
    localStorage.setItem(ACK_KEY, JSON.stringify(arr));
  } catch {
    /* storage disabled — non-fatal, we just re-toast next session */
  }
}

export interface UseResearchJobs {
  /** Jobs still generating. */
  pending: ResearchJob[];
  /** Finished jobs (succeeded/failed) not yet acknowledged by the user. */
  unacked: ResearchJob[];
  /** Mark a job acknowledged so it stops toasting. */
  acknowledge: (jobId: string) => void;
}

export function useResearchJobs(): UseResearchJobs {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [acked, setAcked] = useState<Set<string>>(() => loadAcked());
  const ackedRef = useRef(acked);
  ackedRef.current = acked;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const res = await auth.fetch(`${env.apiBaseUrl}/admin/exam-builder/research/jobs`);
        if (res.ok) {
          const body = (await res.json()) as { jobs: ResearchJob[] };
          if (!cancelled) setJobs(body.jobs ?? []);
        }
      } catch {
        /* transient — keep the last list and try again next tick */
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
