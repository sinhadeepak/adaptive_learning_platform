import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

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
          setError(r.status === 404 ? "Session not found." : "We couldn't load your results.");
          return;
        }
        const body = (await r.json()) as SessionDetail;
        setSession(body);
        // Topic title for context — best-effort, ignore failures.
        try {
          const t = await auth.fetch(`/api/v1/catalog/topics/${body.topicId}`);
          if (t.ok) setTopic((await t.json()) as Topic);
        } catch { /* swallow */ }
      } catch {
        setError("We couldn't load your results.");
      }
    })();
  }, [sessionId]);

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

  if (!session) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <p style={{ color: tokens.colors.text.muted }}>Loading…</p>
        </section>
      </main>
    );
  }

  const total = session.servedCount;
  const correct = session.correctCount;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreTone: "success" | "warning" | "danger" =
    pct >= 80 ? "success" : pct >= 50 ? "warning" : "danger";
  const headline =
    session.status === "EXPIRED"
      ? "Session expired"
      : pct >= 80
      ? "Strong run."
      : pct >= 50
      ? "Decent — room to push."
      : "Keep going — these will click.";

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <header style={styles.header}>
          <Badge tone={scoreTone}>{session.status === "EXPIRED" ? "Expired" : "Submitted"}</Badge>
          {topic ? (
            <Link to={`/catalog/topic/${topic.id}`} style={styles.topicLink}>
              {topic.title}
            </Link>
          ) : null}
        </header>

        <h1 style={styles.headline}>{headline}</h1>

        <div style={styles.scoreRow}>
          <div style={styles.scoreNumber}>
            {correct}
            <span style={styles.scoreDenom}>/{total}</span>
          </div>
          <div style={styles.scoreMeta}>
            <div style={styles.scorePct}>{pct}%</div>
            <div style={styles.scoreLabel}>{session.mode === "MOCK" ? "Mock" : "Practice"} · {session.strategy === "irt" ? "Adaptive" : "Linear"}</div>
          </div>
        </div>

        <h2 style={styles.h2}>Item review</h2>
        <ol style={styles.review}>
          {session.items.map((it) => (
            <li key={it.itemIdx} style={styles.reviewRow}>
              <span style={styles.reviewIdx}>Q{it.itemIdx + 1}</span>
              <span style={styles.reviewStatus}>
                {it.answered ? (
                  it.isCorrect ? <Badge tone="success">Correct</Badge> : <Badge tone="danger">Incorrect</Badge>
                ) : (
                  <Badge>Skipped</Badge>
                )}
              </span>
              <span style={styles.reviewQid}>#{it.questionId.slice(0, 8)}</span>
            </li>
          ))}
        </ol>

        <div style={styles.actions}>
          <Button onClick={() => topic && navigate(`/catalog/topic/${topic.id}`)} disabled={!topic} size="lg">
            Practice this topic again
          </Button>
          <Button variant="secondary" onClick={() => navigate("/catalog")} size="lg">
            Back to catalog
          </Button>
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
  card: {
    width: "100%",
    maxWidth: 720,
    background: tokens.colors.surface.primary,
    borderRadius: tokens.radius.card,
    border: `1px solid ${tokens.colors.border.default}`,
    padding: tokens.spacing[6],
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tokens.spacing[4] },
  topicLink: { color: tokens.colors.brand.primary, textDecoration: "none", fontSize: tokens.typography.scale.body.size, fontWeight: 500 },
  headline: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  scoreRow: { display: "flex", alignItems: "baseline", gap: tokens.spacing[5], margin: `${tokens.spacing[5]}px 0` },
  scoreNumber: {
    fontSize: 56,
    fontWeight: 700,
    color: tokens.colors.text.primary,
    lineHeight: 1,
  },
  scoreDenom: { fontSize: 28, color: tokens.colors.text.muted, fontWeight: 500 },
  scoreMeta: { display: "flex", flexDirection: "column", gap: tokens.spacing[1] },
  scorePct: { fontSize: tokens.typography.scale.sectionHeading.size, fontWeight: 600, color: tokens.colors.text.primary },
  scoreLabel: { fontSize: tokens.typography.scale.body.size, color: tokens.colors.text.secondary },
  h2: {
    margin: `${tokens.spacing[5]}px 0 ${tokens.spacing[2]}px 0`,
    fontSize: tokens.typography.scale.sectionHeading.size,
    fontWeight: tokens.typography.scale.sectionHeading.weight,
    color: tokens.colors.text.primary,
  },
  review: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: tokens.spacing[1] },
  reviewRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[3],
    padding: `${tokens.spacing[2]}px 0`,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
    fontSize: tokens.typography.scale.body.size,
  },
  reviewIdx: { fontWeight: 600, color: tokens.colors.text.primary, minWidth: 36 },
  reviewStatus: { flex: 1 },
  reviewQid: { color: tokens.colors.text.muted, fontFamily: tokens.typography.family.mono, fontSize: tokens.typography.scale.label.size },
  actions: { display: "flex", flexDirection: "column", gap: tokens.spacing[2], marginTop: tokens.spacing[5] },
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
