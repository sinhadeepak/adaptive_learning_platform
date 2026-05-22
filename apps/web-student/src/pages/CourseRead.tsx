// CourseRead — Vidya v1 redesign.
//
// Post-purchase reader. Three states:
//   - error: VidyaShell + Vidya role="alert" banner
//   - loading: VidyaShell + loading copy
//   - loaded:
//     * unstructured: single column article (vidya-card-block) with content_md
//     * structured:   two-column reader — left lesson nav (sticky
//       vidya-card-block), right article. Active lesson highlighted with
//       accent-soft background.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
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
      <VidyaShell
        crumbs="MARKETPLACE · COURSE · READ"
        title="Course"
        subtitle="Couldn't load this course."
        actions={<Link to="/courses-mine" className="vidya-shell__chip">← Back to my courses</Link>}
      >
        <div style={{ maxWidth: 880 }}>
          <div role="alert" style={{
            padding: "var(--sp-3) var(--sp-4)",
            background: "var(--bad)",
            color: "var(--paper)",
            borderRadius: 8,
            fontSize: 13,
          }}>
            {error}
          </div>
        </div>
      </VidyaShell>
    );
  }
  if (!course) {
    return (
      <VidyaShell
        crumbs="MARKETPLACE · COURSE · READ"
        title="Course"
        subtitle="Loading…"
        actions={<Link to="/courses-mine" className="vidya-shell__chip">← Back to my courses</Link>}
      >
        <div style={{ maxWidth: 880, color: "var(--ink-3)" }}>Loading…</div>
      </VidyaShell>
    );
  }

  const hasStructure = (structure?.items.length ?? 0) > 0;

  if (!hasStructure) {
    // Legacy unstructured course — render content_md verbatim.
    return (
      <VidyaShell
        crumbs={`MARKETPLACE · COURSE · ${course.title.toUpperCase()} · READ`}
        title={course.title}
        subtitle={course.description ?? ""}
        actions={<Link to="/courses-mine" className="vidya-shell__chip">← Back to my courses</Link>}
      >
        <div style={{ maxWidth: 880 }}>
          <article className="vidya-card-block" style={{
            whiteSpace: "pre-wrap",
            color: "var(--ink-2)",
            lineHeight: 1.6,
            fontSize: 14,
          }}>
            {course.contentMd}
          </article>
        </div>
      </VidyaShell>
    );
  }

  const activeIndex = activeLesson
    ? allLessons.findIndex((l) => l.id === activeLesson.id) + 1
    : 0;

  return (
    <VidyaShell
      crumbs={`MARKETPLACE · COURSE · ${course.title.toUpperCase()} · READ`}
      title={course.title}
      subtitle={`Lesson ${activeIndex} of ${allLessons.length}`}
      actions={<Link to="/courses-mine" className="vidya-shell__chip">← Back to my courses</Link>}
    >
      <div style={{ maxWidth: 1200 }}>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "var(--sp-4)" }}>
          <nav
            aria-label="Course outline"
            className="vidya-card-block"
            style={{
              maxHeight: "70vh",
              overflowY: "auto",
              position: "sticky",
              top: "var(--sp-3)",
              alignSelf: "start",
            }}
          >
            {structure?.items.map(({ module, lessons }) => (
              <div key={module.id} style={{ marginBottom: "var(--sp-3)" }}>
                <strong style={{ fontSize: 13, color: "var(--ink)", display: "block", marginBottom: 4 }}>
                  {module.position}. {module.title}
                </strong>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {lessons.map((lesson) => {
                    const isActive = activeLessonId === lesson.id;
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => setActiveLessonId(lesson.id)}
                        style={{
                          background: isActive ? "var(--accent-soft)" : "transparent",
                          border: "none",
                          padding: "6px 8px",
                          textAlign: "left",
                          width: "100%",
                          cursor: "pointer",
                          color: isActive ? "var(--accent-2)" : "var(--ink-2)",
                          fontWeight: isActive ? 600 : 400,
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        {lesson.position}. {lesson.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <article
            className="vidya-card-block"
            style={{
              whiteSpace: "pre-wrap",
              minHeight: "60vh",
              color: "var(--ink-2)",
              lineHeight: 1.6,
              fontSize: 14,
            }}
          >
            {activeLesson ? (
              <>
                <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
                  {activeLesson.title}
                </h2>
                <div style={{ marginTop: "var(--sp-3)" }}>{activeLesson.contentMd}</div>
              </>
            ) : (
              <p style={{ color: "var(--ink-3)" }}>Pick a lesson to begin.</p>
            )}
          </article>
        </div>
      </div>
    </VidyaShell>
  );
}
