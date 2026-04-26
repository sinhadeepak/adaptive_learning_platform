import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { flags, type FlagDetail as FlagDetailT } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, BoolPill, SkeletonRows } from "../components/primitives";

export function FlagDetail() {
  const { name = "" } = useParams<{ name: string }>();
  const [flag, setFlag] = useState<FlagDetailT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [overrideValue, setOverrideValue] = useState(true);
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setError(null);
    try {
      setFlag(await flags.get(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function applyOverride() {
    if (!tenantId.trim()) {
      setError("Tenant ID required.");
      return;
    }
    setSubmitting(true);
    try {
      await flags.setOverride(name, tenantId.trim(), overrideValue, rationale || undefined);
      setTenantId("");
      setRationale("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Override failed");
    } finally {
      setSubmitting(false);
    }
  }

  const action = (
    <Link to="/flags" className="btn btn-ghost">
      ← All flags
    </Link>
  );

  if (!flag) {
    return (
      <AppShell title={name || "Flag"} actions={action}>
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : (
          <SkeletonRows count={3} />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={flag.name}
      chips={
        flag.dangerCritical
          ? [{ label: "DANGER-CRITICAL" }]
          : []
      }
      actions={action}
    >
      <section className="card" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-4)" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-3)",
            flexWrap: "wrap",
            marginBottom: "var(--sp-3)",
          }}
        >
          <h2 className="section-heading" style={{ margin: 0 }}>
            Default
          </h2>
          <BoolPill value={flag.defaultValue} />
          {flag.dangerCritical ? <span className="danger-tag">⚠ DANGER-CRITICAL</span> : null}
        </header>
        {flag.description ? (
          <p className="page-subhead" style={{ marginTop: 0 }}>
            {flag.description}
          </p>
        ) : null}
        <dl className="kv-list">
          <div>
            <dt>Owner</dt>
            <dd>{flag.owner ?? "—"}</dd>
          </div>
          <div>
            <dt>Blast radius</dt>
            <dd>{flag.blastRadius ?? "—"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{new Date(flag.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <section style={{ marginTop: "var(--sp-4)" }}>
        <h2 className="section-heading">Tenant overrides</h2>
        {flag.overrides.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-state-title">No overrides</div>
            <p>Every tenant uses the default value.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "var(--sp-4)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Value</th>
                  <th>Set by</th>
                  <th>At</th>
                </tr>
              </thead>
              <tbody>
                {flag.overrides.map((o) => (
                  <tr key={o.tenantId}>
                    <td>
                      <code>{o.tenantId}</code>
                    </td>
                    <td>
                      <BoolPill value={o.value} />
                    </td>
                    <td className="meta">{o.setByUserId?.slice(0, 8) ?? "—"}</td>
                    <td className="meta">{new Date(o.setAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <fieldset className="form-fieldset">
          <legend className="form-label">Add or update an override</legend>
          {error ? (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexWrap: "wrap",
              marginTop: "var(--sp-2)",
            }}
          >
            <label className="form-field" style={{ flex: 1, minWidth: 280 }}>
              <span className="form-label">Tenant UUID</span>
              <input
                placeholder="00000000-0000-0000-0000-000000000000"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="form-input"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Value</span>
              <select
                value={String(overrideValue)}
                onChange={(e) => setOverrideValue(e.target.value === "true")}
                className="form-input"
              >
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
            </label>
            <label className="form-field" style={{ flex: 2, minWidth: 240 }}>
              <span className="form-label">Rationale (audit)</span>
              <input
                placeholder="Why this override?"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                className="form-input"
              />
            </label>
            <button
              type="button"
              onClick={() => void applyOverride()}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Saving…" : "Save override"}
            </button>
          </div>
        </fieldset>
      </section>

      <section style={{ marginTop: "var(--sp-5)" }}>
        <h2 className="section-heading">Audit log</h2>
        {flag.audit.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-state-title">No history</div>
            <p>This flag hasn't been changed yet.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Scope</th>
                  <th>Change</th>
                  <th>By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {flag.audit.map((a, i) => (
                  <tr key={i}>
                    <td className="meta">{new Date(a.ts).toLocaleString()}</td>
                    <td>
                      {(() => {
                        // Backend emits scope as GLOBAL/TENANT; the original
                        // shipped frontend assumed lowercase platform/tenant.
                        // Accept both so the chip is correct in either shape.
                        const isGlobal = ["GLOBAL", "PLATFORM"].includes(a.scope.toUpperCase());
                        return (
                          <span
                            className={`scope-chip ${
                              isGlobal ? "scope-chip-platform" : "scope-chip-tenant"
                            }`}
                          >
                            {isGlobal ? "global" : "tenant"}
                          </span>
                        );
                      })()}
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
      </section>
    </AppShell>
  );
}
