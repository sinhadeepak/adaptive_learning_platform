// Courses marketplace — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + title + subtitle + price-bucket chips +
// tutoring / my-purchases actions) → search/sort row → 3-col vidya-grid
// of vidya-card-block course cards with cover-or-gradient thumb,
// premium ribbon, description, self-paced + lifetime chips, price, and
// rating.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
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

const PRICE_BUCKETS: [PriceBucket, string][] = [
  ["all", "All prices"],
  ["free", "Free"],
  ["under-200", "Under ₹200"],
  ["200-500", "₹200–500"],
  ["500-plus", "₹500+"],
];

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
    <VidyaShell
      crumbs="MARKETPLACE · COURSES"
      title="Self-paced courses"
      subtitle="Asynchronous content authored by community creators. Work at your own pace; rate the course after you finish."
      chips={
        <>
          {PRICE_BUCKETS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`vidya-shell__chip${priceBucket === k ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setPriceBucket(k)}
            >
              {label}
            </button>
          ))}
        </>
      }
      actions={
        <>
          <Link to="/tutors" className="vidya-shell__chip">
            Live 1:1 tutoring →
          </Link>
          <Link to="/courses-mine" className="vidya-shell__chip">
            My purchases
          </Link>
        </>
      }
    >
      <div
        style={{
          display: "flex",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "var(--sp-4)",
        }}
      >
        <input
          type="search"
          placeholder="Search courses…"
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--ink-3)",
          }}
        >
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
            <option value="newest">Newest first</option>
            <option value="price-asc">Price · low to high</option>
            <option value="price-desc">Price · high to low</option>
            <option value="rating">Top rated</option>
          </select>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            marginBottom: "var(--sp-4)",
            background: "var(--bad)",
            color: "var(--paper)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="vidya-grid-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="vidya-card-block"
              style={{ minHeight: 280, opacity: 0.5 }}
              aria-hidden
            />
          ))}
        </div>
      )}

      {filtered !== null && filtered.length === 0 && (
        <section
          style={{
            textAlign: "center",
            padding: "var(--sp-6) var(--sp-4)",
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: "var(--sp-2)" }} aria-hidden>
            🎓
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
            {items && items.length === 0
              ? "No courses published yet"
              : "Nothing matches these filters"}
          </h2>
          <p
            style={{
              margin: "var(--sp-2) auto var(--sp-3)",
              maxWidth: 460,
              fontSize: 13,
              color: "var(--ink-2)",
            }}
          >
            {items && items.length === 0
              ? "New courses are added weekly. Check back soon, or try live 1:1 tutoring in the meantime."
              : "Try clearing the search or widening the price range."}
          </p>
          {items && items.length === 0 ? (
            <Link to="/tutors" className="vidya-shell__primary">
              Browse tutors instead
            </Link>
          ) : (
            <button
              type="button"
              className="vidya-shell__chip"
              onClick={() => {
                setSearch("");
                setPriceBucket("all");
              }}
            >
              Reset filters
            </button>
          )}
        </section>
      )}

      {filtered !== null && filtered.length > 0 && (
        <div className="vidya-grid-3">
          {filtered.map((c) => {
            const isPremium = c.tier === "PREMIUM";
            return (
              <Link
                key={c.id}
                to={`/courses/${c.id}`}
                className="vidya-card-block"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    height: 140,
                    background: c.coverImageUrl ? "none" : thumbFor(c.id),
                    borderRadius: "8px 8px 0 0",
                    margin:
                      "calc(-1 * var(--sp-4)) calc(-1 * var(--sp-4)) var(--sp-3)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c.coverImageUrl ? (
                    <img
                      src={c.coverImageUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ color: "#fff", fontSize: 48, fontWeight: 700 }}>
                      {initialFor(c.title)}
                    </div>
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
                <div className="vidya-card-block__head">
                  <h3 className="vidya-card-block__title">{c.title}</h3>
                </div>
                {c.description && c.description.trim() && c.description !== "—" ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2)",
                      margin: "var(--sp-1) 0 var(--sp-2)",
                    }}
                  >
                    {c.description}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-4)",
                      fontStyle: "italic",
                      margin: "var(--sp-1) 0 var(--sp-2)",
                    }}
                  >
                    No description provided.
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: "var(--sp-2)",
                    flexWrap: "wrap",
                    marginBottom: "var(--sp-3)",
                  }}
                >
                  <span className="vidya-shell__chip">⌛ Self-paced</span>
                  <span className="vidya-shell__chip">📜 Lifetime access</span>
                </div>
                <div
                  style={{
                    marginTop: "auto",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    paddingTop: "var(--sp-3)",
                    borderTop: "1px solid var(--rule)",
                  }}
                >
                  <strong style={{ fontSize: 18 }}>
                    {c.pricePaise === 0 ? "Free" : paiseToRupees(c.pricePaise)}
                  </strong>
                  {(c.ratingCount ?? 0) > 0 ? (
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      ★ {(c.ratingAvg ?? 0).toFixed(1)} ({c.ratingCount})
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>New</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </VidyaShell>
  );
}
