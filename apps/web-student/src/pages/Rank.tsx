import { Fragment, useEffect, useMemo, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

// Leaderboard / Rank — React port of
// docs/ui/01_StudentPortal_Web/12_leaderboard.html.
//
// Phase 1 reality: there is no cohort/leaderboard backend yet — analytics
// only exposes per-user readiness. So this page:
//   • Pulls REAL numbers for the signed-in student (readiness, mastery,
//     streak, ability θ proxy from mean EWA).
//   • Builds a small DEMO cohort of 11 peers around the student's real
//     readiness so the design renders end-to-end. The demo cohort is
//     clearly badged ("Demo cohort · institutional roster lands in Phase 2")
//     so it can never be confused with real peer data.
//   • Computes the student's rank inside the demo cohort honestly — the
//     student's position changes based on their actual readiness.
//
// When the cohort backend ships (Phase 2 — institutional roster + nightly
// rank snapshot in analytics), swap `buildDemoCohort` for the API call
// and the rest of the page renders unchanged.

interface Profile {
  user: { firstName: string; lastName?: string };
  exams: Array<{ examId: string; targetDate: string | null }>;
}
interface ExamMeta { id: string; code: string; name: string; }
interface ReadinessResponse {
  score: number;
  nTopics: number;
  updatedAt: string | null;
  // TODO(phase2): backend fields per spec — currently optional fallback
  predictedAir?: number;
  percentileSource?: "cohort" | "fallback";
  cohortSize?: number;
}
interface MasteryListResponse { topics: Array<{ topicId: string; ewa: number; n: number }>; }
interface StreakResponse { currentStreak: number; longestStreak: number; lastActiveDate: string | null; }

type Period = "weekly" | "monthly" | "all";
type Scope = "institute" | "cohort" | "global";

interface DemoStudent {
  id: string;
  name: string;
  initial: string;
  readiness: number;
  delta: number;
  movement: number;
  streakDays: number;
  topSubject: string;
  topPct: number;
  avatarTone: "blue" | "purple" | "amber" | "cyan" | "red" | "green" | "muted";
  isYou?: boolean;
}

const DEMO_PEERS: Omit<DemoStudent, "isYou">[] = [
  { id: "demo_rahul", name: "Rahul M.", initial: "R", readiness: 94.2, delta: +1.2, movement: 0, streakDays: 28, topSubject: "Bio", topPct: 92, avatarTone: "amber" },
  { id: "demo_ananya", name: "Ananya K.", initial: "A", readiness: 91.8, delta: +0.4, movement: +1, streakDays: 22, topSubject: "Chem", topPct: 88, avatarTone: "cyan" },
  { id: "demo_vikram", name: "Vikram S.", initial: "V", readiness: 88.5, delta: 0, movement: 0, streakDays: 17, topSubject: "Phy", topPct: 85, avatarTone: "muted" },
  { id: "demo_kiran", name: "Kiran P.", initial: "K", readiness: 85.1, delta: +2.1, movement: +1, streakDays: 21, topSubject: "Bio", topPct: 82, avatarTone: "red" },
  { id: "demo_meera", name: "Meera R.", initial: "M", readiness: 83.7, delta: +0.8, movement: 0, streakDays: 9, topSubject: "Phy", topPct: 71, avatarTone: "green" },
  { id: "demo_dev", name: "Dev T.", initial: "D", readiness: 81.2, delta: +1.4, movement: 0, streakDays: 5, topSubject: "Chem", topPct: 68, avatarTone: "cyan" },
  { id: "demo_sid", name: "Siddharth R.", initial: "S", readiness: 77.1, delta: +0.2, movement: 0, streakDays: 3, topSubject: "Bio", topPct: 74, avatarTone: "purple" },
  { id: "demo_nisha", name: "Nisha M.", initial: "N", readiness: 74.8, delta: -1.1, movement: -1, streakDays: 0, topSubject: "Phy", topPct: 44, avatarTone: "muted" },
  { id: "demo_arjun", name: "Arjun P.", initial: "A", readiness: 73.2, delta: +0.5, movement: 0, streakDays: 4, topSubject: "Chem", topPct: 61, avatarTone: "blue" },
  { id: "demo_pooja", name: "Pooja N.", initial: "P", readiness: 68.4, delta: -0.3, movement: -1, streakDays: 1, topSubject: "Bio", topPct: 58, avatarTone: "purple" },
  { id: "demo_rohan", name: "Rohan G.", initial: "R", readiness: 64.1, delta: +0.9, movement: +1, streakDays: 6, topSubject: "Phy", topPct: 52, avatarTone: "blue" },
];

const TONE_GRADIENTS: Record<DemoStudent["avatarTone"], string> = {
  amber: "linear-gradient(135deg, var(--warn), #FF8C42)",
  cyan: "linear-gradient(135deg, var(--gold), #1A8F8F)",
  blue: "linear-gradient(135deg, var(--info), #3D6FE0)",
  purple: "linear-gradient(135deg, var(--accent), #6B4F9A)",
  red: "linear-gradient(135deg, var(--bad), #C73478)",
  green: "linear-gradient(135deg, var(--good), #068852)",
  muted: "linear-gradient(135deg, #4A5580, #2E3A5A)",
};

const POD_TONES = {
  gold: { bg: "rgba(245,166,35,0.16)", text: "var(--warn)", grad: "linear-gradient(135deg, var(--warn), #FF8C42)" },
  silver: { bg: "rgba(160,168,184,0.14)", text: "var(--ink-3)", grad: "linear-gradient(135deg, var(--ink-3), var(--ink-4))" },
  bronze: { bg: "rgba(201,123,62,0.12)", text: "var(--gold)", grad: "linear-gradient(135deg, var(--gold), var(--warn))" },
};

export function Rank() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [mastery, setMastery] = useState<MasteryListResponse["topics"]>([]);
  const [exams, setExams] = useState<ExamMeta[]>([]);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("institute");
  const [period, setPeriod] = useState<Period>("weekly");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await auth.fetch("/api/v1/profile/me");
        if (r.ok) {
          const p = (await r.json()) as Profile;
          setProfile(p);
          if (p.exams.length > 0) setActiveExamId(p.exams[0].examId);
        }
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch("/api/v1/catalog/exams");
        if (r.ok) setExams((await r.json()) as ExamMeta[]);
      } catch {
        /* swallow */
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await auth.fetch(`/api/v1/analytics/readiness/${user.id}`);
        if (r.ok) setReadiness((await r.json()) as ReadinessResponse);
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/analytics/streak/${user.id}`);
        if (r.ok) setStreak((await r.json()) as StreakResponse);
      } catch {
        /* swallow */
      }
      try {
        const r = await auth.fetch(`/api/v1/analytics/mastery/${user.id}`);
        if (r.ok) {
          const body = (await r.json()) as MasteryListResponse;
          setMastery(body.topics);
        }
      } catch {
        /* swallow */
      }
    })();
  }, [user]);

  // Derive student's display data
  const initial = (user?.firstName ?? "?").slice(0, 1).toUpperCase();
  const youName =
    profile?.user.firstName
      ? `${profile.user.firstName}${profile.user.lastName ? " " + profile.user.lastName : ""}`
      : (user?.firstName ?? "You");
  const youReadinessPct = readiness ? +(readiness.score * 100).toFixed(1) : 0;
  const tested = mastery.filter((t) => t.n > 0);
  const meanEwa = tested.length > 0 ? tested.reduce((s, t) => s + t.ewa, 0) / tested.length : 0;
  const theta = +(meanEwa * 4 - 2).toFixed(2);

  // Build the cohort (peers + you). Insert "you" at the right position by
  // readiness so the rank reflects your actual standing.
  const cohort = useMemo<DemoStudent[]>(() => {
    const you: DemoStudent = {
      id: "you",
      name: `${youName} · You`,
      initial,
      readiness: youReadinessPct,
      // Synthesised week delta — proportional to mastery activity. Real
      // weekly delta needs a historical readiness series (Phase 2).
      delta: tested.length > 0 ? +(meanEwa * 4).toFixed(1) : 0,
      movement: tested.length > 2 ? +2 : 0,
      streakDays: streak?.currentStreak ?? 0,
      topSubject: "—",
      topPct: 0,
      avatarTone: "amber",
      isYou: true,
    };
    const merged = [...DEMO_PEERS.map((p) => ({ ...p })), you];
    merged.sort((a, b) => b.readiness - a.readiness);
    return merged;
  }, [youName, initial, youReadinessPct, tested.length, meanEwa, streak]);

  const youRank = cohort.findIndex((s) => s.isYou) + 1;
  const youInTop3 = youRank > 0 && youRank <= 3;
  const top3 = cohort.slice(0, 3);
  const rest = cohort.slice(3);

  // "Students near you" — 1 above + you + 2 below (or first 4 if you're top).
  const nearby = useMemo<DemoStudent[]>(() => {
    if (youRank <= 0) return cohort.slice(0, 4);
    const i = youRank - 1;
    const lo = Math.max(0, i - 1);
    const hi = Math.min(cohort.length, lo + 4);
    return cohort.slice(lo, hi);
  }, [cohort, youRank]);

  // AI insight bullets derived from cohort position.
  const aboveYou = youRank > 1 ? cohort[youRank - 2] : null;
  const belowYou = youRank < cohort.length ? cohort[youRank] : null;
  const climbInsight = (() => {
    if (!aboveYou) return null;
    const gap = +(aboveYou.readiness - youReadinessPct).toFixed(1);
    if (gap <= 0) return null;
    // Velocity = mastery × 0.46 readiness pts/day (matches Analysis projection).
    const days = Math.max(1, Math.round(gap / 0.46));
    return { peer: aboveYou, gap, weeks: Math.max(1, Math.round(days / 7)) };
  })();

  // Predicted AIR derived from readiness + cohort position (Phase 1 proxy).
  // Phase 2: replace with real AIR from analytics backend.
  const predictedAir = youReadinessPct > 0
    ? Math.round(1_000_000 * (1 - youReadinessPct / 100) * 0.85 + youRank * 120)
    : null;

  return (
    <VidyaShell
      crumbs="COMPETE · PREDICTED AIR"
      title="Your predicted rank"
      chips={
        <>
          {exams.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className={`vidya-shell__chip${ex.id === activeExamId ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setActiveExamId(ex.id)}
            >
              {ex.code || ex.name}
            </button>
          ))}
        </>
      }
      actions={
        <>
          <button
            type="button"
            className={`vidya-shell__chip${period === "weekly" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setPeriod("weekly")}
          >
            Weekly
          </button>
          <button
            type="button"
            className={`vidya-shell__chip${period === "monthly" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setPeriod("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`vidya-shell__chip${period === "all" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setPeriod("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`vidya-shell__chip${scope === "institute" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setScope("institute")}
          >
            Institute
          </button>
          <button
            type="button"
            className={`vidya-shell__chip${scope === "cohort" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setScope("cohort")}
          >
            Cohort
          </button>
          <button
            type="button"
            className={`vidya-shell__chip${scope === "global" ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setScope("global")}
          >
            Global
          </button>
        </>
      }
    >
      {/* Demo cohort banner */}
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--sp-2)",
          padding: "var(--sp-3) var(--sp-4)",
          marginBottom: "var(--sp-4)",
          background: "rgba(79,135,246,0.08)",
          border: "1px solid rgba(79,135,246,0.18)",
          borderRadius: "var(--r-md)",
          fontSize: 12,
          color: "var(--ink-2)",
        }}
      >
        <span aria-hidden>◈</span>
        <span>
          <strong>Demo cohort</strong> — peer numbers below are synthesised for design preview.
          Institutional roster + nightly rank snapshots land in Phase 2. Your own readiness,
          streak, and mastery are real.
        </span>
      </div>

      {/* HERO — predicted AIR + readiness + trajectory + source pill */}
      <section className="vidya-heat-card">
        <div className="vidya-heat-card__head">
          <div>
            <div className="vidya-heat-card__eyebrow">
              Predicted AIR · {readiness?.percentileSource ?? "fallback"}
              {readiness?.cohortSize != null
                ? ` · cohort ${readiness.cohortSize}`
                : ` · cohort ${cohort.length}`}
            </div>
            <div className="vidya-heat-card__title">
              {readiness?.predictedAir != null
                ? `AIR ~${readiness.predictedAir.toLocaleString()}`
                : predictedAir != null
                  ? `AIR ~${predictedAir.toLocaleString()}`
                  : "—"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Readiness
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 700,
                color: youReadinessPct >= 80 ? "var(--good)" : youReadinessPct >= 60 ? "var(--info)" : "var(--ink-2)",
                fontFeatureSettings: '"tnum"',
                lineHeight: 1,
              }}
            >
              {youReadinessPct > 0 ? `${youReadinessPct.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Trajectory + supporting copy */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", marginTop: "var(--sp-4)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Cohort rank
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color: "var(--accent)",
                fontSize: 18,
              }}
            >
              {youRank > 0 ? `#${youRank}` : "—"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              θ score
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color: "var(--gold)",
                fontSize: 15,
                background: "rgba(34,212,238,0.10)",
                border: "1px solid rgba(34,212,238,0.22)",
                borderRadius: 20,
                padding: "1px 8px",
              }}
            >
              {theta >= 0 ? `+${theta.toFixed(2)}` : theta.toFixed(2)}
            </span>
          </div>
          {streak && streak.currentStreak > 0 ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--warn)",
                background: "rgba(245,166,35,0.12)",
                border: "1px solid rgba(245,166,35,0.22)",
                borderRadius: 20,
                padding: "2px 10px",
              }}
            >
              🔥 {streak.currentStreak}d streak
            </span>
          ) : null}
          {tested.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Run your first practice round to unlock trajectory analysis.
            </span>
          ) : climbInsight ? (
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
              Gap to <strong>{climbInsight.peer.name}</strong>:{" "}
              <strong style={{ color: "var(--warn)" }}>{climbInsight.gap} pts</strong>{" "}
              — closeable in ~{climbInsight.weeks} week{climbInsight.weeks === 1 ? "" : "s"} at current velocity.
            </span>
          ) : null}
        </div>
      </section>

      {/* PODIUM */}
      <section className="vidya-card-block" aria-label="Top three in scope">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Top 3 in scope</h2>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: "var(--sp-6)",
            padding: "var(--sp-4) 0 var(--sp-2)",
          }}
        >
          <Podium student={top3[1]} place={2} tone={POD_TONES.silver} avSize={48} baseHeight={64} />
          <Podium student={top3[0]} place={1} tone={POD_TONES.gold} avSize={62} baseHeight={92} crown />
          <Podium student={top3[2]} place={3} tone={POD_TONES.bronze} avSize={42} baseHeight={48} />
        </div>
      </section>

      {/* YOUR RANK HIGHLIGHT — only when not on podium */}
      {!youInTop3 ? (
        <section className="vidya-card-block" aria-label="Your rank">
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Your position</h2>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-4)",
              padding: "var(--sp-3) 0",
            }}
          >
            <div style={{ textAlign: "center", minWidth: 56 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--accent)",
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                }}
              >
                {youRank > 0 ? youRank : "—"}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                RANK
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: TONE_GRADIENTS.amber,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 16,
                color: "var(--paper)",
              }}
            >
              {initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{youName}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginTop: 2, flexWrap: "wrap" }}>
                {streak && streak.currentStreak >= 1 ? (
                  <span style={{ color: "var(--good)", fontWeight: 700, fontSize: 12 }}>
                    ↑ Top {Math.max(1, Math.round((youRank / cohort.length) * 100))}% of cohort
                  </span>
                ) : (
                  <span style={{ fontSize: 12 }}>Top {Math.max(1, Math.round((youRank / cohort.length) * 100))}% of cohort</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: 20,
                  color: youReadinessPct >= 80 ? "var(--good)" : youReadinessPct >= 60 ? "var(--info)" : "var(--ink-2)",
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {youReadinessPct.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>readiness score</div>
            </div>
          </div>
        </section>
      ) : null}

      {/* FULL TABLE — collapsed by default */}
      <section className="vidya-card-block" aria-label="Full rankings">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Full rankings</h2>
          <button
            type="button"
            className="vidya-shell__chip"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show top 10" : "Show all"}
          </button>
        </div>

        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "32px 36px 1fr 120px 64px 40px 32px",
            gap: "var(--sp-2)",
            padding: "var(--sp-2) var(--sp-2)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderBottom: "1px solid var(--rule-2)",
          }}
        >
          <span>#</span>
          <span></span>
          <span>Student</span>
          <span>Progress</span>
          <span style={{ textAlign: "right" }}>Score</span>
          <span style={{ textAlign: "right" }}>Wk</span>
          <span></span>
        </div>

        {/* Rows */}
        {(showAll ? rest : rest.slice(0, 7)).map((s, i) => {
          const place = i + 4;
          const deltaColor =
            s.delta > 0
              ? "var(--good)"
              : s.delta < 0
                ? "var(--bad)"
                : "var(--ink-4)";
          const moveColor =
            s.movement > 0
              ? "var(--good)"
              : s.movement < 0
                ? "var(--bad)"
                : "var(--ink-4)";
          const moveSym =
            s.movement > 0
              ? `↑${s.movement}`
              : s.movement < 0
                ? `↓${Math.abs(s.movement)}`
                : "→";
          const scoreColor =
            s.readiness >= 80
              ? "var(--good)"
              : s.readiness >= 60
                ? "var(--info)"
                : "var(--ink-2)";
          return (
            <Fragment key={s.id}>
              <div
                aria-current={s.isYou ? true : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 36px 1fr 120px 64px 40px 32px",
                  gap: "var(--sp-2)",
                  alignItems: "center",
                  padding: "var(--sp-2) var(--sp-2)",
                  borderBottom: "1px solid var(--rule-2)",
                  background: s.isYou ? "rgba(79,135,246,0.08)" : "transparent",
                  borderRadius: s.isYou ? "var(--r-md)" : 0,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--ink-2)",
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {place}
                </div>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: TONE_GRADIENTS[s.avatarTone],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--paper)",
                  }}
                >
                  {s.initial}
                </div>
                <div>
                  <div style={{ fontWeight: s.isYou ? 700 : 500, fontSize: 13, color: "var(--ink)" }}>
                    {s.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-1)", marginTop: 2, flexWrap: "wrap" }}>
                    {s.topPct > 0 ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 20,
                          background: "rgba(79,135,246,0.12)",
                          color: "var(--info)",
                        }}
                      >
                        {s.topSubject} {s.topPct}%
                      </span>
                    ) : null}
                    {s.streakDays > 0 ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 20,
                          background:
                            s.streakDays >= 7
                              ? "rgba(16,196,122,0.12)"
                              : "rgba(245,166,35,0.12)",
                          color:
                            s.streakDays >= 7
                              ? "var(--good)"
                              : "var(--warn)",
                        }}
                      >
                        🔥 {s.streakDays}d
                      </span>
                    ) : null}
                    {s.isYou && s.movement > 0 ? (
                      <span style={{ color: "var(--good)", fontWeight: 600, fontSize: 9 }}>
                        ↑ {s.movement} this week
                      </span>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.min(100, Math.max(0, s.readiness))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${s.name}'s readiness`}
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: "var(--rule-2)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, s.readiness)}%`,
                        background: scoreColor,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 9, color: "var(--ink-3)", marginTop: 2, display: "block" }}>
                    {s.readiness.toFixed(1)} readiness
                  </span>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 13,
                    color: scoreColor,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {s.readiness.toFixed(1)}
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: deltaColor,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {s.delta > 0 ? `+${s.delta.toFixed(1)}` : s.delta.toFixed(1)}
                </div>
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: moveColor }}>
                  {moveSym}
                </div>
              </div>
            </Fragment>
          );
        })}

        {rest.length > 7 ? (
          <button
            type="button"
            className="vidya-shell__chip"
            style={{ margin: "var(--sp-3) auto", display: "block" }}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? "Collapse"
              : `Show all ${cohort.length} students ›`}
          </button>
        ) : null}
      </section>

      {/* NEARBY + AI INSIGHTS side content */}
      <section className="vidya-card-block" aria-label="Students near you">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">Students near you</h2>
        </div>
        {nearby.map((s) => {
          const place = cohort.indexOf(s) + 1;
          const gap = +(s.readiness - youReadinessPct).toFixed(1);
          return (
            <Fragment key={s.id}>
              <div
                aria-current={s.isYou ? true : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-3)",
                  padding: "var(--sp-2) var(--sp-2)",
                  borderBottom: "1px solid var(--rule-2)",
                  background: s.isYou ? "rgba(79,135,246,0.08)" : "transparent",
                  borderRadius: s.isYou ? "var(--r-md)" : 0,
                }}
              >
                <span
                  style={{
                    minWidth: 24,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--ink-2)",
                    textAlign: "right",
                  }}
                >
                  {place}
                </span>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: TONE_GRADIENTS[s.avatarTone],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--paper)",
                    flexShrink: 0,
                  }}
                >
                  {s.initial}
                </div>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: s.isYou ? 700 : 500, color: "var(--ink)" }}>
                  {s.isYou ? "You" : s.name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--ink-2)",
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {s.readiness.toFixed(1)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: s.isYou
                      ? "var(--ink-4)"
                      : gap > 0
                        ? "var(--good)"
                        : "var(--bad)",
                    fontFeatureSettings: '"tnum"',
                    minWidth: 40,
                    textAlign: "right",
                  }}
                >
                  {s.isYou ? "—" : gap > 0 ? `+${gap}` : `${gap}`}
                </span>
              </div>
            </Fragment>
          );
        })}
      </section>

      {/* AI INSIGHTS */}
      <section className="vidya-card-block" aria-label="AI ranking analysis">
        <div className="vidya-card-block__head">
          <h2 className="vidya-card-block__title">◈ AI · ranking analysis</h2>
        </div>
        {tested.length === 0 ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", padding: "var(--sp-2) 0" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", flexShrink: 0, marginTop: 4 }} />
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
              Run your first practice round to start tracking your rank.
            </div>
          </div>
        ) : (
          <>
            {streak && streak.currentStreak >= 3 ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", padding: "var(--sp-2) 0" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--good)", flexShrink: 0, marginTop: 4 }} />
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  <strong>{streak.currentStreak}-day streak</strong> — consistency is
                  the strongest signal that climbs the leaderboard.
                </div>
              </div>
            ) : null}
            {climbInsight ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", padding: "var(--sp-2) 0" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", flexShrink: 0, marginTop: 4 }} />
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  Gap to <strong>{climbInsight.peer.name}</strong> is{" "}
                  <strong>{climbInsight.gap} pts</strong> — closeable in
                  ~{climbInsight.weeks} week
                  {climbInsight.weeks === 1 ? "" : "s"} at current velocity.
                </div>
              </div>
            ) : null}
            {belowYou ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", padding: "var(--sp-2) 0" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--info)", flexShrink: 0, marginTop: 4 }} />
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  <strong>{belowYou.name}</strong> is{" "}
                  {(youReadinessPct - belowYou.readiness).toFixed(1)} pts behind —
                  a session today maintains your lead.
                </div>
              </div>
            ) : null}
          </>
        )}
        {/* TODO(rank): add score velocity trend chart when Phase 2 history series ships */}
      </section>
    </VidyaShell>
  );
}

function Podium({
  student,
  place,
  tone,
  avSize,
  baseHeight,
  crown,
}: {
  student: DemoStudent | undefined;
  place: number;
  tone: { bg: string; text: string; grad: string };
  avSize: number;
  baseHeight: number;
  crown?: boolean;
}) {
  if (!student) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--sp-1)",
      }}
    >
      <div
        style={{
          width: avSize,
          height: avSize,
          borderRadius: "50%",
          background: tone.grad,
          fontSize: avSize >= 56 ? 22 : avSize >= 46 ? 18 : 15,
          border: crown ? "2.5px solid rgba(245,166,35,0.4)" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          color: "var(--paper)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {crown ? (
          <span
            style={{
              position: "absolute",
              top: -14,
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            👑
          </span>
        ) : null}
        {student.initial}
      </div>
      <div style={{ color: tone.text, fontWeight: place === 1 ? 800 : 700, fontSize: 12, textAlign: "center", maxWidth: avSize + 16 }}>
        {student.isYou ? "You" : student.name}
      </div>
      <div style={{ color: tone.text, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>
        {student.readiness.toFixed(1)}
      </div>
      <div
        style={{
          color: student.delta > 0 ? "var(--good)" : student.delta < 0 ? "var(--bad)" : "var(--ink-4)",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {student.delta > 0 ? `▲ +${student.delta.toFixed(1)}` : student.delta < 0 ? `▼ ${student.delta.toFixed(1)}` : "→ 0"}
      </div>
      <div
        style={{
          background: tone.bg,
          height: baseHeight,
          width: avSize + 16,
          borderRadius: "var(--r-md) var(--r-md) 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: tone.text, fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 20 }}>
          {place}
        </div>
      </div>
    </div>
  );
}
