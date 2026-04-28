// Sprint 10 S10-C — Tenant cohorts + members admin surface.

import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  cohorts as cohortsApi,
  tenants,
  type AdminCohort,
  type AdminCohortMember,
  type AdminInviteListEntry,
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

  // Sprint 12 S12-A — invite list/create/revoke
  const [invites, setInvites] = useState<AdminInviteListEntry[] | null>(null);
  const [inviteMaxUses, setInviteMaxUses] = useState<string>("");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  // Sprint 13 S13-B — claim funnel viewer keyed by invite id.
  const [openClaimsFor, setOpenClaimsFor] = useState<string | null>(null);
  const [claims, setClaims] = useState<
    { userId: string; claimedAt: string }[] | null
  >(null);

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
    cohortsApi
      .invites(selected)
      .then(setInvites)
      .catch(() => setInvites([]));
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

  async function generateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const created = await cohortsApi.createInvite(selected, {
        maxUses: inviteMaxUses ? Number(inviteMaxUses) : null,
      });
      // Surface the share URL so the educator can copy it before the
      // raw token disappears (the list endpoint redacts).
      const base = window.location.origin.replace(":35174", ":35173");
      setLatestInviteUrl(`${base}/join/${created.token}`);
      setInviteMaxUses("");
      // Refresh redacted list.
      const fresh = await cohortsApi.invites(selected);
      setInvites(fresh);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      await cohortsApi.revokeInvite(inviteId);
      setInvites((invites ?? []).filter((i) => i.id !== inviteId));
      if (openClaimsFor === inviteId) {
        setOpenClaimsFor(null);
        setClaims(null);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleClaims(inviteId: string) {
    if (openClaimsFor === inviteId) {
      setOpenClaimsFor(null);
      setClaims(null);
      return;
    }
    setOpenClaimsFor(inviteId);
    setClaims(null);
    try {
      const rows = await cohortsApi.listClaims(inviteId);
      setClaims(rows);
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

                {/* Sprint 12 S12-A — Invite list + revoke ─────────── */}
                <h2 style={{ marginTop: 32 }}>Invites</h2>
                {latestInviteUrl && (
                  <div className="banner banner-success" style={{ marginBottom: 12 }}>
                    Share this link (the secret only appears once):
                    <div style={{ marginTop: 6 }}>
                      <code style={{ wordBreak: "break-all" }}>{latestInviteUrl}</code>
                    </div>
                    <button
                      className="btn-link"
                      style={{ marginTop: 6 }}
                      onClick={() => {
                        navigator.clipboard?.writeText(latestInviteUrl);
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
                <form
                  onSubmit={generateInvite}
                  style={{ display: "flex", gap: 8, marginBottom: 12 }}
                >
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    placeholder="Max uses (blank = unlimited)"
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn-primary" type="submit">
                    Generate invite
                  </button>
                </form>
                {invites === null ? (
                  <p>Loading invites…</p>
                ) : invites.length === 0 ? (
                  <p>No invites yet.</p>
                ) : (
                  <table className="leaderboard">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Uses</th>
                        <th>Cap</th>
                        <th>Created</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((inv) => (
                        <React.Fragment key={inv.id}>
                          <tr>
                            <td>
                              <code>{inv.tokenPreview}</code>
                            </td>
                            <td>{inv.uses}</td>
                            <td>{inv.maxUses ?? "∞"}</td>
                            <td>{inv.createdAt.slice(0, 10)}</td>
                            <td>
                              <button
                                className="btn-link"
                                onClick={() => toggleClaims(inv.id)}
                              >
                                {openClaimsFor === inv.id
                                  ? "hide claims"
                                  : "view claims"}
                              </button>
                              {" · "}
                              <button
                                className="btn-link"
                                onClick={() => revokeInvite(inv.id)}
                              >
                                revoke
                              </button>
                            </td>
                          </tr>
                          {openClaimsFor === inv.id && (
                            <tr>
                              <td colSpan={5} style={{ background: "var(--bg-surface-2, #f7f9fc)" }}>
                                {claims === null ? (
                                  <p style={{ margin: 8 }}>Loading claims…</p>
                                ) : claims.length === 0 ? (
                                  <p style={{ margin: 8 }}>
                                    No claims yet — share the link to onboard students.
                                  </p>
                                ) : (
                                  <ul style={{ margin: 8, padding: 0, listStyle: "none" }}>
                                    {claims.map((c, i) => (
                                      <li key={`${c.userId}-${i}`} style={{ padding: "2px 0" }}>
                                        <code>{c.userId.slice(0, 8)}…</code>
                                        {" · "}
                                        {c.claimedAt.slice(0, 19).replace("T", " ")}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
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
