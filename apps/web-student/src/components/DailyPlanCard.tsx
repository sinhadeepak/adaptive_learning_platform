import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-provider";
import {
  connectIGS,
  fetchTodayPlan,
  postOverride,
  type IGSAction,
  type NextActionPayload,
  type TodayPlanResponse,
} from "../lib/igs";

// ────────────────────────────────────────────────────────────────────
// Daily Plan — Phase B3 (IGS) replacement for Today's Mission.
//
// Shows 3–5 ordered actions from /igs/today-plan with the WS stream
// patching `chosen` and the plan-updated banner in real time. Each
// action carries a "Why this?" rationale + skip override.
// ────────────────────────────────────────────────────────────────────

interface Props {
  examId: string;
}

const KIND_TITLES: Record<string, string> = {
  practice_concept: "Practice — weak concept",
  revise_concept:   "Revise — fading recall",
  take_mock:        "Mock — full pattern",
  watch_video:      "Watch — short explainer",
  crash_drill:      "Crash drill — high-yield",
  take_break:       "Take a short break",
};

export function DailyPlanCard({ examId }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TodayPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [openedIdx, setOpenedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id || !examId) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await fetchTodayPlan(user.id, examId);
        if (!cancelled) {
          if (r) setPlan(r);
          else setError("Couldn't load today's plan");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Plan load failed");
      }
    })();

    const handle = connectIGS({
      examId,
      onNextAction: (p: NextActionPayload) => {
        // Patch only the top action when the stream pushes a new chosen.
        setPlan((prev) => prev ? patchTopAction(prev, p.chosen) : prev);
      },
      onPlanUpdated: () => {
        // Server flagged the plan changed (e.g., teacher intervention).
        // Refetch and surface the "plan changed" banner.
        setUpdated(true);
        fetchTodayPlan(user.id, examId).then((r) => r && setPlan(r));
      },
    });
    return () => { cancelled = true; handle.close(); };
  }, [user?.id, examId]);

  if (error) {
    return (
      <section style={{ ...cardStyle, opacity: 0.6 }}>
        <div style={eyebrow}>◈ TODAY'S PLAN</div>
        <p style={{ marginTop: 8, color: "var(--ink-2, #B8C5E0)", fontSize: 13 }}>
          {error}. Try refreshing.
        </p>
      </section>
    );
  }

  if (!plan) {
    return (
      <section style={cardStyle}>
        <div style={eyebrow}>◈ TODAY'S PLAN</div>
        <div style={{ marginTop: 12, height: 16, width: "60%", background: "var(--card)", borderRadius: 4 }} />
        <div style={{ marginTop: 8, height: 12, width: "40%", background: "var(--card)", borderRadius: 4 }} />
      </section>
    );
  }

  return (
    <section style={cardStyle} aria-label="Today's Plan">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={eyebrow}>◈ TODAY'S PLAN</div>
        <span style={budgetStyle}>{plan.total_minutes} min · {plan.plan.length} actions</span>
      </div>

      {updated && (
        <div role="status" style={bannerStyle}>
          Your plan just updated.{" "}
          <button type="button" style={bannerBtnStyle} onClick={() => setUpdated(false)}>
            Dismiss
          </button>
        </div>
      )}

      <ol style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
        {plan.plan.map((a, i) => {
          const ax: IGSAction = {
            actionKind: a.action_kind,
            conceptId: a.concept_id,
            blueprintId: a.blueprint_id,
            expectedMinutes: a.expected_minutes,
            questionCount: a.question_count,
            score: a.score,
            rank: a.rank,
            rationale: a.rationale,
            expectedMarksGained: a.expected_marks_gained,
          };
          return (
            <li key={i} style={i === 0 ? topItemStyle : itemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={titleStyle}>{KIND_TITLES[ax.actionKind] || ax.actionKind}</div>
                  <div style={metaStyle}>
                    {ax.expectedMinutes} min
                    {ax.questionCount ? ` · ${ax.questionCount} q` : ""}
                    {ax.expectedMarksGained ? ` · +${ax.expectedMarksGained.toFixed(1)} marks` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                    onClick={() => startAction(ax, navigate, examId)}
                  >
                    Start →
                  </button>
                  <button
                    type="button"
                    style={whyBtnStyle}
                    onClick={() => setOpenedIdx(openedIdx === i ? null : i)}
                  >
                    {openedIdx === i ? "Hide why" : "Why this?"}
                  </button>
                </div>
              </div>
              {openedIdx === i && (
                <div style={whyPanelStyle}>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {ax.rationale.map((r, j) => (
                      <li key={j} style={{ fontSize: 12, color: "var(--ink-2, #B8C5E0)" }}>{r}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    style={skipBtnStyle}
                    onClick={() => {
                      void postOverride(user!.id, {
                        chosen_action_kind: "take_break",
                        rejected_top_action_id: `${i}`,
                        reason: "user-skipped",
                      });
                      setOpenedIdx(null);
                    }}
                  >
                    Skip this action
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function patchTopAction(plan: TodayPlanResponse, chosen: IGSAction): TodayPlanResponse {
  if (!plan.plan.length) return plan;
  const head = {
    action_kind: chosen.actionKind,
    concept_id: chosen.conceptId,
    blueprint_id: chosen.blueprintId ?? null,
    question_count: chosen.questionCount,
    expected_minutes: chosen.expectedMinutes,
    score: chosen.score,
    rank: chosen.rank,
    rationale: chosen.rationale,
    expected_marks_gained: chosen.expectedMarksGained,
  };
  return { ...plan, plan: [head, ...plan.plan.slice(1)] };
}

function startAction(a: IGSAction, nav: ReturnType<typeof useNavigate>, examId: string) {
  switch (a.actionKind) {
    case "practice_concept":
    case "crash_drill":
      nav(a.conceptId ? `/practice?conceptId=${a.conceptId}` : "/practice");
      break;
    case "revise_concept":
      nav(a.conceptId ? `/revision?conceptId=${a.conceptId}` : "/revision");
      break;
    case "take_mock":
      nav(a.blueprintId ? `/mocks/${a.blueprintId}` : `/mocks?examId=${examId}`);
      break;
    case "watch_video":
      nav(a.conceptId ? `/library?conceptId=${a.conceptId}` : "/library");
      break;
    case "take_break":
    default:
      // No-op for break — the rationale is shown inline.
      break;
  }
}

const cardStyle: React.CSSProperties = {
  padding: 20,
  background: "linear-gradient(135deg, rgba(34,212,238,0.10), rgba(79,135,246,0.04))",
  border: "1px solid rgba(34,212,238,0.30)",
  borderRadius: 12,
  marginBottom: 20,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
  color: "var(--gold, #22D4EE)",
};

const budgetStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--ink-4, #7A8BAD)",
  fontFamily: "var(--font-mono, monospace)",
};

const bannerStyle: React.CSSProperties = {
  marginTop: 10, padding: "8px 12px",
  background: "rgba(34,212,238,0.10)",
  borderRadius: 6, fontSize: 12,
  color: "var(--ink-2, #B8C5E0)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};

const bannerBtnStyle: React.CSSProperties = {
  border: 0, background: "transparent", cursor: "pointer",
  color: "var(--gold, #22D4EE)", fontSize: 12, fontWeight: 600,
};

const itemStyle: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid var(--card, rgba(255,255,255,0.04))",
};

const topItemStyle: React.CSSProperties = {
  ...itemStyle,
  borderTop: "none",
  background: "var(--card, rgba(255,255,255,0.02))",
  borderRadius: 6,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600,
  color: "var(--ink, #EEF2FF)",
};

const metaStyle: React.CSSProperties = {
  fontSize: 11, marginTop: 2,
  color: "var(--ink-4, #7A8BAD)",
  fontFamily: "var(--font-mono, monospace)",
};

const whyBtnStyle: React.CSSProperties = {
  border: 0, background: "transparent", cursor: "pointer",
  color: "var(--gold, #22D4EE)", fontSize: 11, padding: 0,
};

const whyPanelStyle: React.CSSProperties = {
  marginTop: 10, padding: 10,
  background: "var(--card, rgba(255,255,255,0.02))",
  borderLeft: "2px solid var(--gold, #22D4EE)",
  borderRadius: 4,
};

const skipBtnStyle: React.CSSProperties = {
  marginTop: 8, border: 0, background: "transparent", cursor: "pointer",
  color: "var(--ink-4, #7A8BAD)", fontSize: 11, padding: 0, textDecoration: "underline",
};