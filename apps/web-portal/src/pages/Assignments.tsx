// Assignments — educator-side list + create entry.
//
// Production-grade redesign (2026-05-11): uses the shared pg-* design
// vocabulary, surfaces empty states with real guidance, hoists tenant +
// cohort pickers into a single sticky filter row, and renders the
// assignment list as proper cards with status pills + due-date pill.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type Assignment,
  type Cohort,
  assignments as assignmentsApi,
  institution,
} from "../lib/api";

const TENANT_KEY = "alp.portal.tenantId";

function readPinned(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TENANT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function Assignments() {
  const [params, setParams] = useSearchParams();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlTenant = params.get("tenantId") ?? "";
  const pinnedTenant = readPinned();
  const tenantId = urlTenant || pinnedTenant;
  const cohortId = params.get("cohortId") ?? "";

  const [tenantInput, setTenantInput] = useState(tenantId);

  useEffect(() => {
    if (!tenantId) {
      setCohorts(null);
      return;
    }
    setError(null);
    institution
      .cohortsForTenant(tenantId)
      .then(setCohorts)
      .catch((e) => setError((e as Error).message));
  }, [tenantId]);

  useEffect(() => {
    if (!cohortId) {
      setItems(null);
      return;
    }
    setError(null);
    assignmentsApi
      .listForCohort(cohortId)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [cohortId]);

  const cohortName = useMemo(
    () => cohorts?.find((c) => c.id === cohortId)?.name ?? "",
    [cohorts, cohortId],
  );

  function applyTenant(next: string) {
    const v = next.trim();
    setParams(v ? { tenantId: v, cohortId } : {});
  }

  return (
    <AppShell
      title="Assignments"
      actions={
        cohortId ? (
          <Link
            to={`/assignments/new?cohortId=${cohortId}&tenantId=${tenantId}`}
            className="pg-btn pg-btn-primary"
          >
            ＋ New assignment
          </Link>
        ) : null
      }
    >
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Assignments</h1>
            <p className="pg-header-sub">
              Pick a tenant, then a cohort to manage its assignments. Status
              and due dates surface inline; click any row to open the
              detail view.
            </p>
          </div>
        </header>

        {/* ── Filter row: tenant + cohort selectors ─────────────── */}
        <div className="pg-filter-row" style={{ alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 280 }}>
            <span className="pg-filter-label">Tenant</span>
            <input
              className="pg-search-input"
              style={{ paddingLeft: 12 }}
              placeholder="Tenant UUID (paste from admin)"
              defaultValue={tenantId}
              onChange={(e) => setTenantInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyTenant((e.target as HTMLInputElement).value);
              }}
            />
          </div>
          <button
            type="button"
            className="pg-btn pg-btn-subtle"
            onClick={() => applyTenant(tenantInput)}
            disabled={!tenantInput.trim()}
          >
            Apply
          </button>

          {cohorts !== null && cohorts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 280 }}>
              <span className="pg-filter-label">Cohort</span>
              <select
                className="pg-filter-select"
                value={cohortId}
                onChange={(e) => setParams({ tenantId, cohortId: e.currentTarget.value })}
              >
                <option value="">— pick a cohort —</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.exam ? ` · ${c.exam}` : ""}
                    {c.year ? ` · ${c.year}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <p className="banner banner-error">{error}</p>
          </div>
        )}

        {/* ── Body branches by state ────────────────────────────── */}
        {!tenantId && (
          <div className="pg-empty">
            <div className="pg-empty-icon">🏫</div>
            <h2 className="pg-empty-title">Pick a tenant to begin</h2>
            <p className="pg-empty-body">
              Assignments are scoped to a tenant + cohort. Paste a tenant
              UUID above, or visit the Dashboard to pin a default tenant
              so this step is automatic next time.
            </p>
            <Link to="/dashboard" className="pg-btn pg-btn-ghost">
              ← Pin tenant on Dashboard
            </Link>
          </div>
        )}

        {tenantId && cohorts !== null && cohorts.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">👥</div>
            <h2 className="pg-empty-title">No cohorts in this tenant</h2>
            <p className="pg-empty-body">
              Cohorts are created by the institution admin. Once they're
              set up, they'll appear in the picker above and you can
              assign content to each one.
            </p>
          </div>
        )}

        {tenantId && cohorts !== null && cohorts.length > 0 && !cohortId && (
          <div className="pg-empty">
            <div className="pg-empty-icon">📚</div>
            <h2 className="pg-empty-title">Pick a cohort</h2>
            <p className="pg-empty-body">
              Choose a cohort from the dropdown above to see its
              assignments and create new ones.
            </p>
          </div>
        )}

        {tenantId && cohortId && items === null && (
          <div className="pg-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-row" style={{ opacity: 0.5, minHeight: 70 }} aria-hidden />
            ))}
          </div>
        )}

        {tenantId && cohortId && items !== null && items.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">📝</div>
            <h2 className="pg-empty-title">
              No assignments {cohortName ? `for ${cohortName}` : "yet"}
            </h2>
            <p className="pg-empty-body">
              Create the first assignment — students in this cohort will
              see it on their dashboard immediately after you publish.
            </p>
            <Link
              to={`/assignments/new?cohortId=${cohortId}&tenantId=${tenantId}`}
              className="pg-btn pg-btn-primary"
            >
              ＋ Create assignment
            </Link>
          </div>
        )}

        {tenantId && cohortId && items !== null && items.length > 0 && (
          <>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 12,
                marginTop: 4,
              }}
            >
              {cohortName ? `${cohortName} · ${items.length} assignment${items.length === 1 ? "" : "s"}` : `${items.length} assignment${items.length === 1 ? "" : "s"}`}
            </h2>
            <div className="pg-list">
              {items.map((a) => {
                const due = a.dueAt ? new Date(a.dueAt) : null;
                const overdue = due && due.getTime() < Date.now();
                return (
                  <Link
                    key={a.id}
                    to={`/assignments/${a.id}`}
                    className="pg-row"
                  >
                    <div className="pg-row-main">
                      <p className="pg-row-title">{a.title}</p>
                      <div className="pg-row-meta">
                        {due ? (
                          <span style={overdue ? { color: "var(--color-red)" } : {}}>
                            📅 due {due.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            {overdue ? " · overdue" : ""}
                          </span>
                        ) : (
                          <span>No due date</span>
                        )}
                      </div>
                    </div>
                    <div className="pg-row-aside">
                      {a.publishedAt ? (
                        <span className="pg-pill pg-pill-success">Published</span>
                      ) : (
                        <span className="pg-pill pg-pill-muted">Draft</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
