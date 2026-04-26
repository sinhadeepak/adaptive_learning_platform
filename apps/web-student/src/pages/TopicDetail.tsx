import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

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

  const backAction = (
    <Link to="/catalog" className="btn btn-ghost">
      ← Catalog
    </Link>
  );

  if (error && !topic) {
    return (
      <AppShell title="Topic" actions={backAction}>
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (!topic) {
    return (
      <AppShell title="Topic" actions={backAction}>
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  return (
    <AppShell title={topic.title} actions={backAction}>
      <div className="hero">
        <h1>{topic.title}</h1>
        <Pill tone={topic.tier === "PREMIUM" ? "warning" : "muted"}>
          {topic.tier === "PREMIUM" ? "Premium" : "Free"}
        </Pill>
      </div>
      <p className="hero-meta">
        {topic.questionCount} question{topic.questionCount === 1 ? "" : "s"}
      </p>

      {error ? (
        <Banner tone="warning" role="alert">
          {error}
        </Banner>
      ) : null}

      <div className="hero-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={startQuiz}
          disabled={starting}
        >
          {starting ? "Starting…" : "Start practice quiz"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled
          title="Lessons land in a future sprint"
        >
          Read lesson notes
        </button>
      </div>
      <p className="hero-note">
        Practice quiz is live. Lesson notes ship in a future sprint.
      </p>

      {topic.description ? (
        <section className="section-group">
          <h2 className="section-heading">About</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
            {topic.description}
          </p>
        </section>
      ) : null}

      {topic.prerequisites.length > 0 ? (
        <section className="section-group">
          <h2 className="section-heading">Prerequisites</h2>
          <ul className="row-list">
            {topic.prerequisites.map((p) => (
              <li key={p.topicId}>
                <Link
                  to={`/catalog/topic/${p.topicId}`}
                  className="row-link"
                  aria-label={`Open prerequisite ${p.title}`}
                >
                  <div className="row-link-body">
                    <p className="row-link-title">{p.title}</p>
                  </div>
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {topic.objectives.length > 0 ? (
        <section className="section-group">
          <h2 className="section-heading">Learning objectives</h2>
          <ol
            style={{
              paddingLeft: 20,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              margin: 0,
              color: "var(--text-primary)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {topic.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="section-group">
        <h2 className="section-heading">Recent activity</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          No attempts yet — your first quiz attempt will appear here.
        </p>
      </section>
    </AppShell>
  );
}
