# Redesign brief — Data Export + Account Deletion (DPDP §11 + §13)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora-mobile.md) → Aurora v3
**Status:** Proposed
**Date:** 2026-05-14
**Wave / Sub-wave:** [Plan](../../../../.claude/plans/the-mobile-app-ui-cheerful-codd.md) Wave 2 W2.0.5
**Owner (TBD):** Legal lead + Mobile lead + Privacy engineering

---

## 1. Goal

Surface the two non-negotiable DPDP rights — **access** (§11 — "Download my data") and **erasure** (§13 — "Delete my account") — as discoverable, low-friction flows from Settings → Privacy. The flows are independent: a user may export without deleting, or delete without first exporting. Both are auditable and produce a tamper-evident record.

This brief covers **two flows in one surface area** because they share the same legal framework and the same Settings sub-page. They're intentionally adjacent so a user considering deletion sees the export option first.

---

## 2. User / job-to-be-done

| Job | Trigger context |
|---|---|
| "I want a copy of everything you have on me" | Curiosity, mid-life data audit, switching providers, parent verifying their kid's data |
| "I want you to forget me entirely" | Privacy concern, content moderation dispute, kid graduating out of the app, generic GDPR-style hygiene |
| "I want to know what happens if I delete" | Risk-aware user reading the fine print before deciding |

The flows must be **boring** — no dark patterns, no "are you sure you want to lose your streak", no win-back retention messaging. DPDP §13 specifically prohibits adding friction to a deletion request.

---

## 3. Composition map · Settings → Privacy → Data export

| Region | Components |
|---|---|
| Top | `AuroraAppBar` "Your data" + back |
| Section A — Export | Card with: title "Download my data", body explaining what's included, primary button "Request download", muted body about delivery time + format |
| Section B — Past exports | List of previous exports (date · status · download link, valid 7 days) — empty state when never used |
| Section C — Delete account | Card with: title "Delete my account", body explaining the 30-day cooling period + what's deleted vs preserved (legal obligations), danger-variant button "Start deletion" |

The danger button uses `AuroraButton.danger` (not red on first paint — it's brand-aware, derives from `colors.danger600`) and confirms via a typed-name challenge.

---

## 4. Export flow

### 4.1 Request

1. User taps **"Request download"**.
2. Modal sheet appears: "We'll prepare your data and send a download link to <your-email-on-file>. Ready in up to 30 days (usually under 24 hours)."
3. User taps **"Send me the link"** → `POST /identity/exports`.
4. Sheet closes; Section B gets a new row: "Requested · processing · 2026-05-14 14:22".

### 4.2 What's included

Per DPDP §11(1), the export contains all "personal data being processed" — concretely:

| Category | Format |
|---|---|
| Profile fields (name, email, DOB month/year, exam preferences, locale, persona) | `profile.json` |
| Consent records (every consent + withdrawal with timestamps) | `consent_history.json` |
| Quiz session history (sessions, items, answers, scores, timings) | `quiz_sessions.csv` + per-session JSONL |
| Mastery / readiness / streak telemetry | `mastery_history.csv` |
| Doubts asked + Lumi responses | `doubts.jsonl` (with `[redacted]` markers for moderation-flagged content) |
| Notification preferences | `notification_preferences.json` |
| Activity log (90 days of in-app events) | `activity_90d.jsonl` |
| Uploaded artefacts (photo doubts, profile picture) | `uploads/` directory |
| Linked institution / family-plan relationships | `relationships.json` |
| Billing history (invoices, subscription state) | `billing.json` |

What is **not** included (because it's not personal data per DPDP §2(t)):

- Aggregated cohort statistics where the user is one of many.
- Server logs scrubbed of PII.
- Model training data (we do not train on user content per the Privacy Policy).

### 4.3 Delivery

- Server prepares a ZIP, encrypts with AES-256 using a one-time key, uploads to S3 with 7-day pre-signed URL.
- Email sent to user's verified email address with the URL + the AES key separately (defense in depth).
- Server records `export_id`, `requested_at`, `delivered_at`, `key_hash` in `identity_schema.export_records` (retained 5 years for audit).
- App's Section B updates to show "Ready · download (expires 2026-05-21)".

### 4.4 SLA

Per DPDP §11(2), 30 days. Operational target: < 24 hours for accounts under 100 MB; < 72 hours for larger. The "Ready in up to 30 days" copy sets legal expectation; the in-app status row shows the real ETA when known.

---

## 5. Deletion flow

### 5.1 Request

1. User taps **"Start deletion"** in Section C.
2. Full-screen confirmation route opens (not a modal — this is a serious action and we don't want the user to dismiss accidentally with a back-tap).
3. Confirmation route shows:
   - H2 "Delete my ALP account?"
   - List of consequences (see §5.2)
   - Typed-name challenge: "Type your account name to confirm: ____" (compares to `profile.full_name`, case-insensitive, whitespace-collapsed).
   - `AuroraButton.danger` "Delete account" (disabled until name matches).
   - `AuroraButton.tertiary` "Cancel" (returns to Section C).
4. On confirm: `POST /identity/deletions`. Server returns `{deletion_id, cooling_off_ends_at: <now + 30 days>}`.
5. Screen replaces with a confirmation: "Account scheduled for deletion. You have 30 days to reverse this. We've emailed you the details." + button "Back to settings".

### 5.2 Consequences (shown in confirmation route)

Plain-English bullets:

- **What you lose**: all progress, streaks, badges, certificates, doubts, notes, friends, league position, billing history.
- **What we keep for legal reasons**: hashed billing records (7 years, Income Tax Act 1961), grievance-officer correspondence (1 year, IT Rules 2021), the deletion request itself (5 years, audit trail).
- **30-day cooling period**: account is hidden from you and from search; log-in shows a "Restore your account" prompt; logging in restores. After 30 days, deletion is irreversible.
- **Subscriptions**: auto-cancel; refunds per the Refund Policy.
- **Family-plan members**: a Kid member's deletion notifies the parent admin; a parent admin's deletion archives the whole family plan after the cooling period.

### 5.3 Cooling period

- During 30 days, the account is in `state=pending_deletion`. Login is allowed only via the "Restore your account" deep link.
- After 30 days, a scheduled job runs:
  1. Soft-delete in PostgreSQL (`profile.deleted_at = now`, `email` and `name` overwritten with `deleted-<uuid>` hashes).
  2. Hard-delete from event streams (NATS JetStream tombstone), Redis cache, OpenSearch index.
  3. Hard-delete S3 uploads.
  4. Anonymise the user_id in analytics (`hashed_user_id` replaced with a deletion sentinel).
  5. Write `deletion_completed_at` to `identity_schema.deletion_records`.

### 5.4 SLA

Per DPDP §13(2), 30 days from the end of the cooling period (so total ≤ 60 days from request). Operational target: deletion completed within 7 days of cooling-period end.

---

## 6. Wireframe — Settings → Your data

```
┌────────────────────────────────────────┐
│ ←   Your data                          │
├────────────────────────────────────────┤
│  Download my data                      │
│  ─────────────────                     │
│  Get a copy of everything we hold      │
│  about you. We'll email a download     │
│  link, ready in up to 30 days.         │
│                                        │
│  ┌────────────────────────────────┐    │
│  │      Request download          │    │
│  └────────────────────────────────┘    │
│                                        │
├────────────────────────────────────────┤
│  Past exports                          │
│  ─────────────                         │
│  • 2026-04-12 · ready · download ↓     │
│    (expires 2026-04-19)                │
│  • 2026-02-03 · expired                │
│                                        │
├────────────────────────────────────────┤
│  Delete my account                     │
│  ─────────────────                     │
│  Schedule permanent deletion. You'll   │
│  have 30 days to change your mind.     │
│                                        │
│  ┌────────────────────────────────┐    │
│  │       Start deletion           │    │   ← danger variant
│  └────────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘
```

### Deletion confirmation route

```
┌────────────────────────────────────────┐
│ ←                                      │
│                                        │
│  Delete my ALP account?                │
│                                        │
│  What you lose:                        │
│   • All progress, streaks, badges      │
│   • Certificates and notes             │
│   • Doubts and Lumi conversations      │
│   • Friends and league position        │
│                                        │
│  What we keep (legal):                 │
│   • Hashed billing records · 7 yrs     │
│   • Deletion request · 5 yrs           │
│                                        │
│  30-day cooling period — log in to     │
│  restore until 2026-06-13.             │
│                                        │
│  Type your account name to confirm:    │
│  ┌────────────────────────────────┐    │
│  │  Deepak Sinha                  │    │
│  └────────────────────────────────┘    │
│                                        │
│  ┌────────────────────────────────┐    │
│  │       Delete account           │    │   ← danger; enabled when match
│  └────────────────────────────────┘    │
│        Cancel                          │
└────────────────────────────────────────┘
```

---

## 7. States

| Surface | State | Visual |
|---|---|---|
| Section A | Idle | "Request download" enabled |
| Section A | In-flight | Button shows spinner; subtext "Sending…" |
| Section A | Recent request in last 24h | Button disabled with helper "You requested an export at 14:22 — wait until it's ready before requesting again." |
| Section B | Empty | "No exports yet" plus prompt |
| Section B | Ready | Row with download icon + expiry; tap streams the file via system download manager |
| Section B | Expired | Row with grey expired chip; download link removed |
| Section C button | Idle | Danger variant, enabled |
| Section C button | Already pending deletion | Replaced with banner "Deletion scheduled — completes 2026-06-13" + button "Cancel deletion" |
| Confirmation route | Idle | Name field empty, Delete button disabled |
| Confirmation route | Name matched | Delete button enabled with `colors.danger600` |
| Confirmation route | Submitting | Delete shows spinner; rest dims |
| Confirmation route | Done | Replaces with success state + email-sent confirmation |

---

## 8. Voice (locale: en-IN)

| Slot | Copy |
|---|---|
| AppBar | "Your data" |
| Section A title | "Download my data" |
| Section A body | "Get a copy of everything we hold about you. We'll email a download link, ready in up to 30 days." |
| Section A button | "Request download" |
| Section A throttled helper | "You requested an export at {time} — wait until it's ready before requesting again." |
| Section B title | "Past exports" |
| Section B empty | "No exports yet." |
| Section C title | "Delete my account" |
| Section C body | "Schedule permanent deletion. You'll have 30 days to change your mind." |
| Section C button | "Start deletion" |
| Section C pending banner | "Deletion scheduled — completes {date}." + "Cancel deletion" |
| Confirm H2 | "Delete my ALP account?" |
| Confirm losses heading | "What you lose:" |
| Confirm keeps heading | "What we keep (legal):" |
| Confirm cooling note | "30-day cooling period — log in to restore until {date}." |
| Confirm name prompt | "Type your account name to confirm:" |
| Confirm Delete button | "Delete account" |
| Confirm Cancel | "Cancel" |
| Submitted success | "Account scheduled for deletion. You have 30 days to reverse this. We've emailed you the details." |

Localised through `AuroraVoice.privacy.<slot>` — landed in W2.12 / W3.8.

---

## 9. Server interaction

| Endpoint | Verb | Payload | Response |
|---|---|---|---|
| `/identity/exports` | POST | (auth only) | `{export_id, requested_at, eta_at}` |
| `/identity/exports` | GET | (auth only) | `{exports: [...]}` (history list) |
| `/identity/exports/{id}/download` | GET | (auth only, presigned-URL-redirect) | 302 to S3 pre-signed URL |
| `/identity/deletions` | POST | `{typed_name}` | `{deletion_id, cooling_off_ends_at}` |
| `/identity/deletions/{id}` | DELETE | (auth only) | 200 — cancels a pending deletion |

Owned by `alp-identity` service. Endpoints are signed via JWT; deletion endpoint additionally requires the `MFA_ELEVATED` claim (re-authentication within last 5 minutes) — this is in addition to the typed-name challenge.

---

## 10. Accessibility

- "Start deletion" button has `Semantics(label: 'Start account deletion', hint: 'Opens a confirmation screen — does not delete immediately')`.
- The typed-name input announces its character-match state to screen readers via a live region: "Name does not match" / "Name matches — Delete enabled".
- Confirmation route is `Semantics(scopesRoute: true, label: 'Confirm account deletion')` so screen-reader users get the context.
- All danger styling has a non-color secondary cue (icon + bold weight) for colour-blind users.
- Reduce Motion: no transitions on state changes.

---

## 11. Analytics events

| Event | Trigger | Props |
|---|---|---|
| `privacy_screen_viewed` | Settings → Your data mounted | |
| `export_requested` | POST /exports returns 201 | `{export_id}` |
| `export_downloaded` | User taps download row | `{export_id, age_hours}` |
| `export_expired_viewed` | User sees an expired row | `{export_id}` |
| `deletion_confirm_screen_viewed` | Confirmation route mounted | |
| `deletion_requested` | POST /deletions returns 201 | `{deletion_id}` |
| `deletion_cancelled` | DELETE /deletions/{id} returns 200 | `{deletion_id, days_into_cooling}` |
| `deletion_completed` | Background event — completion landed | (server-emitted) |

Note: per DPDP minimisation, these events do **not** carry the typed-name input or any deletion-reason. They confirm only the lifecycle stage.

---

## 12. Edge cases & decisions

1. **What if the user logs in during cooling period?** A modal appears: "Your account is scheduled for deletion on {date}. Restore now?" with `Restore` and `Continue to delete` buttons. No further app surfaces open until they choose.
2. **What if the user has an active subscription?** Cancellation runs on deletion request (not on completion). Pro-rated refund per the Refund Policy is queued for the next billing cycle.
3. **What if the user is a Kid persona under parent control?** The parent must initiate deletion via the parent dashboard. The Settings → Privacy route is hidden for Kid persona.
4. **What if the user is the admin of a family-plan or corporate-seat?** Deletion is blocked with explanation: "You're the admin of {n} accounts. Transfer admin rights or close the plan first."
5. **What about backup retention?** Backups age out per the standard 30-day rolling backup policy; deletion completion waits until all backup generations have rotated through, so the user is fully gone within 60 days.
6. **What if the export request keeps failing server-side?** After 3 retries, server emails the user: "We're having trouble preparing your export. Our team has been notified — we'll get back to you within 7 days." DPDP-compliant communication.

---

## 13. Dependencies

- `AuroraButton.danger` variant — shipped in `aurora/widgets/aurora_button.dart`.
- `AuroraTextField` — shipped.
- `MFA_ELEVATED` JWT claim flow — owned by `alp-identity`; existing 2FA refresh endpoint already supports it.
- `POST /identity/exports`, `POST /identity/deletions` — owned by `alp-identity`; contracts published before W2.0.5 ships.
- `AuroraVoice.privacy.<slot>` keys — landed in W2.0.5.

---

## 14. Verification checklist

- [ ] Export request → email arrives with both download URL + AES key (separately) → ZIP downloads → unzip + open every file listed in §4.2.
- [ ] Deletion request → cooling banner appears → log-in restores → repeat → cooling completes → account is gone from all surfaces.
- [ ] Typed-name challenge rejects whitespace mismatches and case-mismatches with helpful copy.
- [ ] Family-plan admin deletion blocked with explanation.
- [ ] Screen-reader walkthrough on TalkBack + VoiceOver passes.
- [ ] No PII appears in any analytics event payload.
- [ ] All danger styling has icon + weight cues (color-blind safe).
- [ ] Legal sign-off on every consent-related string.
