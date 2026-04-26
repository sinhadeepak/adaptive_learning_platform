import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { flags, type FlagAuditEntry } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, SkeletonRows } from "../components/primitives";

type ScopeFilter = "ALL" | "GLOBAL" | "TENANT";

function isPlatformScope(scope: string): boolean {
  // Backend emits GLOBAL/TENANT (uppercase). The legacy FlagDetail mock used
  // lowercase platform/tenant — accept both so display is correct in either
  // shape.
  const s = scope.toUpperCase();
  return s === "GLOBAL" || s === "PLATFORM";
}

export function Audit() {
  const [items, setItems] = useState<FlagAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeFilter>("ALL");

  useEffect(() => {
    (async () => {
      try {
        setItems(await flags.listAudit(200));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load audit log");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (scope === "ALL") return items;
    return items.filter((r) =>
      scope === "GLOBAL" ? isPlatformScope(r.scope) : !isPlatformScope(r.scope),
    );
  }, [items, scope]);

  const counts = useMemo(() => {
    if (!items) return null;
    return {
      total: items.length,
      global: items.filter((r) => isPlatformScope(r.scope)).length,
      tenant: items.filter((r) => !isPlatformScope(r.scope)).length,
    };
  }, [items]);

  return (
    <AppShell
      title="Audit log"
      chips={
        counts
          ? [
              { label: `${counts.total} total` },
              { label: `${counts.global} global` },
              { label: `${counts.tenant} tenant` },
            ]
          : []
      }
    >
      <p className="page-subhead">
        Every flag default change + every tenant override, newest first. Writes
        emit a <code>flag.changed</code> NATS event so SDK caches invalidate
        within seconds.
      </p>

      <div
        role="tablist"
        aria-label="Scope filter"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        {(["ALL", "GLOBAL", "TENANT"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            type="button"
            onClick={() => setScope(s)}
            className={`preset-chip ${scope === s ? "preset-chip-selected" : ""}`.trim()}
            style={{ flex: "0 1 auto" }}
          >
            {s === "ALL" ? "All" : s === "GLOBAL" ? "Global only" : "Tenant only"}
          </button>
        ))}
      </div>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {filtered === null ? (
        <SkeletonRows count={5} />
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">No audit entries</div>
          <p>
            {scope === "ALL"
              ? "Nothing has been changed yet."
              : `No ${scope.toLowerCase()} entries.`}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Flag</th>
                <th>Scope</th>
                <th>Change</th>
                <th>By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i}>
                  <td className="meta">{new Date(a.ts).toLocaleString()}</td>
                  <td>
                    <Link
                      to={`/flags/${encodeURIComponent(a.flagName)}`}
                      style={{ textDecoration: "none" }}
                    >
                      <code>{a.flagName}</code>
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`scope-chip ${
                        isPlatformScope(a.scope)
                          ? "scope-chip-platform"
                          : "scope-chip-tenant"
                      }`}
                    >
                      {isPlatformScope(a.scope) ? "global" : "tenant"}
                    </span>
                    {a.tenantId ? (
                      <span className="meta" style={{ marginLeft: 6 }}>
                        {a.tenantId.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {a.oldValue === null ? "(new)" : a.oldValue ? "ON" : "OFF"} →{" "}
                    <strong>{a.newValue ? "ON" : "OFF"}</strong>
                  </td>
                  <td className="meta">{a.actorUserId?.slice(0, 8) ?? "—"}</td>
                  <td>{a.rationale ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
