// Sprint 18 (P3-S3) — Creator application page.
//
// Slimmer than TutorApply — no hourly rate, no availability, no topics.
// Course-level details are filled in CourseAuthor.tsx after activation.

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { creator } from "../lib/api";

export function CreatorApply() {
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await creator.apply({ displayName, headline, bio });
      nav("/creator");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Apply as a Creator">
      <main className="page" style={{ padding: 24, maxWidth: 760 }}>
        <h1>Creator application</h1>
        <p style={{ color: "var(--text-muted)" }}>
          Creators publish self-paced courses students buy individually. Per
          ADR-0008, courses must be priced ₹49–₹4,999. Identity verification is
          required before the first course can publish.
        </p>

        {error && <p className="banner banner-error">{error}</p>}

        <fieldset style={{ marginBottom: 16 }}>
          <legend>Profile</legend>
          <label>
            Display name{" "}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            Headline{" "}
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              required
              maxLength={240}
              placeholder="e.g. Author of 'JEE Mechanics in 30 days'"
            />
          </label>
          <label>
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={4000}
              rows={5}
              placeholder="What do you teach? Where have you taught? Optional but boosts trust."
            />
          </label>
        </fieldset>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !displayName || !headline}
          className="btn-primary"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </main>
    </AppShell>
  );
}
