// Sprint 9 F-1 + Sprint 10 S10-D — Student assignment detail.
//
// The student answers each question inline (4 multiple-choice buttons),
// then taps Submit. The server grades and returns the breakdown — the
// page then shows CORRECT/WRONG per item and persists the score via
// upsert_progress (no manual score-entry step).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  fetchAssignment,
  fetchAssignmentQuestions,
  formatDueAt,
  progressBucket,
  submitAssignment,
  type Assignment,
  type AssignmentQuestion,
  type SubmitResult,
} from "../lib/assignments";

export function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

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
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  async function submit() {
    if (!assignmentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await submitAssignment(assignmentId, answers);
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!assignmentId) {
    return (
      <AppShell title="Assignment">
        <p>Missing assignment id.</p>
      </AppShell>
    );
  }

  const allAnswered =
    questions !== null &&
    questions.length > 0 &&
    questions.every((q) => answers[q.questionId] !== undefined);

  return (
    <AppShell title="Assignment">
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

            {result ? (
              // ── Result panel ─────────────────────────────────────────
              <section className="assignment-result">
                <h2>
                  Score: {result.correctCount}/{result.totalCount}
                </h2>
                <p>
                  {result.correctCount === result.totalCount
                    ? "Perfect — well done!"
                    : result.correctCount * 2 >= result.totalCount
                      ? "Solid run. Review the missed items below."
                      : "Try again — review the explanations and re-attempt."}
                </p>
                <ol className="result-breakdown">
                  {result.breakdown.map((b) => (
                    <li
                      key={b.questionId}
                      className={b.isCorrect ? "ok" : "wrong"}
                    >
                      <div>
                        Q{b.position}:{" "}
                        {b.isCorrect ? "✓ CORRECT" : "✗ WRONG"} (you:{" "}
                        {b.studentAnswer === null ? "—" : b.studentAnswer + 1},
                        correct: {b.correctAnswer + 1})
                      </div>
                      {/* Sprint 11 S11-C — explanation only renders on misses. */}
                      {!b.isCorrect && b.explanation && (
                        <div
                          className="explanation-note"
                          style={{
                            marginTop: 4,
                            padding: 8,
                            background: "var(--bg-surface-2, #fff8e1)",
                            borderRadius: 4,
                            fontSize: 13,
                          }}
                        >
                          💡 {b.explanation}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ) : (
              // ── Quiz form ───────────────────────────────────────────
              <>
                <h2>Questions ({questions?.length ?? 0})</h2>
                {questions === null ? (
                  <p>Loading questions…</p>
                ) : (
                  <ol className="assignment-questions">
                    {questions.map((q) => (
                      <li key={q.questionId} style={{ marginBottom: 16 }}>
                        <div>{q.stem || `Question ${q.position}`}</div>
                        {q.choices && (
                          <div
                            style={{
                              display: "grid",
                              gap: 6,
                              marginTop: 8,
                            }}
                          >
                            {q.choices.map((choice, idx) => (
                              <label key={idx}>
                                <input
                                  type="radio"
                                  name={`q-${q.questionId}`}
                                  checked={answers[q.questionId] === idx}
                                  onChange={() =>
                                    setAnswers({
                                      ...answers,
                                      [q.questionId]: idx,
                                    })
                                  }
                                />
                                &nbsp;{String.fromCharCode(65 + idx)}. {choice}
                              </label>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  className="btn-primary"
                  onClick={submit}
                  disabled={
                    submitting ||
                    !allAnswered ||
                    !questions ||
                    questions.length === 0
                  }
                >
                  {submitting
                    ? "Grading…"
                    : assignment.myCompletedAt
                      ? "Submit (re-attempt)"
                      : "Submit answers"}
                </button>
                {!allAnswered && questions && questions.length > 0 && (
                  <p className="hint">Answer every question to enable submit.</p>
                )}
              </>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
