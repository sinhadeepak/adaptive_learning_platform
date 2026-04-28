// Sprint 17 (P3-S2) — Public tutor listing.
//
// Filters: max-rate slider. Topic filter is reserved for later
// (we don't yet have the topic-id picker on this surface).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type TutorListingItem, marketplace } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function Tutors() {
  const [items, setItems] = useState<TutorListingItem[] | null>(null);
  const [maxRate, setMaxRate] = useState<number>(5000);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    marketplace
      .listTutors({ maxHourlyPaise: maxRate * 100, perPage: 50 })
      .then((d) => setItems(d.items))
      .catch((e) => setError((e as Error).message));
  }, [maxRate]);

  return (
    <main className="page" style={{ padding: 24, maxWidth: 960 }}>
      <h1>Find a tutor</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Browse active tutors. Click a tutor to see their profile and book a session.
      </p>

      <div style={{ margin: "16px 0" }}>
        <label>
          Max hourly rate: {paiseToRupees(maxRate * 100)}{" "}
          <input
            type="range"
            min={100}
            max={5000}
            step={100}
            value={maxRate}
            onChange={(e) => setMaxRate(parseInt(e.target.value, 10))}
          />
        </label>
      </div>

      {error && <p className="banner banner-error">{error}</p>}
      {items === null && !error && <p>Loading…</p>}
      {items !== null && items.length === 0 && (
        <p>No active tutors yet matching your filters.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((t) => (
            <li
              key={t.userId}
              style={{
                padding: 16,
                border: "1px solid var(--border-faint)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <Link to={`/tutors/${t.userId}`} style={{ textDecoration: "none" }}>
                <h2 style={{ margin: 0 }}>{t.displayName}</h2>
                <p style={{ color: "var(--text-muted)", margin: "4px 0" }}>
                  {t.headline}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>{paiseToRupees(t.hourlyRatePaise)}</strong>/hr
                  {t.tier === "PREMIUM_VERIFIED" && (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 6px",
                        background: "var(--color-blue, #4F87F6)",
                        color: "white",
                        fontSize: 11,
                        borderRadius: 4,
                      }}
                    >
                      Premium verified
                    </span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
