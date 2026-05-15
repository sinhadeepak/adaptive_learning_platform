// Smoke tests for the extracted QuizPlayer body component (P6 S51).
//
// Verifies:
//   - The stem is rendered as the heading.
//   - All 4 MCQ choices show up with letter keys.
//   - Hint chip appears + dismisses.
//   - Feedback panel renders on verdict + reveals the "Correct" copy.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { QuizPlayer, type QuizPlayerItem } from "./QuizPlayer";

const MCQ: QuizPlayerItem = {
  itemIdx: 2,
  questionId: "q-1",
  stem: "What is 2 + 2?",
  choices: ["3", "4", "5", "22"],
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response("not found", { status: 404 }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("QuizPlayer", () => {
  test("renders the stem + 4 lettered choices for MCQ_SINGLE", () => {
    render(
      <QuizPlayer
        item={MCQ}
        selectedIdx={null}
        onSelectChoice={() => {}}
        responsePayload={null}
        onChangeResponse={() => {}}
        verdict={null}
        questionNumber={3}
        totalQuestions={10}
        hintNote={null}
        onDismissHint={() => {}}
        onSkip={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What is 2 + 2?",
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("QUESTION 3 OF 10")).toBeInTheDocument();
  });

  test("clicking an option calls onSelectChoice with the index", () => {
    const onSelect = vi.fn();
    render(
      <QuizPlayer
        item={MCQ}
        selectedIdx={null}
        onSelectChoice={onSelect}
        responsePayload={null}
        onChangeResponse={() => {}}
        verdict={null}
        questionNumber={1}
        totalQuestions={5}
        hintNote={null}
        onDismissHint={() => {}}
        onSkip={() => {}}
      />,
    );
    // 4 = the choice at index 1.
    fireEvent.click(screen.getByText("4"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  test("hint chip renders + dismiss fires onDismissHint", () => {
    const onDismiss = vi.fn();
    render(
      <QuizPlayer
        item={MCQ}
        selectedIdx={null}
        onSelectChoice={() => {}}
        responsePayload={null}
        onChangeResponse={() => {}}
        verdict={null}
        questionNumber={1}
        totalQuestions={5}
        hintNote="Try eliminating the obvious wrongs first."
        onDismissHint={onDismiss}
        onSkip={() => {}}
      />,
    );
    expect(
      screen.getByText(/Try eliminating the obvious wrongs first/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss hint"));
    expect(onDismiss).toHaveBeenCalled();
  });

  test("verdict renders the explanation panel", () => {
    render(
      <QuizPlayer
        item={MCQ}
        selectedIdx={1}
        onSelectChoice={() => {}}
        responsePayload={null}
        onChangeResponse={() => {}}
        verdict={{ itemIdx: 2, isCorrect: true, correctIdx: 1 }}
        questionNumber={3}
        totalQuestions={10}
        hintNote={null}
        onDismissHint={() => {}}
        onSkip={() => {}}
      />,
    );
    expect(screen.getByText("✓ Correct")).toBeInTheDocument();
  });
});
