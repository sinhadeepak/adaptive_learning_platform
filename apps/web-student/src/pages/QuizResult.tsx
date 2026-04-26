import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

interface ItemSummary {
  itemIdx: number;
  questionId: string;
  answerIdx?: number;
  isCorrect?: boolean;
  answered: boolean;
}

interface SessionDetail {
  sessionId: string;
  userId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  strategy: "irt" | "binary_search";
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  targetCount: number;
  servedCount: number;
  correctCount: number;
  items: ItemSummary[];
}

interface Topic {
  id: string;
  title: string;
  subjectId: string;
}

export function QuizResult() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/quiz/sessions/${sessionId}`);
        if (!r.ok) {
          setError(
            r.status === 404 ? "Session not found." : "We couldn't load your results.",
          );
          return;
        }
        const body = (await r.json()) as SessionDetail;
        setSession(body);
        try {
          const t = await auth.fetch(`/api/v1/catalog/topics/${body.topicId}`);
          if (t.ok) setTopic((await t.json()) as Topic);
        } catch {
          /* swallow */
        }
      } catch {
        setError("We couldn't load your results.");
      }
    })();
  }, [sessionId]);

  if (error) {
    return (
      <AppShell title="Result">
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

  if (!session) {
    return (
      <AppShell title="Result">
        <SkeletonRows count={2} />
      </AppShell>
    );
  }

  const total = session.servedCount;
  const correct = session.correctCount;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const pctTone =
    pct >= 80 ? "result-score-pct-success" : pct >= 50 ? "result-score-pct-warning" : "result-score-pct-danger";
  const pillTone = pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger";
  const headline =
    session.status === "EXPIRED"
      ? "Session expired"
      : pct >= 80
        ? "Strong run."
        : pct >= 50
          ? "Decent — room to push."
          : "Keep going — these will click.";

  return (
    <AppShell
      title="Quiz result"
      actions={
        <Link to="/catalog" className="btn btn-ghost">
          ← Catalog
        </Link>
      }
    >
      <section className="result-card">
        <header className="result-header">
          <Pill tone={pillTone}>
            {session.status === "EXPIRED" ? "Expired" : "Submitted"}
          </Pill>
          {topic ? (
            <Link
              to={`/catalog/topic/${topic.id}`}
              style={{
                color: "var(--color-blue)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {topic.title}
            </Link>
          ) : null}
        </header>

        <h1 className="result-headline">{headline}</h1>

        <div className="result-score-row">
          <div className="result-score-number">
            {correct}
            <span className="result-score-denom">/{total}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={`result-score-pct ${pctTone}`}>{pct}%</span>
            <span className="result-score-label">
              {session.mode === "MOCK" ? "Mock" : "Practice"} ·{" "}
              {session.strategy === "irt" ? "Adaptive" : "Linear"}
            </span>
          </div>
        </div>

        <h2 className="section-heading">Item review</h2>
        <ol className="result-review">
          {session.items.map((it) => (
            <li key={it.itemIdx} className="result-review-row">
              <span className="result-review-idx">Q{it.itemIdx + 1}</span>
              <span className="result-review-status">
                {it.answered ? (
                  it.isCorrect ? (
                    <Pill tone="success">Correct</Pill>
                  ) : (
                    <Pill tone="danger">Incorrect</Pill>
                  )
                ) : (
                  <Pill tone="muted">Skipped</Pill>
                )}
              </span>
              <span className="result-review-qid">#{it.questionId.slice(0, 8)}</span>
            </li>
          ))}
        </ol>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: "var(--sp-6)",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => topic && navigate(`/catalog/topic/${topic.id}`)}
            disabled={!topic}
          >
            Practice this topic again
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate("/catalog")}
          >
            Back to catalog
          </button>
        </div>
      </section>
    </AppShell>
  );
}
