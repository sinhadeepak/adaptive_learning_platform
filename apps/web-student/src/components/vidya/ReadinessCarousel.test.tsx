import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ReadinessCarousel } from "./ReadinessCarousel";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

const exams: EnrolledExam[] = [
  { examId: "e1", code: "NEET", name: "NEET UG", targetDate: "2027-05-01" },
  { examId: "e2", code: "UPSC_CSE", name: "UPSC", targetDate: null },
];
const summaries: Record<string, ExamSummary> = {
  e1: { examId: "e1", readinessScore: 0.5, nTopics: 10, weakestTopicId: "t", weakestEwa: 0.2, mistakesDue: 1, revisionDue: 0 },
  e2: { examId: "e2", readinessScore: 0.7, nTopics: 8, weakestTopicId: null, weakestEwa: null, mistakesDue: 0, revisionDue: 2 },
};

describe("ReadinessCarousel", () => {
  test("shows the first exam's readiness and switches on next", () => {
    render(<ReadinessCarousel exams={exams} summaries={summaries} />);
    expect(screen.getByText(/NEET Readiness/i)).toBeInTheDocument();
    expect(screen.getByText("450")).toBeInTheDocument(); // 0.5 * 900
    fireEvent.click(screen.getByRole("button", { name: /next exam/i }));
    expect(screen.getByText(/UPSC_CSE Readiness/i)).toBeInTheDocument();
    expect(screen.getByText("630")).toBeInTheDocument(); // 0.7 * 900
  });

  test("renders empty state with no exams", () => {
    render(<ReadinessCarousel exams={[]} summaries={{}} />);
    expect(screen.getByText(/Practice 10 more questions/i)).toBeInTheDocument();
  });
});
