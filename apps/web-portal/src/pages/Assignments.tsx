// Sprint 10 S10-B — replaces the Phase-Two stub with a working
// list + create entry. Educator-side surface for `/content/assignments`.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type Assignment,
  type Cohort,
  assignments as assignmentsApi,
  institution,
} from "../lib/api";

export function Assignments() {
  const [params, setParams] = useSearchParams();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tenantId = params.get("tenantId") ?? "";
  const cohortId = params.get("cohortId") ?? "";

  useEffect(() => {
    if (!tenantId) return;
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
    assignmentsApi
      .listForCohort(cohortId)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [cohortId]);

  const cohortName = useMemo(
    () => cohorts?.find((c) => c.id === cohortId)?.name ?? "",
    [cohorts, cohortId],
  );

  return (
    <AppShell title="Assignments">
      <main className="page" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1>Assignments</h1>
          {cohortId && (
            <Link
              to={`/assignments/new?cohortId=${cohortId}&tenantId=${tenantId}`}
              className="btn-primary"
            >
              + New Assignment
            </Link>
          )}
        </div>
        {error && <p className="banner banner-error">{error}</p>}

        <section style={{ marginTop: 16 }}>
          <label>
            Tenant ID:&nbsp;
            <input
              defaultValue={tenantId}
              onBlur={(e) =>
                setParams({ tenantId: e.currentTarget.value, cohortId })
              }
              style={{ minWidth: 280 }}
            />
          </label>
        </section>

        {cohorts !== null && cohorts.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <label>
              Cohort:&nbsp;
              <select
                value={cohortId}
                onChange={(e) =>
                  setParams({ tenantId, cohortId: e.currentTarget.value })
                }
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
            </label>
          </section>
        )}

        {cohortId && items !== null && (
          <section style={{ marginTop: 24 }}>
            <h2>{cohortName ? `${cohortName} — Assignments` : "Assignments"}</h2>
            {items.length === 0 ? (
              <p>No assignments in this cohort yet.</p>
            ) : (
              <ul className="assignment-rows">
                {items.map((a) => (
                  <li key={a.id} style={{ marginTop: 12 }}>
                    <Link to={`/assignments/${a.id}`}>
                      <strong>{a.title}</strong>
                    </Link>
                    {" · "}
                    {a.publishedAt ? (
                      <span className="pill pill-success">PUBLISHED</span>
                    ) : (
                      <span className="pill pill-neutral">DRAFT</span>
                    )}
                    {a.dueAt && ` · due ${a.dueAt.slice(0, 10)}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
