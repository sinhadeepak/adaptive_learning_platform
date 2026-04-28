import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flags, type FlagSummary } from "../lib/api";
import { AppShell } from "../components/AppShell";
import { Banner, BoolPill, SkeletonRows } from "../components/primitives";

export function Flags() {
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
    const rationale = window.prompt(
      `Set ${f.name} default to ${(!f.defaultValue).toString()}.\nReason (visible in audit log):`,
      "",
    );
    if (rationale === null) return;
    setBusyName(f.name);
    try {
      await flags.setDefault(f.name, !f.defaultValue, rationale);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusyName(null);
    }
  }

  const danger = items?.filter((f) => f.dangerCritical).length ?? 0;

  return (
    <AppShell
      title="Feature flags"
      chips={
        items
          ? [
              { label: `${items.length} total` },
              ...(danger ? [{ label: `${danger} danger-critical` }] : []),
            ]
          : []
      }
    >
      <p className="page-subhead">
        Each row is the platform-wide default. Click a flag name to set tenant
        overrides + see the audit trail. Writes emit a <code>flag.changed</code>{" "}
        NATS event so SDK caches invalidate within seconds.
      </p>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {items === null ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-title">No flags</div>
          <p>No flags registered yet.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Default</th>
                <th>Overrides</th>
                <th>Owner</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.name}>
                  <td>
                    <Link
                      to={`/flags/${encodeURIComponent(f.name)}`}
                      style={{ textDecoration: "none" }}
                    >
                      <code>{f.name}</code>
                    </Link>
                    {f.dangerCritical ? (
                      <span className="danger-tag" style={{ marginLeft: 8 }}>
                        ⚠ DANGER
                      </span>
                    ) : null}
                    {f.description ? (
                      <div className="meta" style={{ marginTop: 4 }}>{f.description}</div>
                    ) : null}
                  </td>
                  <td>
                    <BoolPill value={f.defaultValue} />
                  </td>
                  <td className="meta">{f.overrideCount}</td>
                  <td className="meta">{f.owner ?? "—"}</td>
                  <td className="meta">
                    {new Date(f.updatedAt).toLocaleString()}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => void toggle(f)}
                      disabled={busyName === f.name}
                      className="btn btn-ghost"
                    >
                      {busyName === f.name ? "…" : `Set ${(!f.defaultValue).toString().toUpperCase()}`}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
