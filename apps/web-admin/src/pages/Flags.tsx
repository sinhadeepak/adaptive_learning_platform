import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flags, type FlagSummary } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

export function Flags() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<FlagSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      setItems(await flags.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggle(f: FlagSummary) {
    if (f.dangerCritical) {
      const ok = window.confirm(
        `${f.name} is marked DANGER-CRITICAL. Toggling will affect every tenant. Continue?`,
      );
      if (!ok) return;
    }
    setBusyName(f.name);
    try {
      const rationale = window.prompt(
        `Set ${f.name} default to ${(!f.defaultValue).toString()}.\nReason (visible in audit log):`,
        "",
      );
      if (rationale === null) {
        setBusyName(null);
        return;
      }
      await flags.setDefault(f.name, !f.defaultValue, rationale);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusyName(null);
    }
  }

  return (
    <main style={{ maxWidth: 1024, margin: "2rem auto", padding: "0 1.5rem", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>Feature flags</h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
          <span style={{ color: "#666" }}>
            {user?.firstName} ({user?.role})
          </span>
          <button onClick={() => void logout()} style={{ fontSize: 13 }}>
            Sign out
          </button>
        </nav>
      </header>

      <p style={{ color: "#555", fontSize: 14 }}>
        Each row is the platform-wide default. Click a flag name to set tenant
        overrides + see the audit trail. Writes emit a <code>flag.changed</code>{" "}
        NATS event so SDK caches invalidate within seconds.
      </p>

      {error && (
        <div role="alert" style={{ color: "#a51c30", fontSize: 13, margin: "0.5rem 0" }}>
          {error}
        </div>
      )}

      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "#666" }}>No flags registered yet.</p>
      ) : (
        <table style={{ width: "100%", marginTop: 16, fontSize: 14, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "8px 4px" }}>Flag</th>
              <th style={{ padding: "8px 4px" }}>Default</th>
              <th style={{ padding: "8px 4px" }}>Overrides</th>
              <th style={{ padding: "8px 4px" }}>Owner</th>
              <th style={{ padding: "8px 4px" }}>Updated</th>
              <th style={{ padding: "8px 4px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.name} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 4px" }}>
                  <Link to={`/flags/${encodeURIComponent(f.name)}`}>
                    <code>{f.name}</code>
                  </Link>
                  {f.dangerCritical && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        color: "#a51c30",
                        fontWeight: 600,
                      }}
                    >
                      ⚠ DANGER
                    </span>
                  )}
                  {f.description && (
                    <div style={{ color: "#666", fontSize: 12 }}>{f.description}</div>
                  )}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  <BoolPill value={f.defaultValue} />
                </td>
                <td style={{ padding: "8px 4px", color: "#666" }}>{f.overrideCount}</td>
                <td style={{ padding: "8px 4px", color: "#666" }}>{f.owner ?? "—"}</td>
                <td style={{ padding: "8px 4px", color: "#666", fontSize: 12 }}>
                  {new Date(f.updatedAt).toLocaleString()}
                </td>
                <td style={{ padding: "8px 4px" }}>
                  <button onClick={() => void toggle(f)} disabled={busyName === f.name}>
                    {busyName === f.name ? "…" : `Set ${(!f.defaultValue).toString()}`}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

export function BoolPill({ value }: { value: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        background: value ? "#e6f7ed" : "#fdecec",
        color: value ? "#1a6d3a" : "#a51c30",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {value ? "ON" : "OFF"}
    </span>
  );
}
