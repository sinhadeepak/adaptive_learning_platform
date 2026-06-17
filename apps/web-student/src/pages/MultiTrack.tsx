// MultiTrack — Vidya v1 multi-track dashboard ("Three pursuits in motion").
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 multi-course mockup (page 5/10).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Two surfaces share this view:
//
//   1. /tracks               — the standalone "ALL TRACKS" page
//   2. /home (multi-exam)    — when the user has 2+ enrolled exams,
//                              Home.tsx forks into MultiTrackBody
//                              instead of the single-exam dashboard.
//
// Both surfaces pass real exam data into MultiTrackBody. Allocator
// metrics (hours, pct, weakToday, nextSession) and cross-track
// insights are still placeholder until /api/v1/tracks/{budget,
// insights} ship — the contract is documented in the ADR-0034
// follow-ups.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../lib/api";
import { VidyaShell } from "../components/vidya/VidyaShell";

/* ── Types ─────────────────────────────────────────────────────── */

export interface Track {
  id: string;
  code: string;          // "NEET 2027"
  longName: string;
  niche: string;         // "Medical · MBBS / BDS"
  hours: number;         // weekly time-budget hours
  pct: number;           // weekly time-budget percent
  color: string;         // CSS var ref or hex
  readiness: {
    current: number;
    max: number;
    deltaWeeks: number;
    label: string;
  };
  weakToday: string;
  nextSession: string;
  isPercent?: boolean;
  passThreshold?: string;
}

export interface ExamMeta {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface ProfileResponse {
  exams?: Array<{ examId: string; targetDate: string | null }> | null;
}

/* ── /tracks page wrapper ──────────────────────────────────────── */

export function MultiTrack() {
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [profileRes, examsRes] = await Promise.all([
          auth.fetch("/api/v1/profile/me"),
          auth.fetch("/api/v1/catalog/exams"),
        ]);
        if (!alive) return;
        if (!profileRes.ok || !examsRes.ok) {
          // Fall back to the demo deck so the design is still walkable
          // from /tracks even when the user has no exams enrolled.
          setTracks(DEMO_TRACKS);
          return;
        }
        const profile = (await profileRes.json()) as ProfileResponse;
        const examsBody = (await examsRes.json()) as ExamMeta[] | { exams?: ExamMeta[] | null };
        const catalog: ExamMeta[] = Array.isArray(examsBody)
          ? examsBody
          : Array.isArray(examsBody.exams)
            ? examsBody.exams
            : [];
        const enrolled = Array.isArray(profile.exams) ? profile.exams : [];
        const enrolledExams = catalog.filter((c) =>
          enrolled.some((e) => e.examId === c.id),
        );
        if (alive) {
          setTracks(
            enrolledExams.length >= 2
              ? buildTracksFromExams(enrolledExams)
              : DEMO_TRACKS,
          );
        }
      } catch {
        if (alive) setTracks(DEMO_TRACKS);
      }
    })();
    return () => { alive = false; };
  }, []);

  const list = tracks ?? [];
  const headlineSubject = list[0]?.code ?? "your top track";

  return (
    <VidyaShell
      crumbs="All tracks · overview"
      title={list.length >= 2 ? `${list.length} pursuits in motion.` : "All tracks"}
      subtitle={
        list.length
          ? list.map((t) => t.code).join(" + ") +
            ". AI re-allocates time daily."
          : "Add an exam to begin tracking."
      }
      actions={
        <button className="vidya-shell__primary">⚡ Auto-balance plan</button>
      }
    >
      <MultiTrackBody tracks={list} headlineSubject={headlineSubject} />
    </VidyaShell>
  );
}

/* ── Shared body (used by /tracks and /home multi-exam variant) ── */

export interface MultiTrackBodyProps {
  tracks: Track[];
  headlineSubject?: string;
}

export function MultiTrackBody({ tracks, headlineSubject }: MultiTrackBodyProps) {
  const totalHours = useMemo(
    () => tracks.reduce((acc, t) => acc + t.hours, 0),
    [tracks],
  );
  const subject = headlineSubject ?? tracks[0]?.code ?? "your top track";
  const trackCount = tracks.length;

  if (trackCount === 0) {
    return (
      <section className="vidya-multi-hero" style={{ background: "var(--card)", color: "var(--ink)" }}>
        <p className="vidya-multi-hero__eyebrow" style={{ color: "var(--ink-3)" }}>
          No tracks yet
        </p>
        <h2 className="vidya-multi-hero__headline" style={{ color: "var(--ink)" }}>
          Add an exam to start the multi-track view.
        </h2>
        <Link to="/exams/add" className="vidya-shell__primary" style={{ alignSelf: "flex-start" }}>
          + Add exam / course
        </Link>
      </section>
    );
  }

  return (
    <>
      {/* Time budget hero card */}
      <section className="vidya-multi-hero">
        <div className="vidya-multi-hero__head">
          <span className="vidya-multi-hero__eyebrow">
            This week's time budget
          </span>
          <div className="vidya-multi-hero__chips">
            <span className="vidya-multi-hero__chip">Adjusted today</span>
            <button className="vidya-multi-hero__why">Why? See reasoning</button>
          </div>
        </div>
        <h2 className="vidya-multi-hero__headline">
          <em>{totalHours} hours</em> across {numberWord(trackCount)} track
          {trackCount === 1 ? "" : "s"}. {subject} takes the biggest slice — your
          readiness gap is widest there.
        </h2>
        <div
          className="vidya-multi-hero__bar"
          role="img"
          aria-label="Weekly time budget allocation"
        >
          {tracks.map((t) => (
            <span
              key={t.id}
              className="vidya-multi-hero__seg"
              style={{ width: `${t.pct}%`, background: t.color }}
              title={`${t.code}: ${t.hours} hrs · ${t.pct}%`}
            />
          ))}
        </div>
        <div className="vidya-multi-hero__legend">
          {tracks.map((t) => (
            <div className="vidya-multi-hero__legend-item" key={t.id}>
              <span
                className="vidya-multi-hero__swatch"
                style={{ background: t.color }}
              />
              {t.code} · {t.hours} hrs · {t.pct}%
            </div>
          ))}
        </div>
      </section>

      {/* Track cards (responsive — wraps under 1100px) */}
      <div className={trackCount >= 3 ? "vidya-grid-3" : "vidya-grid-2"}>
        {tracks.map((t) => (
          <TrackCard key={t.id} t={t} />
        ))}
      </div>

      {/* Time allocation + cross-track insights */}
      <div className="vidya-grid-2">
        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <span className="vidya-card-block__title">
              Time allocation · past 7 days
            </span>
          </div>
          <div className="vidya-card-block__sub">
            How {numberWord(trackCount)} actually competed
          </div>
          <div className="vidya-multi-stack" aria-hidden>
            {[5, 7, 6, 8, 4, 3, 7].map((hours, i) => {
              const weights = trackCount === 2 ? [0.6, 0.4] : [0.55, 0.3, 0.15];
              return (
                <div className="vidya-multi-stack__col" key={i}>
                  {weights.slice(0, trackCount).map((r, k) => (
                    <span
                      key={k}
                      className="vidya-multi-stack__seg"
                      style={{
                        height: `${hours * r * 8}px`,
                        background: tracks[k]!.color,
                      }}
                    />
                  ))}
                  <span className="vidya-multi-stack__day">
                    {"MTWTFSS"[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="vidya-card-block">
          <div className="vidya-card-block__head">
            <span className="vidya-card-block__title">Cross-track insights</span>
          </div>
          <ul className="vidya-cross-list">
            {buildInsights(tracks).map((ins, i) => (
              <li key={i}>
                <span className="vidya-cross-list__bar" style={{ background: ins.color }} />
                <span>
                  <strong>{ins.headline}</strong> {ins.body}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/analysis" className="vidya-card-block__more">
            See full cross-track analysis →
          </Link>
        </section>
      </div>

      <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: "var(--sp-6)" }}>
        Time-budget allocator + cross-track AI insights are Vidya v1
        design surfaces — the recommendations shown here will swap to
        live data when the /tracks/budget + /tracks/insights endpoints
        ship.
      </div>
    </>
  );
}

/* ── Track card ────────────────────────────────────────────────── */

function TrackCard({ t }: { t: Track }) {
  return (
    <section className="vidya-track-card">
      <header className="vidya-track-card__head">
        <div className="vidya-track-card__title-row">
          <span
            className="vidya-track-card__hue"
            style={{ background: t.color }}
            aria-hidden
          />
          <div>
            <div className="vidya-track-card__title">{t.code}</div>
            <div className="vidya-track-card__sub">{t.niche}</div>
          </div>
        </div>
        <div className="vidya-track-card__hours">
          {t.hours}h · {t.pct}%
        </div>
      </header>

      <div className="vidya-track-card__readiness">
        <div className="vidya-track-card__readiness-label">
          {t.isPercent ? "Cert readiness" : "Readiness"}
        </div>
        <div className="vidya-track-card__readiness-value">
          {t.readiness.current}
          {t.isPercent ? "%" : ""}
          {t.readiness.max ? (
            <span className="vidya-track-card__readiness-max">
              {" "}/ {t.readiness.max}
              {t.readiness.label ? ` (${t.readiness.label})` : ""}
            </span>
          ) : null}
        </div>
        <div className="vidya-track-card__delta">▲ +{t.readiness.deltaWeeks} wk</div>
        {t.passThreshold ? (
          <div className="vidya-track-card__threshold">{t.passThreshold}</div>
        ) : null}
      </div>

      <div className="vidya-track-card__weak">
        <span className="vidya-track-card__weak-label">Weak today</span>
        <span className="vidya-track-card__weak-name">{t.weakToday}</span>
      </div>

      <div className="vidya-track-card__next">
        <span className="vidya-track-card__next-label">Next session</span>
        <span className="vidya-track-card__next-name">{t.nextSession}</span>
      </div>

      <Link
        to={`/exams/${t.id}`}
        className="vidya-shell__primary vidya-track-card__cta"
      >
        Open track →
      </Link>
    </section>
  );
}

/* ── Real-data builder ─────────────────────────────────────────── */

const TRACK_PALETTE: Array<{ color: string; isPercent?: boolean }> = [
  { color: "var(--info)" },
  { color: "var(--gold)" },
  { color: "var(--ink)", isPercent: true },
  { color: "var(--accent)" },
  { color: "var(--bad)" },
];

const NICHE_BY_CODE: Record<string, string> = {
  NEET: "Medical · MBBS / BDS",
  JEE_MAIN: "Engineering · IIT/NIT",
  JEE_ADVANCED: "Engineering · IIT (Adv)",
  UPSC_CSE: "Civil services · GS / CSAT",
  CAT: "MBA · IIM",
  CBSE_8: "School · Class 8",
  CBSE_9: "School · Class 9",
  CBSE_12: "School · Class 12",
  CLASS_7: "School · Class 7",
  VEDIC_MATHS: "Skill · Vedic Maths",
};

/**
 * Build a real Track[] from the user's enrolled-exam catalog rows.
 * Allocator metrics (hours / pct / weakToday / nextSession /
 * readiness deltas) are placeholder until per-exam analytics ship —
 * the splits are equal so the bar segments make visual sense.
 */
export function buildTracksFromExams(exams: ExamMeta[]): Track[] {
  if (!exams.length) return [];
  const equalPct = Math.floor(100 / exams.length);
  const totalHoursWeekly = 28; // mirror the demo deck's weekly load
  const baseHours = Math.round(totalHoursWeekly / exams.length);
  return exams.map((ex, i) => {
    const palette = TRACK_PALETTE[i % TRACK_PALETTE.length]!;
    const isPercent = palette.isPercent ?? false;
    return {
      id: ex.id,
      code: ex.name || ex.code,
      longName: ex.name || ex.code,
      niche: NICHE_BY_CODE[ex.code] ?? ex.subtitle ?? "—",
      hours: baseHours,
      pct: i === exams.length - 1 ? 100 - equalPct * (exams.length - 1) : equalPct,
      color: palette.color,
      readiness: {
        current: isPercent ? 0 : 0,
        max: isPercent ? 0 : 900,
        deltaWeeks: 0,
        label: "",
      },
      weakToday: "Take a session to surface a weak topic.",
      nextSession: "Pick a topic on the exam dashboard →",
      isPercent,
    };
  });
}

/* ── Helpers ───────────────────────────────────────────────────── */

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven"][n] ?? String(n);
}

function buildInsights(tracks: Track[]): Array<{
  headline: string;
  body: string;
  color: string;
}> {
  if (tracks.length < 2) return [];
  const t1 = tracks[0]!;
  const t2 = tracks[1]!;
  const t3 = tracks[2];
  const out = [
    {
      headline: `Math from ${t2.code} is lifting your ${t1.code} Physics by 11%`,
      body: "— your numerical-method drills are transferring. Keep going.",
      color: "var(--accent)",
    },
    {
      headline: `${t1.code} Biology slipped 8% this week`,
      body: "— Botany & Physiology need a 90-min block before Friday's review.",
      color: "var(--bad)",
    },
  ];
  if (t3) {
    out.splice(1, 0, {
      headline: `${t3.code} networking week conflicts with ${t1.code} mock M-15`,
      body: "— I've moved the lab to Saturday morning.",
      color: "var(--gold)",
    });
  }
  return out;
}

/* ── Demo deck (used when /tracks loads with <2 enrolled) ─────── */

const DEMO_TRACKS: Track[] = [
  {
    id: "neet-2027",
    code: "NEET 2027",
    longName: "NEET 2027 — Aarav's preparation",
    niche: "Medical · MBBS / BDS",
    hours: 17,
    pct: 52,
    color: "var(--info)",
    readiness: { current: 728, max: 900, deltaWeeks: 18, label: "" },
    weakToday: "Thermodynamics · Entropy",
    nextSession: "Carnot cycle · 12 Qs · 22 min",
  },
  {
    id: "jee-2027",
    code: "JEE 2027",
    longName: "JEE 2027",
    niche: "Engineering · IIT/NIT",
    hours: 9,
    pct: 28,
    color: "var(--gold)",
    readiness: { current: 612, max: 360, deltaWeeks: 8, label: "Adv" },
    weakToday: "Coordinate geometry · Conics",
    nextSession: "Ellipse properties · 8 Qs · 14 min",
  },
  {
    id: "aws-saa",
    code: "AWS SAA",
    longName: "AWS SAA · cert",
    niche: "Cert · 28 days",
    hours: 6,
    pct: 20,
    color: "var(--ink)",
    readiness: { current: 74, max: 0, deltaWeeks: 6, label: "" },
    weakToday: "VPC · routing",
    nextSession: "Transit Gateway lab · 18 min",
    isPercent: true,
    passThreshold: "Pass threshold 72% · you're above",
  },
];
