// StudyMap — Vidya v1 (mockup 3/8).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 mockup 3/8 (Study map).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Per-subject chapter map. Layout:
//   ┌──────── chapter list ─────────┐ ┌── recommended next ──┐
//   │  01  Physical World ▮▮▮▮▮▮▮▮  │ │  Ch 08 · Thermo      │
//   │  02  Kinematics    ▮▮▮▮▮▮▮▮   │ │  weakest active      │
//   │  03  Laws of Motion ▮▮▮▮▮▮    │ │  [Start session]     │
//   │  ...                          │ ├──────────────────────┤
//   └───────────────────────────────┘ │  Mock test · Class 11│
//                                     └──────────────────────┘
//
// When no subjectId is provided in the URL, the page picks the first
// subject from /api/v1/catalog/exams/{examId}/subjects. Subject
// chips along the top let users swap.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface Subject {
  id: string;
  examId: string;
  name: string;
  topicCount: number;
}

interface Topic {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
}

interface MasteryListResponse {
  topics: Array<{ topicId: string; ewa: number; n: number }>;
}

interface ExamMeta {
  id: string;
  code: string;
  name: string;
}

interface ChapterRow {
  id: string;
  index: number;
  title: string;
  ewa: number;          // -1 = not started, 0..1 = mastery
  qsDone: number;
  questionCount: number;
  tier: "FREE" | "PREMIUM";
  locked: boolean;
  isFocus: boolean;
  hasDecay: boolean;
}

export function StudyMap() {
  const { examId = "", subjectId: routeSubjectId } = useParams<{
    examId: string;
    subjectId?: string;
  }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  // Topics keyed by subject id. When `routeSubjectId` is in the URL the
  // page renders only that subject; otherwise all subjects render in
  // sequence so users see the entire syllabus at a glance.
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, Topic[]>>({});
  const [mastery, setMastery] = useState<Map<string, { ewa: number; n: number }>>(new Map());
  const [examMeta, setExamMeta] = useState<ExamMeta | null>(null);
  // Immediate-start CTAs ("Start session →", "AI choose for me"). startingId
  // holds the topic id mid-flight so the buttons can disable; startErr
  // surfaces a 422 ("no questions yet") or network failure inline.
  const [startingId, setStartingId] = useState<string | null>(null);
  // Keyed by topic id so the error renders next to the row/card that failed.
  const [startErr, setStartErr] = useState<{ topicId: string; msg: string } | null>(null);

  // Start a practice session for a specific topic and jump into the quiz.
  // Mirrors TopicDetail.startQuiz — the canonical sessions/start pattern.
  async function startPractice(topicId: string) {
    if (!user || startingId) return;
    setStartErr(null);
    setStartingId(topicId);
    try {
      const { contentLanguageField } = await import("../lib/session-start");
      const langField = await contentLanguageField();
      const r = await auth.fetch("/api/v1/quiz/sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId, userId: user.id, mode: "PRACTICE", ...langField }),
      });
      if (r.status === 422) {
        setStartErr({ topicId, msg: "No practice questions for this chapter yet." });
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { sessionId } = (await r.json()) as { sessionId: string };
      navigate(`/quiz/${sessionId}`);
    } catch {
      setStartErr({ topicId, msg: "Couldn't start practice. Please try again." });
    } finally {
      setStartingId(null);
    }
  }

  // Exam meta — drives subtitle + right-rail labels. The /catalog/exams
  // endpoint returns either a bare array OR { exams: [...] }; tolerate
  // both shapes (same pattern as VidyaShell).
  useEffect(() => {
    if (!examId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams`);
        if (!r.ok || !alive) return;
        const body = (await r.json()) as
          | ExamMeta[]
          | { exams?: ExamMeta[] | null };
        const list: ExamMeta[] = Array.isArray(body)
          ? body
          : Array.isArray(body.exams)
            ? body.exams
            : [];
        const match = list.find((e) => e.id === examId);
        if (alive && match) setExamMeta(match);
      } catch { /* offline — subtitle falls back to "your exam" */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  // Subjects. The endpoint returns either a bare array OR
  // { subjects: [...] }; tolerate both shapes (same pattern as /catalog/exams).
  useEffect(() => {
    if (!examId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (r.ok && alive) {
          const body = (await r.json()) as
            | Subject[]
            | { subjects?: Subject[] | null };
          const list: Subject[] = Array.isArray(body)
            ? body
            : Array.isArray(body.subjects)
              ? body.subjects
              : [];
          setSubjects(list);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  const activeSubjectId = routeSubjectId ?? subjects[0]?.id ?? "";
  const activeSubject = subjects.find((s) => s.id === activeSubjectId);

  // Topics — fetched for ALL subjects in parallel so the all-subjects
  // landing view (no `routeSubjectId` in the URL) can show every
  // chapter in the syllabus. The single-subject deep-link
  // (`/study/:examId/:subjectId`) reads from the same map.
  // Endpoint returns either a bare array OR { topics: [...] }; tolerate
  // both. The `tier` field may be omitted by the API — default to "FREE".
  useEffect(() => {
    if (subjects.length === 0) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        subjects.map(async (s): Promise<[string, Topic[]]> => {
          try {
            const r = await auth.fetch(`/api/v1/catalog/subjects/${s.id}/topics`);
            if (!r.ok) return [s.id, []];
            const body = (await r.json()) as
              | Partial<Topic>[]
              | { topics?: Partial<Topic>[] | null };
            const list: Partial<Topic>[] = Array.isArray(body)
              ? body
              : Array.isArray(body.topics)
                ? body.topics
                : [];
            const cleaned: Topic[] = list
              .filter((t): t is Topic & { id: string; title: string } =>
                typeof t.id === "string" && typeof t.title === "string",
              )
              .map((t) => ({
                id: t.id,
                subjectId: t.subjectId ?? s.id,
                title: t.title,
                questionCount: t.questionCount ?? 0,
                tier: (t.tier as Topic["tier"]) ?? "FREE",
              }));
            return [s.id, cleaned];
          } catch {
            return [s.id, []];
          }
        }),
      );
      if (alive) setTopicsBySubject(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [subjects]);

  // Mastery
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (r.ok && alive) {
          const data = (await r.json()) as MasteryListResponse;
          const m = new Map<string, { ewa: number; n: number }>();
          const ts = Array.isArray(data.topics) ? data.topics : [];
          for (const t of ts) m.set(t.topicId, t);
          setMastery(m);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  /* ── Build chapter rows per subject ───────────────────────── */

  const chaptersBySubject: Record<string, ChapterRow[]> = useMemo(() => {
    const out: Record<string, ChapterRow[]> = {};
    for (const [subjectId, topics] of Object.entries(topicsBySubject)) {
      out[subjectId] = topics.map((t, i) => {
        const m = mastery.get(t.id);
        const ewa = m?.ewa ?? -1;
        // Stub flags — replace with real planner output when available.
        const isFocus = ewa >= 0 && ewa >= 0.4 && ewa < 0.7 && i % 3 === 1;
        const hasDecay = m ? ewa > 0 && ewa < 0.4 && m.n > 3 : false;
        const locked = ewa < 0 && i >= 9 && i % 3 === 0;
        return {
          id: t.id,
          index: i + 1,
          title: t.title,
          ewa,
          qsDone: m?.n ?? 0,
          questionCount: t.questionCount,
          tier: t.tier,
          locked,
          isFocus,
          hasDecay,
        };
      });
    }
    return out;
  }, [topicsBySubject, mastery]);

  // When deep-linked to a single subject, only that subject's chapters
  // render. Otherwise all subjects render in `subjects` order.
  const visibleSubjects = useMemo(
    () => (routeSubjectId ? subjects.filter((s) => s.id === routeSubjectId) : subjects),
    [routeSubjectId, subjects],
  );

  // Recommended next — weakest active chapter across the visible
  // subjects (single-subject mode → that subject only; all-subjects
  // mode → globally weakest).
  const recommended = useMemo(() => {
    const all = visibleSubjects.flatMap((s) => chaptersBySubject[s.id] ?? []);
    const active = all.filter((c) => !c.locked && c.ewa >= 0 && c.ewa < 0.7);
    return [...active].sort((a, b) => a.ewa - b.ewa)[0] ?? null;
  }, [visibleSubjects, chaptersBySubject]);

  const totalVisibleChapters = useMemo(
    () => visibleSubjects.reduce((n, s) => n + (chaptersBySubject[s.id]?.length ?? 0), 0),
    [visibleSubjects, chaptersBySubject],
  );

  const crumbLabel = routeSubjectId
    ? `Study map · ${activeSubject?.name ?? "Subject"}`
    : "Study map · Full syllabus";

  const headEyebrow = routeSubjectId
    ? `${activeSubject?.name ?? "Subject"} · ${totalVisibleChapters} chapters`
    : `${examMeta?.code || examMeta?.name || "Full"} · ${totalVisibleChapters} chapters · ${visibleSubjects.length} subjects`;

  const headTitle = routeSubjectId
    ? `${activeSubject?.name ?? "Subject"} syllabus`
    : `${examMeta?.code || examMeta?.name || "Exam"} syllabus`;

  return (
    <VidyaShell
      crumbs={crumbLabel}
      title="Study map"
      subtitle={`Every chapter, every topic — your path through the ${examMeta?.code || examMeta?.name || "exam"} syllabus`}
      chips={
        <>
          {/* "All" pill resets to the exam-wide view */}
          <Link
            key="__all"
            to={`/study/${examId}`}
            className={`vidya-shell__chip${!routeSubjectId ? " vidya-shell__chip--on" : ""}`}
          >
            All
          </Link>
          {subjects.map((s) => (
            <Link
              key={s.id}
              to={`/study/${examId}/${s.id}`}
              className={`vidya-shell__chip${s.id === routeSubjectId ? " vidya-shell__chip--on" : ""}`}
            >
              {s.name}
            </Link>
          ))}
        </>
      }
      actions={
        <button
          type="button"
          className="vidya-shell__primary"
          disabled={!recommended || startingId !== null}
          onClick={() => {
            if (recommended) void startPractice(recommended.id);
          }}
        >
          ⚡ AI choose for me
        </button>
      }
    >
      <div className="vidya-grid-2">
        {/* Chapter list */}
        <section className="vidya-chapters">
          <div className="vidya-chapters__head">
            <div>
              <div className="vidya-chapters__eyebrow">{headEyebrow}</div>
              <div className="vidya-chapters__title">{headTitle}</div>
            </div>
            <div className="vidya-chapters__filters">
              <button type="button" className="vidya-shell__chip">▽ Filter</button>
            </div>
          </div>

          {totalVisibleChapters === 0 ? (
            <ol className="vidya-chapters__list">
              <li style={{ color: "var(--ink-3)", textAlign: "center", padding: "var(--sp-8) 0" }}>
                No chapters for this exam yet.
              </li>
            </ol>
          ) : (
            visibleSubjects.map((s) => {
              const subjectChapters = chaptersBySubject[s.id] ?? [];
              if (subjectChapters.length === 0) return null;
              return (
                <div key={s.id} style={{ marginBottom: "var(--sp-6)" }}>
                  {/* In single-subject mode the subject heading is
                      redundant with headTitle, so suppress it. */}
                  {routeSubjectId ? null : (
                    <h2
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        color: "var(--ink-3)",
                        margin: "var(--sp-4) 0 var(--sp-2)",
                      }}
                    >
                      {s.name}
                    </h2>
                  )}
                  <ol className="vidya-chapters__list">
                    {subjectChapters.map((c) => (
                      <ChapterRowView
                        key={c.id}
                        c={c}
                        onStart={startPractice}
                        startingId={startingId}
                        startErr={startErr}
                      />
                    ))}
                  </ol>
                </div>
              );
            })
          )}
        </section>

        {/* Right rail */}
        <div className="vidya-chapters__rail">
          {recommended ? (
            <section className="vidya-rec">
              <div className="vidya-rec__eyebrow">Recommended next</div>
              <div className="vidya-rec__title">
                Ch {String(recommended.index).padStart(2, "0")} · {recommended.title}
              </div>
              <p className="vidya-rec__body">
                Your weakest active chapter. {recommended.questionCount} high-yield
                questions queued.
              </p>
              <div className="vidya-rec__stats">
                <div>
                  <div className="vidya-rec__stat-label">Mastery</div>
                  <div
                    className="vidya-rec__stat-value"
                    style={{ color: "var(--bad)" }}
                  >
                    {Math.round(Math.max(0, recommended.ewa) * 100)}%
                  </div>
                </div>
                <div>
                  <div className="vidya-rec__stat-label">Last seen</div>
                  <div className="vidya-rec__stat-value">11d ago</div>
                </div>
                <div>
                  <div className="vidya-rec__stat-label">Difficulty</div>
                  <div className="vidya-rec__stat-value">0.71</div>
                </div>
              </div>
              <button
                className="vidya-rec__cta"
                disabled={startingId !== null}
                onClick={() => void startPractice(recommended.id)}
              >
                {startingId === recommended.id ? "Starting…" : "Start session →"}
              </button>
              {startErr?.topicId === recommended.id ? (
                <p
                  role="alert"
                  style={{ color: "var(--bad)", fontSize: 13, marginTop: 10 }}
                >
                  {startErr.msg}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="vidya-mock-card">
            <div className="vidya-mock-card__eyebrow">
              Mock test{examMeta?.code ? ` · ${examMeta.code}` : ""}
            </div>
            <div className="vidya-mock-card__title">Take the section test</div>
            <p className="vidya-mock-card__body">
              30 questions · 45 min · adaptive difficulty based on your θ.
            </p>
            <div className="vidya-mock-card__stats">
              <div>
                <div className="vidya-mock-card__stat-label">Available</div>
                <div className="vidya-mock-card__stat-value">14</div>
              </div>
              <div>
                <div className="vidya-mock-card__stat-label">Best score</div>
                <div
                  className="vidya-mock-card__stat-value"
                  style={{ color: "var(--good)" }}
                >
                  82%
                </div>
              </div>
            </div>
            <button
              className="vidya-shell__primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => navigate("/mocks")}
            >
              Start mock
            </button>
          </section>
        </div>
      </div>
    </VidyaShell>
  );
}

/* ── Per-chapter row ─────────────────────────────────────────── */

function ChapterRowView({
  c,
  onStart,
  startingId,
  startErr,
}: {
  c: ChapterRow;
  onStart: (topicId: string) => void;
  startingId: string | null;
  startErr: { topicId: string; msg: string } | null;
}) {
  const navigate = useNavigate();
  const bucket = chapterBucket(c.ewa, c.locked);
  const pct = c.ewa >= 0 ? Math.round(c.ewa * 100) : 0;
  const isStarting = startingId === c.id;
  return (
    <li
      className={`vidya-chapters__row${c.locked ? " vidya-chapters__row--locked" : ""}`}
    >
      <div
        className={`vidya-chapters__num vidya-chapters__num--${bucket}`}
        aria-hidden
      >
        {c.locked ? "🔒" : String(c.index).padStart(2, "0")}
      </div>

      <div className="vidya-chapters__main">
        <div className="vidya-chapters__title-row">
          {c.locked ? (
            <span className="vidya-chapters__name">{c.title}</span>
          ) : (
            <button
              type="button"
              className="vidya-chapters__name"
              onClick={() => navigate(`/catalog/topic/${c.id}`)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {c.title}
            </button>
          )}
          {c.isFocus ? (
            <span className="vidya-chapters__tag vidya-chapters__tag--focus">
              ◈ AI focus
            </span>
          ) : null}
          {c.hasDecay ? (
            <span className="vidya-chapters__tag vidya-chapters__tag--decay">
              decay
            </span>
          ) : null}
        </div>
        <div className={`vidya-chapters__bar vidya-chapters__bar--${bucket}`}>
          <span
            className={`vidya-chapters__bar-fill vidya-chapters__bar-fill--${bucket}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="vidya-chapters__meta">
        <span className={`vidya-chapters__pct vidya-chapters__pct--${bucket}`}>
          {c.locked ? "0%" : `${pct}%`}
        </span>
        <span className="vidya-chapters__qs">{c.qsDone} qs done</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
        }}
      >
        <button
          className="vidya-chapters__action"
          disabled={c.locked || isStarting}
          onClick={() => !c.locked && onStart(c.id)}
        >
          {c.locked ? "Locked" : isStarting ? "Starting…" : "Start Practice"}
        </button>
        {startErr?.topicId === c.id ? (
          <span
            role="alert"
            style={{ color: "var(--bad)", fontSize: 12, textAlign: "right" }}
          >
            {startErr.msg}
          </span>
        ) : null}
      </div>
    </li>
  );
}

type Bucket = "mastered" | "strong" | "dev" | "weak" | "none" | "locked";

function chapterBucket(ewa: number, locked: boolean): Bucket {
  if (locked) return "locked";
  if (ewa < 0) return "none";
  if (ewa >= 0.9) return "mastered";
  if (ewa >= 0.7) return "strong";
  if (ewa >= 0.4) return "dev";
  if (ewa > 0) return "weak";
  return "none";
}
