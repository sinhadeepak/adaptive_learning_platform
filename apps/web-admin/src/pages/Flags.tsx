// Flags — Vidya v1 admin feature-flag console (mockup 2/29).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 admin mockup 2/29.
// ADR:  docs/adr/0034-design-system-v3-vidya.md
//
// Layout:
//   topbar: FEATURE FLAGS crumb · "Feature flags" + count chips
//   ┌─ explainer body
//   ┌─ table: flag | default | overrides | owner | updated | action

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flags, type FlagSummary } from "../lib/api";
import { AdminShell } from "../components/AdminShell";

export function Flags() {
  const [items, setItems] = useState<FlagSummary[] | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setItems(await flags.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load flags");
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

  const total = items?.length ?? 0;
  const danger = items?.filter((f) => f.dangerCritical).length ?? 0;

  return (
    <AdminShell
      crumbs="Feature flags"
      title="Feature flags"
      chips={
        <>
          <span className="vidya-shell__chip">{total} total</span>
          {danger > 0 ? (
            <span className="admin-pill admin-pill--bad">{danger} danger-critical</span>
          ) : null}
        </>
      }
    >
      {error ? (
        <div className="vidya-auth__error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <p className="admin-lede">
        Each row is the platform-wide default. Click a flag name to set tenant
        overrides + see the audit trail. Writes emit a <code>flag.changed</code>{" "}
        NATS event so SDK caches invalidate within seconds.
      </p>

      <section className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Default</th>
              <th style={{ textAlign: "right" }}>Overrides</th>
              <th>Owner</th>
              <th>Updated</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items === null ? (
              <tr>
                <td colSpan={6} className="admin-table__empty">Loading flags…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table__empty">No flags registered yet.</td>
              </tr>
            ) : (
              items.map((f) => (
                <tr key={f.name}>
                  <td>
                    <div className="admin-flag__row">
                      <Link to={`/flags/${f.name}`} className="admin-flag__name">
                        {f.name}
                      </Link>
                      {f.dangerCritical ? (
                        <span className="admin-pill admin-pill--bad">⚠ DANGER</span>
                      ) : null}
                    </div>
                    {f.description ? (
                      <div className="admin-flag__desc">{f.description}</div>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={`admin-pill ${f.defaultValue ? "admin-pill--good" : "admin-pill--mute"}`}
                    >
                      ● {f.defaultValue ? "ON" : "OFF"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }} className="admin-mono">
                    {f.overrideCount}
                  </td>
                  <td className="admin-mono-sm">{f.owner ?? "—"}</td>
                  <td className="admin-mono-sm">
                    {new Date(f.updatedAt).toLocaleString(undefined, {
                      month: "numeric",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    })}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busyName === f.name}
                      onClick={() => void toggle(f)}
                    >
                      {busyName === f.name
                        ? "…"
                        : `Set ${(!f.defaultValue).toString().toUpperCase()}`}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
