import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import { auth } from "../lib/api";
import { env } from "../lib/env";

// ─────────────────────────────────────────────────────────────────────────
// Admin Users page.
//
// Wraps GET /auth/admin/users (PLATFORM_ADMIN only). Server-side
// pagination + role filter + email/name substring search. Suspend /
// ban / impersonate are deferred to a follow-up — this iteration is
// the read-only directory the spec asked for.
// ─────────────────────────────────────────────────────────────────────────

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
  items: UserRow[];
  total: number;
}

const ROLE_OPTIONS: { code: string; label: string }[] = [
  { code: "STUDENT", label: "Student" },
  { code: "TEACHER", label: "Teacher" },
  { code: "MODERATOR", label: "Moderator" },
  { code: "INSTITUTION_ADMIN", label: "Institution admin" },
  { code: "PLATFORM_ADMIN", label: "Platform admin" },
];

const PAGE_SIZE = 25;

function roleTone(role: string): "muted" | "info" | "warning" | "danger" | "success" {
  switch (role) {
    case "PLATFORM_ADMIN":
      return "danger";
    case "INSTITUTION_ADMIN":
      return "warning";
    case "MODERATOR":
      return "info";
    case "TEACHER":
      return "success";
    default:
      return "muted";
  }
}

function statusTone(status: string): "muted" | "warning" | "success" | "danger" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
    case "BANNED":
      return "danger";
    case "PENDING_VERIFICATION":
      return "warning";
    default:
      return "muted";
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
        setRows(body.items);
        setTotal(body.total);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  function applySearch(): void {
    setSearch(pendingSearch);
    setPage(0);
  }

  function toggleRole(role: string): void {
    const next = new Set(roleFilter);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setRoleFilter(next);
    setPage(0);
  }

  return (
    <AppShell title="Users" chips={[{ label: "Admin" }]}>
      <Banner tone="info">
        Read-only directory of all users — students, teachers, moderators, and
        admins. Suspend / ban / impersonate land in a follow-up; until then this
        is the source-of-truth view backed by{" "}
        <code>/auth/admin/users</code>.
      </Banner>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 16,
          marginBottom: 12,
        }}
      >
        <input
          type="search"
          placeholder="Search by email or name…"
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "6px 10px",
            background: "var(--bg-surface3)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 13,
          }}
        />
        <button
          onClick={applySearch}
          style={{
            padding: "6px 16px",
            background: "var(--color-blue)",
            color: "white",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Search
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.04,
            marginRight: 4,
          }}
        >
          Role:
        </span>
        {ROLE_OPTIONS.map((r) => {
          const on = roleFilter.has(r.code);
          return (
            <button
              key={r.code}
              onClick={() => toggleRole(r.code)}
              style={{
                padding: "4px 10px",
                background: on ? "var(--color-blue)" : "var(--bg-surface2)",
                color: on ? "white" : "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {r.label}
            </button>
          );
        })}
        {roleFilter.size > 0 && (
          <button
            onClick={() => setRoleFilter(new Set())}
            style={{
              padding: "4px 10px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px dashed var(--border)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div
        style={{
          background: "var(--bg-surface1)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                background: "var(--bg-surface2)",
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
                textAlign: "left",
              }}
            >
              {["Email", "Name", "Institution", "Role", "Admin level", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.04,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                  No users match this filter.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono, monospace)" }}>
                  {u.email}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                  {u.fullName || <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                  {u.institution ? (
                    u.institution.name
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Pill tone={roleTone(u.role)}>{u.role}</Pill>
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                  {u.adminAccessLevel}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <Pill tone={statusTone(u.accountStatus)}>{u.accountStatus}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        <span>
          {total === 0
            ? "0 users"
            : `Showing ${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setPage(0)} disabled={page === 0} style={pageBtn(page === 0)}>
            ‹‹
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={pageBtn(page === 0)}
          >
            ‹ Prev
          </button>
          <span style={{ alignSelf: "center", padding: "0 8px" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={pageBtn(page >= totalPages - 1)}
          >
            Next ›
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            style={pageBtn(page >= totalPages - 1)}
          >
            ››
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    background: "var(--bg-surface2)",
    color: disabled ? "var(--text-faint)" : "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
  };
}
