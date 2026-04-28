// Sprint 9 F-1 — Student assignment detail view.
//
// Loads /content/assignments/{id} + /questions and renders:
//  - title, description, due date pill
//  - the educator-curated question list
//  - "Mark complete" CTA that records progress (placeholder until the
//    full quiz-runner integration in Sprint 10 — for now it accepts a
//    correctCount the student types in)

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  fetchAssignment,
  fetchAssignmentQuestions,
  formatDueAt,
  progressBucket,
  recordProgress,
  type Assignment,
  type AssignmentQuestion,
} from "../lib/assignments";

export function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [correct, setCorrect] = useState<number>(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    Promise.all([
      fetchAssignment(assignmentId),
      fetchAssignmentQuestions(assignmentId),
    ])
      .then(([a, qs]) => {
        if (cancelled) return;
        setAssignment(a);
        setQuestions(qs);
        if (a.myCorrectCount != null) setCorrect(a.myCorrectCount);
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  async function submit() {
    if (!assignmentId || !questions) return;
    setSubmitting(true);
    try {
      await recordProgress(assignmentId, {
        correctCount: correct,
        totalCount: questions.length,
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!assignmentId) {
    return (
      <AppShell>
        <p>Missing assignment id.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="assignment-detail">
        <Link to="/assignments" className="back-link">
          ← My Assignments
        </Link>
        {error && <p className="banner banner-error">{error}</p>}
        {assignment === null && <p>Loading…</p>}
        {assignment !== null && (
          <>
            <h1>{assignment.title}</h1>
            <div className="meta-row">
              <span className={`pill pill-${progressBucket(assignment)}`}>
                {progressBucket(assignment)}
              </span>
              {formatDueAt(assignment) && <span>{formatDueAt(assignment)}</span>}
            </div>
            {assignment.description && (
              <p className="assignment-desc">{assignment.description}</p>
            )}
            <h2>Questions ({questions?.length ?? 0})</h2>
            {questions === null ? (
              <p>Loading questions…</p>
            ) : (
              <ol className="assignment-questions">
                {questions.map((q) => (
                  <li key={q.questionId}>{q.stem || `Question ${q.position}`}</li>
                ))}
              </ol>
            )}
            <div className="record-progress">
              <h3>Record your score</h3>
              <p className="hint">
                After working through the questions, enter how many you got
                right. Your educator sees this on the leaderboard.
              </p>
              <label>
                Correct answers:
                <input
                  type="number"
                  min={0}
                  max={questions?.length ?? 0}
                  value={correct}
                  onChange={(e) => setCorrect(Number(e.target.value))}
                />
                <span>/ {questions?.length ?? 0}</span>
              </label>
              <button
                className="btn-primary"
                onClick={submit}
                disabled={submitting || done || !questions || questions.length === 0}
              >
                {done
                  ? "Saved ✓"
                  : submitting
                    ? "Saving…"
                    : assignment.myCompletedAt
                      ? "Update score"
                      : "Mark complete"}
              </button>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
