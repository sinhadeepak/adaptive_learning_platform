/**
 * Phase 5 portal components — Vitest tests (P5-S65).
 *
 * Covers the four S55 components: AIDraftPanel, ConceptTagger,
 * RubricEditor, DiagramAuthoringCanvas.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConceptTagger, type ConceptTag } from "./components/ConceptTagger";
import { RubricEditor, type RubricCriterion } from "./components/RubricEditor";
import { DiagramAuthoringCanvas } from "./components/DiagramAuthoringCanvas";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response("not found", { status: 404 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── ConceptTagger ──────────────────────────────────────────────────────────


test("ConceptTagger surfaces a primary-required warning when tags are empty", () => {
  render(<ConceptTagger tags={[]} onChange={() => {}} />);
  // The warning span has the text broken across a nested <strong>.
  // findAllByText with the function matcher returns ancestor + child;
  // we just assert at least one matches.
  const matches = screen.queryAllByText((_, node) =>
    Boolean(node?.textContent?.match(/Add at least one.*primary/i)),
  );
  expect(matches.length).toBeGreaterThanOrEqual(1);
});

test("ConceptTagger emits onChange when adding a tag", () => {
  const onChange = vi.fn();
  render(<ConceptTagger tags={[]} onChange={onChange} />);
  const input = screen.getByPlaceholderText(/concept-uuid/i);
  fireEvent.change(input, { target: { value: "newton-2nd-law" } });
  fireEvent.click(screen.getByRole("button", { name: /Add tag/i }));
  expect(onChange).toHaveBeenCalledWith([
    { conceptId: "newton-2nd-law", role: "primary" },
  ]);
});

test("ConceptTagger surfaces prereq-coverage warning", () => {
  const tags: ConceptTag[] = [{ conceptId: "newton-2", role: "primary" }];
  render(
    <ConceptTagger
      tags={tags}
      onChange={() => {}}
      prereqMissingIds={["newton-1", "vectors"]}
    />,
  );
  expect(screen.getByText(/Prereq coverage/i)).toBeInTheDocument();
  expect(screen.getByText(/newton-1, vectors/i)).toBeInTheDocument();
});

// ── RubricEditor ──────────────────────────────────────────────────────────


test("RubricEditor surfaces sum-to-100 invariant — red when off", () => {
  const criteria: RubricCriterion[] = [
    { id: "c1", text: "states X", weight: 60, keywords: [], descriptors: [] },
    { id: "c2", text: "states Y", weight: 30, keywords: [], descriptors: [] },
  ];
  render(<RubricEditor version={1} criteria={criteria} onChange={() => {}} />);
  expect(screen.getByText(/Σ weights:.*90/i)).toBeInTheDocument();
  expect(screen.getByText(/must = 100/i)).toBeInTheDocument();
});

test("RubricEditor 'Distribute evenly' computes weights", () => {
  const onChange = vi.fn();
  const criteria: RubricCriterion[] = [
    { id: "c1", text: "x", weight: 0, keywords: [], descriptors: [] },
    { id: "c2", text: "y", weight: 0, keywords: [], descriptors: [] },
  ];
  render(
    <RubricEditor version={1} criteria={criteria} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Distribute evenly/i }));
  expect(onChange).toHaveBeenCalled();
  const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
  expect(lastCall[0].weight + lastCall[1].weight).toBeCloseTo(100, 1);
});

test("RubricEditor 'Add criterion' appends a new row", () => {
  const onChange = vi.fn();
  render(
    <RubricEditor version={1} criteria={[]} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Add criterion/i }));
  expect(onChange).toHaveBeenCalledWith([
    { id: "c1", text: "", weight: 0, keywords: [], descriptors: [] },
  ]);
});

// ── DiagramAuthoringCanvas ────────────────────────────────────────────────


test("DiagramAuthoringCanvas shows the toolbar in non-preview mode", () => {
  render(
    <DiagramAuthoringCanvas
      shapes={[]}
      markers={[]}
      onShapesChange={() => {}}
      onMarkersChange={() => {}}
    />,
  );
  // Tool buttons.
  expect(screen.getByRole("button", { name: /select/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^circle$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^rect$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /polygon/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /marker/i })).toBeInTheDocument();
  // Image upload trigger.
  expect(screen.getByText(/Upload image/i)).toBeInTheDocument();
});

test("DiagramAuthoringCanvas hides toolbar in preview mode", () => {
  render(
    <DiagramAuthoringCanvas
      preview
      shapes={[]}
      markers={[]}
      onShapesChange={() => {}}
      onMarkersChange={() => {}}
    />,
  );
  // Toolbar buttons should be absent in preview.
  expect(screen.queryByText(/Upload image/i)).not.toBeInTheDocument();
});

test("DiagramAuthoringCanvas shows shape/marker counts", () => {
  render(
    <DiagramAuthoringCanvas
      shapes={[
        { kind: "circle", id: "c1", cx: 50, cy: 50, r: 20 },
        { kind: "rect", id: "r1", x: 10, y: 10, width: 50, height: 30 },
      ]}
      markers={[{ id: "m1", x: 100, y: 100 }]}
      onShapesChange={() => {}}
      onMarkersChange={() => {}}
    />,
  );
  expect(screen.getByText(/2 shapes.*1 marker/i)).toBeInTheDocument();
});
