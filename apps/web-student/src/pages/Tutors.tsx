// Tutors marketplace — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → pg-filter-row (search + sort + price)
// → pg-grid of pg-card tutor cards with avatar, rate, subjects, rating.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
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
    <AppShell title="Find a tutor">
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Find a tutor</h1>
            <p className="pg-header-sub">
              Browse vetted 1:1 tutors. Filter by price and seniority; tap any
              card to see qualifications, weekly availability, and book a
              session.
            </p>
          </div>
          <div className="pg-header-actions">
            <Link to="/bookings" className="pg-btn pg-btn-ghost">
              My bookings
            </Link>
          </div>
        </header>

        <div className="pg-filter-row">
          <div className="pg-search">
            <span className="pg-search-icon">⌕</span>
            <input
              className="pg-search-input"
              placeholder="Search by name or expertise…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="pg-filter-chips">
            {(["all", "premium", "standard"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`pg-chip${tierFilter === t ? " on" : ""}`}
                onClick={() => setTierFilter(t)}
              >
                {t === "all" ? "All tiers" : t === "premium" ? "Premium verified" : "Standard"}
              </button>
            ))}
          </div>
          <div className="pg-range" title={`Max hourly rate: ${paiseToRupees(maxRate * 100)}`}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Max ₹{maxRate.toLocaleString("en-IN")}
            </span>
            <input
              type="range"
              className="pg-range-input"
              min={100}
              max={5000}
              step={100}
              value={maxRate}
              onChange={(e) => setMaxRate(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="pg-filter-sort">
            <span className="pg-filter-label">Sort</span>
            <select
              className="pg-filter-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="price-asc">Price · low to high</option>
              <option value="price-desc">Price · high to low</option>
              <option value="rating">Top rated</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        {error && <p className="banner banner-error">{error}</p>}

        {items === null && !error && (
          <div className="pg-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="pg-card"
                style={{ minHeight: 220, opacity: 0.5 }}
                aria-hidden
              />
            ))}
          </div>
        )}

        {filtered !== null && filtered.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">🔎</div>
            <h2 className="pg-empty-title">No tutors match these filters</h2>
            <p className="pg-empty-body">
              Try raising the price ceiling, clearing the search, or switching
              to "All tiers". New tutors join every week.
            </p>
            <button
              type="button"
              className="pg-btn pg-btn-ghost"
              onClick={() => {
                setSearch("");
                setMaxRate(5000);
                setTierFilter("all");
              }}
            >
              Reset filters
            </button>
          </div>
        )}

        {filtered !== null && filtered.length > 0 && (
          <div className="pg-grid">
            {filtered.map((t) => {
              const isPremium = t.tier === "PREMIUM_VERIFIED";
              const subjectCount = t.topicIds?.length ?? 0;
              return (
                <Link key={t.userId} to={`/tutors/${t.userId}`} className="pg-card">
                  <div
                    className="pg-card-thumb"
                    style={{ background: tintFor(t.userId), height: 110 }}
                  >
                    <div className="pg-card-thumb-letter">
                      {initialFor(t.displayName)}
                    </div>
                    {isPremium && (
                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          padding: "3px 8px",
                          background: "rgba(255,255,255,0.95)",
                          color: "#000",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          borderRadius: 999,
                          textTransform: "uppercase",
                        }}
                      >
                        ★ Verified
                      </div>
                    )}
                  </div>
                  <div className="pg-card-body">
                    <h2 className="pg-card-title">{t.displayName}</h2>
                    <p className="pg-card-desc">
                      {t.headline || "Tutor on AdaptiveLearn."}
                    </p>
                    <div className="pg-card-meta">
                      {subjectCount > 0 && (
                        <span className="pg-card-meta-pill">
                          📚 {subjectCount} subject{subjectCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {isPremium ? (
                        <span className="pg-card-meta-pill" style={{ color: "var(--color-blue)" }}>
                          Premium tier
                        </span>
                      ) : (
                        <span className="pg-card-meta-pill">Standard tier</span>
                      )}
                    </div>
                  </div>
                  <div className="pg-card-foot">
                    <span className="pg-card-price">
                      {paiseToRupees(t.hourlyRatePaise)}
                      <span className="pg-card-price-unit"> /hr</span>
                    </span>
                    {(t.ratingCount ?? 0) > 0 ? (
                      <span className="pg-card-rating">
                        <span className="pg-card-rating-star">★</span>
                        {(t.ratingAvg ?? 0).toFixed(1)}
                        <span style={{ color: "var(--text-faint)" }}>
                          ({t.ratingCount})
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                        New tutor
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
