// Sprint 18 (P3-S3) — Course detail + purchase + ratings preview.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
    courseMarketplace.get(courseId).then(setCourse).catch((e) => setError((e as Error).message));
    courseMarketplace.ratings(courseId).then(setRatings).catch(() => setRatings(null));
  }, [courseId]);

  async function purchase() {
    if (!courseId) return;
    if (!confirm(`Purchase this course for ${paiseToRupees(course!.pricePaise)}?`)) return;
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
      <main className="page" style={{ padding: 24 }}>
        {error ? <p className="banner banner-error">{error}</p> : <p>Loading…</p>}
        <Link to="/courses">← Back to courses</Link>
      </main>
    );
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 800 }}>
      <Link to="/courses">← Back to courses</Link>
      <h1>{course.title}</h1>
      <p style={{ color: "var(--text-muted)" }}>{course.description}</p>
      <p style={{ fontSize: 18 }}>
        <strong>{paiseToRupees(course.pricePaise)}</strong>
      </p>

      {ratings && ratings.count > 0 && (
        <p>
          ⭐ {ratings.averageStars.toFixed(1)} ({ratings.count} review
          {ratings.count === 1 ? "" : "s"})
        </p>
      )}

      <section style={{ margin: "16px 0" }}>
        <h2>Preview</h2>
        <pre style={{ whiteSpace: "pre-wrap", background: "var(--bg-surface-1, #f5f5f5)", padding: 12, borderRadius: 8 }}>
          {course.contentMd}
          {course.contentMd.length >= 500 && "\n\n[Purchase to read the full course]"}
        </pre>
      </section>

      {error && <p className="banner banner-error">{error}</p>}

      <button type="button" onClick={purchase} disabled={busy} className="btn-primary">
        {busy ? "Processing…" : `Buy course · ${paiseToRupees(course.pricePaise)}`}
      </button>

      {ratings && ratings.recent.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Recent reviews</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {ratings.recent.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: 12,
                  border: "1px solid var(--border-faint)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <strong>{"⭐".repeat(r.stars)}</strong>
                {r.comment && <p style={{ marginTop: 4 }}>{r.comment}</p>}
                <small style={{ color: "var(--text-muted)" }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
