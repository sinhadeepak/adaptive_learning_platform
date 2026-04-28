// Sprint 18 (P3-S3) — Course content reader (post-purchase).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { type CourseDetail, courseMarketplace } from "../lib/api";

export function CourseRead() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    courseMarketplace
      .access(courseId)
      .then(setCourse)
      .catch((e) => setError((e as Error).message));
  }, [courseId]);

  if (error) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">{error}</p>
        <Link to="/courses-mine">← Back to my courses</Link>
      </main>
    );
  }
  if (!course) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 800 }}>
      <Link to="/courses-mine">← Back</Link>
      <h1>{course.title}</h1>
      <p style={{ color: "var(--text-muted)" }}>{course.description}</p>
      <article
        style={{
          background: "var(--bg-surface-1, #fff)",
          padding: 24,
          borderRadius: 8,
          marginTop: 16,
          whiteSpace: "pre-wrap",
        }}
      >
        {course.contentMd}
      </article>
    </main>
  );
}
