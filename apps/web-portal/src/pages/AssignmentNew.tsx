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
  type Question,
  assignments as assignmentsApi,
  content,
  institution,
} from "../lib/api";
import {
  type PickerState,
  applyFilters,
  initialPickerState,
  setQuery,
  setTopic,
  toggle as togglePicker,
  topicsInSet,
} from "../lib/question_picker";
import {
  type WizardState,
  dueAtToIso,
  initialWizardState,
  nextStep,
  prevStep,
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
  // Sprint 11 S11-B — published-question picker for Step 2.
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [picker, setPicker] = useState<PickerState>(initialPickerState);

  useEffect(() => {
    // Lazy-load on first entry to Step 2 — keeps initial render fast for
    // educators who only use the wizard's other steps.
    if (state.step !== 2 || questions !== null) return;
    content
      .listMine("PUBLISHED")
      .then(setQuestions)
      .catch((e) => setError((e as Error).message));
  }, [state.step, questions]);

  // Keep wizard.questionIds in sync with picker.selected so validation
  // (>=1) and the Step 3 review both reflect what's been picked.
  useEffect(() => {
    setState((prev) => ({ ...prev, questionIds: picker.selected }));
  }, [picker.selected]);

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
              Pick from your published questions. Selected:{" "}
              {picker.selected.length}
            </p>
            {questions === null ? (
              <p>Loading your question bank…</p>
            ) : questions.length === 0 ? (
              <p className="banner banner-info">
                No published questions yet —{" "}
                <a href="/questions/new">author some questions first</a>.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    placeholder="Search by stem…"
                    value={picker.query}
                    onChange={(e) =>
                      setPicker((p) => setQuery(p, e.currentTarget.value))
                    }
                    style={{ flex: 1 }}
                  />
                  <select
                    value={picker.topicId ?? ""}
                    onChange={(e) =>
                      setPicker((p) =>
                        setTopic(p, e.currentTarget.value || null),
                      )
                    }
                  >
                    <option value="">All topics</option>
                    {topicsInSet(questions).map((t) => (
                      <option key={t} value={t}>
                        {t.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    maxHeight: 320,
                    overflowY: "auto",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                  }}
                >
                  {applyFilters(questions, picker).map((q) => {
                    const checked = picker.selected.includes(q.id);
                    return (
                      <li
                        key={q.id}
                        style={{
                          padding: 8,
                          borderBottom: "1px solid var(--rule)",
                        }}
                      >
                        <label style={{ display: "flex", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setPicker((p) => togglePicker(p, q.id))
                            }
                          />
                          <span>{q.stem}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
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
          <ul style={{ color: "var(--bad, red)", marginTop: 8 }}>
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