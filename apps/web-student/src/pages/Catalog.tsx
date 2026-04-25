import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, tokens } from "@alp/design-system";
import { auth } from "../lib/api";

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
    <main style={styles.page}>
      <header style={styles.header}>
        <Link to="/home" style={styles.backLink} aria-label="Back to home">‹ Home</Link>
      </header>

      <section style={styles.section}>
        <h1 style={styles.title}>Catalog</h1>
        <p style={styles.subtitle}>Pick an exam to browse its subjects and topics.</p>

        {error ? (
          <div role="alert" style={styles.errorBanner}>
            <Badge tone="danger">Error</Badge>
            <span>{error}</span>
          </div>
        ) : null}

        {exams === null ? (
          <ListSkeleton />
        ) : exams.length === 0 ? (
          <p style={{ color: tokens.colors.text.muted }}>No exams available yet.</p>
        ) : (
          <ul style={styles.list}>
            {exams.map((exam) => (
              <li key={exam.id} style={{ listStyle: "none" }}>
                <Link to={`/catalog/exam/${exam.id}`} style={styles.itemLink}>
                  <div>
                    <div style={styles.itemName}>{exam.name}</div>
                    {exam.subtitle ? <p style={styles.itemSubtitle}>{exam.subtitle}</p> : null}
                  </div>
                  <span style={styles.chevron}>›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ListSkeleton() {
  return (
    <ul style={styles.list}>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} style={{ ...styles.itemLink, listStyle: "none", height: 64, opacity: 0.5 } as React.CSSProperties} />
      ))}
    </ul>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: tokens.colors.surface.secondary,
    fontFamily: tokens.typography.family.ui,
  },
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
  title: {
    margin: 0,
    fontSize: tokens.typography.scale.pageTitle.size,
    fontWeight: tokens.typography.scale.pageTitle.weight,
    color: tokens.colors.text.primary,
  },
  subtitle: { color: tokens.colors.text.secondary, fontSize: tokens.typography.scale.body.size, marginTop: tokens.spacing[2], marginBottom: tokens.spacing[5] },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: tokens.spacing[3] },
  itemLink: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacing[4],
    background: tokens.colors.surface.primary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.card,
    textDecoration: "none",
    color: tokens.colors.text.primary,
  },
  itemName: { fontSize: tokens.typography.scale.subheading.size, fontWeight: tokens.typography.scale.subheading.weight },
  itemSubtitle: { margin: `${tokens.spacing[1]}px 0 0 0`, fontSize: tokens.typography.scale.hint.size, color: tokens.colors.text.secondary },
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
