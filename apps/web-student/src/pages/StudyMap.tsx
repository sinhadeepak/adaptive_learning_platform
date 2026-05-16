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
  const [topics, setTopics] = useState<Topic[]>([]);
  const [mastery, setMastery] = useState<Map<string, { ewa: number; n: number }>>(new Map());
  const [classFilter, setClassFilter] = useState<"all" | "11" | "12">("all");

  // Subjects
  useEffect(() => {
    if (!examId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects`);
        if (r.ok && alive) {
          const data = (await r.json()) as { subjects?: Subject[] | null };
          setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [examId]);

  const activeSubjectId = routeSubjectId ?? subjects[0]?.id ?? "";
  const activeSubject = subjects.find((s) => s.id === activeSubjectId);

  // Topics for the active subject
  useEffect(() => {
    if (!activeSubjectId) return;
    let alive = true;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/catalog/subjects/${activeSubjectId}/topics`);
        if (r.ok && alive) {
          const data = (await r.json()) as { topics?: Topic[] | null };
          setTopics(Array.isArray(data.topics) ? data.topics : []);
        }
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [activeSubjectId]);

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

  /* ── Build chapter rows ──────────────────────────────────── */

  const chapters: ChapterRow[] = useMemo(() => {
    if (!topics.length) return [];
    return topics.map((t, i) => {
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
  }, [topics, mastery]);

  const filteredChapters = useMemo(() => {
    if (classFilter === "all") return chapters;
    const half = Math.ceil(chapters.length / 2);
    return classFilter === "11" ? chapters.slice(0, half) : chapters.slice(half);
  }, [chapters, classFilter]);

  // Weakest active chapter (recommended next)
  const recommended = useMemo(() => {
    const active = chapters.filter((c) => !c.locked && c.ewa >= 0 && c.ewa < 0.7);
    return [...active].sort((a, b) => a.ewa - b.ewa)[0] ?? null;
  }, [chapters]);

  const subjectShort = activeSubject?.name ?? "Subject";

  return (
    <VidyaShell
      crumbs={`Study map · ${subjectShort}`}
      title="Study map"
      subtitle={`Every chapter, every topic — your path through the ${(activeSubject?.examId ?? examId).toUpperCase()} syllabus`}
      chips={
        <>
          {subjects.map((s) => (
            <Link
              key={s.id}
              to={`/study/${examId}/${s.id}`}
              className={`vidya-shell__chip${s.id === activeSubjectId ? " vidya-shell__chip--on" : ""}`}
            >
              {s.name}
            </Link>
          ))}
        </>
      }
      actions={
        <button
          className="vidya-shell__primary"
          onClick={() => {
            if (recommended) navigate(`/practice?topic=${recommended.id}`);
            else navigate("/practice");
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
              <div className="vidya-chapters__eyebrow">
                {subjectShort} · {chapters.length} chapters
              </div>
              <div className="vidya-chapters__title">
                Class 11 <span aria-hidden>→</span> 12 path
              </div>
            </div>
            <div className="vidya-chapters__filters">
              <button className="vidya-shell__chip">▽ Filter</button>
              <button
                className={`vidya-shell__chip${classFilter === "11" ? " vidya-shell__chip--on" : ""}`}
                onClick={() => setClassFilter(classFilter === "11" ? "all" : "11")}
              >
                Class 11
              </button>
              <button
                className={`vidya-shell__chip${classFilter === "12" ? " vidya-shell__chip--on" : ""}`}
                onClick={() => setClassFilter(classFilter === "12" ? "all" : "12")}
              >
                Class 12
              </button>
            </div>
          </div>

          <ol className="vidya-chapters__list">
            {filteredChapters.length === 0 ? (
              <li style={{ color: "var(--ink-3)", textAlign: "center", padding: "var(--sp-8) 0" }}>
                No chapters for this subject yet.
              </li>
            ) : (
              filteredChapters.map((c) => <ChapterRowView key={c.id} c={c} />)
            )}
          </ol>
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
                onClick={() => navigate(`/practice?topic=${recommended.id}`)}
              >
                Start session →
              </button>
            </section>
          ) : null}

          <section className="vidya-mock-card">
            <div className="vidya-mock-card__eyebrow">
              Mock test · Class {classFilter === "12" ? "12" : "11"}
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

function ChapterRowView({ c }: { c: ChapterRow }) {
  const navigate = useNavigate();
  const bucket = chapterBucket(c.ewa, c.locked);
  const pct = c.ewa >= 0 ? Math.round(c.ewa * 100) : 0;
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
          <span className="vidya-chapters__name">{c.title}</span>
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

      <button
        className="vidya-chapters__action"
        disabled={c.locked}
        onClick={() => navigate(`/practice?topic=${c.id}`)}
      >
        {c.locked ? "Locked" : bucket === "dev" || bucket === "weak" ? "Practice" : "Refresh"}
      </button>
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
