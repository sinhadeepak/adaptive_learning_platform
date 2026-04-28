// Sprint 18 (P3-S3) — Creator's course list across all states.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type Course, courseAuthoring } from "../lib/api";

const STATUS_BADGE: Record<Course["status"], { color: string; label: string }> = {
  DRAFT: { color: "#888", label: "Draft" },
  PENDING_REVIEW: { color: "#FFB020", label: "Pending review" },
  PUBLISHED: { color: "#10C47A", label: "Published" },
  RETIRED: { color: "#888", label: "Retired" },
};

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function MyCourses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    courseAuthoring
      .myCourses()
      .then(setCourses)
      .catch((e) => setError((e as Error).message));
  }
  useEffect(refresh, []);

  async function submit(c: Course) {
    try {
      await courseAuthoring.submit(c.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function retire(c: Course) {
    if (!confirm(`Retire "${c.title}"? Existing buyers retain access.`)) return;
    try {
      await courseAuthoring.retire(c.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <AppShell title="My courses">
      <main className="page" style={{ padding: 24, maxWidth: 960 }}>
        <h1>My courses</h1>
        <p>
          <Link to="/creator/courses/new" className="btn-primary">
            + New course
          </Link>
        </p>

        {error && <p className="banner banner-error">{error}</p>}
        {courses === null && !error && <p>Loading…</p>}
        {courses !== null && courses.length === 0 && (
          <p>No courses yet. Create your first one.</p>
        )}

        {courses !== null && courses.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {courses.map((c) => {
              const badge = STATUS_BADGE[c.status];
              return (
                <li
                  key={c.id}
                  style={{
                    padding: 16,
                    border: "1px solid var(--border-faint)",
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{c.title}</h2>
                      <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                        {paiseToRupees(c.pricePaise)} · {c.tier}
                      </p>
                    </div>
                    <span
                      style={{
                        padding: "2px 8px",
                        background: badge.color,
                        color: "white",
                        fontSize: 11,
                        borderRadius: 4,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {c.status === "DRAFT" && (
                      <>
                        <Link to={`/creator/courses/${c.id}/edit`}>Edit</Link>{" "}·{" "}
                        <button type="button" onClick={() => submit(c)}>
                          Submit for review
                        </button>
                      </>
                    )}
                    {c.status === "PENDING_REVIEW" && (
                      <small>Awaiting admin approval</small>
                    )}
                    {c.status === "PUBLISHED" && (
                      <button type="button" onClick={() => retire(c)}>
                        Retire course
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
