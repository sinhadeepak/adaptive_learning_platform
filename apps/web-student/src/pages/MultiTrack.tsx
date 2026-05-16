// MultiTrack — Vidya v1 multi-track dashboard ("Three pursuits in motion").
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 multi-course mockup (page 5/10).
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// This page renders the "ALL TRACKS · OVERVIEW" surface for learners
// pursuing multiple exams concurrently. The backend doesn't yet model
// tracks as first-class objects (profile.exams is a simple array of
// {examId, targetDate}); the time-budget allocator + cross-track AI
// insights described in the mockup require new endpoints
// (/api/v1/tracks/budget, /api/v1/tracks/insights). Until those land
// this page renders with deterministic stub data shaped to match the
// final contract — see TRACK_STUBS at the bottom.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

interface TrackStub {
  id: string;
  code: string;
  longName: string;
  niche: string;
  hours: number;
  pct: number;
  color: string;
  hue: string;
  readiness: { current: number; max: number; deltaWeeks: number; label: string };
  weakToday: string;
  nextSession: string;
  isPercent?: boolean;
  passThreshold?: string;
}

export function MultiTrack() {
  const { user } = useAuth();
  const tracks = TRACK_STUBS;
  const totalHours = useMemo(
    () => tracks.reduce((acc, t) => acc + t.hours, 0),
    [tracks],
  );
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Learner";

  return (
    <VidyaShell
      crumbs="All tracks · overview"
      title="Three pursuits in motion."
      subtitle="NEET 2027 + JEE 2027 + AWS Solutions Architect. AI re-allocates time daily."
      chips={
        <>
          <button
            className={`vidya-shell__chip${filter === "all" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`vidya-shell__chip${filter === "active" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setFilter("active")}
          >
            Active · 3
          </button>
          <button
            className={`vidya-shell__chip${filter === "paused" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setFilter("paused")}
          >
            Paused
          </button>
        </>
      }
      actions={
        <button className="vidya-shell__primary">
          ⚡ Auto-balance plan
        </button>
      }
    >
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
          <em>{totalHours} hours</em> across three tracks. NEET takes the
          biggest slice — your readiness gap is widest there.
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

      {/* Track cards */}
      <div className="vidya-grid-3">
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
          <div className="vidya-card-block__sub">How the three actually competed</div>
          <div className="vidya-multi-stack" aria-hidden>
            {[5, 7, 6, 8, 4, 3, 7].map((hours, i) => {
              const ratios = [0.55, 0.3, 0.15];
              return (
                <div className="vidya-multi-stack__col" key={i}>
                  {ratios.map((r, k) => (
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
            <li>
              <span
                className="vidya-cross-list__bar"
                style={{ background: "var(--accent)" }}
              />
              <span>
                <strong>Math from JEE is lifting your NEET Physics by 11%</strong>{" "}
                — your numerical-method drills are transferring. Keep going.
              </span>
            </li>
            <li>
              <span
                className="vidya-cross-list__bar"
                style={{ background: "var(--gold)" }}
              />
              <span>
                <strong>AWS networking week conflicts with NEET mock M-15</strong>
                {" "}— I've moved the lab to Saturday morning.
              </span>
            </li>
            <li>
              <span
                className="vidya-cross-list__bar"
                style={{ background: "var(--bad)" }}
              />
              <span>
                <strong>NEET Biology slipped 8% this week</strong> — Botany &
                Physiology need a 90-min block before Friday's review.
              </span>
            </li>
          </ul>
          <Link to="/analysis" className="vidya-card-block__more">
            See full cross-track analysis →
          </Link>
        </section>
      </div>

      <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: "var(--sp-6)" }}>
        Signed in as <strong style={{ color: "var(--ink-2)" }}>{fullName}</strong>{" "}
        · the multi-track allocator is a Vidya v1 design — the budget
        recommendations shown here will swap to live data when the
        /tracks/budget endpoint ships.
      </div>
    </VidyaShell>
  );
}

function TrackCard({ t }: { t: TrackStub }) {
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
              {" "}/ {t.readiness.max}{t.readiness.label ? ` (${t.readiness.label})` : ""}
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

/* ── Stub data shaped to match the planned /tracks endpoint ────
   Replace with a fetch when the backend lands. The shape is
   deliberately the same as the future API so the swap is a
   one-line change. */

const TRACK_STUBS: TrackStub[] = [
  {
    id: "neet-2027",
    code: "NEET 2027",
    longName: "NEET 2027 — Aarav's preparation",
    niche: "Medical · MBBS / BDS",
    hours: 17,
    pct: 52,
    color: "var(--info)",
    hue: "info",
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
    hue: "gold",
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
    hue: "ink",
    readiness: { current: 74, max: 0, deltaWeeks: 6, label: "" },
    weakToday: "VPC · routing",
    nextSession: "Transit Gateway lab · 18 min",
    isPercent: true,
    passThreshold: "Pass threshold 72% · you're above",
  },
];
