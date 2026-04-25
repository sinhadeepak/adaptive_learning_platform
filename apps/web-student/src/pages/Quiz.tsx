import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

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
        // Session is SUBMITTED or EXPIRED — go review.
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

  // Pull the session's running counts on mount + after each answer so the
  // header bar always reflects truth even if the user reloaded mid-quiz.
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
      // ignore — header is best-effort
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

  // Done state: target reached or bank exhausted — auto-submit + go to result.
  useEffect(() => {
    if (done) {
      finishSession();
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
          <Button onClick={() => navigate("/catalog")}>Back to catalog</Button>
        </section>
      </main>
    );
  }

  if (done || !item) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <p style={{ color: tokens.colors.text.muted }}>Wrapping up…</p>
        </section>
      </main>
    );
  }

  const showFeedback = verdict !== null;

  return (
    <main style={styles.page}>
      <header style={styles.progress}>
        <span style={styles.progressMeta}>
          Question {counts.served + (showFeedback ? 0 : 1)} of {counts.target}
        </span>
        <span style={styles.progressMeta}>
          {counts.correct} correct
        </span>
      </header>

      <section style={styles.card}>
        <h1 style={styles.stem}>{item.stem}</h1>

        <ol style={styles.choices}>
          {item.choices.map((choice, idx) => {
            const isSelected = selectedIdx === idx;
            const isCorrectAnswer = showFeedback && idx === verdict!.correctIdx;
            const isWrongPick = showFeedback && idx === selectedIdx && !verdict!.isCorrect;
            const tone = isCorrectAnswer ? "success" : isWrongPick ? "danger" : isSelected ? "selected" : "default";
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => !showFeedback && setSelectedIdx(idx)}
                  disabled={showFeedback}
                  style={{ ...styles.choice, ...styles[`choice_${tone}`] }}
                  aria-pressed={isSelected}
                >
                  <span style={styles.choiceLetter}>{String.fromCharCode(65 + idx)}</span>
                  <span style={styles.choiceText}>{choice}</span>
                  {tone === "success" ? <Badge tone="success">Correct</Badge> : null}
                  {tone === "danger" ? <Badge tone="danger">Your answer</Badge> : null}
                </button>
              </li>
            );
          })}
        </ol>

        {showFeedback ? (
          <div role="status" style={verdict!.isCorrect ? styles.feedbackOk : styles.feedbackKo}>
            <strong>{verdict!.isCorrect ? "Nice — that's right." : "Not quite."}</strong>{" "}
            {verdict!.isCorrect
              ? "Keep going."
              : `The correct answer is ${String.fromCharCode(65 + verdict!.correctIdx)}.`}
          </div>
        ) : null}

        <div style={styles.actions}>
          {showFeedback ? (
            <Button
              size="lg"
              onClick={() => {
                if (counts.served >= counts.target) {
                  setDone(true);
                } else {
                  fetchNext();
                }
              }}
              style={{ width: "100%" }}
            >
              {counts.served >= counts.target ? "Finish quiz" : "Next question"}
            </Button>
          ) : (
            <Button
              size="lg"
              isLoading={submitting}
              onClick={submitAnswer}
              disabled={selectedIdx === null}
              style={{ width: "100%" }}
            >
              {submitting ? "Submitting…" : "Submit answer"}
            </Button>
          )}
          <button type="button" onClick={finishSession} style={styles.linkButton}>
            End quiz now
          </button>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: tokens.colors.surface.secondary,
    fontFamily: tokens.typography.family.ui,
    padding: tokens.spacing[5],
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  progress: {
    width: "100%",
    maxWidth: 720,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing[3],
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.scale.body.size,
  },
  progressMeta: { fontWeight: 500 },
  card: {
    width: "100%",
    maxWidth: 720,
    background: tokens.colors.surface.primary,
    borderRadius: tokens.radius.card,
    border: `1px solid ${tokens.colors.border.default}`,
    padding: tokens.spacing[6],
  },
  stem: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
    lineHeight: 1.4,
  },
  choices: {
    listStyle: "none",
    padding: 0,
    margin: `${tokens.spacing[5]}px 0`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacing[2],
  },
  choice: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[3],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    border: `1px solid ${tokens.colors.border.default}`,
    background: tokens.colors.surface.primary,
    color: tokens.colors.text.primary,
    fontFamily: "inherit",
    fontSize: tokens.typography.scale.body.size,
    textAlign: "left",
    cursor: "pointer",
  },
  choice_default: {},
  choice_selected: {
    borderColor: tokens.colors.brand.primary,
    background: "rgba(96, 110, 234, 0.08)",
  },
  choice_success: {
    borderColor: tokens.colors.semantic.success.fg,
    background: tokens.colors.semantic.success.bg,
  },
  choice_danger: {
    borderColor: tokens.colors.semantic.danger.fg,
    background: tokens.colors.semantic.danger.bg,
  },
  choiceLetter: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: tokens.colors.surface.secondary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: tokens.typography.scale.label.size,
    color: tokens.colors.text.secondary,
    flexShrink: 0,
  },
  choiceText: { flex: 1 },
  feedbackOk: {
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.success.bg,
    color: tokens.colors.semantic.success.fg,
    fontSize: tokens.typography.scale.body.size,
    marginBottom: tokens.spacing[3],
  },
  feedbackKo: {
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    fontSize: tokens.typography.scale.body.size,
    marginBottom: tokens.spacing[3],
  },
  actions: { display: "flex", flexDirection: "column", alignItems: "center", gap: tokens.spacing[2] },
  linkButton: {
    background: "none",
    border: "none",
    color: tokens.colors.text.muted,
    cursor: "pointer",
    fontSize: tokens.typography.scale.hint.size,
    padding: tokens.spacing[1],
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    marginBottom: tokens.spacing[4],
  },
};
