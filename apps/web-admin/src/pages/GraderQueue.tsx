import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill, StatCard } from "../components/primitives";
import { auth } from "../lib/api";
import { env } from "../lib/env";

// ─────────────────────────────────────────────────────────────────────────
// CE-308 — Human Grader Application.
//
// Backend (P5-S57, learning.grading.queue_routes):
//   GET  /grading/calibration-set                  daily warm-up (3 items)
//   GET  /grading/queue                            pending_review + cal samples
//   POST /grading/responses/{id}/grade             submit per-criterion verdict
//
// Per AIM §3.5. Subjective responses with AI confidence < 0.75 (or
// calibration-sampled) land in the queue. Anonymised — no student id,
// age, or prior performance. Per-criterion verdicts (0/0.5/1) feed
// the calibration corpus that keeps AI evaluation honest.
// ─────────────────────────────────────────────────────────────────────────

interface CalibrationItem {
  id: string;
  stem: string;
  answer: string;
  rubric: { id: string; text: string; weight: number }[];
  gold_verdict: { criterion_id: string; satisfied: number }[];
}

interface QueueItem {
  queue_kind: "pending_review" | "calibration_sample";
  response_id: string;
  question_id: string | null;
  type_id: string | null;
  rubric_version: number | null;
  prompt_version: string | null;
  ai_confidence: number | null;
  sampled_at: string;
  ai_resolution: Record<string, unknown> | null;
  criterion: string | null;
  ai_score: number | null;
}

interface QueueResponse {
  items: QueueItem[];
  pendingReviewCount: number;
  calibrationSampleCount: number;
}

interface GraderVerdict {
  itemId: string;
  criterionId: string;
  satisfied: number;
  note: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Calibration warm-up — pulls from /grading/calibration-set.
// ─────────────────────────────────────────────────────────────────────────

function CalibrationWarmUp({
  items,
  onComplete,
}: {
  items: CalibrationItem[];
  onComplete: (passed: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [verdicts, setVerdicts] = useState<GraderVerdict[]>([]);
  const [response, setResponse] = useState<Record<string, number>>({});

  const item = items[idx];
  if (!item) return null;

  const allRated = item.rubric.every(
    (c) => typeof response[c.id] === "number",
  );

  function next(): void {
    const recorded: GraderVerdict[] = item.rubric.map((c) => ({
      itemId: item.id,
      criterionId: c.id,
      satisfied: response[c.id],
      note: "",
    }));
    const updated = [...verdicts, ...recorded];
    setVerdicts(updated);
    setResponse({});
    if (idx + 1 >= items.length) {
      // Match each verdict to the gold for the SAME item — criterion
      // ids (c1/c2) repeat across items, so a flat find() would compare
      // against the wrong item's gold.
      let agree = 0;
      let total = 0;
      for (const it of items) {
        for (const gold of it.gold_verdict) {
          total += 1;
          const v = updated.find(
            (x) => x.itemId === it.id && x.criterionId === gold.criterion_id,
          );
          if (v && Math.abs(gold.satisfied - v.satisfied) < 0.25) agree += 1;
        }
      }
      const passed = total > 0 && agree / total >= 0.85;
      onComplete(passed);
    } else {
      setIdx(idx + 1);
    }
  }

  return (
    <section
      style={{
        padding: 16,
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        color: "var(--ink)",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Pill tone="warning">
          Calibration {idx + 1} of {items.length}
        </Pill>
      </div>
      <h3 style={{ fontSize: 15, marginBottom: 12, color: "var(--ink)" }}>
        {item.stem}
      </h3>

      <h4 style={{ fontSize: 13, marginBottom: 8, color: "var(--ink-2)" }}>
        Student answer
      </h4>
      <blockquote
        style={{
          margin: "0 0 16px",
          padding: "10px 14px",
          background: "var(--card)",
          borderLeft: "3px solid var(--rule-2)",
          borderRadius: 4,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--ink-2)",
        }}
      >
        {item.answer}
      </blockquote>

      <h4 style={{ fontSize: 13, marginBottom: 8, color: "var(--ink-2)" }}>
        Rubric — score each criterion against the answer
      </h4>
      {item.rubric.map((c) => (
        <div
          key={c.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: 8,
            marginBottom: 4,
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--ink)" }}>
            {c.id} — {c.text} ({c.weight}%)
          </span>
          <select
            value={response[c.id] ?? ""}
            onChange={(e) =>
              setResponse({ ...response, [c.id]: Number(e.target.value) })
            }
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              background: "var(--paper-2)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
            }}
          >
            <option value="">…</option>
            <option value={0}>0 (not satisfied)</option>
            <option value={0.5}>0.5 (partially)</option>
            <option value={1}>1 (fully)</option>
          </select>
        </div>
      ))}

      <button
        onClick={next}
        disabled={!allRated}
        className={allRated ? "btn btn-primary" : "btn btn-ghost"}
        style={{ marginTop: 12 }}
      >
        {idx + 1 === items.length ? "Finish warm-up" : "Next"}
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Live queue panel — pulls from /grading/queue.
// ─────────────────────────────────────────────────────────────────────────

function QueuePanel({
  queue,
  onPullNext,
  onSubmitVerdict,
  busy,
}: {
  queue: QueueResponse | null;
  onPullNext: () => void;
  onSubmitVerdict: (item: QueueItem, satisfied: number, note: string) => Promise<void>;
  busy: boolean;
}) {
  const [activeItem, setActiveItem] = useState<QueueItem | null>(null);
  const [satisfied, setSatisfied] = useState<number | "">("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!queue) return;
    if (queue.items.length === 0) {
      setActiveItem(null);
      return;
    }
    setActiveItem(queue.items[0]);
  }, [queue]);

  async function submit(): Promise<void> {
    if (!activeItem || satisfied === "" || busy) return;
    await onSubmitVerdict(activeItem, satisfied, note);
    setSatisfied("");
    setNote("");
  }

  if (!queue) return null;

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8, color: "var(--ink)" }}>
        Grading queue
      </h2>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard
          label="Pending review (low-confidence AI)"
          value={queue.pendingReviewCount}
        />
        <StatCard
          label="Calibration samples awaiting human"
          value={queue.calibrationSampleCount}
        />
      </div>

      {!activeItem && (
        <Banner tone="info">
          Queue is empty. New low-confidence AI evaluations and 5%
          calibration samples land here as students submit subjective
          answers.
        </Banner>
      )}

      {activeItem && (
        <div
          style={{
            padding: 16,
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            color: "var(--ink)",
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Pill tone={activeItem.queue_kind === "pending_review" ? "danger" : "info"}>
              {activeItem.queue_kind === "pending_review"
                ? "Pending review"
                : "Calibration sample"}
            </Pill>
            {activeItem.ai_confidence !== null && (
              <Pill tone="warning">
                AI confidence {activeItem.ai_confidence.toFixed(2)}
              </Pill>
            )}
            {activeItem.type_id && <Pill tone="muted">{activeItem.type_id}</Pill>}
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>
            response&nbsp;<code>{activeItem.response_id.slice(0, 8)}…</code>
            {activeItem.criterion && (
              <> · criterion <code>{activeItem.criterion}</code></>
            )}
            {" · "}sampled {new Date(activeItem.sampled_at).toLocaleString()}
          </div>

          {activeItem.ai_resolution && (
            <details
              style={{
                marginBottom: 12,
                padding: 8,
                background: "var(--card)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
              }}
            >
              <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>
                AI's suggestion (collapsed — open only after forming your own view)
              </summary>
              <pre
                style={{
                  fontSize: 11,
                  marginTop: 8,
                  whiteSpace: "pre-wrap",
                  color: "var(--ink)",
                }}
              >
                {JSON.stringify(activeItem.ai_resolution, null, 2)}
              </pre>
            </details>
          )}

          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "var(--ink-2)",
              marginBottom: 4,
            }}
          >
            Your verdict
          </label>
          <select
            value={satisfied}
            onChange={(e) => setSatisfied(Number(e.target.value))}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              background: "var(--paper-2)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              marginBottom: 8,
            }}
          >
            <option value="">…</option>
            <option value={0}>0 (not satisfied)</option>
            <option value={0.5}>0.5 (partially)</option>
            <option value={1}>1 (fully)</option>
          </select>

          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "var(--ink-2)",
              marginBottom: 4,
            }}
          >
            Note (optional, ≤ 500 chars)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            style={{
              width: "100%",
              padding: 6,
              fontSize: 13,
              background: "var(--paper-2)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              marginBottom: 12,
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={submit}
              disabled={satisfied === "" || busy}
              className={satisfied !== "" && !busy ? "btn btn-primary" : "btn btn-ghost"}
            >
              {busy ? "Submitting…" : "Submit verdict"}
            </button>
            <button
              onClick={onPullNext}
              disabled={busy}
              className="btn btn-ghost"
            >
              Skip / refresh queue
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export function GraderQueue() {
  const [calibrationItems, setCalibrationItems] = useState<CalibrationItem[] | null>(null);
  const [calibrationLoadError, setCalibrationLoadError] = useState<string | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationFailed, setCalibrationFailed] = useState(false);
  const [sessionStartedAt] = useState(() => new Date());
  const [gradedThisSession, setGradedThisSession] = useState(0);
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch(`${env.apiBaseUrl}/grading/calibration-set`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as { items: CalibrationItem[] };
        setCalibrationItems(body.items);
      } catch (e) {
        setCalibrationLoadError(
          e instanceof Error ? e.message : "Couldn't load calibration set",
        );
      }
    })();
  }, []);

  async function refreshQueue(): Promise<void> {
    try {
      setQueueError(null);
      const r = await auth.fetch(`${env.apiBaseUrl}/grading/queue?limit=25`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setQueue((await r.json()) as QueueResponse);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "Queue fetch failed");
    }
  }

  useEffect(() => {
    if (calibrated) refreshQueue();
  }, [calibrated]);

  async function submitVerdict(
    item: QueueItem,
    satisfied: number,
    note: string,
  ): Promise<void> {
    setBusy(true);
    try {
      const submission = {
        grader_id: "admin@alp.dev",
        type_id: item.type_id ?? "ESSAY",
        question_id: item.question_id ?? "00000000-0000-0000-0000-000000000000",
        rubric_version: item.rubric_version ?? 1,
        criteria: [
          {
            criterion_id: item.criterion ?? "c1",
            satisfied,
            note,
          },
        ],
        final_status:
          satisfied === 1
            ? "CORRECT"
            : satisfied >= 0.5
              ? "PARTIAL_CORRECT"
              : "INCORRECT",
        second_grader_required: false,
        calibration_sample_id:
          item.queue_kind === "calibration_sample" ? item.response_id : null,
      };
      const r = await auth.fetch(
        `${env.apiBaseUrl}/grading/responses/${item.response_id}/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submission),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGradedThisSession((n) => n + 1);
      await refreshQueue();
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      crumbs="Quality · Grader queue"
      title="Grader Queue"
      chips={
        <>
          <span className="vidya-shell__chip">Phase 5</span>
          <span className="vidya-shell__chip">Grader</span>
        </>
      }
    >
      <Banner tone="info">
        <strong>Anonymised grading.</strong> You won't see student ids, names,
        ages, or prior performance. Per-criterion verdicts (0 / 0.5 / 1) feed
        the calibration corpus that keeps AI evaluation honest.
      </Banner>

      {calibrationLoadError && (
        <Banner tone="danger">
          <strong>Couldn't load calibration set.</strong> {calibrationLoadError}.
          Check that the learning service is reachable at <code>/api/v1/grading/calibration-set</code>.
        </Banner>
      )}

      {!calibrated && !calibrationFailed && calibrationItems && (
        <>
          <h2
            style={{
              fontSize: 16,
              marginTop: 24,
              marginBottom: 8,
              color: "var(--ink)",
            }}
          >
            Daily calibration warm-up
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-2)",
              marginBottom: 16,
            }}
          >
            {calibrationItems.length} pre-graded items. ≥ 85% agreement with gold
            to proceed; below triggers a refresher (escalates to lead grader).
          </p>
          <CalibrationWarmUp
            items={calibrationItems}
            onComplete={(passed) => {
              if (passed) setCalibrated(true);
              else setCalibrationFailed(true);
            }}
          />
        </>
      )}

      {calibrationFailed && (
        <>
          <Banner tone="danger">
            <strong>Calibration check failed.</strong> Your verdicts diverged
            from gold by more than 15%. Take a 5-minute break and review the{" "}
            <a href="/calibration-dashboard">calibration dashboard</a>; the lead
            grader has been notified.
          </Banner>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              onClick={() => setCalibrationFailed(false)}
              className="btn btn-primary"
            >
              Retry calibration
            </button>
            <a
              href="/calibration-dashboard"
              className="btn btn-ghost"
              style={{ textDecoration: "none" }}
            >
              Open calibration dashboard
            </a>
          </div>
        </>
      )}

      {calibrated && (
        <>
          <Banner tone="success">
            ✓ Calibration passed. Session started at{" "}
            {sessionStartedAt.toLocaleTimeString()}. Graded so far:{" "}
            <strong>{gradedThisSession}</strong>.
          </Banner>

          {queueError && (
            <div style={{ marginTop: 8 }}>
              <Banner tone="warning">{queueError}</Banner>
            </div>
          )}

          <QueuePanel
            queue={queue}
            onPullNext={refreshQueue}
            onSubmitVerdict={submitVerdict}
            busy={busy}
          />
        </>
      )}
    </AdminShell>
  );
}
