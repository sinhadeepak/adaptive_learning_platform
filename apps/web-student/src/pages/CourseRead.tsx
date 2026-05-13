// Sprint 18 (P3-S3) — Course content reader (post-purchase).
// Sprint 21 (P3-S6) — Module/lesson navigation when the course has structure.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type CourseDetail,
  type CourseStructureView,
  courseMarketplace,
} from "../lib/api";

export function CourseRead() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [structure, setStructure] = useState<CourseStructureView | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    courseMarketplace
      .access(courseId)
      .then(setCourse)
      .catch((e) => setError((e as Error).message));
    courseMarketplace
      .structure(courseId)
      .then((s) => {
        setStructure(s);
        // Auto-select first lesson if any
        const firstLesson = s.items.flatMap((i) => i.lessons)[0];
        if (firstLesson) setActiveLessonId(firstLesson.id);
      })
      .catch(() => {
        // Structure failure is not fatal — fall back to legacy content_md
      });
  }, [courseId]);

  const allLessons = useMemo(
    () => structure?.items.flatMap((i) => i.lessons) ?? [],
    [structure],
  );

  const activeLesson = useMemo(
    () => allLessons.find((l) => l.id === activeLessonId) ?? null,
    [allLessons, activeLessonId],
  );

  if (error) {
    return (
      <AppShell title="Course">
        <div style={{ padding: "16px 24px" }}>
          <p className="banner banner-error">{error}</p>
          <Link to="/courses-mine" style={{ color: "var(--color-blue)" }}>← Back to my courses</Link>
        </div>
      </AppShell>
    );
  }
  if (!course) {
    return (
      <AppShell title="Course">
        <div style={{ padding: "16px 24px", color: "var(--text-muted)" }}>Loading…</div>
      </AppShell>
    );
  }

  const hasStructure = (structure?.items.length ?? 0) > 0;

  if (!hasStructure) {
    // Legacy unstructured course — render content_md verbatim.
    return (
      <AppShell title={course.title}>
        <div style={{ padding: "16px 24px 32px", maxWidth: 880 }}>
          <Link to="/courses-mine" style={{ color: "var(--color-blue)", fontSize: 13 }}>← Back to my courses</Link>
          <h1 style={{ marginTop: 12 }}>{course.title}</h1>
          <p style={{ color: "var(--text-muted)" }}>{course.description}</p>
          <article
            style={{
              background: "var(--bg-surface1)",
              border: "1px solid var(--border)",
              padding: 24,
              borderRadius: 8,
              marginTop: 16,
              whiteSpace: "pre-wrap",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {course.contentMd}
          </article>
        </div>
      </AppShell>
    );
  }

  const activeIndex = activeLesson
    ? allLessons.findIndex((l) => l.id === activeLesson.id) + 1
    : 0;

  return (
    <AppShell title={course.title}>
    <div style={{ padding: "16px 24px 32px", maxWidth: 1200 }}>
      <Link to="/courses-mine" style={{ color: "var(--color-blue)", fontSize: 13 }}>← Back to my courses</Link>
      <h1 style={{ marginTop: 12 }}>{course.title}</h1>
      <p style={{ color: "var(--text-muted)" }}>{course.description}</p>
      <p style={{ color: "var(--text-muted)" }}>
        Lesson {activeIndex} of {allLessons.length}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 24, marginTop: 16 }}>
        <nav
          aria-label="Course outline"
          style={{
            background: "var(--bg-surface-1, #fff)",
            padding: 16,
            borderRadius: 8,
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {structure?.items.map(({ module, lessons }) => (
            <div key={module.id} style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>
                {module.position}. {module.title}
              </strong>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 4 }}>
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => setActiveLessonId(lesson.id)}
                      style={{
                        background:
                          activeLessonId === lesson.id ? "var(--bg-elevated, #eef)" : "none",
                        border: "none",
                        padding: "6px 8px",
                        textAlign: "left",
                        width: "100%",
                        cursor: "pointer",
                        color:
                          activeLessonId === lesson.id ? "inherit" : "var(--color-blue, #4F87F6)",
                        borderRadius: 4,
                      }}
                    >
                      {lesson.position}. {lesson.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <article
          style={{
            background: "var(--bg-surface-1, #fff)",
            padding: 24,
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            minHeight: "60vh",
          }}
        >
          {activeLesson ? (
            <>
              <h2 style={{ marginTop: 0 }}>{activeLesson.title}</h2>
              <div>{activeLesson.contentMd}</div>
            </>
          ) : (
            <p>Pick a lesson to begin.</p>
          )}
        </article>
      </div>
    </div>
    </AppShell>
  );
}
