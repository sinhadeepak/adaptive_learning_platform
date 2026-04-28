// Sprint 18 (P3-S3) — Course author page (create + edit DRAFT courses).

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type Course, courseAuthoring } from "../lib/api";

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
  }, [courseId]);

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

  const locked = course && course.status !== "DRAFT";

  return (
    <AppShell title={isNew ? "New course" : "Edit course"}>
      <main className="page" style={{ padding: 24, maxWidth: 800 }}>
        <h1>{isNew ? "New course" : "Edit course"}</h1>
        {locked && (
          <p className="banner">
            Course is in <strong>{course?.status}</strong> — only price + cover
            edits allowed. Retire and re-create to edit content.
          </p>
        )}

        {error && <p className="banner banner-error">{error}</p>}

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
          <legend>Course content (markdown)</legend>
          <textarea
            value={contentMd}
            onChange={(e) => setContentMd(e.target.value)}
            rows={20}
            maxLength={200000}
            disabled={!!locked}
            style={{ width: "100%", fontFamily: "monospace" }}
            placeholder="# Module 1: Introduction&#10;Begin here. Markdown is supported.&#10;&#10;## Lesson 1.1&#10;..."
          />
        </fieldset>

        <button
          type="button"
          onClick={save}
          disabled={submitting || !title.trim()}
          className="btn-primary"
        >
          {submitting ? "Saving…" : isNew ? "Create draft" : "Save changes"}
        </button>
      </main>
    </AppShell>
  );
}
