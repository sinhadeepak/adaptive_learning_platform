// Sprint 28 (P4-S28) — Syllabus coverage view.
//
// Subject tabs → chapter cards with status pill + "M of N topics mastered"
// + mini progress bar. Top headline shows overall coverage % + chapters
// remaining.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import {
  chapterStatusColour,
  chapterStatusLabel,
  chaptersRemaining,
  type CoverageResponse,
  type ChapterCoverage,
} from "../lib/syllabus_coverage";

const JEE_MAIN_ID = "11111111-0000-0000-0000-000000000001";

export function SyllabusCoverage() {
  const [params] = useSearchParams();
  const examId = params.get("examId") ?? JEE_MAIN_ID;
  const { user } = useAuth();
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(
          `/api/v1/analytics/syllabus-coverage/${user.id}?examId=${examId}`,
        );
        if (!r.ok) {
          setError("Could not load syllabus coverage.");
          return;
        }
        const body = (await r.json()) as CoverageResponse;
        setCoverage(body);
        if (body.subjects.length > 0 && !activeSubjectId) {
          setActiveSubjectId(body.subjects[0].subjectId);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [user, examId]);

  const activeSubject = useMemo(() => {
    if (!coverage || !activeSubjectId) return null;
    return coverage.subjects.find((s) => s.subjectId === activeSubjectId) ?? null;
  }, [coverage, activeSubjectId]);

  if (error) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p className="banner banner-error">{error}</p>
      </main>
    );
  }
  if (!coverage) {
    return (
      <main className="page" style={{ padding: 24 }}>
        <p>Loading…</p>
      </main>
    );
  }

  const remaining = chaptersRemaining(coverage);

  return (
    <main className="page" style={{ padding: 24, maxWidth: 1000 }}>
      <h1>My Syllabus</h1>
      <p style={{ color: "var(--ink-3)" }}>
        Track progress against the exam syllabus chapter by chapter.
      </p>

      {/* Headline tile */}
      <section
        style={{
          background: "var(--card-1, #fff)",
          padding: 20,
          borderRadius: 8,
          marginTop: 16,
          display: "flex",
          gap: 32,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 38, fontWeight: 700 }}>{coverage.overallPct}%</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {coverage.masteredTopics} / {coverage.totalTopics} topics mastered
          </div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{remaining}</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            chapters remaining
          </div>
        </div>
      </section>

      {/* Subject tabs */}
      <nav
        style={{
          display: "flex",
          gap: 8,
          marginTop: 24,
          flexWrap: "wrap",
        }}
      >
        {coverage.subjects.map((s) => (
          <button
            key={s.subjectId}
            type="button"
            onClick={() => setActiveSubjectId(s.subjectId)}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--rule)",
              background:
                activeSubjectId === s.subjectId
                  ? "var(--card, #eef)"
                  : "transparent",
              fontWeight: activeSubjectId === s.subjectId ? 600 : 400,
            }}
          >
            {s.name} · {s.coveredChapters}/{s.totalChapters}
          </button>
        ))}
      </nav>

      {/* Chapter list for active subject */}
      {activeSubject && (
        <section style={{ marginTop: 16 }}>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {activeSubject.chapters.map((ch) => (
              <ChapterCard key={ch.chapterId} chapter={ch} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ChapterCard({ chapter }: { chapter: ChapterCoverage }) {
  const colour = chapterStatusColour(chapter.status);
  const pct =
    chapter.totalTopics > 0
      ? Math.round((chapter.masteredTopics / chapter.totalTopics) * 100)
      : 0;
  return (
    <li
      style={{
        background: "var(--card-1, #fff)",
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <strong>{chapter.name}</strong>
        <span
          className="pill"
          style={{
            padding: "2px 8px",
            borderRadius: 12,
            background: colour,
            color: "#fff",
            fontSize: 11,
          }}
        >
          {chapterStatusLabel(chapter.status)}
        </span>
      </div>
      <p
        style={{
          margin: "6px 0 8px",
          fontSize: 13,
          color: "var(--ink-3)",
        }}
      >
        {chapter.totalTopics === 0
          ? "No topics mapped yet — content team is working on it."
          : `${chapter.masteredTopics} of ${chapter.totalTopics} topics mastered · attempted ${chapter.attemptedTopics}`}
      </p>
      {/* Mini progress bar */}
      <div
        style={{
          background: "var(--card-2, #e5e7eb)",
          borderRadius: 4,
          height: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: colour,
          }}
        />
      </div>
    </li>
  );
}