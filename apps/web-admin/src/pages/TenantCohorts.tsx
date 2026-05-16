// Tenant cohorts + members admin surface — uses the @alp/design-system
// shell.css primitives (.card, .data-table, .btn-*, .banner-*) so the
// look stays consistent with the rest of the admin app.

import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner, Pill, SkeletonRows } from "../components/primitives";
import {
  cohorts as cohortsApi,
  tenants,
  type AdminCohort,
  type AdminCohortMember,
  type AdminInviteListEntry,
  type AdminTenant,
} from "../lib/api";

type SortKey = "userId" | "role" | "joinedAt";
type SortDir = "asc" | "desc";

export function TenantCohorts() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [cohortList, setCohortList] = useState<AdminCohort[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<AdminCohortMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "STUDENT" | "LEAD_TEACHER">("");
  const [sortKey, setSortKey] = useState<SortKey>("joinedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [showCohortModal, setShowCohortModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [name, setName] = useState("");
  const [exam, setExam] = useState("");
  const [year, setYear] = useState<string>("");

  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] =
    useState<AdminCohortMember["role"]>("STUDENT");

  const [invites, setInvites] = useState<AdminInviteListEntry[] | null>(null);
  const [inviteMaxUses, setInviteMaxUses] = useState<string>("");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
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
    cohortsApi.members(selected).then(setMembers).catch((e) => setError((e as Error).message));
    cohortsApi.invites(selected).then(setInvites).catch(() => setInvites([]));
  }, [selected]);

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    const needle = search.trim().toLowerCase();
    let rows = members.filter((m) => {
      if (roleFilter && m.role !== roleFilter) return false;
      if (!needle) return true;
      return (
        m.userId.toLowerCase().includes(needle) ||
        m.role.toLowerCase().includes(needle)
      );
    });
    rows = [...rows].sort((a, b) => {
      const av = (a[sortKey] ?? "").toString();
      const bv = (b[sortKey] ?? "").toString();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [members, search, roleFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    try {
      const c = await tenants.createCohort(tenantId, {
        name, exam: exam || undefined, year: year ? Number(year) : undefined,
      });
      setName(""); setExam(""); setYear("");
      setCohortList([c, ...(cohortList ?? [])]);
      setSelected(c.id);
      setShowCohortModal(false);
    } catch (err) { setError((err as Error).message); }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const m = await cohortsApi.addMember(selected, {
        userId: memberId, role: memberRole,
      });
      setMembers([m, ...(members ?? [])]);
      setMemberId("");
      setShowMemberModal(false);
    } catch (err) { setError((err as Error).message); }
  }

  async function removeMember(userId: string) {
    if (!selected) return;
    if (!confirm(`Remove member ${userId.slice(0, 8)}…?`)) return;
    try {
      await cohortsApi.removeMember(selected, userId);
      setMembers((members ?? []).filter((m) => m.userId !== userId));
    } catch (err) { setError((err as Error).message); }
  }

  async function generateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const created = await cohortsApi.createInvite(selected, {
        maxUses: inviteMaxUses ? Number(inviteMaxUses) : null,
      });
      const base = window.location.origin
        .replace(":35174", ":35173")
        .replace(":35175", ":35173");
      setLatestInviteUrl(`${base}/join/${created.token}`);
      setInviteMaxUses("");
      const fresh = await cohortsApi.invites(selected);
      setInvites(fresh);
      setShowInviteModal(false);
    } catch (err) { setError((err as Error).message); }
  }

  async function revokeInvite(inviteId: string) {
    if (!confirm("Revoke this invite?")) return;
    try {
      await cohortsApi.revokeInvite(inviteId);
      setInvites((invites ?? []).filter((i) => i.id !== inviteId));
      if (openClaimsFor === inviteId) {
        setOpenClaimsFor(null);
        setClaims(null);
      }
    } catch (err) { setError((err as Error).message); }
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
    } catch (err) { setError((err as Error).message); }
  }

  const memberCounts = useMemo(() => {
    const m = members ?? [];
    return {
      total: m.length,
      students: m.filter((x) => x.role === "STUDENT").length,
      teachers: m.filter((x) => x.role === "LEAD_TEACHER").length,
    };
  }, [members]);

  return (
    <AppShell title={tenant?.name ?? "Tenant"}>
      <main className="page" style={{ padding: 24, maxWidth: 1400 }}>
        {/* ── Header bar ── */}
        <div style={headerBar}>
          <Link
            to={tenantId ? `/institutions?id=${tenantId}` : "/institutions"}
            className="row-link"
            style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "none" }}
          >
            ← Back to tenant
          </Link>
          <div style={{ flex: 1 }} />
          {tenantId && (
            <Link
              to={`/institutes/${tenantId}/analytics`}
              className="btn btn-primary"
              style={{ textDecoration: "none" }}
            >
              📊 Open analytics →
            </Link>
          )}
        </div>

        {/* ── Tenant title + meta ── */}
        <h1 style={{ margin: "12px 0 4px", fontSize: 26 }}>{tenant?.name ?? "Cohorts"}</h1>
        <div style={metaRow}>
          {tenant?.kind && <Pill tone="muted">{tenant.kind}</Pill>}
          <code style={metaCode}>{tenantId?.slice(0, 8)}…</code>
        </div>

        {error && (
          <div style={{ margin: "12px 0" }}>
            <Banner tone="danger" role="alert">{error}</Banner>
          </div>
        )}

        <section style={layoutGrid}>
          {/* ── Left rail: cohort list ───────────────────────── */}
          <aside className="card" style={cardPad}>
            <div style={sectionHeader}>
              <h2 style={sectionTitle}>Cohorts</h2>
              <span className="meta" style={{ marginLeft: "auto" }}>
                {(cohortList ?? []).length}
              </span>
              <button
                className="btn btn-primary"
                onClick={() => setShowCohortModal(true)}
                style={{ marginLeft: 8 }}
              >
                + New
              </button>
            </div>
            {cohortList === null && <SkeletonRows count={3} />}
            {cohortList?.length === 0 && (
              <div className="empty-state">
                <p style={{ margin: 0 }}>No cohorts yet.</p>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCohortModal(true)}
                  style={{ marginTop: 12 }}
                >
                  + Create cohort
                </button>
              </div>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {(cohortList ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    style={{
                      ...cohortPill,
                      ...(selected === c.id ? cohortPillActive : {}),
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {c.exam ?? "no exam"}{c.year ? ` · ${c.year}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* ── Right pane ──────────────────────────────────── */}
          <section style={{ display: "grid", gap: 24 }}>
            {!selected ? (
              <div className="card empty-state">
                <p style={{ margin: 0 }}>Pick or create a cohort to manage members.</p>
              </div>
            ) : (
              <>
                {/* ── Members card ── */}
                <div className="card" style={{ padding: 0 }}>
                  <div style={cardHeaderBar}>
                    <h2 style={sectionTitle}>Members</h2>
                    <Pill tone="muted">{memberCounts.total} total</Pill>
                    <Pill tone="info">{memberCounts.students} students</Pill>
                    <Pill tone="warning">{memberCounts.teachers} teachers</Pill>
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowMemberModal(true)}
                    >
                      + Add member
                    </button>
                  </div>

                  {/* Toolbar: search + role filter */}
                  <div style={toolbar}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span style={searchIcon}>🔍</span>
                      <input
                        type="search"
                        placeholder="Search by user-id or role…"
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={searchInput}
                      />
                    </div>
                    <select
                      value={roleFilter}
                      onChange={(e) =>
                        setRoleFilter(e.currentTarget.value as typeof roleFilter)
                      }
                      style={selectInput}
                    >
                      <option value="">All roles</option>
                      <option value="STUDENT">Students</option>
                      <option value="LEAD_TEACHER">Lead teachers</option>
                    </select>
                  </div>

                  {/* Members table */}
                  {members === null ? (
                    <div style={{ padding: 12 }}><SkeletonRows count={5} /></div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="empty-state" style={{ borderRadius: 0, border: "none" }}>
                      <p style={{ margin: 0 }}>
                        {memberCounts.total === 0
                          ? "No members yet. Click + Add member to invite."
                          : "No members match this filter."}
                      </p>
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <SortableHeader
                            label="User ID"
                            active={sortKey === "userId"}
                            dir={sortDir}
                            onClick={() => toggleSort("userId")}
                          />
                          <SortableHeader
                            label="Role"
                            active={sortKey === "role"}
                            dir={sortDir}
                            onClick={() => toggleSort("role")}
                          />
                          <SortableHeader
                            label="Joined"
                            active={sortKey === "joinedAt"}
                            dir={sortDir}
                            onClick={() => toggleSort("joinedAt")}
                          />
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMembers.map((m) => (
                          <tr key={m.userId}>
                            <td><code>{m.userId}</code></td>
                            <td>
                              <span
                                className={
                                  m.role === "STUDENT"
                                    ? "scope-chip scope-chip-tenant"
                                    : "scope-chip scope-chip-platform"
                                }
                              >
                                {m.role}
                              </span>
                            </td>
                            <td className="meta">
                              {m.joinedAt.slice(0, 10)}{" "}
                              <span style={{ color: "var(--ink-4)" }}>
                                {m.joinedAt.slice(11, 16)}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="btn btn-danger"
                                onClick={() => removeMember(m.userId)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ── Invites card ── */}
                <div className="card" style={{ padding: 0 }}>
                  <div style={cardHeaderBar}>
                    <h2 style={sectionTitle}>Invites</h2>
                    <Pill tone="muted">{invites?.length ?? 0}</Pill>
                    <span style={{ flex: 1 }} />
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowInviteModal(true)}
                    >
                      + Generate invite
                    </button>
                  </div>

                  {latestInviteUrl && (
                    <div style={{ padding: "12px 18px 0" }}>
                      <Banner tone="success">
                        <div>
                          <strong>Share this link</strong> — the secret only appears once.
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <code style={{ wordBreak: "break-all", fontSize: 11 }}>
                            {latestInviteUrl}
                          </code>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <button
                            className="btn btn-ghost"
                            onClick={() =>
                              navigator.clipboard?.writeText(latestInviteUrl)
                            }
                          >
                            📋 Copy
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => setLatestInviteUrl(null)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </Banner>
                    </div>
                  )}

                  {invites === null ? (
                    <div style={{ padding: 12 }}><SkeletonRows count={3} /></div>
                  ) : invites.length === 0 ? (
                    <div className="empty-state" style={{ borderRadius: 0, border: "none" }}>
                      <p style={{ margin: 0 }}>
                        No invites. Generate one to share a join-link with students.
                      </p>
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Token</th>
                          <th>Uses</th>
                          <th>Cap</th>
                          <th>Created</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invites.map((inv) => (
                          <React.Fragment key={inv.id}>
                            <tr>
                              <td><code>{inv.tokenPreview}</code></td>
                              <td>{inv.uses}</td>
                              <td>{inv.maxUses ?? "∞"}</td>
                              <td className="meta">{inv.createdAt.slice(0, 10)}</td>
                              <td style={{ textAlign: "right" }}>
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => toggleClaims(inv.id)}
                                  style={{ marginRight: 6 }}
                                >
                                  {openClaimsFor === inv.id ? "Hide claims" : "View claims"}
                                </button>
                                <button
                                  className="btn btn-danger"
                                  onClick={() => revokeInvite(inv.id)}
                                >
                                  Revoke
                                </button>
                              </td>
                            </tr>
                            {openClaimsFor === inv.id && (
                              <tr>
                                <td colSpan={5} style={{ background: "var(--paper-2)", padding: 12 }}>
                                  {claims === null ? (
                                    <SkeletonRows count={2} />
                                  ) : claims.length === 0 ? (
                                    <p className="meta" style={{ margin: 0 }}>
                                      No claims yet — share the link to onboard students.
                                    </p>
                                  ) : (
                                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                                      {claims.map((c, i) => (
                                        <li key={`${c.userId}-${i}`} style={{ display: "flex", gap: 12, fontSize: 12 }}>
                                          <code>{c.userId.slice(0, 8)}…</code>
                                          <span className="meta">
                                            {c.claimedAt.slice(0, 19).replace("T", " ")}
                                          </span>
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
                </div>
              </>
            )}
          </section>
        </section>
      </main>

      {/* ─── Modals ───────────────────────────────────────────── */}
      {showCohortModal && (
        <Modal title="Create cohort" onClose={() => setShowCohortModal(false)}>
          <form onSubmit={createCohort} style={{ display: "grid", gap: 12 }}>
            <FieldLabel label="Name">
              <input
                placeholder="e.g. NEET 2027 Foundation"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                autoFocus
                className="form-input"
              />
            </FieldLabel>
            <FieldLabel label="Exam (optional)">
              <input
                placeholder="e.g. NEET, JEE_MAIN"
                value={exam}
                onChange={(e) => setExam(e.currentTarget.value)}
                className="form-input"
              />
            </FieldLabel>
            <FieldLabel label="Year (optional)">
              <input
                type="number"
                min={2020}
                max={2100}
                placeholder="2027"
                value={year}
                onChange={(e) => setYear(e.currentTarget.value)}
                className="form-input"
              />
            </FieldLabel>
            <ModalFooter onCancel={() => setShowCohortModal(false)} submitLabel="Create cohort" />
          </form>
        </Modal>
      )}

      {showMemberModal && selected && (
        <Modal title="Add member" onClose={() => setShowMemberModal(false)}>
          <form onSubmit={addMember} style={{ display: "grid", gap: 12 }}>
            <FieldLabel
              label="User UUID"
              hint="Find user UUIDs from the Users page →"
            >
              <input
                placeholder="00000000-0000-0000-0000-000000000000"
                value={memberId}
                onChange={(e) => setMemberId(e.currentTarget.value)}
                required
                autoFocus
                className="form-input"
              />
            </FieldLabel>
            <FieldLabel label="Role">
              <select
                value={memberRole}
                onChange={(e) =>
                  setMemberRole(e.currentTarget.value as AdminCohortMember["role"])
                }
                className="form-input"
              >
                <option value="STUDENT">STUDENT</option>
                <option value="LEAD_TEACHER">LEAD_TEACHER</option>
              </select>
            </FieldLabel>
            <ModalFooter onCancel={() => setShowMemberModal(false)} submitLabel="Add member" />
          </form>
        </Modal>
      )}

      {showInviteModal && selected && (
        <Modal title="Generate invite link" onClose={() => setShowInviteModal(false)}>
          <form onSubmit={generateInvite} style={{ display: "grid", gap: 12 }}>
            <FieldLabel
              label="Max uses"
              hint="Tokens are revoke-able and count claims independently."
            >
              <input
                type="number"
                min={1}
                max={10000}
                placeholder="Blank = unlimited"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(e.currentTarget.value)}
                autoFocus
                className="form-input"
              />
            </FieldLabel>
            <ModalFooter onCancel={() => setShowInviteModal(false)} submitLabel="Generate" />
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function SortableHeader({
  label, active, dir, onClick,
}: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      style={{ cursor: "pointer", userSelect: "none" }}
      title={`Sort by ${label}`}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ fontSize: 10, opacity: active ? 1 : 0.3 }}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

function FieldLabel({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label style={fieldLabel}>
      <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.04, fontWeight: 600 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{hint}</span>
      )}
    </label>
  );
}

function ModalFooter({
  onCancel, submitLabel,
}: {
  onCancel: () => void; submitLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" style={{ marginLeft: "auto" }}>
        {submitLabel}
      </button>
    </div>
  );
}

function Modal({
  title, onClose, children,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={modalBody} onClick={(e) => e.stopPropagation()} className="card">
        <header style={modalHeader}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} className="btn-icon" aria-label="Close">×</button>
        </header>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Inline styles (only what shell.css doesn't already cover) ─────────

const headerBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  paddingBottom: 8,
};

const metaRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginBottom: 16,
  color: "var(--ink-3)",
  fontSize: 12,
};

const metaCode: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--ink-3)",
  background: "var(--paper-2)",
  padding: "2px 6px",
  borderRadius: 4,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 320px) 1fr",
  gap: 24,
  marginTop: 12,
  alignItems: "start",
};

const cardPad: React.CSSProperties = {
  padding: 16,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.05,
  color: "var(--ink)",
};

const cardHeaderBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 18px",
  borderBottom: "1px solid var(--rule)",
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "12px 18px",
  borderBottom: "1px solid var(--rule)",
  background: "var(--paper-2)",
};

const searchIcon: React.CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: "var(--ink-4)",
  fontSize: 12,
  pointerEvents: "none",
};

const searchInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px 8px 30px",
  background: "var(--card)",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "var(--font-sans)",
};

const selectInput: React.CSSProperties = {
  padding: "8px 12px",
  background: "var(--card)",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
  minWidth: 160,
};

const cohortPill: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  cursor: "pointer",
  transition: "border-color 120ms, background 120ms",
};

const cohortPillActive: React.CSSProperties = {
  background: "rgba(244,63,94,0.10)",
  borderColor: "var(--info)", // admin theme aliases this to red
  color: "var(--ink)",
};

const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalBody: React.CSSProperties = {
  width: "min(480px, 92vw)",
  maxHeight: "92vh",
  overflowY: "auto",
  padding: 0,
  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid var(--rule)",
};