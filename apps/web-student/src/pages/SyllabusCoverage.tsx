// SyllabusCoverage — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle + subject chips with
// counts) → vidya-heat-card hero showing overall coverage % +
// remaining chapters → vertical list of vidya-card-block chapter rows
// with status pill, mastered/attempted count, and mini progress bar.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
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
      <VidyaShell crumbs="PROGRESS · SYLLABUS" title="My Syllabus" subtitle="Couldn't load syllabus coverage.">
        <div role="alert" style={{
          padding: "var(--sp-3) var(--sp-4)",
          marginBottom: "var(--sp-4)",
          background: "var(--bad)",
          color: "var(--paper)",
          borderRadius: 8,
          fontSize: 13,
        }}>
          {error}
        </div>
      </VidyaShell>
    );
  }
  if (!coverage) {
    return (
      <VidyaShell crumbs="PROGRESS · SYLLABUS" title="My Syllabus" subtitle="Loading…">
        <p style={{ color: "var(--ink-3)" }}>Loading…</p>
      </VidyaShell>
    );
  }

  const remaining = chaptersRemaining(coverage);

  return (
    <VidyaShell
      crumbs="PROGRESS · SYLLABUS"
      title="My Syllabus"
      subtitle="Track progress against the exam syllabus chapter by chapter."
      chips={
        <>
          {coverage.subjects.map((s) => (
            <button
              key={s.subjectId}
              type="button"
              role="tab"
              aria-selected={activeSubjectId === s.subjectId}
              className={`vidya-shell__chip${activeSubjectId === s.subjectId ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setActiveSubjectId(s.subjectId)}
            >
              {s.name} · {s.coveredChapters}/{s.totalChapters}
            </button>
          ))}
        </>
      }
    >
      <div style={{ maxWidth: 1000 }}>
        {/* Headline tile */}
        <section className="vidya-heat-card" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="vidya-heat-card__head" style={{ display: "flex", gap: "var(--sp-6)", alignItems: "center" }}>
            <div>
              <div className="vidya-heat-card__eyebrow">OVERALL COVERAGE</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: "var(--ink)" }}>{coverage.overallPct}%</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                {coverage.masteredTopics} / {coverage.totalTopics} topics mastered
              </div>
            </div>
            <div>
              <div className="vidya-heat-card__eyebrow">REMAINING</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)" }}>{remaining}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>chapters remaining</div>
            </div>
          </div>
        </section>

        {/* Chapter list for active subject */}
        {activeSubject && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {activeSubject.chapters.map((ch) => (
              <ChapterCard key={ch.chapterId} chapter={ch} />
            ))}
          </div>
        )}
      </div>
    </VidyaShell>
  );
}

function ChapterCard({ chapter }: { chapter: ChapterCoverage }) {
  const colour = chapterStatusColour(chapter.status);
  const pct = chapter.totalTopics > 0
    ? Math.round((chapter.masteredTopics / chapter.totalTopics) * 100)
    : 0;
  return (
    <div className="vidya-card-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)" }}>
        <strong style={{ fontSize: 14, color: "var(--ink)" }}>{chapter.name}</strong>
        <span style={{
          padding: "3px 10px",
          borderRadius: 9999,
          background: colour,
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          flexShrink: 0,
        }}>
          {chapterStatusLabel(chapter.status)}
        </span>
      </div>
      <p style={{ margin: "var(--sp-2) 0", fontSize: 13, color: "var(--ink-2)" }}>
        {chapter.totalTopics === 0
          ? "No topics mapped yet — content team is working on it."
          : `${chapter.masteredTopics} of ${chapter.totalTopics} topics mastered · attempted ${chapter.attemptedTopics}`}
      </p>
      <div style={{ background: "var(--paper-2)", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colour, transition: "width 200ms" }} />
      </div>
    </div>
  );
}
