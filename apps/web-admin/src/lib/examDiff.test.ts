import { describe, expect, it } from "vitest";

import { diffExam } from "./examDiff";
import type { ExamProposal } from "./examDiff";

function exam(subjects: ExamProposal["subjects"]): ExamProposal {
  return { code: "X", name: "X", subtitle: null, pools: [], subjects, notes: null };
}

const sub = (
  code: string,
  name: string,
  topics: { code: string; title: string }[],
) => ({
  code,
  name,
  description: null,
  is_mandatory: true,
  pool_code: null,
  topics: topics.map((t) => ({ ...t, description: null })),
});

describe("diffExam", () => {
  it("flags an added subject and its topics", () => {
    const baseline = exam([sub("A", "Alpha", [{ code: "A1", title: "One" }])]);
    const next = exam([
      sub("A", "Alpha", [{ code: "A1", title: "One" }]),
      sub("B", "Beta", [{ code: "B1", title: "Two" }]),
    ]);
    const { subjects } = diffExam(baseline, next);
    const b = subjects.find((s) => s.code === "B")!;
    expect(b._status).toBe("added");
    expect(b.topics[0]._status).toBe("added");
  });

  it("re-injects a removed subject tagged removed", () => {
    const baseline = exam([
      sub("A", "Alpha", [{ code: "A1", title: "One" }]),
      sub("B", "Beta", [{ code: "B1", title: "Two" }]),
    ]);
    const next = exam([sub("A", "Alpha", [{ code: "A1", title: "One" }])]);
    const { subjects } = diffExam(baseline, next);
    const b = subjects.find((s) => s.code === "B")!;
    expect(b._status).toBe("removed");
    expect(b.topics[0]._status).toBe("removed");
  });

  it("flags a modified subject name and unchanged topics", () => {
    const baseline = exam([sub("A", "Alpha", [{ code: "A1", title: "One" }])]);
    const next = exam([sub("A", "Alpha RENAMED", [{ code: "A1", title: "One" }])]);
    const { subjects } = diffExam(baseline, next);
    const a = subjects.find((s) => s.code === "A")!;
    expect(a._status).toBe("modified");
    expect(a.topics[0]._status).toBe("unchanged");
  });

  it("flags added / removed / modified topics within a subject", () => {
    const baseline = exam([
      sub("A", "Alpha", [
        { code: "A1", title: "One" },
        { code: "A2", title: "Two" },
      ]),
    ]);
    const next = exam([
      sub("A", "Alpha", [
        { code: "A1", title: "One CHANGED" },
        { code: "A3", title: "Three" },
      ]),
    ]);
    const a = diffExam(baseline, next).subjects.find((s) => s.code === "A")!;
    const byCode = Object.fromEntries(a.topics.map((t) => [t.code, t._status]));
    expect(byCode.A1).toBe("modified");
    expect(byCode.A3).toBe("added");
    expect(byCode.A2).toBe("removed");
  });
});
