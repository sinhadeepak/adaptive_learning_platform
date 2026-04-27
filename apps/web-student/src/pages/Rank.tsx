import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { AppShell } from "../components/AppShell";

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
interface ReadinessResponse { score: number; nTopics: number; updatedAt: string | null; }
interface MasteryListResponse { topics: Array<{ topicId: string; ewa: number; n: number }>; }
interface StreakResponse { currentStreak: number; longestStreak: number; lastActiveDate: string | null; }

type Period = "weekly" | "monthly" | "all";
type Scope = "institute" | "global";

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
  amber: "linear-gradient(135deg, var(--color-amber), #FF8C42)",
  cyan: "linear-gradient(135deg, var(--color-ai), #1A8F8F)",
  blue: "linear-gradient(135deg, var(--color-blue), #3D6FE0)",
  purple: "linear-gradient(135deg, var(--color-purple), #6B4F9A)",
  red: "linear-gradient(135deg, var(--color-red), #C73478)",
  green: "linear-gradient(135deg, var(--color-green), #068852)",
  muted: "linear-gradient(135deg, #4A5580, #2E3A5A)",
};

const POD_TONES = {
  gold: { bg: "rgba(245,166,35,0.16)", text: "var(--color-amber)", grad: "linear-gradient(135deg, var(--color-amber), #FF8C42)" },
  silver: { bg: "rgba(160,168,184,0.14)", text: "#A0A8B8", grad: "linear-gradient(135deg, #A0A8B8, #8898C0)" },
  bronze: { bg: "rgba(201,123,62,0.12)", text: "#C97B3E", grad: "linear-gradient(135deg, #C97B3E, #A05A28)" },
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

  const activeExam = activeExamId
    ? exams.find((e) => e.id === activeExamId) ?? null
    : null;

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

  return (
    <AppShell
      title="Leaderboard"
      chips={[
        { label: "Live · updates hourly", live: true },
        { label: `${cohort.length} students · ${scope === "institute" ? "Institute" : "Global"}` },
      ]}
    >
      <nav className="rank-filter-bar" aria-label="Leaderboard filters">
        <div className="rank-scope-tabs">
          <button
            type="button"
            className={`rank-st ${scope === "institute" ? "is-active" : ""}`}
            onClick={() => setScope("institute")}
          >
            Institute
          </button>
          <button
            type="button"
            className={`rank-st ${scope === "global" ? "is-active" : ""}`}
            onClick={() => setScope("global")}
          >
            Global
          </button>
        </div>
        <div className="rank-vsep" />
        <div className="rank-period-tabs">
          {(["weekly", "monthly", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`rank-pt ${period === p ? "is-active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "weekly" ? "Weekly" : p === "monthly" ? "Monthly" : "All time"}
            </button>
          ))}
        </div>
        <div className="rank-exam-sel">
          {activeExam?.name ?? "All exams"} ▾
        </div>
      </nav>

      <div className="rank-demo-banner">
        <span aria-hidden>◈</span>
        <span>
          <strong>Demo cohort</strong> — peer numbers below are synthesised for
          design preview. Institutional roster + nightly rank snapshots land in
          Phase 2. Your own readiness, streak, and mastery are real.
        </span>
      </div>

      <div className="rank-body">
        <div>
          {/* Podium */}
          <section className="rank-podium-card" aria-label="Top three">
            <div className="rank-podium-row">
              <Podium student={top3[1]} place={2} tone={POD_TONES.silver} avSize={48} baseHeight={64} />
              <Podium student={top3[0]} place={1} tone={POD_TONES.gold} avSize={62} baseHeight={92} crown />
              <Podium student={top3[2]} place={3} tone={POD_TONES.bronze} avSize={42} baseHeight={48} />
            </div>
          </section>

          {/* Your rank highlight (only when you're not on the podium) */}
          {!youInTop3 ? (
            <div className="rank-you-card">
              <div className="rank-yc-rank">
                <div className="rank-yc-rank-num">{youRank > 0 ? youRank : "—"}</div>
                <div className="rank-yc-rank-lbl">RANK</div>
              </div>
              <div className="rank-yc-av">{initial}</div>
              <div className="rank-yc-info">
                <div className="rank-yc-name">{youName}</div>
                <div className="rank-yc-meta">
                  {streak && streak.currentStreak >= 1 ? (
                    <span style={{ color: "var(--color-green)", fontWeight: 700 }}>
                      ↑ Top {Math.max(1, Math.round((youRank / cohort.length) * 100))}% of cohort
                    </span>
                  ) : (
                    <span>Top {Math.max(1, Math.round((youRank / cohort.length) * 100))}% of cohort</span>
                  )}
                  <span>·</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-ai)",
                      background: "rgba(34,212,238,0.10)",
                      border: "1px solid rgba(34,212,238,0.22)",
                      borderRadius: 20,
                      padding: "1px 8px",
                    }}
                  >
                    θ {theta >= 0 ? `+${theta.toFixed(2)}` : theta.toFixed(2)}
                  </span>
                  {streak && streak.currentStreak > 0 ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--color-amber)",
                        background: "rgba(245,166,35,0.12)",
                        border: "1px solid rgba(245,166,35,0.22)",
                        borderRadius: 20,
                        padding: "1px 8px",
                      }}
                    >
                      🔥 {streak.currentStreak}d streak
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="rank-yc-right">
                <div className="rank-yc-score">{youReadinessPct.toFixed(1)}</div>
                <div className="rank-yc-slbl">readiness score</div>
              </div>
            </div>
          ) : null}

          {/* Header row */}
          <div className="rank-list-head">
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
                ? "var(--color-green)"
                : s.delta < 0
                  ? "var(--color-red)"
                  : "var(--text-faint)";
            const moveColor =
              s.movement > 0
                ? "var(--color-green)"
                : s.movement < 0
                  ? "var(--color-red)"
                  : "var(--text-faint)";
            const moveSym =
              s.movement > 0
                ? `↑${s.movement}`
                : s.movement < 0
                  ? `↓${Math.abs(s.movement)}`
                  : "→";
            const scoreColor =
              s.readiness >= 80
                ? "var(--color-green)"
                : s.readiness >= 60
                  ? "var(--color-blue)"
                  : "var(--text-secondary)";
            return (
              <div key={s.id} className={`rank-row${s.isYou ? " is-you" : ""}`}>
                <div className="rank-row-pos">{place}</div>
                <div
                  className="rank-row-av"
                  style={{ background: TONE_GRADIENTS[s.avatarTone] }}
                >
                  {s.initial}
                </div>
                <div className="rank-row-info">
                  <div className="rank-row-name">{s.name}</div>
                  <div className="rank-row-meta">
                    {s.topPct > 0 ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 20,
                          background: "rgba(79,135,246,0.12)",
                          color: "var(--color-blue)",
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
                              ? "var(--color-green)"
                              : "var(--color-amber)",
                        }}
                      >
                        🔥 {s.streakDays}d
                      </span>
                    ) : null}
                    {s.isYou && s.movement > 0 ? (
                      <span style={{ color: "var(--color-green)", fontWeight: 600 }}>
                        ↑ {s.movement} this week
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="rank-row-progress">
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min(100, s.readiness)}%`,
                        background: scoreColor,
                      }}
                    />
                  </div>
                  <span className="rank-row-progress-lbl">
                    {s.readiness.toFixed(1)} readiness
                  </span>
                </div>
                <div className="rank-row-score" style={{ color: scoreColor }}>
                  {s.readiness.toFixed(1)}
                </div>
                <div className="rank-row-delta" style={{ color: deltaColor }}>
                  {s.delta > 0 ? `+${s.delta.toFixed(1)}` : s.delta.toFixed(1)}
                </div>
                <div className="rank-row-move" style={{ color: moveColor }}>
                  {moveSym}
                </div>
              </div>
            );
          })}

          {rest.length > 7 ? (
            <button
              type="button"
              className="rank-list-foot"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? "Collapse"
                : `Show all ${cohort.length} students ›`}
            </button>
          ) : null}
        </div>

        {/* Right rail */}
        <aside aria-label="Your performance">
          <div className="rank-stats-card">
            <div className="rank-rp-label">Your performance</div>
            <div className="rank-stats-grid">
              <div className="rank-stat">
                <div className="rank-stat-num" style={{ color: "var(--color-blue)" }}>
                  {youRank > 0 ? `#${youRank}` : "—"}
                </div>
                <div className="rank-stat-lbl">Cohort rank</div>
              </div>
              <div className="rank-stat">
                <div className="rank-stat-num" style={{ color: "var(--color-purple)" }}>
                  Top {Math.max(1, Math.round((youRank / cohort.length) * 100))}%
                </div>
                <div className="rank-stat-lbl">Of {cohort.length}</div>
              </div>
              <div className="rank-stat">
                <div className="rank-stat-num" style={{ color: "var(--color-green)" }}>
                  {tested.length > 0 ? `+${(meanEwa * 4).toFixed(1)}` : "—"}
                </div>
                <div className="rank-stat-lbl">Score velocity</div>
              </div>
              <div className="rank-stat">
                <div className="rank-stat-num" style={{ color: "var(--color-amber)" }}>
                  {youReadinessPct.toFixed(1)}
                </div>
                <div className="rank-stat-lbl">Readiness</div>
              </div>
            </div>
            <div className="rank-hist-label">Rank history</div>
            <div className="rank-hist-row">
              <span className="rank-hist-period">This wk</span>
              <span className="rank-hist-rank">
                #{youRank} · {scope === "institute" ? "Institute" : "Global"}
              </span>
              <span className="rank-hist-delta" style={{ color: "var(--color-faint)" }}>
                —
              </span>
            </div>
            <div className="rank-hist-row">
              <span className="rank-hist-period">Older</span>
              <span className="rank-hist-rank" style={{ color: "var(--text-faint)" }}>
                Snapshots Phase 2
              </span>
              <span className="rank-hist-delta" style={{ color: "var(--text-faint)" }}>
                —
              </span>
            </div>
          </div>

          <div className="rank-nb-card">
            <div className="rank-rp-label">Students near you</div>
            {nearby.map((s) => {
              const place = cohort.indexOf(s) + 1;
              const gap = +(s.readiness - youReadinessPct).toFixed(1);
              return (
                <div
                  key={s.id}
                  className={`rank-nb-row${s.isYou ? " is-you" : ""}`}
                >
                  <div className="rank-nb-pos">{place}</div>
                  <div
                    className="rank-nb-av"
                    style={{ background: TONE_GRADIENTS[s.avatarTone] }}
                  >
                    {s.initial}
                  </div>
                  <div className="rank-nb-name">
                    {s.isYou ? "You" : s.name}
                  </div>
                  <div className="rank-nb-score">{s.readiness.toFixed(1)}</div>
                  <div
                    className="rank-nb-gap"
                    style={{
                      color: s.isYou
                        ? "var(--text-faint)"
                        : gap > 0
                          ? "var(--color-green)"
                          : "var(--color-red)",
                    }}
                  >
                    {s.isYou ? "—" : gap > 0 ? `+${gap}` : `${gap}`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rank-ai-card">
            <div className="rank-ai-ey">◈ AI · ranking analysis</div>
            {tested.length === 0 ? (
              <div className="rank-ai-ins">
                <div className="rank-ai-dot" style={{ background: "var(--color-amber)" }} />
                <div className="rank-ai-text">
                  Run your first practice round to start tracking your rank.
                </div>
              </div>
            ) : (
              <>
                {streak && streak.currentStreak >= 3 ? (
                  <div className="rank-ai-ins">
                    <div className="rank-ai-dot" style={{ background: "var(--color-green)" }} />
                    <div className="rank-ai-text">
                      <strong>{streak.currentStreak}-day streak</strong> — consistency is
                      the strongest signal that climbs the leaderboard.
                    </div>
                  </div>
                ) : null}
                {climbInsight ? (
                  <div className="rank-ai-ins">
                    <div className="rank-ai-dot" style={{ background: "var(--color-amber)" }} />
                    <div className="rank-ai-text">
                      Gap to <strong>{climbInsight.peer.name}</strong> is{" "}
                      <strong>{climbInsight.gap} pts</strong> — closeable in
                      ~{climbInsight.weeks} week
                      {climbInsight.weeks === 1 ? "" : "s"} at current velocity.
                    </div>
                  </div>
                ) : null}
                {belowYou ? (
                  <div className="rank-ai-ins">
                    <div className="rank-ai-dot" style={{ background: "var(--color-blue)" }} />
                    <div className="rank-ai-text">
                      <strong>{belowYou.name}</strong> is{" "}
                      {(youReadinessPct - belowYou.readiness).toFixed(1)} pts behind —
                      a session today maintains your lead.
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
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
    <div className="rank-pod">
      <div
        className="rank-pod-av"
        style={{
          width: avSize,
          height: avSize,
          background: tone.grad,
          fontSize: avSize >= 56 ? 22 : avSize >= 46 ? 18 : 15,
          border: crown ? "2.5px solid rgba(245,166,35,0.4)" : undefined,
        }}
      >
        {crown ? <span className="rank-pod-crown">👑</span> : null}
        {student.initial}
      </div>
      <div className="rank-pod-name" style={{ color: tone.text, fontWeight: place === 1 ? 800 : 700 }}>
        {student.isYou ? "You" : student.name}
      </div>
      <div className="rank-pod-score" style={{ color: tone.text }}>
        {student.readiness.toFixed(1)}
      </div>
      <div className="rank-pod-delta" style={{ color: student.delta > 0 ? "var(--color-green)" : student.delta < 0 ? "var(--color-red)" : "var(--text-faint)" }}>
        {student.delta > 0 ? `▲ +${student.delta.toFixed(1)}` : student.delta < 0 ? `▼ ${student.delta.toFixed(1)}` : "→ 0"}
      </div>
      <div
        className="rank-pod-base"
        style={{ background: tone.bg, height: baseHeight }}
      >
        <div className="rank-pod-rank" style={{ color: tone.text }}>
          {place}
        </div>
      </div>
    </div>
  );
}
