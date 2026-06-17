// Tutors marketplace — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle + tier chips + My-bookings
// action) → search/range/sort row → 3-col vidya-grid of vidya-card-block
// tutor cards with thumb gradient, headline, subject + tier chips, hourly
// rate, and rating.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
import { type TutorListingItem, marketplace } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

function initialFor(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "T";
}

const AVATAR_TINTS = [
  "linear-gradient(135deg, #4F87F6, #22D4EE)",
  "linear-gradient(135deg, #A78BFA, #F472B6)",
  "linear-gradient(135deg, #10C47A, #22D4EE)",
  "linear-gradient(135deg, #FB923C, #F43F5E)",
  "linear-gradient(135deg, #F5A623, #F472B6)",
  "linear-gradient(135deg, #6366F1, #4F87F6)",
];

function tintFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

type SortKey = "price-asc" | "price-desc" | "rating" | "newest";

export function Tutors() {
  const [items, setItems] = useState<TutorListingItem[] | null>(null);
  const [maxRate, setMaxRate] = useState<number>(5000);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [tierFilter, setTierFilter] = useState<"all" | "premium" | "standard">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    marketplace
      .listTutors({ maxHourlyPaise: maxRate * 100, perPage: 50 })
      .then((d) => setItems(d.items))
      .catch((e) => setError((e as Error).message));
  }, [maxRate]);

  const filtered = useMemo(() => {
    if (!items) return null;
    let out = [...items];
    if (tierFilter === "premium") out = out.filter((t) => t.tier === "PREMIUM_VERIFIED");
    if (tierFilter === "standard") out = out.filter((t) => t.tier !== "PREMIUM_VERIFIED");
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          (t.headline ?? "").toLowerCase().includes(q),
      );
    }
    out.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return a.hourlyRatePaise - b.hourlyRatePaise;
        case "price-desc":
          return b.hourlyRatePaise - a.hourlyRatePaise;
        case "rating":
          return (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0);
        case "newest":
        default:
          return 0;
      }
    });
    return out;
  }, [items, search, sort, tierFilter]);

  return (
    <VidyaShell
      crumbs="MARKETPLACE · FIND A TUTOR"
      title="Find a tutor"
      subtitle="Browse vetted 1:1 tutors. Filter by price and seniority; tap any card to see qualifications, weekly availability, and book a session."
      chips={
        <>
          {(["all", "premium", "standard"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`vidya-shell__chip${tierFilter === t ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setTierFilter(t)}
            >
              {t === "all" ? "All tiers" : t === "premium" ? "Premium verified" : "Standard"}
            </button>
          ))}
        </>
      }
      actions={
        <Link to="/bookings" className="vidya-shell__chip">
          My bookings
        </Link>
      }
    >
      <div style={{
        display: "flex",
        gap: "var(--sp-3)",
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: "var(--sp-4)",
      }}>
        <input
          type="search"
          placeholder="Search by name or expertise…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 240px",
            minWidth: 200,
            padding: "8px 12px",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            color: "var(--ink)",
            fontSize: 13,
          }}
        />
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--ink-3)" }}>
          <span>Max ₹{maxRate.toLocaleString("en-IN")}</span>
          <input
            type="range"
            min={100}
            max={5000}
            step={100}
            value={maxRate}
            onChange={(e) => setMaxRate(parseInt(e.target.value, 10))}
            style={{ width: 160 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
          <span>SORT</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{
              padding: "7px 10px",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              color: "var(--ink)",
              fontSize: 13,
            }}
          >
            <option value="price-asc">Price · low to high</option>
            <option value="price-desc">Price · high to low</option>
            <option value="rating">Top rated</option>
            <option value="newest">Newest</option>
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" style={{
          padding: "var(--sp-3) var(--sp-4)",
          marginBottom: "var(--sp-4)",
          background: "var(--bad)",
          color: "var(--paper)",
          borderRadius: 8,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="vidya-grid-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="vidya-card-block"
              style={{ minHeight: 220, opacity: 0.5 }}
              aria-hidden
            />
          ))}
        </div>
      )}

      {filtered !== null && filtered.length === 0 && (
        <section style={{
          textAlign: "center",
          padding: "var(--sp-6) var(--sp-4)",
          background: "var(--card)",
          border: "1px solid var(--rule)",
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 36, marginBottom: "var(--sp-2)" }} aria-hidden>🔎</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
            No tutors match these filters
          </h2>
          <p style={{ margin: "var(--sp-2) auto var(--sp-3)", maxWidth: 460, fontSize: 13, color: "var(--ink-2)" }}>
            Try raising the price ceiling, clearing the search, or switching to "All tiers". New tutors join every week.
          </p>
          <button
            type="button"
            className="vidya-shell__chip"
            onClick={() => {
              setSearch("");
              setMaxRate(5000);
              setTierFilter("all");
            }}
          >
            Reset filters
          </button>
        </section>
      )}

      {filtered !== null && filtered.length > 0 && (
        <div className="vidya-grid-3">
          {filtered.map((t) => {
            const isPremium = t.tier === "PREMIUM_VERIFIED";
            const subjectCount = t.topicIds?.length ?? 0;
            return (
              <Link
                key={t.userId}
                to={`/tutors/${t.userId}`}
                className="vidya-card-block"
                style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column" }}
              >
                <div style={{
                  height: 110,
                  background: tintFor(t.userId),
                  borderRadius: "8px 8px 0 0",
                  margin: "calc(-1 * var(--sp-4)) calc(-1 * var(--sp-4)) var(--sp-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 48, fontWeight: 700,
                }}>
                  {initialFor(t.displayName)}
                </div>
                <div className="vidya-card-block__head">
                  <h3 className="vidya-card-block__title">{t.displayName}</h3>
                </div>
                <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "var(--sp-1) 0 var(--sp-2)" }}>
                  {t.headline ?? "Tutor on AdaptiveLearn."}
                </p>
                <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
                  <span className="vidya-shell__chip">📚 {subjectCount} subject{subjectCount === 1 ? "" : "s"}</span>
                  <span className={`vidya-shell__chip${isPremium ? " vidya-shell__chip--on" : ""}`}>
                    {isPremium ? "Premium verified" : "Standard tier"}
                  </span>
                </div>
                <div style={{
                  marginTop: "auto",
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  paddingTop: "var(--sp-3)", borderTop: "1px solid var(--rule)",
                }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>{paiseToRupees(t.hourlyRatePaise)}</strong>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>/hr</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {(t.ratingCount ?? 0) > 0 ? `★ ${t.ratingAvg?.toFixed(1) ?? "—"} (${t.ratingCount})` : "New tutor"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </VidyaShell>
  );
}
