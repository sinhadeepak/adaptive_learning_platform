/**
 * Phase 5 student renderers + components — Vitest tests (P5-S65).
 *
 * Covers per-family renderers (Objective / Numeric / FillIn /
 * Subjective) + RadarChart + ConfidenceSlider + the QuestionRenderer
 * dispatcher.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  MCQSingleRenderer,
  MCQMultiRenderer,
  TrueFalseRenderer,
} from "./components/renderers/ObjectiveRenderer";
import {
  NumericIntegerRenderer,
  NumericDecimalRenderer,
  FormulaInputRenderer,
} from "./components/renderers/NumericRenderer";
import {
  FillBlankSingleRenderer,
  ShortTextRenderer,
} from "./components/renderers/FillInRenderer";
import {
  EssayRenderer,
} from "./components/renderers/SubjectiveRenderer";
import { QuestionRenderer } from "./components/renderers";
import { RadarChart } from "./components/RadarChart";
import { ConfidenceSlider } from "./components/ConfidenceSlider";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response("not found", { status: 404 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── MCQ_SINGLE ────────────────────────────────────────────────────────────

test("MCQSingleRenderer emits selected_id on click", () => {
  const onChange = vi.fn();
  render(
    <MCQSingleRenderer
      payload={{
        stem: "What is 2+2?",
        options: [
          { id: "A", text: "3" },
          { id: "B", text: "4" },
        ],
      }}
      value={null}
      onChange={onChange}
    />,
  );
  const optionB = screen.getByText("4");
  fireEvent.click(optionB);
  expect(onChange).toHaveBeenCalledWith({ selected_id: "B" });
});

test("MCQSingleRenderer highlights the selected option", () => {
  render(
    <MCQSingleRenderer
      payload={{
        stem: "x?",
        options: [
          { id: "A", text: "yes" },
          { id: "B", text: "no" },
        ],
      }}
      value={{ selected_id: "A" }}
      onChange={() => {}}
    />,
  );
  const radio = screen.getByDisplayValue("A") as HTMLInputElement;
  expect(radio.checked).toBe(true);
});

// ── MCQ_MULTI ──────────────────────────────────────────────────────────────

test("MCQMultiRenderer toggles selection on checkbox click", () => {
  const onChange = vi.fn();
  render(
    <MCQMultiRenderer
      payload={{
        stem: "Pick all primes",
        options: [
          { id: "A", text: "2" },
          { id: "B", text: "3" },
          { id: "C", text: "4" },
        ],
      }}
      value={{ selected_ids: ["A"] }}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByText("3"));
  expect(onChange).toHaveBeenCalledWith({ selected_ids: ["A", "B"] });
});

// ── TRUE_FALSE ─────────────────────────────────────────────────────────────

test("TrueFalseRenderer emits boolean", () => {
  const onChange = vi.fn();
  render(
    <TrueFalseRenderer
      payload={{ stem: "The Earth is flat." }}
      value={null}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /False/i }));
  expect(onChange).toHaveBeenCalledWith({ selected: false });
});

// ── NUMERIC_INTEGER ────────────────────────────────────────────────────────

test("NumericIntegerRenderer parses integer input", () => {
  const onChange = vi.fn();
  render(
    <NumericIntegerRenderer
      payload={{ stem: "Compute" }}
      value={null}
      onChange={onChange}
    />,
  );
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "42" } });
  expect(onChange).toHaveBeenCalledWith({ answer: 42 });
});

test("NumericDecimalRenderer parses decimal input", () => {
  const onChange = vi.fn();
  render(
    <NumericDecimalRenderer
      payload={{ stem: "Find pi", tolerance: 0.01 }}
      value={null}
      onChange={onChange}
    />,
  );
  const input = screen.getByRole("spinbutton") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "3.14" } });
  expect(onChange).toHaveBeenCalledWith({ answer: 3.14 });
});

test("NumericDecimalRenderer surfaces tolerance hint", () => {
  render(
    <NumericDecimalRenderer
      payload={{ stem: "x", tolerance: 0.05 }}
      value={null}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText(/tolerance ±0\.05/i)).toBeInTheDocument();
});

test("FormulaInputRenderer accepts symbolic expression", () => {
  const onChange = vi.fn();
  render(
    <FormulaInputRenderer
      payload={{ stem: "Solve" }}
      value={null}
      onChange={onChange}
    />,
  );
  const input = screen.getByPlaceholderText(/x\^2 \+ 2\*x \+ 1/);
  fireEvent.change(input, { target: { value: "(x+1)^2" } });
  expect(onChange).toHaveBeenCalledWith({ expression: "(x+1)^2" });
});

// ── FILL_BLANK_SINGLE ──────────────────────────────────────────────────────

test("FillBlankSingleRenderer splits stem on placeholder + accepts input", () => {
  const onChange = vi.fn();
  render(
    <FillBlankSingleRenderer
      payload={{ stem: "The capital of India is ___ ." }}
      value={null}
      onChange={onChange}
    />,
  );
  // Stem splits into "The capital of India is " + input + " ."
  expect(screen.getByText(/The capital of India is/)).toBeInTheDocument();
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Delhi" } });
  expect(onChange).toHaveBeenCalledWith({ answer: "Delhi" });
});

// ── SHORT_TEXT ─────────────────────────────────────────────────────────────

test("ShortTextRenderer shows word count + on-target badge", () => {
  render(
    <ShortTextRenderer
      payload={{
        stem: "Explain photosynthesis briefly.",
        expected_word_count_range: [10, 30],
      }}
      value={{ text: "Plants use sunlight to convert CO2 into sugar through photosynthesis." }}
      onChange={() => {}}
    />,
  );
  // 10 words → on target (10 ≤ 10 ≤ 30).
  expect(screen.getByText(/10 words/)).toBeInTheDocument();
  expect(screen.getByText(/on target/)).toBeInTheDocument();
});

test("ShortTextRenderer shows below-target when too short", () => {
  render(
    <ShortTextRenderer
      payload={{
        stem: "x",
        expected_word_count_range: [10, 30],
      }}
      value={{ text: "Just a few words." }}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText(/below target/i)).toBeInTheDocument();
});

// ── ESSAY ──────────────────────────────────────────────────────────────────

test("EssayRenderer renders rubric details collapsed", () => {
  render(
    <EssayRenderer
      payload={{
        stem: "Discuss federalism.",
        expected_word_count_range: [100, 300],
        rubric: {
          criteria: [
            { id: "c1", text: "Defines federalism", weight: 50 },
            { id: "c2", text: "Cites an example", weight: 50 },
          ],
        },
      }}
      value={null}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText(/Marking rubric \(2 criteria\)/i)).toBeInTheDocument();
  // The criteria details are inside <details>; their text is in the DOM
  // even when collapsed.
  expect(screen.getByText(/Defines federalism/)).toBeInTheDocument();
});

// ── QuestionRenderer dispatcher ────────────────────────────────────────────

test("QuestionRenderer dispatches MCQ_SINGLE to the right component", () => {
  render(
    <QuestionRenderer
      typeId="MCQ_SINGLE"
      payload={{
        stem: "What?",
        options: [{ id: "A", text: "yes" }, { id: "B", text: "no" }],
      }}
      value={null}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText("yes")).toBeInTheDocument();
  expect(screen.getByText("no")).toBeInTheDocument();
});

test("QuestionRenderer mounts the LISTENING_COMP renderer (ungated per ADR-0026)", () => {
  // The pre-ADR-0026 implementation surfaced a "Phase 2 question type"
  // banner for LISTENING_COMP / VIDEO_QUESTION / KBC_LIFELINE / etc.
  // ADR-0026 un-gated all five families, so the renderer now mounts the
  // real ListeningCompRenderer — no banner. We assert the page renders
  // without throwing and the renderer's empty-payload media slot shows
  // the "Audio not provided" copy (rendered when mediaSrc is null).
  render(
    <QuestionRenderer
      typeId="LISTENING_COMP"
      payload={{}}
      value={null}
      onChange={() => {}}
    />,
  );
  expect(
    screen.getAllByText(/audio not provided|listening|play/i).length,
  ).toBeGreaterThanOrEqual(1);
});

test("QuestionRenderer surfaces unknown-type error", () => {
  render(
    <QuestionRenderer
      typeId="WHO_KNOWS"
      payload={{}}
      value={null}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText(/Unknown question type/i)).toBeInTheDocument();
});

// ── RadarChart ────────────────────────────────────────────────────────────

test("RadarChart renders all 5 dimension labels", () => {
  render(
    <RadarChart
      points={[
        { label: "Mastery", value: 0.6 },
        { label: "Bloom", value: 0.5 },
        { label: "Fluency", value: 0.7 },
        { label: "Calibration", value: 0.4 },
        { label: "Transfer", value: 0.3 },
      ]}
    />,
  );
  expect(screen.getByText("Mastery")).toBeInTheDocument();
  expect(screen.getByText("Bloom")).toBeInTheDocument();
  expect(screen.getByText("Calibration")).toBeInTheDocument();
});

test("RadarChart guards against < 3 points", () => {
  render(
    <RadarChart
      points={[
        { label: "x", value: 0.5 },
        { label: "y", value: 0.5 },
      ]}
    />,
  );
  expect(screen.getByText(/Need ≥ 3 dimensions/i)).toBeInTheDocument();
});

// ── ConfidenceSlider ──────────────────────────────────────────────────────

test("ConfidenceSlider preset buttons emit fixed values", () => {
  const onChange = vi.fn();
  render(<ConfidenceSlider value={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /^Pretty sure$/i }));
  expect(onChange).toHaveBeenCalledWith(0.75);
});

test("ConfidenceSlider Clear sets value to null", () => {
  const onChange = vi.fn();
  render(<ConfidenceSlider value={0.75} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
  expect(onChange).toHaveBeenCalledWith(null);
});
