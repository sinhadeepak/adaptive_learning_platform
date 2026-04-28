// Sprint 10 S10-C — Tenant cohorts + members admin surface.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  cohorts as cohortsApi,
  tenants,
  type AdminCohort,
  type AdminCohortMember,
  type AdminTenant,
} from "../lib/api";

export function TenantCohorts() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [cohortList, setCohortList] = useState<AdminCohort[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminCohortMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create cohort
  const [name, setName] = useState("");
  const [exam, setExam] = useState("");
  const [year, setYear] = useState<string>("");
  // Add member
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] =
    useState<AdminCohortMember["role"]>("STUDENT");

  useEffect(() => {
    if (!tenantId) return;
    tenants.get(tenantId).then(setTenant).catch((e) => setError((e as Error).message));
    tenants
      .cohorts(tenantId)
      .then((rows) => {
        setCohortList(rows);
        if (rows.length > 0 && selected === null) setSelected(rows[0].id);
      })
      .catch((e) => setError((e as Error).message));
  }, [tenantId, selected]);

  useEffect(() => {
    if (!selected) return;
    cohortsApi
      .members(selected)
      .then(setMembers)
      .catch((e) => setError((e as Error).message));
  }, [selected]);

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    try {
      const c = await tenants.createCohort(tenantId, {
        name,
        exam: exam || undefined,
        year: year ? Number(year) : undefined,
      });
      setName("");
      setExam("");
      setYear("");
      setCohortList([c, ...(cohortList ?? [])]);
      setSelected(c.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const m = await cohortsApi.addMember(selected, {
        userId: memberId,
        role: memberRole,
      });
      setMembers([m, ...(members ?? [])]);
      setMemberId("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeMember(userId: string) {
    if (!selected) return;
    try {
      await cohortsApi.removeMember(selected, userId);
      setMembers((members ?? []).filter((m) => m.userId !== userId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell title={tenant?.name ?? "Tenant"}>
      <main className="page" style={{ padding: 24 }}>
        <Link to={tenantId ? `/institutions?id=${tenantId}` : "/institutions"}>
          ← Back to tenant
        </Link>
        <h1>Cohorts</h1>
        {error && <p className="banner banner-error">{error}</p>}

        <section style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}>
          <aside>
            <h2 style={{ fontSize: 14 }}>Cohorts</h2>
            {cohortList === null && <p>Loading…</p>}
            {cohortList?.length === 0 && <p>No cohorts yet.</p>}
            <ul style={{ listStyle: "none", padding: 0 }}>
              {(cohortList ?? []).map((c) => (
                <li key={c.id} style={{ marginTop: 8 }}>
                  <button
                    className={selected === c.id ? "btn-primary" : "btn-secondary"}
                    onClick={() => setSelected(c.id)}
                    style={{ width: "100%", textAlign: "left" }}
                  >
                    {c.name}
                    {c.exam ? ` · ${c.exam}` : ""}
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={createCohort} style={{ marginTop: 16, display: "grid", gap: 6 }}>
              <strong>+ Add cohort</strong>
              <input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <input
                placeholder="Exam (optional)"
                value={exam}
                onChange={(e) => setExam(e.currentTarget.value)}
              />
              <input
                type="number"
                min={2020}
                max={2100}
                placeholder="Year"
                value={year}
                onChange={(e) => setYear(e.currentTarget.value)}
              />
              <button className="btn-primary" type="submit">
                Create
              </button>
            </form>
          </aside>

          <section>
            {selected ? (
              <>
                <h2>Members</h2>
                {members === null ? (
                  <p>Loading members…</p>
                ) : members.length === 0 ? (
                  <p>No members yet.</p>
                ) : (
                  <table className="leaderboard">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.userId}>
                          <td>
                            <code>{m.userId.slice(0, 8)}…</code>
                          </td>
                          <td>{m.role}</td>
                          <td>{m.joinedAt.slice(0, 10)}</td>
                          <td>
                            <button
                              className="btn-link"
                              onClick={() => removeMember(m.userId)}
                            >
                              remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <form onSubmit={addMember} style={{ marginTop: 24, display: "flex", gap: 8 }}>
                  <input
                    placeholder="User UUID"
                    value={memberId}
                    onChange={(e) => setMemberId(e.currentTarget.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  <select
                    value={memberRole}
                    onChange={(e) =>
                      setMemberRole(
                        e.currentTarget.value as AdminCohortMember["role"],
                      )
                    }
                  >
                    <option value="STUDENT">STUDENT</option>
                    <option value="LEAD_TEACHER">LEAD_TEACHER</option>
                  </select>
                  <button className="btn-primary" type="submit">
                    Add
                  </button>
                </form>
              </>
            ) : (
              <p>Pick or create a cohort to manage members.</p>
            )}
          </section>
        </section>
      </main>
    </AppShell>
  );
}
