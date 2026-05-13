// Creator's course list across all states — production-grade redesign.
// Uses pg-* primitives, tabs by status, proper status pills, and a
// rich empty state with a clear CTA.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type Course, courseAuthoring } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

type Tab = "draft" | "review" | "published" | "retired";

const STATUS_INFO: Record<
  Course["status"],
  { label: string; tone: "muted" | "warn" | "success"; tab: Tab }
> = {
  DRAFT: { label: "Draft", tone: "muted", tab: "draft" },
  PENDING_REVIEW: { label: "In review", tone: "warn", tab: "review" },
  PUBLISHED: { label: "Published", tone: "success", tab: "published" },
  RETIRED: { label: "Retired", tone: "muted", tab: "retired" },
};

const TAB_LABELS: Record<Tab, string> = {
  draft: "Drafts",
  review: "In review",
  published: "Published",
  retired: "Retired",
};

export function MyCourses() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("draft");

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

  const grouped = useMemo(() => {
    const out: Record<Tab, Course[]> = {
      draft: [],
      review: [],
      published: [],
      retired: [],
    };
    if (!courses) return out;
    for (const c of courses) out[STATUS_INFO[c.status].tab].push(c);
    return out;
  }, [courses]);

  const visible = grouped[tab];

  return (
    <AppShell
      title="My courses"
      actions={
        <>
          <Link to="/creator/earnings" className="pg-btn pg-btn-ghost">
            View earnings →
          </Link>
          <Link to="/creator/courses/new" className="pg-btn pg-btn-primary">
            ＋ New course
          </Link>
        </>
      }
    >
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">My courses</h1>
            <p className="pg-header-sub">
              Every course you've authored. Draft → submit for review →
              published. Retired courses retain access for existing buyers
              but stop appearing in the marketplace.
            </p>
          </div>
        </header>

        <div className="pg-tabs" role="tablist">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`pg-tab${tab === t ? " on" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
              <span className="pg-tab-count">{grouped[t].length}</span>
            </button>
          ))}
        </div>

        {error && <p className="banner banner-error">{error}</p>}

        {courses === null && !error && (
          <div className="pg-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-row" style={{ opacity: 0.5, minHeight: 80 }} aria-hidden />
            ))}
          </div>
        )}

        {courses !== null && visible.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">
              {tab === "draft" ? "✍️" : tab === "review" ? "⏳" : tab === "published" ? "🎓" : "📦"}
            </div>
            <h2 className="pg-empty-title">
              {courses.length === 0
                ? "No courses yet"
                : tab === "draft"
                  ? "No drafts in flight"
                  : tab === "review"
                    ? "Nothing in review"
                    : tab === "published"
                      ? "No published courses yet"
                      : "No retired courses"}
            </h2>
            <p className="pg-empty-body">
              {courses.length === 0
                ? "Author your first self-paced course. Once approved by the admin team, it goes live on the student marketplace."
                : tab === "draft"
                  ? "All your courses have moved on from drafting. Start a new one when you're ready."
                  : tab === "review"
                    ? "Submit a draft for review to see it here while admins approve it."
                    : tab === "published"
                      ? "Once a draft passes review, it lands here and goes live on the marketplace."
                      : "Retired courses keep paying out to existing buyers but stop accepting new ones."}
            </p>
            {(courses.length === 0 || tab === "draft") && (
              <Link to="/creator/courses/new" className="pg-btn pg-btn-primary">
                ＋ Author a course
              </Link>
            )}
          </div>
        )}

        {courses !== null && visible.length > 0 && (
          <div className="pg-list">
            {visible.map((c) => {
              const info = STATUS_INFO[c.status];
              return (
                <div key={c.id} className="pg-row">
                  <div className="pg-row-main">
                    <p className="pg-row-title">{c.title}</p>
                    <div className="pg-row-meta">
                      <span>{paiseToRupees(c.pricePaise)}</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>{c.tier}</span>
                    </div>
                  </div>
                  <div className="pg-row-aside">
                    <span className={`pg-pill pg-pill-${info.tone}`}>{info.label}</span>
                    {c.status === "DRAFT" && (
                      <>
                        <Link
                          to={`/creator/courses/${c.id}/edit`}
                          className="pg-btn pg-btn-ghost pg-btn-sm"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="pg-btn pg-btn-primary pg-btn-sm"
                          onClick={() => submit(c)}
                        >
                          Submit for review →
                        </button>
                      </>
                    )}
                    {c.status === "PENDING_REVIEW" && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Awaiting admin
                      </span>
                    )}
                    {c.status === "PUBLISHED" && (
                      <button
                        type="button"
                        className="pg-btn pg-btn-ghost pg-btn-sm"
                        onClick={() => retire(c)}
                      >
                        Retire
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
