/**
 * ExamsList — admin landing for the exam catalogue.
 *
 * Lists every exam (including retired ones) with row-level counts so
 * admins can spot gaps. Each row has Edit / Open buttons; the page-
 * level "+ Add new exam" button kicks off the AI-assisted wizard.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
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

export function ExamsList() {
  const [exams, setExams] = useState<ExamListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "retired">("published");

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/admin/exam-builder/exams");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setExams((await res.json()) as ExamListEntry[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load exams");
      }
    })();
  }, []);

  const visible = (exams ?? []).filter((e) => {
    if (filter === "published") return e.is_published;
    if (filter === "retired") return !e.is_published;
    return true;
  });

  return (
    <AppShell
      title="Exams"
      actions={
        <Link to="/exams/new" className="btn btn-primary" style={{ padding: "8px 14px" }}>
          + Add new exam
        </Link>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: 10,
              border: "1px solid var(--color-red, #f43f5e)",
              borderRadius: 6,
              color: "var(--color-red, #f43f5e)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="card"
          style={{ padding: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {(["published", "retired", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "btn btn-primary" : "btn btn-ghost"}
                style={{ padding: "4px 10px", fontSize: 12, textTransform: "capitalize" }}
                aria-pressed={filter === f}
              >
                {f}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {visible.length} of {exams?.length ?? 0} exam{exams?.length === 1 ? "" : "s"}
          </span>
        </div>

        {exams === null ? (
          <div className="card" style={{ padding: 20, fontSize: 13 }}>
            Loading exams…
          </div>
        ) : visible.length === 0 ? (
          <div className="card" style={{ padding: 20, fontSize: 13, color: "var(--text-muted)" }}>
            No {filter !== "all" ? filter : ""} exams yet.{" "}
            <Link to="/exams/new" style={{ color: "var(--color-blue)" }}>
              Add the first one →
            </Link>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "var(--bg-surface3)" }}>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 11 }}>
                  <th style={th}>Name</th>
                  <th style={th}>Code</th>
                  <th style={{ ...th, textAlign: "right" }}>Subjects</th>
                  <th style={{ ...th, textAlign: "right" }}>Pools</th>
                  <th style={{ ...th, textAlign: "right" }}>Topics</th>
                  <th style={th}>Status</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{e.name}</div>
                      {e.subtitle && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {e.subtitle}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <code style={{ fontSize: 11, color: "var(--color-ai)" }}>{e.code}</code>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {e.subject_count}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {e.pool_count > 0 ? e.pool_count : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {e.topic_count}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          background: e.is_published ? "rgba(16,196,122,0.15)" : "rgba(244,63,94,0.15)",
                          color: e.is_published ? "var(--color-green)" : "var(--color-red)",
                        }}
                      >
                        {e.is_published ? "Published" : "Retired"}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <Link
                        to={`/exams/edit/${e.id}`}
                        className="btn btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

const th: React.CSSProperties = {
  padding: "8px 14px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const td: React.CSSProperties = {
  padding: "10px 14px",
  verticalAlign: "top",
};
