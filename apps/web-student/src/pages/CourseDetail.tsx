// Sprint 18 (P3-S3) — Course detail + purchase + ratings preview.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
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

  return (
    <AppShell title={course?.title ?? "Course"}>
      <div style={{ padding: "16px 24px 32px", maxWidth: 880 }}>
        <Link to="/courses" style={{ color: "var(--info)", fontSize: 13 }}>
          ← Back to courses
        </Link>

        {!course && error && (
          <p className="banner banner-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
        {!course && !error && (
          <p style={{ color: "var(--ink-3)", marginTop: 12 }}>Loading…</p>
        )}

        {course && (
          <>
            <div
              style={{
                height: 140,
                background:
                  "linear-gradient(135deg, #4F87F6 0%, #8b5cf6 100%)",
                borderRadius: 10,
                marginTop: 16,
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 56,
              }}
              aria-hidden
            >
              🎓
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h1 style={{ margin: 0, fontSize: 28 }}>{course.title}</h1>
                <p style={{ color: "var(--ink-2)", margin: "8px 0 0", lineHeight: 1.5 }}>
                  {course.description}
                </p>
                {ratings && ratings.count > 0 && (
                  <p style={{ marginTop: 12, color: "var(--ink-3)" }}>
                    ⭐ {ratings.averageStars.toFixed(1)} from {ratings.count}{" "}
                    review{ratings.count === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              <aside
                style={{
                  background: "var(--paper-2)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                  padding: 20,
                  minWidth: 220,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.04 }}>
                    Price
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)" }}>
                    {paiseToRupees(course.pricePaise)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={purchase}
                  disabled={busy}
                  style={{
                    padding: "10px 16px",
                    background: "var(--info)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: busy ? "not-allowed" : "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {busy ? "Processing…" : "Buy course"}
                </button>
                <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>
                  Lifetime access · Refund within 7 days
                </p>
              </aside>
            </div>

            {error && (
              <p className="banner banner-error" style={{ marginTop: 16 }}>
                {error}
              </p>
            )}

            {course.contentMd && course.contentMd.trim().length > 20 && (
              <section style={{ marginTop: 32 }}>
                <h2 style={{ fontSize: 18, marginBottom: 8 }}>About this course</h2>
                <article
                  style={{
                    background: "var(--paper-2)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: 16,
                    whiteSpace: "pre-wrap",
                    color: "var(--ink-2)",
                    lineHeight: 1.6,
                  }}
                >
                  {course.contentMd}
                  {course.contentMd.length >= 500 && (
                    <p style={{ marginTop: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
                      [Purchase to read the full course]
                    </p>
                  )}
                </article>
              </section>
            )}

            {ratings && ratings.recent.length > 0 && (
              <section style={{ marginTop: 32 }}>
                <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent reviews</h2>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {ratings.recent.map((r) => (
                    <li
                      key={r.id}
                      style={{
                        padding: 16,
                        background: "var(--paper-2)",
                        border: "1px solid var(--rule)",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ color: "var(--warn, #fbbf24)" }}>
                        {"⭐".repeat(r.stars)}
                      </div>
                      {r.comment && (
                        <p style={{ margin: "6px 0", color: "var(--ink-2)" }}>
                          {r.comment}
                        </p>
                      )}
                      <small style={{ color: "var(--ink-3)" }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}