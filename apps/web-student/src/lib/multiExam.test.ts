import { describe, expect, test } from "vitest";
import { buildEnrolledExams } from "./multiExam";

describe("buildEnrolledExams", () => {
  test("merges catalog code/name onto profile exams", () => {
    const out = buildEnrolledExams(
      [
        { examId: "e1", targetDate: "2027-05-01" },
        { examId: "e2", targetDate: null },
      ],
      [
        { id: "e1", code: "NEET", name: "NEET UG" },
        { id: "e2", code: "UPSC_CSE", name: "UPSC Civil Services" },
      ],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      examId: "e1",
      code: "NEET",
      name: "NEET UG",
      targetDate: "2027-05-01",
    });
    expect(out[1].code).toBe("UPSC_CSE");
  });

  test("keeps enrolled exam even when catalog lookup is missing", () => {
    const out = buildEnrolledExams(
      [{ examId: "e9", targetDate: null }],
      [{ id: "e1", code: "NEET", name: "NEET UG" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].examId).toBe("e9");
    expect(out[0].code).toBe("e9"); // degrades to id, not dropped
  });
});
