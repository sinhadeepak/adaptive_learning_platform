// Sprint 10 S10-C — Replaces the Phase-Two stub with real Institution
// Core admin UI. Lookup-by-id since /institution/tenants doesn't expose
// a list endpoint (tenants come from billing); the admin uses this UI
// to spot-check existing tenants and create new ones.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { tenants, type AdminTenant } from "../lib/api";

export function Tenants() {
  const [params, setParams] = useSearchParams();
  const lookupId = params.get("id") ?? "";
  const [tenant, setTenant] = useState<AdminTenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<AdminTenant["kind"]>("COACHING_CENTER");
  const [seatLimit, setSeatLimit] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<AdminTenant | null>(null);

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
      setParams({ id: t.id });
      setTenant(t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell title="Institutions">
      <main className="page" style={{ padding: 24 }}>
        <h1>Institutions</h1>
        {error && <p className="banner banner-error">{error}</p>}

        <section style={{ marginBottom: 24 }}>
          <h2>Lookup tenant by ID</h2>
          <input
            value={lookupId}
            onChange={(e) => setParams({ id: e.currentTarget.value })}
            placeholder="UUID"
            style={{ minWidth: 320 }}
          />
          <button
            className="btn-primary"
            onClick={lookup}
            disabled={!lookupId || loading}
            style={{ marginLeft: 8 }}
          >
            {loading ? "Loading…" : "Look up"}
          </button>
        </section>

        {tenant && (
          <section style={{ marginBottom: 24 }}>
            <h2>{tenant.name}</h2>
            <p>
              <span className="pill pill-neutral">{tenant.kind}</span>{" "}
              <code>slug: {tenant.slug}</code>
              {tenant.seatLimit != null && ` · ${tenant.seatLimit} seats`}
            </p>
            <Link to={`/institutions/${tenant.id}/cohorts`}>
              View cohorts &amp; members →
            </Link>
          </section>
        )}

        <section>
          <h2>Create new tenant</h2>
          {created && (
            <p className="banner banner-success">
              Created tenant {created.slug} (id {created.id.slice(0, 8)}…)
            </p>
          )}
          <form
            onSubmit={create}
            style={{ display: "grid", gap: 12, maxWidth: 480 }}
          >
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
              />
            </label>
            <label>
              Slug (optional — derived from name if blank)
              <input
                value={slug}
                onChange={(e) => setSlug(e.currentTarget.value)}
              />
            </label>
            <label>
              Kind
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.currentTarget.value as AdminTenant["kind"])
                }
              >
                <option value="COACHING_CENTER">Coaching center</option>
                <option value="SCHOOL">School</option>
                <option value="UNIVERSITY">University</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Seat limit (optional)
              <input
                type="number"
                min={1}
                max={100000}
                value={seatLimit}
                onChange={(e) => setSeatLimit(e.currentTarget.value)}
              />
            </label>
            <button className="btn-primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create tenant"}
            </button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
