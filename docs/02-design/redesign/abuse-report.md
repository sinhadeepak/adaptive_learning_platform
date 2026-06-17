# Redesign brief — Abuse-Report Flow

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora-mobile.md) → Aurora v3
**Status:** Proposed
**Date:** 2026-05-14
**Wave / Sub-wave:** [Plan](../../../../.claude/plans/the-mobile-app-ui-cheerful-codd.md) Wave 2 W2.0.5
**Owner (TBD):** Trust & Safety lead + Mobile lead

---

## 1. Goal

Give every user a one-tap path to report any AI-generated or user-generated content they think violates the [content safety policy](../content-safety-policy.md). The flow should be fast (≤ 15 seconds median submit time) and never punish the user for reporting (no "are you sure" friction, no shame copy, no negative confirmation).

This is the **user-initiated** counterpart to the **automated** L1/L2 filter pipeline. Both feed the same moderator queue but with different priorities (`P1_USER_REPORT` here, `P0_SELF_HARM` / `P2_AUTO_FLAG` from the automated pipeline).

---

## 2. User / job-to-be-done

| User segment | The job |
|---|---|
| Kid | "Lumi said something weird; tell my parent / a grown-up." |
| Teen | "This answer is wrong / inappropriate; flag it." |
| Aspirant | "This information is misleading / outdated; flag for correction." |
| Learner | "This response is off-topic; flag." |

The flow shape is identical for all four personas — only the entry-point copy differs and the reason taxonomy adapts (e.g. Kid does not see "Talking about something political"; Aspirant does).

---

## 3. Entry points

| Surface | Trigger |
|---|---|
| Lumi message bubble | Long-press → context menu → "Report" |
| Doubt-detail answer | Tap kebab (⋮) → "Report" |
| Friends chat message | Long-press → context menu → "Report" |
| Cohort-leaderboard comment | Long-press → context menu → "Report" |
| Course review | Tap kebab (⋮) → "Report" |

Every surface that renders text from any source (AI or another user) must include a Report entry-point.

---

## 4. Composition map

| Region | Component |
|---|---|
| Sheet header (8%) | "Report this message" + close `×` |
| Quoted message preview (16%) | Greyed quote of the reported message (max 3 lines + ellipsis) |
| Reason picker (52%) | List of `AuroraRadio` options — see §4.1 |
| Free-text (optional, 16%) | `AuroraTextField` 200-char max, only revealed when "Something else" is picked |
| Footer (8%) | `AuroraButton.primary` "Submit report" (disabled until a reason is picked) + tertiary "Cancel" |

### 4.1 Reason taxonomy

Common across personas:

1. **Inappropriate language** (profanity, slurs)
2. **Wrong / misleading answer** (factual incorrectness)
3. **Asking for personal information** (request for phone / address / contact)
4. **Self-harm or distress** (someone seems to be hurting themselves) — surfaces helpline post-submit
5. **Something else** (free-text)

Persona-specific additions:

- Kid: "Saying something scary or mean"
- Aspirant: "Stating a political opinion as fact" + "Outdated / out-of-syllabus"
- Learner: "Off-topic for this course"

---

## 5. Wireframe (Compact 360 dp · Bottom sheet 80% height)

```
┌────────────────────────────────────────┐
│  Report this message              ✕    │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐    │
│  │  Lumi said:                    │    │
│  │  "You can find their phone     │    │
│  │   number on the school site…"  │    │
│  └────────────────────────────────┘    │
│                                        │
│  Why are you reporting?                │
│                                        │
│  ○  Inappropriate language             │
│  ○  Wrong / misleading answer          │
│  ●  Asking for personal info           │
│  ○  Self-harm or distress              │
│  ○  Something else                     │
│                                        │
│  ┌────────────────────────────────┐    │
│  │   Free text (200 chars)        │    │   ← revealed only on "Something else"
│  └────────────────────────────────┘    │
│                                        │
├────────────────────────────────────────┤
│       ┌────────────────────────┐       │
│       │    Submit report       │       │
│       └────────────────────────┘       │
│           Cancel                       │
└────────────────────────────────────────┘
```

---

## 6. States

| State | Visual |
|---|---|
| Open (no reason picked) | Submit disabled; reason list normal weight |
| Reason picked | Submit enabled; picked radio in `colors.brand600` |
| "Something else" picked | Free-text field reveals via 200 ms slide; cursor focuses automatically |
| Submitting | Submit shows spinner; sheet dims |
| Submitted successfully | Sheet auto-closes; `AuroraSnackbar.success` "Thanks, we'll review within 24h · #REP-12345" |
| Submitted (self-harm reason) | Sheet auto-closes; immediately push [`AuroraSafetyHelplineSheet`](../../apps/mobile/lib/aurora/widgets/aurora_safety_helpline_sheet.dart) with the iCall / Vandrevala numbers |
| Server error | `AuroraSnackbar.error` "Couldn't submit. Try again." + sheet stays open with form preserved |

---

## 7. Voice (locale: en-IN)

| Slot | Copy |
|---|---|
| Sheet title | "Report this message" |
| Sub | "Why are you reporting?" |
| Reason 1 | "Inappropriate language" |
| Reason 2 | "Wrong / misleading answer" |
| Reason 3 | "Asking for personal information" |
| Reason 4 | "Self-harm or distress" |
| Reason 5 | "Something else" |
| Kid addition | "Saying something scary or mean" |
| Aspirant addition 1 | "Stating political opinion as fact" |
| Aspirant addition 2 | "Outdated / out-of-syllabus" |
| Learner addition | "Off-topic for this course" |
| Free-text placeholder | "Tell us more (optional, 200 chars)" |
| Submit | "Submit report" |
| Cancel | "Cancel" |
| Success toast | "Thanks, we'll review within 24h · #{report_id}" |
| Error toast | "Couldn't submit. Try again." |

Localised through `AuroraVoice.report.<slot>` — landed in W2.12 / W3.8.

---

## 8. Server interaction

```
POST /moderation/reports
Headers: Authorization: Bearer <jwt>
Body:
  {
    message_id: string,       // "msg_abc123" — the reported content's id
    surface: enum,            // "lumi" | "doubt_answer" | "friends_chat" | "leaderboard_comment" | "course_review"
    reason: enum,             // see §4.1
    free_text?: string,       // present iff reason == "something_else"
    persona: enum,
    locale: string,
    app_version: string,
    reported_at: ISO-8601
  }
Response 201:
  {
    report_id: string,         // "REP-12345" — surfaced in success toast
    sla_response_at: ISO-8601, // +24h
    next_steps: string         // human-readable, e.g. "We'll review and follow up here"
  }
```

Owned by the new `alp-moderation` service (W2.0.5 backend work). The mobile client is forward-compatible with HTTP 503 fallback (stores the report locally and retries via background isolate).

---

## 9. Accessibility

- Reason radios: `Semantics(label: …, inMutuallyExclusiveGroup: true, checked: bool)`.
- Quoted message preview is `Semantics(label: 'Reported message: <content>')`.
- Long-press entry-point on Lumi bubbles has a visible alternative: a kebab (⋮) icon for users who can't long-press.
- Tab order: Reason 1 → … → Reason N → Free-text (if visible) → Submit → Cancel.
- Reduce Motion: free-text reveal becomes instant.

---

## 10. Analytics events

| Event | Trigger |
|---|---|
| `abuse_report_opened` | Sheet mounted — `{surface, message_id}` |
| `abuse_report_reason_picked` | Reason selected — `{reason}` |
| `abuse_report_submitted` | Successful submit — `{reason, has_free_text: bool, time_on_sheet_ms}` |
| `abuse_report_failed` | Server error — `{error_code}` |
| `abuse_report_cancelled` | User closed without submitting — `{reason_picked: bool}` |

---

## 11. Edge cases & decisions

1. **What if the user reports the same message twice?** Server returns 200 with the existing `report_id`. No new ticket created.
2. **What if a user mass-reports (spam)?** Server rate-limits: max 10 reports / user / hour. 11th submit gets `429` with "You've reported a lot recently — give us time to catch up." The account is auto-flagged for moderator review.
3. **What if the network is offline?** Client persists the report locally (Drift `pending_reports` table) and retries on reconnect. Success toast appears only when the server returns 201.
4. **Can a user un-report?** No — reports are immutable. The moderator outcome (e.g. "left up with note") is the resolution. If the user changes their mind, they can submit a new report under "Something else" with free-text "Withdrawing my earlier report."
5. **Does the reportee know they were reported?** No — reportee identity is not surfaced to the reporter and vice versa.

---

## 12. Dependencies

- `AuroraButton`, `AuroraSnackbar`, `AuroraTextField`, `AuroraRadio` — shipped under `aurora/widgets/`.
- `AuroraSafetyHelplineSheet` — shipped in W2.0.5.
- `POST /moderation/reports` endpoint — owned by new `alp-moderation` service (W2.0.5 backend).
- `AuroraVoice` keys under `report.<slot>` — shipped in W2.0.5.

---

## 13. Verification checklist

- [ ] Long-press entry-point visible on every surface listed in §3.
- [ ] Median submit time ≤ 15 s (measured via `abuse_report_submitted.time_on_sheet_ms`).
- [ ] Self-harm reason triggers helpline sheet within 200 ms after submit.
- [ ] Mass-report rate limit (10/h) verified.
- [ ] Offline submit retries on reconnect.
- [ ] Screen-reader walkthrough passes on TalkBack + VoiceOver.
- [ ] No PII (reporter name, reportee name) appears in any client log.
