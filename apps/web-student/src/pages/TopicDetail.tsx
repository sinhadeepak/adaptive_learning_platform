import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, tokens } from "@alp/design-system";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  description?: string | null;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
  objectives: string[];
  prerequisites: Array<{ topicId: string; title: string }>;
}

export function TopicDetail() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!topicId) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/topics/${topicId}`);
        if (r.status === 404) {
          setError("Topic not found.");
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setTopic((await r.json()) as Topic);
      } catch {
        setError("We couldn't load this topic.");
      }
    })();
  }, [topicId]);

  async function startQuiz() {
    if (!topicId || !user || starting) return;
    setError(null);
    setStarting(true);
    try {
      const r = await auth.fetch(`/api/v1/quiz/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, userId: user.id, mode: "PRACTICE" }),
      });
      if (r.status === 422) {
        setError("This topic doesn't have any practice questions yet.");
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${body.sessionId}`);
    } catch {
      setError("We couldn't start the quiz. Try again in a moment.");
    } finally {
      setStarting(false);
    }
  }

  if (error) {
    return (
      <main style={styles.page}>
        <header style={styles.header}>
          <Link to="/catalog" style={styles.backLink}>‹ Catalog</Link>
        </header>
        <section style={styles.section}>
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        </section>
      </main>
    );
  }

  if (!topic) {
    return (
      <main style={styles.page}>
        <header style={styles.header}>
          <Link to="/catalog" style={styles.backLink}>‹ Catalog</Link>
        </header>
        <section style={styles.section}>
          <p style={{ color: tokens.colors.text.muted }}>Loading…</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <Link to="/catalog" style={styles.backLink}>‹ Catalog</Link>
      </header>

      <section style={styles.section}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>{topic.title}</h1>
          {topic.tier === "PREMIUM" ? <Badge tone="warning">Premium</Badge> : <Badge>Free</Badge>}
        </div>
        <p style={styles.meta}>{topic.questionCount} questions</p>

        <div style={styles.actions}>
          <Button size="lg" isLoading={starting} onClick={startQuiz}>
            {starting ? "Starting…" : "Start practice quiz"}
          </Button>
          <Button variant="secondary" size="lg" disabled title="Lessons land in Sprint 4">
            Read lesson notes
          </Button>
        </div>
        <p style={styles.disabledNote}>Practice quiz is live (Sprint 3). Lesson notes ship in Sprint 4.</p>

        {topic.description ? (
          <>
            <h2 style={styles.h2}>About</h2>
            <p style={styles.bodyText}>{topic.description}</p>
          </>
        ) : null}

        {topic.prerequisites.length > 0 ? (
          <>
            <h2 style={styles.h2}>Prerequisites</h2>
            <ul style={styles.prereqList}>
              {topic.prerequisites.map((p) => (
                <li key={p.topicId}>
                  <Link to={`/catalog/topic/${p.topicId}`} style={styles.prereqLink}>{p.title}</Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {topic.objectives.length > 0 ? (
          <>
            <h2 style={styles.h2}>Learning objectives</h2>
            <ol style={styles.objectivesList}>
              {topic.objectives.map((o, i) => (
                <li key={i} style={styles.objective}>{o}</li>
              ))}
            </ol>
          </>
        ) : null}

        <h2 style={styles.h2}>Recent activity</h2>
        <p style={{ color: tokens.colors.text.muted, fontSize: tokens.typography.scale.body.size }}>
          No attempts yet — your first quiz attempt will appear here.
        </p>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: tokens.colors.surface.secondary, fontFamily: tokens.typography.family.ui },
  header: {
    background: tokens.colors.surface.primary,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
    height: 56,
    display: "flex",
    alignItems: "center",
    padding: `0 ${tokens.spacing[6]}px`,
  },
  backLink: { color: tokens.colors.text.secondary, textDecoration: "none", fontSize: tokens.typography.scale.body.size },
  section: { maxWidth: 720, margin: "0 auto", padding: tokens.spacing[5], boxSizing: "border-box" },
  titleRow: { display: "flex", alignItems: "center", gap: tokens.spacing[3] },
  title: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  meta: { color: tokens.colors.text.secondary, fontSize: tokens.typography.scale.body.size, marginTop: tokens.spacing[1] },
  actions: { display: "flex", flexDirection: "column", gap: tokens.spacing[2], marginTop: tokens.spacing[5] },
  disabledNote: {
    margin: `${tokens.spacing[2]}px 0 ${tokens.spacing[5]}px 0`,
    color: tokens.colors.text.muted,
    fontSize: tokens.typography.scale.hint.size,
  },
  h2: {
    margin: `${tokens.spacing[5]}px 0 ${tokens.spacing[2]}px 0`,
    fontSize: tokens.typography.scale.sectionHeading.size,
    fontWeight: tokens.typography.scale.sectionHeading.weight,
    color: tokens.colors.text.primary,
  },
  bodyText: { fontSize: tokens.typography.scale.body.size, color: tokens.colors.text.secondary, lineHeight: 1.5 },
  prereqList: { paddingLeft: tokens.spacing[5], display: "flex", flexDirection: "column", gap: tokens.spacing[1] },
  prereqLink: { color: tokens.colors.brand.primary, textDecoration: "none", fontSize: tokens.typography.scale.body.size },
  objectivesList: { paddingLeft: tokens.spacing[5], display: "flex", flexDirection: "column", gap: tokens.spacing[2] },
  objective: { fontSize: tokens.typography.scale.body.size, color: tokens.colors.text.primary },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    fontSize: tokens.typography.scale.body.size,
  },
};
