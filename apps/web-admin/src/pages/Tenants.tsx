// Sprint 10 S10-C — Institution Core admin UI. Lists all tenants with
// counts up top; lookup-by-id + create flows live in modal popups.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  tenants,
  type AdminTenant,
  type AdminTenantListEntry,
} from "../lib/api";

export function Tenants() {
  const [params, setParams] = useSearchParams();
  const lookupId = params.get("id") ?? "";
  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [list, setList] = useState<AdminTenantListEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showLookup, setShowLookup] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<AdminTenant["kind"]>("COACHING_CENTER");
  const [seatLimit, setSeatLimit] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<AdminTenant | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await tenants.list({ limit: 100 });
        if (!cancelled) setList(r.items);
      } catch (e) {
        if (!cancelled) setListError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [created]);

  async function lookup() {
    setLoading(true);
    setError(null);
    setTenant(null);
    try {
      const t = await tenants.get(lookupId.trim());
      setTenant(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const t = await tenants.create({
        name,
        kind,
        slug: slug || undefined,
        seatLimit: seatLimit ? Number(seatLimit) : null,
      });
      setCreated(t);
      // Reset form + close modal
      setName("");
      setSlug("");
      setSeatLimit("");
      setKind("COACHING_CENTER");
      setShowCreate(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell title="Institutions">
      <div style={{ padding: "16px 24px 32px" }}>
        {error && <p className="banner banner-error">{error}</p>}
        {created && (
          <p className="banner banner-success">
            Created tenant {created.slug} (id {created.id.slice(0, 8)}…)
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0 }}>All tenants</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowLookup(true)}
              style={btnSecondary}
            >
              Lookup by ID
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={btnPrimary}
            >
              + New tenant
            </button>
          </div>
        </div>

        {listError && <p className="banner banner-error">{listError}</p>}
        {list === null && !listError && (
          <p style={{ color: "var(--ink-3)" }}>Loading…</p>
        )}
        {list !== null && list.length === 0 && (
          <p style={{ color: "var(--ink-3)" }}>No tenants yet.</p>
        )}
        {list !== null && list.length > 0 && (
          <div
            style={{
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--card)",
                    color: "var(--ink-3)",
                    borderBottom: "1px solid var(--rule)",
                    textAlign: "left",
                  }}
                >
                  {["Name", "Slug", "Kind", "Cohorts", "Teachers", "Students", ""].map(
                    (h) => (
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
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: "1px solid var(--rule)",
                      color: "var(--ink)",
                    }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                      {t.name}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: "var(--font-mono, monospace)",
                        color: "var(--ink-2)",
                      }}
                    >
                      {t.slug}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: "var(--ink-2)",
                      }}
                    >
                      {t.kind}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{t.cohortCount}</td>
                    <td style={{ padding: "10px 12px" }}>{t.teacherCount}</td>
                    <td style={{ padding: "10px 12px" }}>{t.studentCount}</td>
                    <td style={{ padding: "10px 12px", display: "flex", gap: 12 }}>
                      <Link to={`/institutions/${t.id}/cohorts`}>Cohorts →</Link>
                      <Link
                        to={`/institutes/${t.id}/analytics`}
                        style={{ color: "var(--gold)" }}
                      >
                        Analytics →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showLookup && (
        <Modal title="Lookup tenant by ID" onClose={() => setShowLookup(false)}>
          <input
            value={lookupId}
            onChange={(e) => setParams({ id: e.currentTarget.value })}
            placeholder="UUID"
            style={inputStyle}
          />
          <button
            onClick={lookup}
            disabled={!lookupId || loading}
            style={{ ...btnPrimary, marginTop: 12 }}
          >
            {loading ? "Loading…" : "Look up"}
          </button>
          {tenant && (
            <div style={{ marginTop: 16, fontSize: 13 }}>
              <strong style={{ fontSize: 15 }}>{tenant.name}</strong>
              <p style={{ margin: "4px 0", color: "var(--ink-3)" }}>
                {tenant.kind} · slug: <code>{tenant.slug}</code>
                {tenant.seatLimit != null && ` · ${tenant.seatLimit} seats`}
              </p>
              <Link
                to={`/institutions/${tenant.id}/cohorts`}
                onClick={() => setShowLookup(false)}
              >
                View cohorts & members →
              </Link>
            </div>
          )}
        </Modal>
      )}

      {showCreate && (
        <Modal title="Create new tenant" onClose={() => setShowCreate(false)}>
          <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                style={inputStyle}
                autoFocus
              />
            </label>
            <label style={labelStyle}>
              Slug
              <input
                value={slug}
                onChange={(e) => setSlug(e.currentTarget.value)}
                placeholder="optional — derived from name if blank"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Kind
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.currentTarget.value as AdminTenant["kind"])
                }
                style={inputStyle}
              >
                <option value="COACHING_CENTER">Coaching center</option>
                <option value="SCHOOL">School</option>
                <option value="UNIVERSITY">University</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label style={labelStyle}>
              Seat limit
              <input
                type="number"
                min={1}
                max={100000}
                value={seatLimit}
                placeholder="optional"
                onChange={(e) => setSeatLimit(e.currentTarget.value)}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={btnSecondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={creating} style={btnPrimary}>
                {creating ? "Creating…" : "Create tenant"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 10,
          padding: 24,
          minWidth: 420,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, color: "var(--ink)" }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "var(--ink-3)",
              fontSize: 20,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--paper-2)",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  fontSize: 13,
  marginTop: 4,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--ink-3)",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--info)",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--card)",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};