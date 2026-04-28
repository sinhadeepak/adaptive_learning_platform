// Sprint 18 (P3-S3) — Public course listing.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type CourseListingItem, courseMarketplace } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function Courses() {
  const [items, setItems] = useState<CourseListingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    courseMarketplace
      .list({ perPage: 50 })
      .then((d) => setItems(d.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main className="page" style={{ padding: 24, maxWidth: 960 }}>
      <h1>Self-paced courses</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Asynchronous content authored by community creators.{" "}
        <Link to="/bookings">Looking for live tutors instead? →</Link>
      </p>

      {error && <p className="banner banner-error">{error}</p>}
      {items === null && !error && <p>Loading…</p>}
      {items !== null && items.length === 0 && (
        <p>No published courses yet — check back soon.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((c) => (
            <li
              key={c.id}
              style={{
                padding: 16,
                border: "1px solid var(--border-faint)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <Link to={`/courses/${c.id}`} style={{ textDecoration: "none" }}>
                <h2 style={{ margin: 0 }}>{c.title}</h2>
                <p style={{ color: "var(--text-muted)", margin: "4px 0" }}>
                  {c.description}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>{paiseToRupees(c.pricePaise)}</strong>
                  {c.tier === "FREE" && " · Free"}
                  {c.tier === "PREMIUM" && (
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
                      Premium
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
