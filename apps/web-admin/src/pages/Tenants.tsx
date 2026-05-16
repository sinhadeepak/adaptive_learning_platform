// Tenants — Vidya v1 admin Institutions list (mockups 3+4/29).
//
// Spec: docs/02-design/design-system/04_components.md
//       + Vidya v1 admin mockups 3/29 (list) + 4/29 (create modal).
// ADR:  docs/adr/0034-design-system-v3-vidya.md

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { tenants, type AdminTenantListEntry } from "../lib/api";
import { AdminShell } from "../components/AdminShell";

type Kind = "SCHOOL" | "COACHING_CENTER" | "UNIVERSITY" | "OTHER";

const KIND_LABEL: Record<Kind, string> = {
  SCHOOL: "School",
  COACHING_CENTER: "Coaching center",
  UNIVERSITY: "University",
  OTHER: "Other",
};

export function Tenants() {
  const [items, setItems] = useState<AdminTenantListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<Kind>("COACHING_CENTER");
  const [seatLimit, setSeatLimit] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const r = await tenants.list({ limit: 100 });
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tenants");
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function onLookup(e: FormEvent) {
    e.preventDefault();
    if (!lookupId.trim()) return;
    try {
      const t = await tenants.get(lookupId.trim());
      if (t) setItems([t as unknown as AdminTenantListEntry]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await tenants.create({
        name: name.trim(),
        slug: slug.trim() || undefined,
        kind,
        seatLimit: seatLimit ? Number(seatLimit) : null,
      });
      setShowCreate(false);
      setName(""); setSlug(""); setKind("COACHING_CENTER"); setSeatLimit("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminShell crumbs="Tenants · institutions" title="Institutions">
      {error ? (
        <div className="vidya-auth__error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <section className="admin-table">
        <header className="admin-table__head">
          <div className="admin-table__title">All tenants</div>
          <form className="admin-table__head-actions" onSubmit={onLookup}>
            <input
              type="text"
              placeholder="Tenant UUID…"
              className="admin-input"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
            />
            <button type="submit" className="admin-btn">Lookup by ID</button>
            <button
              type="button"
              className="vidya-shell__primary"
              onClick={() => setShowCreate(true)}
            >
              + New tenant
            </button>
          </form>
        </header>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Kind</th>
              <th style={{ textAlign: "right" }}>Cohorts</th>
              <th style={{ textAlign: "right" }}>Teachers</th>
              <th style={{ textAlign: "right" }}>Students</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items === null ? (
              <tr><td colSpan={7} className="admin-table__empty">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="admin-table__empty">No tenants yet.</td></tr>
            ) : (
              items.map((t) => (
                <tr key={t.id}>
                  <td className="admin-cell-strong">{t.name}</td>
                  <td className="admin-mono-sm">{t.slug}</td>
                  <td className="admin-mono-sm">{KIND_LABEL[t.kind as Kind] ?? t.kind}</td>
                  <td style={{ textAlign: "right" }} className="admin-mono">{t.cohortCount}</td>
                  <td style={{ textAlign: "right" }} className="admin-mono">{t.teacherCount}</td>
                  <td style={{ textAlign: "right" }} className="admin-mono">{t.studentCount}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Link to={`/institutions/${t.id}/cohorts`} className="admin-link">Cohorts →</Link>
                    <span style={{ display: "inline-block", width: 12 }} />
                    <Link to={`/institutes/${t.id}/analytics`} className="admin-link">Analytics →</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {showCreate ? (
        <>
          <div className="vidya-drawer__scrim" onClick={() => setShowCreate(false)} aria-hidden />
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Create new tenant">
            <header className="admin-modal__head">
              <h2 className="admin-modal__title">Create new tenant</h2>
              <button
                type="button"
                className="vidya-drawer__close"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <form className="admin-modal__form" onSubmit={onCreate}>
              <label className="vidya-auth__field">
                <span className="vidya-auth__field-label">Name</span>
                <input
                  className="vidya-auth__field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label className="vidya-auth__field">
                <span className="vidya-auth__field-label">Slug</span>
                <input
                  className="vidya-auth__field-input"
                  value={slug}
                  placeholder="optional — derived from name if blank"
                  onChange={(e) => setSlug(e.target.value)}
                />
              </label>
              <label className="vidya-auth__field">
                <span className="vidya-auth__field-label">Kind</span>
                <select
                  className="vidya-auth__field-input"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Kind)}
                >
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
              <label className="vidya-auth__field">
                <span className="vidya-auth__field-label">Seat limit</span>
                <input
                  className="vidya-auth__field-input"
                  type="number"
                  inputMode="numeric"
                  value={seatLimit}
                  placeholder="optional"
                  onChange={(e) => setSeatLimit(e.target.value)}
                />
              </label>
              <div className="admin-modal__actions">
                <button type="button" className="admin-btn" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="vidya-shell__primary" disabled={creating || !name.trim()}>
                  {creating ? "Creating…" : "Create tenant"}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}
