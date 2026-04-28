import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

export function Catalog() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/catalog/exams");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setExams((await res.json()) as Exam[]);
      } catch {
        setError("We couldn't load the exam list.");
      }
    })();
  }, []);

  return (
    <AppShell title="Catalog">
      <h1 className="page-greeting">Browse exams</h1>
      <p className="page-subhead">Pick an exam to explore its subjects and topics.</p>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {exams === null ? (
        <SkeletonRows count={4} />
      ) : exams.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">No exams yet</div>
          <p>Check back once content authoring uploads the first exam.</p>
        </div>
      ) : (
        <ul
          className="row-list"
          style={{ display: "flex", flexDirection: "column", gap: 8, padding: 0, margin: 0 }}
        >
          {exams.map((exam) => (
            <li key={exam.id} style={{ listStyle: "none" }}>
              <Link
                to={`/catalog/exam/${exam.id}`}
                className="row-link"
                aria-label={`Browse ${exam.name}`}
              >
                <div className="row-link-body">
                  <p className="row-link-title">{exam.name}</p>
                  {exam.subtitle ? <p className="row-link-meta">{exam.subtitle}</p> : null}
                </div>
                <span className="chevron" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
