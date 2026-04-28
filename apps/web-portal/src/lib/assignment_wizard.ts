// Sprint 10 S10-B — pure-logic helpers driving the Assignment Authoring
// wizard. Extracted so the step machine + validation rules can be
// unit-tested without React.

export interface WizardState {
  step: 1 | 2 | 3;
  cohortId: string | null;
  questionIds: string[];
  title: string;
  description: string;
  dueAt: string; // ISO date string (YYYY-MM-DD) or "" when unset
}

export const initialWizardState: WizardState = {
  step: 1,
  cohortId: null,
  questionIds: [],
  title: "",
  description: "",
  dueAt: "",
};

export interface StepError {
  field: string;
  message: string;
}

/**
 * Validate the current step. Returns [] when the step is ready to advance.
 * Mirroring on the backend: cohortId required (Step 1), at least one question
 * (Step 2), title >= 2 chars (Step 3). Due date is optional.
 */
export function validateStep(state: WizardState): StepError[] {
  const errors: StepError[] = [];
  if (state.step === 1) {
    if (!state.cohortId) {
      errors.push({ field: "cohortId", message: "Pick a cohort to continue." });
    }
  }
  if (state.step === 2) {
    if (state.questionIds.length === 0) {
      errors.push({
        field: "questionIds",
        message: "Pick at least one question.",
      });
    }
    if (state.questionIds.length > 100) {
      errors.push({
        field: "questionIds",
        message: "Max 100 questions per assignment.",
      });
    }
  }
  if (state.step === 3) {
    if (state.title.trim().length < 2) {
      errors.push({
        field: "title",
        message: "Title must be at least 2 characters.",
      });
    }
    if (state.title.trim().length > 200) {
      errors.push({
        field: "title",
        message: "Title is too long (max 200 characters).",
      });
    }
    if (state.dueAt) {
      const due = new Date(state.dueAt);
      if (Number.isNaN(due.getTime())) {
        errors.push({
          field: "dueAt",
          message: "Due date is not a valid date.",
        });
      }
    }
  }
  return errors;
}

/** Advance forward when the current step is valid; otherwise return state. */
export function nextStep(state: WizardState): WizardState {
  if (validateStep(state).length > 0) return state;
  if (state.step >= 3) return state;
  return { ...state, step: (state.step + 1) as WizardState["step"] };
}

export function prevStep(state: WizardState): WizardState {
  if (state.step <= 1) return state;
  return { ...state, step: (state.step - 1) as WizardState["step"] };
}

export function toggleQuestion(state: WizardState, questionId: string): WizardState {
  const has = state.questionIds.includes(questionId);
  return {
    ...state,
    questionIds: has
      ? state.questionIds.filter((id) => id !== questionId)
      : [...state.questionIds, questionId],
  };
}

/** Convert the YYYY-MM-DD form input into the ISO datetime the backend expects. */
export function dueAtToIso(dueAt: string): string | null {
  if (!dueAt) return null;
  // Treat the input as "end-of-day local time" so educators can pick a
  // date and not worry about timezones converting them backwards.
  const dt = new Date(`${dueAt}T23:59:59`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
