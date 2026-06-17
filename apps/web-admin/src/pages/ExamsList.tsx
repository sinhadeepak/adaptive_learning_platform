// ExamsList — Vidya v1 admin exam catalog (mockup 5/29).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 admin mockup 5/29.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { auth } from "../lib/api";

interface ExamListEntry {
  id: string;
  code: string;
  name: string;
  subtitle: string | null;
  is_published: boolean;
  subject_count: number;
  pool_count: number;
  topic_count: number;
}

type Filter = "all" | "published" | "retired";

export function ExamsList() {
  const [exams, setExams] = useState<ExamListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("published");

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/admin/exam-builder/exams");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        setExams(Array.isArray(body) ? (body as ExamListEntry[]) : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load exams");
      }
    })();
  }, []);

  const total = exams?.length ?? 0;
  const visible = (exams ?? []).filter((e) => {
    if (filter === "published") return e.is_published;
    if (filter === "retired") return !e.is_published;
    return true;
  });

  return (
    <AdminShell
      crumbs="Exams · catalog"
      title="Exams"
      actions={
        <Link to="/exams/new" className="vidya-shell__primary">
          + Add new exam
        </Link>
      }
    >
      {error ? (
        <div className="vidya-auth__error" role="alert"><span>{error}</span></div>
      ) : null}

      <div className="admin-tabs">
        <button
          className={`admin-tabs__tab${filter === "published" ? " admin-tabs__tab--on" : ""}`}
          onClick={() => setFilter("published")}
        >
          Published
        </button>
        <button
          className={`admin-tabs__tab${filter === "retired" ? " admin-tabs__tab--on" : ""}`}
          onClick={() => setFilter("retired")}
        >
          Retired
        </button>
        <button
          className={`admin-tabs__tab${filter === "all" ? " admin-tabs__tab--on" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <span className="admin-tabs__meta">
          {visible.length} of {total} exams
        </span>
      </div>

      <section className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th style={{ textAlign: "right" }}>Subjects</th>
              <th style={{ textAlign: "right" }}>Pools</th>
              <th style={{ textAlign: "right" }}>Topics</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {exams === null ? (
              <tr><td colSpan={7} className="admin-table__empty">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="admin-table__empty">No exams match this filter.</td></tr>
            ) : (
              visible.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="admin-cell-strong">{e.name}</div>
                    {e.subtitle ? (
                      <div className="admin-cell-meta">{e.subtitle}</div>
                    ) : null}
                  </td>
                  <td className="admin-mono-sm" style={{ color: "var(--accent)" }}>{e.code}</td>
                  <td style={{ textAlign: "right" }} className="admin-mono">{e.subject_count}</td>
                  <td style={{ textAlign: "right" }} className="admin-mono">{e.pool_count || "—"}</td>
                  <td style={{ textAlign: "right" }} className="admin-mono">{e.topic_count}</td>
                  <td>
                    <span className={`admin-pill ${e.is_published ? "admin-pill--good" : "admin-pill--mute"}`}>
                      {e.is_published ? "Published" : "Retired"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link to={`/exams/edit/${e.id}`} className="admin-btn admin-btn--link">
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
