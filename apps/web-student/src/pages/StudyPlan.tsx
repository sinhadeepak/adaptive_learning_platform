// StudyPlan — constrained plan editor (Phase 6 S55).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S55
// ADR:  docs/adr/0023-constrained-plan-coediting.md
//
// Three states:
//   - loading: SkeletonRows
//   - absent : "no active plan" empty state + Generate button
//   - active : grouped-by-day session list with per-row edit actions
//
// Constrained edits (per ADR-0023): the server enforces invariants
// (required sessions can't be deleted; total minutes per day stays
// within ±dailyMinutesGoal). When the server returns blocked=true,
// we surface the block_reason inline rather than hiding the action.

import { useEffect, useState } from "react";

import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/dashboard";
import {
  dayOffsetLabel,
  editPlan,
  fetchActivePlan,
  generatePlan,
  sessionKindLabel,
  type EditKind,
  type EditPayload,
  type PlanSession,
  type StudyPlan,
} from "../lib/study-plan";

interface EditFeedback {
  kind: "info" | "danger";
  message: string;
}

export function StudyPlanPage() {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [absent, setAbsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<EditFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const res = await fetchActivePlan();
      if (res.kind === "absent") {
        setAbsent(true);
        setPlan(null);
      } else {
        setAbsent(false);
        setPlan(res.plan);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the plan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const next = await generatePlan({ dailyMinutesGoal: 45 });
      setPlan(next);
      setAbsent(false);
      setFeedback({ kind: "info", message: "Plan generated for this week." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a plan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(kind: EditKind, session: PlanSession, extras?: Partial<EditPayload>) {
    if (!plan || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await editPlan(plan.id, {
        kind,
        sessionId: session.id,
        ...extras,
      });
      if (res.blocked) {
        setFeedback({
          kind: "danger",
          message:
            res.blockReason ??
            "That edit isn't allowed — required sessions stay put.",
        });
      } else {
        setFeedback({
          kind: "info",
          message:
            res.impactPreview.summary ??
            `${kind} applied — re-fetching plan.`,
        });
        await refresh();
      }
    } catch (e) {
      setFeedback({
        kind: "danger",
        message:
          e instanceof Error ? e.message : "Edit failed — try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Study plan">
        <SkeletonRows count={3} />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Study plan">
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      </AppShell>
    );
  }

  if (absent || !plan) {
    return (
      <AppShell title="Study plan">
        <section className="plan-empty">
          <h2 className="plan-empty-title">No active plan yet</h2>
          <p className="plan-empty-copy">
            The plan is a constrained, editable view of what to study this
            week. It groups practice, revision, and mock sessions by day —
            you can move, swap, shorten, or skip any non-required slot.
          </p>
          <button
            type="button"
            className="plan-generate-btn"
            onClick={handleGenerate}
            disabled={busy}
          >
            {busy ? "Generating…" : "Generate a plan for this week"}
          </button>
        </section>
      </AppShell>
    );
  }

  // Group sessions by day_offset for a clean weekly view.
  const byDay = new Map<number, PlanSession[]>();
  for (const s of plan.sessions) {
    const list = byDay.get(s.dayOffset) ?? [];
    list.push(s);
    byDay.set(s.dayOffset, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <AppShell title="Study plan">
      <header className="plan-head">
        <div>
          <h1 className="plan-title">Plan editor</h1>
          <p className="plan-sub">
            Week of {plan.weekStart} · {plan.dailyMinutesGoal}m/day target ·
            source: <code className="plan-source">{plan.source}</code>
          </p>
        </div>
        <button
          type="button"
          className="plan-regen-btn"
          onClick={() => handleEdit("regenerate", plan.sessions[0])}
          disabled={busy || plan.sessions.length === 0}
        >
          {busy ? "Working…" : "Regenerate"}
        </button>
      </header>

      {feedback && (
        <Banner
          tone={feedback.kind === "danger" ? "danger" : "info"}
          role={feedback.kind === "danger" ? "alert" : "status"}
        >
          {feedback.message}
        </Banner>
      )}

      <div className="plan-days">
        {days.map((day) => (
          <DaySection
            key={day}
            day={day}
            weekStart={plan.weekStart}
            sessions={byDay.get(day) ?? []}
            onEdit={handleEdit}
            busy={busy}
          />
        ))}
      </div>
    </AppShell>
  );
}

// ─── Day section ─────────────────────────────────────────────────────

function DaySection({
  day,
  weekStart,
  sessions,
  onEdit,
  busy,
}: {
  day: number;
  weekStart: string;
  sessions: PlanSession[];
  onEdit: (kind: EditKind, s: PlanSession, extras?: Partial<EditPayload>) => void;
  busy: boolean;
}) {
  const totalMins = sessions
    .filter((s) => s.status !== "removed")
    .reduce((acc, s) => acc + s.expectedMinutes, 0);
  return (
    <section className="plan-day">
      <header className="plan-day-head">
        <span className="plan-day-name">{dayOffsetLabel(day, weekStart)}</span>
        <span className="plan-day-total">{totalMins}m planned</span>
      </header>
      <ul className="plan-rows">
        {sessions.map((s) => (
          <PlanRow key={s.id} session={s} onEdit={onEdit} busy={busy} />
        ))}
      </ul>
    </section>
  );
}

// ─── Per-session row ─────────────────────────────────────────────────

function PlanRow({
  session,
  onEdit,
  busy,
}: {
  session: PlanSession;
  onEdit: (kind: EditKind, s: PlanSession, extras?: Partial<EditPayload>) => void;
  busy: boolean;
}) {
  const isCompleted = session.status === "completed";
  const isRemoved = session.status === "removed";
  return (
    <li
      className={`plan-row${session.isRequired ? " is-required" : ""}${isCompleted ? " is-completed" : ""}${isRemoved ? " is-removed" : ""}`}
    >
      <div className="plan-row-main">
        <div className="plan-row-kind">{sessionKindLabel(session.kind)}</div>
        <div className="plan-row-meta">
          <span>{session.expectedMinutes}m</span>
          <span>·</span>
          <span>{session.expectedQuestions} Q</span>
          {session.isRequired && (
            <>
              <span>·</span>
              <span className="plan-row-required">required</span>
            </>
          )}
          {isCompleted && (
            <>
              <span>·</span>
              <span className="plan-row-done">done</span>
            </>
          )}
        </div>
      </div>
      {!isCompleted && !isRemoved && (
        <div className="plan-row-actions">
          <ActionButton
            label="Shorten"
            disabled={busy || session.isRequired}
            onClick={() =>
              onEdit("shorten", session, {
                newMinutes: Math.max(10, session.expectedMinutes - 10),
              })
            }
          />
          <ActionButton
            label="Postpone"
            disabled={busy}
            onClick={() => onEdit("postpone", session)}
          />
          <ActionButton
            label="Rest"
            disabled={busy || session.isRequired}
            onClick={() => onEdit("rest", session)}
          />
        </div>
      )}
    </li>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="plan-row-btn"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
