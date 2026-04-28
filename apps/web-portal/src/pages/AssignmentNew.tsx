// Sprint 10 S10-B — Assignment Authoring wizard.
//
// Three-step flow:
//   Step 1: pick cohort (prefilled from query string)
//   Step 2: paste/pick question IDs (full picker UI deferred — Sprint 11)
//   Step 3: title, description, due date, review + Publish
//
// State machine + validation come from lib/assignment_wizard.ts so the
// step transitions are unit-testable without React.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type Cohort,
  assignments as assignmentsApi,
  institution,
} from "../lib/api";
import {
  type WizardState,
  dueAtToIso,
  initialWizardState,
  nextStep,
  prevStep,
  toggleQuestion,
  validateStep,
} from "../lib/assignment_wizard";

export function AssignmentNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tenantId = params.get("tenantId") ?? "";
  const initialCohort = params.get("cohortId") ?? "";

  const [state, setState] = useState<WizardState>(() => ({
    ...initialWizardState,
    cohortId: initialCohort || null,
  }));
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<string>("");

  useEffect(() => {
    if (!tenantId) return;
    institution
      .cohortsForTenant(tenantId)
      .then(setCohorts)
      .catch((e) => setError((e as Error).message));
  }, [tenantId]);

  const errors = validateStep(state);

  async function publish() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await assignmentsApi.create({
        cohortId: state.cohortId!,
        title: state.title,
        description: state.description || undefined,
        dueAt: dueAtToIso(state.dueAt),
      });
      await assignmentsApi.setQuestions(created.id, state.questionIds);
      await assignmentsApi.publish(created.id);
      navigate(`/assignments/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="New Assignment">
      <main className="page" style={{ padding: 24, maxWidth: 720 }}>
        <h1>New Assignment</h1>
        <p>
          Step {state.step} of 3.{" "}
          {state.step === 1 && "Pick the cohort to assign this to."}
          {state.step === 2 && "Curate the question list."}
          {state.step === 3 && "Title, due date, review, and publish."}
        </p>
        {error && <p className="banner banner-error">{error}</p>}

        {state.step === 1 && (
          <section>
            <label>
              Cohort:&nbsp;
              <select
                value={state.cohortId ?? ""}
                onChange={(e) =>
                  setState({ ...state, cohortId: e.currentTarget.value || null })
                }
              >
                <option value="">— pick —</option>
                {(cohorts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.exam ? ` · ${c.exam}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {state.step === 2 && (
          <section>
            <p>
              Paste a comma-separated list of question UUIDs (the full picker
              ships in Sprint 11). Picked: {state.questionIds.length}
            </p>
            <textarea
              rows={6}
              style={{ width: "100%" }}
              value={draftQuestions}
              onChange={(e) => setDraftQuestions(e.currentTarget.value)}
              placeholder="Paste question UUIDs separated by comma or newline"
            />
            <button
              className="btn-secondary"
              onClick={() => {
                const ids = draftQuestions
                  .split(/[,\n]+/)
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                let next = state;
                for (const id of ids) next = toggleQuestion(next, id);
                setState(next);
                setDraftQuestions("");
              }}
            >
              Add IDs to assignment
            </button>
            {state.questionIds.length > 0 && (
              <ul style={{ marginTop: 12 }}>
                {state.questionIds.map((id) => (
                  <li key={id}>
                    <code style={{ fontSize: 12 }}>{id}</code>{" "}
                    <button
                      className="btn-link"
                      onClick={() => setState(toggleQuestion(state, id))}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {state.step === 3 && (
          <section>
            <label>
              Title:&nbsp;
              <input
                value={state.title}
                onChange={(e) =>
                  setState({ ...state, title: e.currentTarget.value })
                }
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ display: "block", marginTop: 12 }}>
              Description (optional):
              <textarea
                rows={4}
                value={state.description}
                onChange={(e) =>
                  setState({ ...state, description: e.currentTarget.value })
                }
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ display: "block", marginTop: 12 }}>
              Due date (optional):
              <input
                type="date"
                value={state.dueAt}
                onChange={(e) =>
                  setState({ ...state, dueAt: e.currentTarget.value })
                }
              />
            </label>
          </section>
        )}

        {errors.length > 0 && (
          <ul style={{ color: "var(--color-red, red)", marginTop: 8 }}>
            {errors.map((e) => (
              <li key={e.field}>{e.message}</li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
          <button
            className="btn-secondary"
            onClick={() => setState(prevStep(state))}
            disabled={state.step === 1}
          >
            ← Back
          </button>
          {state.step < 3 ? (
            <button
              className="btn-primary"
              onClick={() => setState(nextStep(state))}
              disabled={errors.length > 0}
            >
              Next →
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={publish}
              disabled={errors.length > 0 || submitting}
            >
              {submitting ? "Publishing…" : "Publish assignment"}
            </button>
          )}
        </div>
      </main>
    </AppShell>
  );
}
