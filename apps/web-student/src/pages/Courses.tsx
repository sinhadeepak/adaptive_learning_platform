// Courses marketplace — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → pg-filter-row → pg-grid of pg-cards.
// Each course card uses a subject-themed gradient thumbnail (derived
// from a hash of the course id) with the title initial laid over it —
// matches the visual language of the Tutors page.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type CourseListingItem, courseMarketplace } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

const THUMB_GRADIENTS = [
  "linear-gradient(135deg, #4F87F6, #A78BFA)",
  "linear-gradient(135deg, #22D4EE, #4F87F6)",
  "linear-gradient(135deg, #10C47A, #22D4EE)",
  "linear-gradient(135deg, #F5A623, #F43F5E)",
  "linear-gradient(135deg, #A78BFA, #F472B6)",
  "linear-gradient(135deg, #FB923C, #A78BFA)",
];

function thumbFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return THUMB_GRADIENTS[h % THUMB_GRADIENTS.length];
}

function initialFor(title: string): string {
  return title.trim().slice(0, 1).toUpperCase() || "C";
}

type SortKey = "newest" | "price-asc" | "price-desc" | "rating";
type PriceBucket = "all" | "free" | "under-200" | "200-500" | "500-plus";

export function Courses() {
  const [items, setItems] = useState<CourseListingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [priceBucket, setPriceBucket] = useState<PriceBucket>("all");

  useEffect(() => {
    courseMarketplace
      .list({ perPage: 50 })
      .then((d) => setItems(d.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    let out = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q),
      );
    }
    if (priceBucket !== "all") {
      out = out.filter((c) => {
        const r = c.pricePaise / 100;
        if (priceBucket === "free") return r === 0;
        if (priceBucket === "under-200") return r > 0 && r < 200;
        if (priceBucket === "200-500") return r >= 200 && r <= 500;
        if (priceBucket === "500-plus") return r > 500;
        return true;
      });
    }
    out.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return a.pricePaise - b.pricePaise;
        case "price-desc":
          return b.pricePaise - a.pricePaise;
        case "rating":
          return (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0);
        case "newest":
        default:
          return 0;
      }
    });
    return out;
  }, [items, search, priceBucket, sort]);

  return (
    <AppShell title="Self-paced courses">
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Self-paced courses</h1>
            <p className="pg-header-sub">
              Asynchronous content authored by community creators. Work at
              your own pace; rate the course after you finish.
            </p>
          </div>
          <div className="pg-header-actions">
            <Link to="/tutors" className="pg-btn pg-btn-ghost">
              Live 1:1 tutoring →
            </Link>
            <Link to="/courses-mine" className="pg-btn pg-btn-subtle">
              My purchases
            </Link>
          </div>
        </header>

        <div className="pg-filter-row">
          <div className="pg-search">
            <span className="pg-search-icon">⌕</span>
            <input
              className="pg-search-input"
              placeholder="Search courses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="pg-filter-chips">
            {(
              [
                ["all", "All prices"],
                ["free", "Free"],
                ["under-200", "Under ₹200"],
                ["200-500", "₹200–500"],
                ["500-plus", "₹500+"],
              ] as [PriceBucket, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`pg-chip${priceBucket === k ? " on" : ""}`}
                onClick={() => setPriceBucket(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pg-filter-sort">
            <span className="pg-filter-label">Sort</span>
            <select
              className="pg-filter-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="newest">Newest first</option>
              <option value="price-asc">Price · low to high</option>
              <option value="price-desc">Price · high to low</option>
              <option value="rating">Top rated</option>
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
                style={{ minHeight: 280, opacity: 0.5 }}
                aria-hidden
              />
            ))}
          </div>
        )}

        {filtered !== null && filtered.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">🎓</div>
            <h2 className="pg-empty-title">
              {items && items.length === 0
                ? "No courses published yet"
                : "Nothing matches these filters"}
            </h2>
            <p className="pg-empty-body">
              {items && items.length === 0
                ? "New courses are added weekly. Check back soon, or try live 1:1 tutoring in the meantime."
                : "Try clearing the search or widening the price range."}
            </p>
            {items && items.length === 0 ? (
              <Link to="/tutors" className="pg-btn pg-btn-primary">
                Browse tutors instead
              </Link>
            ) : (
              <button
                type="button"
                className="pg-btn pg-btn-ghost"
                onClick={() => {
                  setSearch("");
                  setPriceBucket("all");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        )}

        {filtered !== null && filtered.length > 0 && (
          <div className="pg-grid">
            {filtered.map((c) => {
              const isPremium = c.tier === "PREMIUM";
              return (
                <Link key={c.id} to={`/courses/${c.id}`} className="pg-card">
                  <div
                    className="pg-card-thumb"
                    style={{ background: c.coverImageUrl ? "none" : thumbFor(c.id) }}
                  >
                    {c.coverImageUrl ? (
                      <img
                        src={c.coverImageUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div className="pg-card-thumb-letter">{initialFor(c.title)}</div>
                    )}
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
                        ★ Premium
                      </div>
                    )}
                  </div>
                  <div className="pg-card-body">
                    <h2 className="pg-card-title">{c.title}</h2>
                    {c.description && c.description.trim() && c.description !== "—" ? (
                      <p className="pg-card-desc">{c.description}</p>
                    ) : (
                      <p className="pg-card-desc" style={{ fontStyle: "italic", color: "var(--ink-4)" }}>
                        No description provided.
                      </p>
                    )}
                    <div className="pg-card-meta">
                      <span className="pg-card-meta-pill">
                        ⌛ Self-paced
                      </span>
                      <span className="pg-card-meta-pill">
                        📜 Lifetime access
                      </span>
                    </div>
                  </div>
                  <div className="pg-card-foot">
                    <span className="pg-card-price">
                      {c.pricePaise === 0 ? "Free" : paiseToRupees(c.pricePaise)}
                    </span>
                    {(c.ratingCount ?? 0) > 0 ? (
                      <span className="pg-card-rating">
                        <span className="pg-card-rating-star">★</span>
                        {(c.ratingAvg ?? 0).toFixed(1)}
                        <span style={{ color: "var(--ink-4)" }}>
                          ({c.ratingCount})
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                        New
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