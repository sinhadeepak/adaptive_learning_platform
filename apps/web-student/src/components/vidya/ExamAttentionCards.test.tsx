import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { ExamAttentionCards } from "./ExamAttentionCards";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

const exams: EnrolledExam[] = [
  { examId: "e1", code: "NEET", name: "NEET UG", targetDate: "2027-05-01" },
  { examId: "e2", code: "CBSE_9", name: "CBSE Class 9", targetDate: null },
];
const summaries: Record<string, ExamSummary> = {
  e1: { examId: "e1", readinessScore: 0.5, nTopics: 10, weakestTopicId: "t1", weakestEwa: 0.2, mistakesDue: 4, revisionDue: 2 },
  e2: { examId: "e2", readinessScore: 0.9, nTopics: 5, weakestTopicId: null, weakestEwa: null, mistakesDue: 0, revisionDue: 0 },
};

function renderCards() {
  return render(
    <MemoryRouter>
      <ExamAttentionCards exams={exams} summaries={summaries} topicTitles={{ t1: "Thermodynamics" }} />
    </MemoryRouter>,
  );
}

describe("ExamAttentionCards", () => {
  test("shows per-exam due counts and weakest topic", () => {
    renderCards();
    expect(screen.getByText("NEET")).toBeInTheDocument();
    expect(screen.getByText(/4 mistakes due/i)).toBeInTheDocument();
    expect(screen.getByText(/Thermodynamics/i)).toBeInTheDocument();
  });

  test("shows all-clear when nothing due", () => {
    renderCards();
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
  });

  test("CTA deep-links into the exam with the weakest topic", () => {
    renderCards();
    const cta = screen.getByRole("link", { name: /Resume NEET/i });
    expect(cta).toHaveAttribute("href", "/practice?examId=e1&topic=t1");
  });
});
