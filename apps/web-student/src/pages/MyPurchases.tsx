// Sprint 18 (P3-S3) — Student's course purchases + access links + rate.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type Purchase, courseMarketplace } from "../lib/api";

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function MyPurchases() {
  const [items, setItems] = useState<Purchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    courseMarketplace
      .myPurchases()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }
  useEffect(refresh, []);

  async function rate(p: Purchase) {
    const stars = parseInt(window.prompt("Rate the course (1–5 stars):") || "0", 10);
    if (!(stars >= 1 && stars <= 5)) return;
    const comment = window.prompt("Optional comment:") || undefined;
    try {
      await courseMarketplace.rate(p.courseId, p.id, stars, comment);
      alert("Thanks! Your rating is in.");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 760 }}>
      <h1>My courses</h1>
      <p>
        <Link to="/courses">Browse more courses</Link>
      </p>

      {error && <p className="banner banner-error">{error}</p>}
      {items === null && !error && <p>Loading…</p>}
      {items !== null && items.length === 0 && <p>No purchases yet.</p>}

      {items !== null && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((p) => (
            <li
              key={p.id}
              style={{
                padding: 16,
                border: "1px solid var(--border-faint)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <p style={{ margin: 0, color: "var(--text-muted)" }}>
                Course <code>{p.courseId.slice(0, 8)}…</code> ·{" "}
                {paiseToRupees(p.pricePaise)} · <strong>{p.status}</strong>
              </p>
              {p.status === "PAID" && (
                <div style={{ marginTop: 8 }}>
                  <Link to={`/courses/${p.courseId}/read`}>Open course →</Link>{" "}
                  <button type="button" onClick={() => rate(p)} style={{ marginLeft: 8 }}>
                    Rate
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
