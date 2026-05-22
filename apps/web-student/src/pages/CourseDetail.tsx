// CourseDetail — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + course title + description preview +
// back-to-courses action) → gradient hero thumb → two-column row
// (description + price aside with primary CTA) → About / Recent reviews
// vidya-card-block sections.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import {
  type CourseDetail as CourseDetailT,
  type RatingAggregate,
  courseMarketplace,
} from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function CourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const nav = useNavigate();
  const [course, setCourse] = useState<CourseDetailT | null>(null);
  const [ratings, setRatings] = useState<RatingAggregate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    courseMarketplace
      .get(courseId)
      .then(setCourse)
      .catch((e) => setError((e as Error).message));
    courseMarketplace
      .ratings(courseId)
      .then(setRatings)
      .catch(() => setRatings(null));
  }, [courseId]);

  async function purchase() {
    if (!courseId || !course) return;
    if (!confirm(`Purchase this course for ${paiseToRupees(course.pricePaise)}?`))
      return;
    setBusy(true);
    setError(null);
    try {
      const p = await courseMarketplace.purchase(courseId);
      await courseMarketplace.confirmPayment(courseId, p.id);
      nav("/courses-mine");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!course) {
    return (
      <VidyaShell
        crumbs="MARKETPLACE · COURSE"
        title="Course"
        subtitle="Loading course details…"
        actions={<Link to="/courses" className="vidya-shell__chip">← Back to courses</Link>}
      >
        <div style={{ maxWidth: 880 }}>
          {error ? (
            <div role="alert" style={{
              padding: "var(--sp-3) var(--sp-4)",
              background: "var(--bad)",
              color: "var(--paper)",
              borderRadius: 8,
              fontSize: 13,
            }}>
              {error}
            </div>
          ) : (
            <p style={{ color: "var(--ink-3)" }}>Loading…</p>
          )}
        </div>
      </VidyaShell>
    );
  }

  const subtitlePreview = course?.description
    ? course.description.length > 160
      ? `${course.description.slice(0, 160)}…`
      : course.description
    : "Loading course details…";

  return (
    <VidyaShell
      crumbs={`MARKETPLACE · COURSE · ${course.title.toUpperCase()}`}
      title={course.title}
      subtitle={subtitlePreview}
      actions={<Link to="/courses" className="vidya-shell__chip">← Back to courses</Link>}
    >
      <div style={{ maxWidth: 880 }}>
        <div
          aria-hidden
          style={{
            height: 140,
            background: "linear-gradient(135deg, #4F87F6 0%, #8b5cf6 100%)",
            borderRadius: 10,
            marginBottom: "var(--sp-4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
            color: "#fff",
          }}
        >
          🎓
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-5)", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "var(--sp-5)" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <p style={{ color: "var(--ink-2)", margin: 0, lineHeight: 1.5, fontSize: 14 }}>
              {course.description}
            </p>
            {ratings && ratings.count > 0 && (
              <p style={{ marginTop: "var(--sp-3)", color: "var(--ink-3)", fontSize: 13 }}>
                ⭐ {ratings.averageStars.toFixed(1)} from {ratings.count} review{ratings.count === 1 ? "" : "s"}
              </p>
            )}
          </div>

          <aside
            className="vidya-card-block"
            style={{
              minWidth: 220,
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-3)",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                Price
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink)" }}>
                {paiseToRupees(course.pricePaise)}
              </div>
            </div>
            <button
              type="button"
              onClick={purchase}
              disabled={busy}
              className="vidya-shell__primary"
              style={{ width: "100%" }}
            >
              {busy ? "Processing…" : "Buy course"}
            </button>
            <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>
              Lifetime access · Refund within 7 days
            </p>
          </aside>
        </div>

        {error && (
          <div role="alert" style={{
            padding: "var(--sp-3) var(--sp-4)",
            background: "var(--bad)",
            color: "var(--paper)",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: "var(--sp-4)",
          }}>
            {error}
          </div>
        )}

        {course.contentMd && course.contentMd.trim().length > 20 && (
          <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">About this course</h2>
            </div>
            <article style={{
              whiteSpace: "pre-wrap",
              color: "var(--ink-2)",
              lineHeight: 1.6,
              fontSize: 14,
            }}>
              {course.contentMd}
              {course.contentMd.length >= 500 && (
                <p style={{ marginTop: "var(--sp-3)", color: "var(--ink-3)", fontStyle: "italic" }}>
                  [Purchase to read the full course]
                </p>
              )}
            </article>
          </section>
        )}

        {ratings && ratings.recent.length > 0 && (
          <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Recent reviews</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {ratings.recent.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "var(--sp-3)",
                    background: "var(--paper-2)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ color: "var(--warn)" }}>{"⭐".repeat(r.stars)}</div>
                  {r.comment && (
                    <p style={{ margin: "var(--sp-1) 0", color: "var(--ink-2)", fontSize: 13 }}>
                      {r.comment}
                    </p>
                  )}
                  <small style={{ color: "var(--ink-3)", fontSize: 11 }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </small>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </VidyaShell>
  );
}
