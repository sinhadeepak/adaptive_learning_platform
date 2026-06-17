// Sprint 18 (P3-S3) — Creator application page.
//
// Slimmer than TutorApply — no hourly rate, no availability, no topics.
// Course-level details are filled in CourseAuthor.tsx after activation.

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { SectionHeader } from "../components/primitives";
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
    <AppShell
      title="Apply as a Creator"
      subtitle="Creators publish self-paced courses students buy individually. Per ADR-0008, courses must be priced ₹49–₹4,999. Identity verification is required before the first course can publish."
    >
      <div className="dash-section" style={{ maxWidth: 760 }}>
        {error && <p className="banner banner-error">{error}</p>}

        <SectionHeader label="Profile" />
        <div className="form-field">
          <label className="form-label">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={120}
            className="form-input"
          />
        </div>
        <div className="form-field">
          <label className="form-label">Headline</label>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            required
            maxLength={240}
            placeholder="e.g. Author of 'JEE Mechanics in 30 days'"
            className="form-input"
          />
        </div>
        <div className="form-field">
          <label className="form-label">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={4000}
            rows={5}
            placeholder="What do you teach? Where have you taught? Optional but boosts trust."
            className="form-input"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !displayName || !headline}
          className="btn btn-primary"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </AppShell>
  );
}