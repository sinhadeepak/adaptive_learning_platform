// Users — Vidya v1 admin user directory (mockup 7/29).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 admin mockup 7/29.
//
// Read-only directory of every user (students, teachers, moderators,
// institution + platform admins). Wraps GET /auth/admin/users —
// server-side search + role-filter + pagination.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { auth } from "../lib/api";
import { env } from "../lib/env";

interface UserInstitution {
  id: string;
  name: string;
  slug: string;
  kind: "SCHOOL" | "COACHING_CENTER" | "UNIVERSITY" | "OTHER";
}

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  adminAccessLevel: string;
  accountStatus: string;
  institution: UserInstitution | null;
}

interface UserList {
  items?: UserRow[] | null;
  total?: number;
}

const ROLE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "STUDENT", label: "Student" },
  { code: "TEACHER", label: "Teacher" },
  { code: "MODERATOR", label: "Moderator" },
  { code: "INSTITUTION_ADMIN", label: "Institution admin" },
  { code: "PLATFORM_ADMIN", label: "Platform admin" },
];

const PAGE_SIZE = 25;

function rolePill(role: string): "bad" | "warn" | "info" | "good" | "mute" {
  switch (role) {
    case "PLATFORM_ADMIN":
      return "bad";
    case "INSTITUTION_ADMIN":
      return "warn";
    case "MODERATOR":
      return "info";
    case "TEACHER":
      return "good";
    default:
      return "mute";
  }
}

function statusPill(status: string): "bad" | "warn" | "good" | "mute" {
  switch (status) {
    case "ACTIVE":
      return "good";
    case "SUSPENDED":
    case "BANNED":
      return "bad";
    case "PENDING_VERIFICATION":
      return "warn";
    default:
      return "mute";
  }
}

export function Users() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingSearch, setPendingSearch] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = page * PAGE_SIZE;

  const queryString = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (search.trim()) p.set("q", search.trim());
    for (const r of roleFilter) p.append("role", r);
    return p.toString();
  }, [offset, search, roleFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await auth.fetch(`${env.apiBaseUrl}/auth/admin/users?${queryString}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as UserList;
        if (cancelled) return;
        setRows(Array.isArray(body.items) ? body.items : []);
        setTotal(typeof body.total === "number" ? body.total : 0);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [queryString]);

  function applySearch(e?: FormEvent) {
    e?.preventDefault();
    setSearch(pendingSearch);
    setPage(0);
  }

  function toggleRole(role: string) {
    const next = new Set(roleFilter);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setRoleFilter(next);
    setPage(0);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);

  return (
    <AdminShell
      crumbs="Users · directory"
      title="Users"
      chips={<span className="vidya-shell__chip">Admin</span>}
    >
      <p className="admin-lede">
        Read-only directory of all users — students, teachers, moderators,
        and admins. Suspend / ban / impersonate land in a follow-up; until
        then this is the source-of-truth view backed by{" "}
        <code>/auth/admin/users</code>.
      </p>

      {error ? (
        <div className="vidya-auth__error" role="alert"><span>{error}</span></div>
      ) : null}

      <form className="admin-search" onSubmit={applySearch}>
        <input
          type="search"
          className="admin-search__input"
          placeholder="Search by email or name…"
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
        />
        <button type="submit" className="vidya-shell__primary">
          Search
        </button>
      </form>

      <div className="admin-filter-row">
        <span className="admin-filter-label">Role:</span>
        {ROLE_OPTIONS.map((opt) => {
          const on = roleFilter.has(opt.code);
          return (
            <button
              key={opt.code}
              type="button"
              className={`vidya-shell__chip${on ? " vidya-shell__chip--on" : ""}`}
              onClick={() => toggleRole(opt.code)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <section className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Institution</th>
              <th>Role</th>
              <th>Admin level</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="admin-table__empty">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="admin-table__empty">No users match this filter.</td></tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td><span className="admin-link">{u.email}</span></td>
                  <td className="admin-cell-strong">{u.fullName || "—"}</td>
                  <td className="admin-mono-sm">{u.institution?.name ?? "—"}</td>
                  <td>
                    <span className={`admin-pill admin-pill--${rolePill(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="admin-mono-sm">{u.adminAccessLevel}</td>
                  <td>
                    <span className={`admin-pill admin-pill--${statusPill(u.accountStatus)}`}>
                      {u.accountStatus}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <footer className="admin-table__footer">
          <span className="admin-table__count">
            Showing {from}–{to} of {total}
          </span>
          <div className="admin-pager">
            <button
              type="button"
              className="admin-btn"
              onClick={() => setPage(0)}
              disabled={page === 0}
            >
              «
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              ‹ Prev
            </button>
            <span className="admin-pager__pos">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page + 1 >= totalPages}
            >
              Next ›
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => setPage(totalPages - 1)}
              disabled={page + 1 >= totalPages}
            >
              »
            </button>
          </div>
        </footer>
      </section>
    </AdminShell>
  );
}
