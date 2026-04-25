import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

interface Subject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
}

interface SubjectWithTopics extends Subject {
  topics: Topic[];
}

export function CatalogExam() {
  const { examId } = useParams();
  const [data, setData] = useState<SubjectWithTopics[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) return;
    (async () => {
      try {
        const subjectsRes = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (!subjectsRes.ok) throw new Error(`HTTP ${subjectsRes.status}`);
        const subjects = (await subjectsRes.json()) as Subject[];

        const enriched = await Promise.all(
          subjects.map(async (s): Promise<SubjectWithTopics> => {
            const r = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
            const topics = r.ok ? ((await r.json()) as Topic[]) : [];
            return { ...s, topics };
          })
        );
        setData(enriched);
      } catch {
        setError("We couldn't load this exam's content.");
      }
    })();
  }, [examId]);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <Link to="/catalog" style={styles.backLink}>‹ Catalog</Link>
      </header>

      <section style={styles.section}>
        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        {data === null ? (
          <p style={{ color: tokens.colors.text.muted }}>Loading…</p>
        ) : data.length === 0 ? (
          <p style={{ color: tokens.colors.text.muted }}>No subjects yet for this exam.</p>
        ) : (
          data.map((subject) => (
            <section key={subject.id} style={{ marginBottom: tokens.spacing[6] }}>
              <h2 style={styles.subjectHeading}>{subject.name}</h2>
              {subject.topics.length === 0 ? (
                <p style={{ color: tokens.colors.text.muted, fontSize: tokens.typography.scale.body.size }}>
                  No topics yet.
                </p>
              ) : (
                <ul style={styles.topicList}>
                  {subject.topics.map((t) => (
                    <li key={t.id} style={{ listStyle: "none" }}>
                      <Link to={`/catalog/topic/${t.id}`} style={styles.topicLink}>
                        <div>
                          <div style={styles.topicTitle}>{t.title}</div>
                          <p style={styles.topicMeta}>{t.questionCount} questions</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing[3] }}>
                          {t.tier === "PREMIUM" ? <Badge tone="warning">Premium</Badge> : <Badge>Free</Badge>}
                          <span style={styles.chevron}>›</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
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
  subjectHeading: {
    margin: `0 0 ${tokens.spacing[3]}px 0`,
    fontSize: tokens.typography.scale.sectionHeading.size,
    fontWeight: tokens.typography.scale.sectionHeading.weight,
    color: tokens.colors.text.primary,
  },
  topicList: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: tokens.spacing[2] },
  topicLink: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing[3],
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.card,
    textDecoration: "none",
    color: tokens.colors.text.primary,
  },
  topicTitle: { fontWeight: 500, fontSize: tokens.typography.scale.body.size },
  topicMeta: { margin: `${tokens.spacing[1]}px 0 0 0`, color: tokens.colors.text.muted, fontSize: tokens.typography.scale.hint.size },
  chevron: { color: tokens.colors.text.muted, fontSize: 20 },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.panel,
    background: tokens.colors.semantic.danger.bg,
    color: tokens.colors.semantic.danger.fg,
    marginBottom: tokens.spacing[4],
    fontSize: tokens.typography.scale.body.size,
  },
};
