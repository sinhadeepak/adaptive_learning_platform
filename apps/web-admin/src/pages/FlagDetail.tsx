import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { flags, type FlagDetail as FlagDetailT } from "../lib/api";
import { BoolPill } from "./Flags";

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

  if (!flag) {
    return (
      <main style={{ maxWidth: 920, margin: "2rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
        {error ? <p style={{ color: "#a51c30" }}>{error}</p> : <p>Loading…</p>}
        <p>
          <Link to="/flags">← All flags</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 920, margin: "2rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <p>
        <Link to="/flags">← All flags</Link>
      </p>
      <h1 style={{ fontSize: 22 }}>
        <code>{flag.name}</code>{" "}
        {flag.dangerCritical && (
          <span style={{ marginLeft: 6, fontSize: 12, color: "#a51c30", fontWeight: 600 }}>
            ⚠ DANGER-CRITICAL
          </span>
        )}
      </h1>
      {flag.description && <p style={{ color: "#666" }}>{flag.description}</p>}

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Default</h2>
        <BoolPill value={flag.defaultValue} />{" "}
        <span style={{ color: "#666", fontSize: 13 }}>
          owner: {flag.owner ?? "—"} · blast: {flag.blastRadius ?? "—"} · updated:{" "}
          {new Date(flag.updatedAt).toLocaleString()}
        </span>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>Tenant overrides</h2>
        {flag.overrides.length === 0 ? (
          <p style={{ color: "#666" }}>No tenant overrides — every tenant uses the default.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: "6px 4px" }}>Tenant</th>
                <th style={{ padding: "6px 4px" }}>Value</th>
                <th style={{ padding: "6px 4px" }}>Set by</th>
                <th style={{ padding: "6px 4px" }}>At</th>
              </tr>
            </thead>
            <tbody>
              {flag.overrides.map((o) => (
                <tr key={o.tenantId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 4px" }}>
                    <code>{o.tenantId}</code>
                  </td>
                  <td style={{ padding: "6px 4px" }}>
                    <BoolPill value={o.value} />
                  </td>
                  <td style={{ padding: "6px 4px", color: "#666", fontSize: 12 }}>
                    {o.setByUserId?.slice(0, 8) ?? "—"}
                  </td>
                  <td style={{ padding: "6px 4px", color: "#666", fontSize: 12 }}>
                    {new Date(o.setAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <fieldset style={{ marginTop: 12, padding: 12, border: "1px solid #ddd" }}>
          <legend style={{ fontSize: 13 }}>Add or update an override</legend>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Tenant UUID"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              style={{ padding: 6, fontFamily: "ui-monospace", fontSize: 13, minWidth: 280 }}
            />
            <select
              value={String(overrideValue)}
              onChange={(e) => setOverrideValue(e.target.value === "true")}
            >
              <option value="true">ON</option>
              <option value="false">OFF</option>
            </select>
            <input
              placeholder="Rationale (audit)"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              style={{ padding: 6, fontSize: 13, flex: 1, minWidth: 200 }}
            />
            <button onClick={() => void applyOverride()} disabled={submitting}>
              {submitting ? "…" : "Save override"}
            </button>
          </div>
        </fieldset>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>Audit log</h2>
        {flag.audit.length === 0 ? (
          <p style={{ color: "#666" }}>No history yet.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th style={{ padding: "6px 4px" }}>When</th>
                <th style={{ padding: "6px 4px" }}>Scope</th>
                <th style={{ padding: "6px 4px" }}>Change</th>
                <th style={{ padding: "6px 4px" }}>By</th>
                <th style={{ padding: "6px 4px" }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {flag.audit.map((a, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 4px", color: "#666" }}>
                    {new Date(a.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: "6px 4px" }}>
                    {a.scope}
                    {a.tenantId && <span style={{ color: "#666" }}> ({a.tenantId.slice(0, 8)})</span>}
                  </td>
                  <td style={{ padding: "6px 4px" }}>
                    {a.oldValue === null ? "(new)" : a.oldValue ? "ON" : "OFF"} →{" "}
                    {a.newValue ? "ON" : "OFF"}
                  </td>
                  <td style={{ padding: "6px 4px", color: "#666" }}>
                    {a.actorUserId?.slice(0, 8) ?? "—"}
                  </td>
                  <td style={{ padding: "6px 4px" }}>{a.rationale ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
