import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/dashboard";

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
          }),
        );
        setData(enriched);
      } catch {
        setError("We couldn't load this exam's content.");
      }
    })();
  }, [examId]);

  return (
    <AppShell
      title="Exam"
      actions={
        <Link to="/catalog" className="btn btn-ghost">
          ← All exams
        </Link>
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {data === null ? (
        <SkeletonRows count={3} />
      ) : data.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">Nothing here yet</div>
          <p>This exam has no subjects in the catalog.</p>
        </div>
      ) : (
        data.map((subject) => (
          <section key={subject.id} className="section-group">
            <h2 className="section-heading">{subject.name}</h2>
            {subject.topics.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No topics yet.</p>
            ) : (
              <ul className="row-list">
                {subject.topics.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/catalog/topic/${t.id}`}
                      className="row-link"
                      aria-label={`Open ${t.title}`}
                    >
                      <div className="row-link-body">
                        <p className="row-link-title">{t.title}</p>
                        <p className="row-link-meta">{t.questionCount} questions</p>
                      </div>
                      <div className="row-link-trail">
                        <Pill tone={t.tier === "PREMIUM" ? "warning" : "muted"}>
                          {t.tier === "PREMIUM" ? "Premium" : "Free"}
                        </Pill>
                        <span className="chevron" aria-hidden>
                          ›
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </AppShell>
  );
}
