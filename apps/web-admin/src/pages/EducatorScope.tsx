import { useEffect, useMemo, useState } from "react";
import {
  adminCatalog,
  adminUsers,
  type AdminCatalogExam,
  type AdminEducatorAssignment,
  type AdminUserSummary,
} from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────
// Educator scope — admin manages which exams a TEACHER / MODERATOR can
// author for. Each row in the matrix represents one (educator × exam)
// pair; checking the box inserts an exam-wide grant (subject_id NULL),
// unchecking deletes it. Subject-level grants are a follow-up.
// ─────────────────────────────────────────────────────────────────────

type AssignmentByEducator = Record<string, AdminEducatorAssignment[]>;

export function EducatorScope() {
  const [educators, setEducators] = useState<AdminUserSummary[] | null>(null);
  const [exams, setExams] = useState<AdminCatalogExam[] | null>(null);
  const [byEducator, setByEducator] = useState<AssignmentByEducator>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setError(null);
    try {
      const [users, examList] = await Promise.all([
        adminUsers.list({ roles: ["TEACHER", "MODERATOR"], limit: 200 }),
        adminCatalog.listExams(),
      ]);
      setEducators(users);
      setExams(examList);
      const map: AssignmentByEducator = {};
      await Promise.all(
        users.map(async (u) => {
          map[u.id] = await adminCatalog.listAssignments(u.id);
        }),
      );
      setByEducator(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  async function refreshOne(educatorId: string) {
    const list = await adminCatalog.listAssignments(educatorId);
    setByEducator((cur) => ({ ...cur, [educatorId]: list }));
  }

  async function toggle(
    educatorId: string,
    exam: AdminCatalogExam,
    current: AdminEducatorAssignment | undefined,
  ) {
    const key = `${educatorId}:${exam.id}`;
    setBusyKey(key);
    setError(null);
    try {
      if (current) {
        await adminCatalog.deleteAssignment(current.id);
      } else {
        await adminCatalog.createAssignment(educatorId, exam.id, null);
      }
      await refreshOne(educatorId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyKey(null);
    }
  }

  const filtered = useMemo(() => {
    if (!educators) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return educators;
    return educators.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q),
    );
  }, [educators, filter]);

  function examsForRow(
    educatorId: string,
  ): Map<string, AdminEducatorAssignment> {
    const list = byEducator[educatorId] ?? [];
    const m = new Map<string, AdminEducatorAssignment>();
    for (const a of list) {
      // Exam-wide grant trumps subject-level for the matrix view.
      if (a.subjectId === null) m.set(a.examId, a);
    }
    // If only subject-level grants exist, treat the exam as
    // "partially granted" — show as checked but mark which row.
    for (const a of list) {
      if (a.subjectId !== null && !m.has(a.examId)) m.set(a.examId, a);
    }
    return m;
  }

  return (
    <AppShell
      title="Educator scope"
      chips={
        educators && exams
          ? [
              { label: `${educators.length} educators` },
              { label: `${exams.length} exams` },
            ]
          : []
      }
    >
      <p className="page-subhead">
        Grant authoring access to a TEACHER or MODERATOR by checking the
        exam they should be able to write questions for. Unchecking
        revokes the grant. Subject-level grants are a follow-up — for
        now every check is exam-wide. Educators with zero exams cannot
        save drafts on the teacher portal.
      </p>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      <div style={{ marginTop: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
        <input
          type="search"
          placeholder="Filter by name or email…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="form-input"
          style={{ maxWidth: 360 }}
        />
      </div>

      {filtered === null || exams === null ? (
        <SkeletonRows count={5} />
      ) : filtered.length === 0 ? (
        <Banner tone="muted">
          No educators match. The seed stack has teacher@alp.dev and
          moderator@alp.dev. Add real educators via the auth onboarding
          flow.
        </Banner>
      ) : (
        <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Educator</th>
                <th>Role</th>
                {exams.map((e) => (
                  <th key={e.id} style={{ textAlign: "center" }}>
                    {e.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const granted = examsForRow(u.id);
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {u.fullName || u.email}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ink-3)",
                        }}
                      >
                        {u.email}
                      </div>
                    </td>
                    <td>
                      <Pill tone={u.role === "MODERATOR" ? "warning" : "muted"}>
                        {u.role}
                      </Pill>
                    </td>
                    {exams.map((e) => {
                      const current = granted.get(e.id);
                      const subjectOnly =
                        current !== undefined && current.subjectId !== null;
                      const key = `${u.id}:${e.id}`;
                      return (
                        <td key={e.id} style={{ textAlign: "center" }}>
                          <label
                            style={{
                              display: "inline-flex",
                              gap: 4,
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                            title={
                              subjectOnly
                                ? "Subject-level grant exists; click to add exam-wide"
                                : current
                                  ? "Exam-wide grant — click to revoke"
                                  : "Click to grant exam-wide authoring"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={!!current && !subjectOnly}
                              disabled={busyKey === key}
                              onChange={() =>
                                void toggle(
                                  u.id,
                                  e,
                                  subjectOnly ? undefined : current,
                                )
                              }
                            />
                            {subjectOnly ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "var(--warn)",
                                }}
                              >
                                subj
                              </span>
                            ) : null}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          marginTop: "var(--sp-4)",
        }}
      >
        Per BRD ADM-REQ-05 — every grant or revoke writes an immutable
        audit row (created_by = the admin acting). The audit surface
        for these actions ships with the Audit page in the next sprint.
      </p>
    </AppShell>
  );
}