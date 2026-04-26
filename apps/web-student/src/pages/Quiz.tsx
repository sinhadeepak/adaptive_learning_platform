import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

interface QuizItem {
  itemIdx: number;
  questionId: string;
  stem: string;
  choices: string[];
}

interface NextResponse {
  sessionId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  done: boolean;
  item?: QuizItem;
}

interface AnswerResponse {
  sessionId: string;
  itemIdx: number;
  isCorrect: boolean;
  correctIdx: number;
  servedCount: number;
  correctCount: number;
}

export function Quiz() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState<QuizItem | null>(null);
  const [done, setDone] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<AnswerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState({ served: 0, correct: 0, target: 10 });
  const [error, setError] = useState<string | null>(null);

  const fetchNext = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setSelectedIdx(null);
    setVerdict(null);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/next`);
      if (r.status === 409) {
        navigate(`/quiz/${sessionId}/result`, { replace: true });
        return;
      }
      if (r.status === 404) {
        setError("Session not found.");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as NextResponse;
      if (body.done) {
        setDone(true);
        setItem(null);
        return;
      }
      setItem(body.item ?? null);
    } catch {
      setError("We couldn't load the next question.");
    }
  }, [sessionId, navigate]);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
      if (!r.ok) return;
      const body = (await r.json()) as {
        status: string;
        servedCount: number;
        correctCount: number;
        targetCount: number;
      };
      setCounts({ served: body.servedCount, correct: body.correctCount, target: body.targetCount });
      if (body.status !== "IN_PROGRESS") {
        navigate(`/quiz/${sessionId}/result`, { replace: true });
      }
    } catch {
      /* header is best-effort */
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    fetchSession();
    fetchNext();
  }, [fetchSession, fetchNext]);

  async function submitAnswer() {
    if (!sessionId || !item || selectedIdx === null || submitting) return;
    setSubmitting(true);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIdx: item.itemIdx, answerIdx: selectedIdx }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as AnswerResponse;
      setVerdict(body);
      setCounts((c) => ({ ...c, served: body.servedCount, correct: body.correctCount }));
    } catch {
      setError("We couldn't record that answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishSession() {
    if (!sessionId) return;
    try {
      await auth.fetch(`/api/v1/quiz/sessions/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      navigate(`/quiz/${sessionId}/result`, { replace: true });
    }
  }

  useEffect(() => {
    if (done) {
      finishSession();
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <AppShell title="Quiz">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate("/catalog")}
        >
          Back to catalog
        </button>
      </AppShell>
    );
  }

  if (done || !item) {
    return (
      <AppShell title="Quiz">
        <SkeletonRows count={2} />
      </AppShell>
    );
  }

  const showFeedback = verdict !== null;
  const questionNumber = counts.served + (showFeedback ? 0 : 1);
  const remaining = Math.max(0, counts.target - counts.served);
  const progressPct = counts.target > 0 ? Math.min(100, Math.round((counts.served / counts.target) * 100)) : 0;

  const accuracyPct = counts.served > 0 ? Math.round((counts.correct / counts.served) * 100) : null;

  return (
    <AppShell
      title={`Question ${questionNumber} of ${counts.target}`}
      chips={[
        { label: `${counts.correct} correct` },
        { label: remaining > 0 ? `${remaining} left` : "Final question" },
      ]}
    >
      <div className="quiz-eyebrow">
        <span className="ai-pill">◈ AI ADAPTIVE SESSION</span>
        <span className="quiz-difficulty">
          item #{item.itemIdx + 1} · {item.questionId.slice(0, 6)}
        </span>
        {accuracyPct !== null ? (
          <span className="quiz-theta-tracker">
            ◆ {accuracyPct}% accuracy this session
          </span>
        ) : null}
      </div>
      <div className="quiz-progress-bar" aria-label={`Progress ${progressPct}%`}>
        <div className="quiz-progress-track">
          <div className="quiz-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="quiz-progress-meta">
          {counts.served} / {counts.target}
        </span>
      </div>

      <section className="quiz-card">
        <h1 className="quiz-stem">{item.stem}</h1>

        <ol className="quiz-choices">
          {item.choices.map((choice, idx) => {
            const isSelected = selectedIdx === idx;
            const isCorrectAnswer = showFeedback && idx === verdict!.correctIdx;
            const isWrongPick = showFeedback && idx === selectedIdx && !verdict!.isCorrect;
            const variant = isCorrectAnswer
              ? "quiz-choice-correct"
              : isWrongPick
                ? "quiz-choice-wrong"
                : isSelected
                  ? "quiz-choice-selected"
                  : "";
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => !showFeedback && setSelectedIdx(idx)}
                  disabled={showFeedback}
                  className={`quiz-choice ${variant}`.trim()}
                  aria-pressed={isSelected}
                >
                  <span className="quiz-choice-letter">{String.fromCharCode(65 + idx)}</span>
                  <span className="quiz-choice-text">{choice}</span>
                  {isCorrectAnswer ? <Pill tone="success">Correct</Pill> : null}
                  {isWrongPick ? <Pill tone="danger">Your answer</Pill> : null}
                </button>
              </li>
            );
          })}
        </ol>

        {showFeedback ? (
          <div
            role="status"
            className={`quiz-feedback ${verdict!.isCorrect ? "quiz-feedback-correct" : "quiz-feedback-wrong"}`}
          >
            <strong>{verdict!.isCorrect ? "Nice — that's right." : "Not quite."}</strong>
            <span>
              {verdict!.isCorrect
                ? "Keep going."
                : `The correct answer is ${String.fromCharCode(65 + verdict!.correctIdx)}.`}
            </span>
          </div>
        ) : null}

        <div className="quiz-actions">
          {showFeedback ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                if (counts.served >= counts.target) {
                  setDone(true);
                } else {
                  fetchNext();
                }
              }}
            >
              {counts.served >= counts.target ? "Finish quiz" : "Next question"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={selectedIdx === null || submitting}
              onClick={submitAnswer}
            >
              {submitting ? "Submitting…" : "Submit answer"}
            </button>
          )}
          <button type="button" className="link-button" onClick={finishSession}>
            End quiz now
          </button>
        </div>
      </section>
    </AppShell>
  );
}
