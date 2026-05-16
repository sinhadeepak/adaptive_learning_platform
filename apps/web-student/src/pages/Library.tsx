// F6 — Curated Test Library (student-facing).
// URL: /library
//
// Browses CURATED + PUBLISHED + PUBLIC blueprints. Optional filters:
//   - exam: dropdown built from /catalog/exams (defaults to student's
//     primary exam from /profile/me when present).
//   - max minutes: chips for 15 / 30 / 60 / 120 / Any.
// Each card shows title, exam, total Q/min, marking, and a Start CTA
// that routes to the existing MockExam runner using blueprintId — no
// new session machinery needed.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/dashboard";

interface Exam {
  id: string;
  code: string;
  name: string;
}

interface LibraryItem {
  id: string;
  examId: string;
  name: string;
  totalQuestions: number;
  totalMinutes: number;
  marksCorrect: number;
  marksNegative: number;
  publishedAt: string | null;
}

interface Profile {
  exams: Array<{ examId: string; targetDate: string | null }>;
}

const MAX_MINUTES_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "Any", value: null },
  { label: "≤15m", value: 15 },
  { label: "≤30m", value: 30 },
  { label: "≤60m", value: 60 },
  { label: "≤2h", value: 120 },
];

export function Library() {
  const nav = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [, setProfile] = useState<Profile | null>(null);
  const [examFilter, setExamFilter] = useState<string | "ALL">("ALL");
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examNameById = useMemo(
    () => Object.fromEntries(exams.map((e) => [e.id, e.name] as const)),
    [exams],
  );

  // Load exam list + the user's profile (to pre-select their exam).
  useEffect(() => {
    (async () => {
      try {
        const [examsRes, profRes] = await Promise.all([
          fetch("/api/v1/catalog/exams"),
          auth.fetch("/api/v1/profile/me"),
        ]);
        if (examsRes.ok) setExams(await examsRes.json());
        if (profRes.ok) {
          const p = (await profRes.json()) as Profile;
          setProfile(p);
          if (p.exams?.[0]?.examId) setExamFilter(p.exams[0].examId);
        }
      } catch (e) {
        setError(`Network error: ${(e as Error).message}`);
      }
    })();
  }, []);

  // Reload library on filter change.
  useEffect(() => {
    let alive = true;
    (async () => {
      setItems(null);
      setError(null);
      const qs = new URLSearchParams();
      if (examFilter !== "ALL") qs.set("exam_id", examFilter);
      if (maxMinutes !== null) qs.set("max_minutes", String(maxMinutes));
      try {
        const r = await fetch(`/api/v1/catalog/exam-blueprints/library?${qs.toString()}`);
        if (!alive) return;
        if (!r.ok) {
          setError(`Couldn't load library (HTTP ${r.status}).`);
          return;
        }
        const body = (await r.json()) as { items: LibraryItem[] };
        setItems(body.items);
      } catch (e) {
        if (alive) setError(`Network error: ${(e as Error).message}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [examFilter, maxMinutes]);

  function start(bp: LibraryItem) {
    nav(`/mock-exam?blueprintId=${bp.id}`);
  }

  return (
    <AppShell
      title="Curated tests"
      actions={
        <Link to="/practice" className="pg-btn pg-btn-ghost">
          ← Practice
        </Link>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 1080 }}>
        {error && <Banner tone="danger">{error}</Banner>}

        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Tests hand-picked by our editors</h1>
            <p className="pg-header-sub">
              Curated problem sets shaped around specific topics, exam
              patterns, or revision strategies. Filter by exam + duration to
              find what fits your moment.
            </p>
          </div>
        </header>

        {/* ── Filter row ───────────────────────────────────────────── */}
        <section className="pg-section">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}>
                Exam
              </label>
              <select
                className="pg-input"
                value={examFilter}
                onChange={(e) => setExamFilter(e.target.value)}
                style={{ minWidth: 200 }}
              >
                <option value="ALL">All exams</option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}>
                Duration
              </span>
              {MAX_MINUTES_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={
                    "pg-chip" + (maxMinutes === opt.value ? " pg-chip-active" : "")
                  }
                  onClick={() => setMaxMinutes(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Cards ────────────────────────────────────────────────── */}
        <section className="pg-section">
          {items === null && (
            <div style={{ opacity: 0.6 }}>Loading curated tests…</div>
          )}
          {items !== null && items.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                background: "rgba(0,0,0,0.02)",
                border: "1px dashed var(--rule)",
                borderRadius: 10,
                color: "var(--ink-3)",
              }}
            >
              No curated tests match those filters yet. Try widening duration
              or switching exam.
            </div>
          )}
          {items !== null && items.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {items.map((bp) => (
                <div
                  key={bp.id}
                  style={{
                    padding: 18,
                    background: "var(--card)",
                    border: "1px solid var(--rule)",
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{bp.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {examNameById[bp.examId] ?? "Exam"}
                  </div>
                  <div className="pg-row-meta" style={{ marginTop: 4 }}>
                    <span>{bp.totalQuestions} Q</span>
                    <span className="pg-row-meta-dot">·</span>
                    <span>{bp.totalMinutes} min</span>
                    <span className="pg-row-meta-dot">·</span>
                    <span>
                      +{bp.marksCorrect}/−{bp.marksNegative}
                    </span>
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="pg-btn pg-btn-primary"
                      onClick={() => start(bp)}
                    >
                      Start →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}