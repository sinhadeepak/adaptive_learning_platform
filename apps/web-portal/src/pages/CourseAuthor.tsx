// Sprint 18 (P3-S3) — Course author page (create + edit DRAFT courses).
// Sprint 21 (P3-S6) — Adds module + lesson sidebar editor on the right.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type Course,
  type CourseLesson,
  type CourseModule,
  type CourseStructure,
  courseAuthoring,
  courseStructure,
} from "../lib/api";
import { nextPosition } from "../lib/course_structure";

function rupeesToPaise(rs: number): number {
  return Math.round(rs * 100);
}

export function CourseAuthor() {
  const { courseId } = useParams<{ courseId?: string }>();
  const isNew = !courseId;
  const nav = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentMd, setContentMd] = useState("");
  const [priceRs, setPriceRs] = useState<number>(499);
  const [course, setCourse] = useState<Course | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [structure, setStructure] = useState<CourseStructure | null>(null);
  const [activeLesson, setActiveLesson] = useState<{ moduleId: string; lessonId: string } | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonBody, setLessonBody] = useState("");
  const [lessonSaving, setLessonSaving] = useState(false);
  const [structErr, setStructErr] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    courseAuthoring
      .get(courseId)
      .then((c) => {
        setCourse(c);
        setTitle(c.title);
        setDescription(c.description);
        setContentMd(c.contentMd);
        setPriceRs(c.pricePaise / 100);
      })
      .catch((e) => setError((e as Error).message));
    courseStructure
      .get(courseId)
      .then(setStructure)
      .catch((e) => setStructErr((e as Error).message));
  }, [courseId]);

  async function reloadStructure() {
    if (!courseId) return;
    try {
      const s = await courseStructure.get(courseId);
      setStructure(s);
    } catch (e) {
      setStructErr((e as Error).message);
    }
  }

  async function save() {
    setError(null);
    setSubmitting(true);
    try {
      if (isNew) {
        const c = await courseAuthoring.create({
          title,
          description,
          contentMd,
          pricePaise: rupeesToPaise(priceRs),
        });
        nav(`/creator/courses/${c.id}/edit`);
      } else if (courseId) {
        await courseAuthoring.patch(courseId, {
          title,
          description,
          contentMd,
          pricePaise: rupeesToPaise(priceRs),
        });
        nav("/creator/courses");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function addModule() {
    if (!courseId) return;
    const t = window.prompt("Module title");
    if (!t || !t.trim()) return;
    try {
      await courseStructure.addModule(courseId, t.trim());
      await reloadStructure();
    } catch (e) {
      setStructErr((e as Error).message);
    }
  }

  async function renameModule(m: CourseModule) {
    if (!courseId) return;
    const t = window.prompt("Rename module", m.title);
    if (!t || !t.trim() || t === m.title) return;
    try {
      await courseStructure.patchModule(courseId, m.id, { title: t.trim() });
      await reloadStructure();
    } catch (e) {
      setStructErr((e as Error).message);
    }
  }

  async function deleteModule(m: CourseModule) {
    if (!courseId) return;
    if (!window.confirm(`Delete module "${m.title}" and all its lessons?`)) return;
    try {
      await courseStructure.deleteModule(courseId, m.id);
      if (activeLesson?.moduleId === m.id) setActiveLesson(null);
      await reloadStructure();
    } catch (e) {
      setStructErr((e as Error).message);
    }
  }

  async function addLesson(m: CourseModule, lessons: CourseLesson[]) {
    if (!courseId) return;
    const t = window.prompt("Lesson title");
    if (!t || !t.trim()) return;
    try {
      await courseStructure.addLesson(courseId, m.id, t.trim(), "");
      // nextPosition is computed server-side; the helper here also tells us
      // what number we'd assign so educators know where it lands.
      void nextPosition(lessons);
      await reloadStructure();
    } catch (e) {
      setStructErr((e as Error).message);
    }
  }

  async function selectLesson(moduleId: string, lesson: CourseLesson) {
    setActiveLesson({ moduleId, lessonId: lesson.id });
    setLessonTitle(lesson.title);
    setLessonBody(lesson.contentMd);
  }

  async function saveLesson() {
    if (!courseId || !activeLesson) return;
    setLessonSaving(true);
    try {
      await courseStructure.patchLesson(courseId, activeLesson.moduleId, activeLesson.lessonId, {
        title: lessonTitle,
        contentMd: lessonBody,
      });
      await reloadStructure();
    } catch (e) {
      setStructErr((e as Error).message);
    } finally {
      setLessonSaving(false);
    }
  }

  async function deleteLesson(moduleId: string, lesson: CourseLesson) {
    if (!courseId) return;
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    try {
      await courseStructure.deleteLesson(courseId, moduleId, lesson.id);
      if (activeLesson?.lessonId === lesson.id) setActiveLesson(null);
      await reloadStructure();
    } catch (e) {
      setStructErr((e as Error).message);
    }
  }

  const locked = course && course.status !== "DRAFT";

  return (
    <AppShell title={isNew ? "New course" : "Edit course"}>
      <main className="page" style={{ padding: 24, maxWidth: 1280 }}>
        <h1>{isNew ? "New course" : "Edit course"}</h1>
        {locked && (
          <p className="banner">
            Course is in <strong>{course?.status}</strong> — only price + cover
            edits allowed. Retire and re-create to edit content.
          </p>
        )}

        {error && <p className="banner banner-error">{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: isNew ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", gap: 24 }}>
          <section>
            <fieldset style={{ marginBottom: 16 }}>
              <legend>Course meta</legend>
              <label>
                Title{" "}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={240}
                />
              </label>
              <label>
                Short description (shown on listing cards){" "}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={4000}
                  rows={3}
                />
              </label>
              <label>
                Price (₹){" "}
                <input
                  type="number"
                  min={49}
                  max={4999}
                  value={priceRs}
                  onChange={(e) => setPriceRs(parseInt(e.target.value || "0", 10))}
                />{" "}
                <small>= {rupeesToPaise(priceRs).toLocaleString()} paise</small>
              </label>
            </fieldset>

            <fieldset style={{ marginBottom: 16 }}>
              <legend>Course body (legacy markdown — used when no modules)</legend>
              <textarea
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                rows={12}
                maxLength={200000}
                disabled={!!locked}
                style={{ width: "100%", fontFamily: "monospace" }}
                placeholder="Plain markdown for courses without modules."
              />
              <small style={{ color: "var(--ink-3)" }}>
                If this course has any modules + lessons (right pane), students see the structured
                view instead. Use this body for short courses without modules.
              </small>
            </fieldset>

            <button
              type="button"
              onClick={save}
              disabled={submitting || !title.trim()}
              className="btn-primary"
            >
              {submitting ? "Saving…" : isNew ? "Create draft" : "Save changes"}
            </button>
          </section>

          {!isNew && courseId && (
            <section>
              <h2 style={{ marginTop: 0 }}>Modules &amp; lessons</h2>
              {structErr && <p className="banner banner-error">{structErr}</p>}
              <button type="button" onClick={addModule} disabled={!!locked}>
                + Add module
              </button>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
                {(structure?.items ?? []).map(({ module: m, lessons }) => (
                  <li
                    key={m.id}
                    style={{
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>
                        {m.position}. {m.title}
                      </strong>
                      <span>
                        <button type="button" onClick={() => renameModule(m)} disabled={!!locked}>
                          Rename
                        </button>{" "}
                        <button type="button" onClick={() => deleteModule(m)} disabled={!!locked}>
                          Delete
                        </button>
                      </span>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
                      {lessons.map((lesson) => (
                        <li
                          key={lesson.id}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 4,
                            background:
                              activeLesson?.lessonId === lesson.id ? "var(--card)" : undefined,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => selectLesson(m.id, lesson)}
                            style={{ background: "none", border: "none", padding: 0, color: "var(--info)", cursor: "pointer" }}
                          >
                            {lesson.position}. {lesson.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLesson(m.id, lesson)}
                            disabled={!!locked}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => addLesson(m, lessons)} disabled={!!locked}>
                      + Add lesson
                    </button>
                  </li>
                ))}
              </ul>

              {activeLesson && (
                <fieldset style={{ marginTop: 16 }}>
                  <legend>Edit lesson</legend>
                  <label>
                    Title{" "}
                    <input
                      type="text"
                      value={lessonTitle}
                      onChange={(e) => setLessonTitle(e.target.value)}
                      maxLength={240}
                    />
                  </label>
                  <textarea
                    value={lessonBody}
                    onChange={(e) => setLessonBody(e.target.value)}
                    rows={14}
                    style={{ width: "100%", fontFamily: "monospace" }}
                    placeholder="# Lesson body in markdown"
                  />
                  <button type="button" onClick={saveLesson} disabled={lessonSaving || !!locked}>
                    {lessonSaving ? "Saving…" : "Save lesson"}
                  </button>{" "}
                  <button type="button" onClick={() => setActiveLesson(null)}>
                    Close
                  </button>
                </fieldset>
              )}
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}