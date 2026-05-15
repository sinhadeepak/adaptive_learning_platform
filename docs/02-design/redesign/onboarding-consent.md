# Redesign brief — Onboarding · Consent (DPDP + COPPA-equivalent)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora-mobile.md) → Aurora v3
**Status:** Proposed
**Date:** 2026-05-14
**Wave / Sub-wave:** [Plan](../../../../.claude/plans/the-mobile-app-ui-cheerful-codd.md) Wave 2 W2.0.5
**Owner (TBD):** Design lead + Legal lead + Mobile lead

---

## 1. Goal

Capture **explicit, informed, granular consent** for personal-data processing and AI interaction in a single screen between Persona Select and Welcome. Without a stored consent record, no Lumi surface activates and no analytics events with persona attribution are emitted.

The screen has three distinct legal jobs:

1. **DPDP Act 2023 §5–§7** — informed consent for processing of personal data. Explicit, specific, free, informed, unconditional, unambiguous, capable-of-being-withdrawn.
2. **DPDP §9** — Verifiable Parental Consent (VPC) for users <18. Diverts the flow to a parent-OTP capture when the declared age is under 18.
3. **COPPA equivalence** (for international users <13) — same parent-consent flow + content restrictions triggered when geo + age suggest a US/EU minor.

---

## 2. User / job-to-be-done

| User segment | The job |
|---|---|
| Adult (≥18) | "Tell me what data you collect, why, and confirm — let me get on with it." |
| Teen (13–17) | "I'm under 18 — get my parent's permission so I can keep going." |
| Kid (<13) | "I'm a kid; my parent is setting this up and signing off." |

A single screen serves all three by branching on the declared date-of-birth captured here. There is no separate "are you a kid" question — the DOB question is the gate.

---

## 3. Composition map

| Region | Components |
|---|---|
| Top (12%) | `AuroraAppBar` minimal — back disabled; small `i` info button opens privacy-policy bottom sheet |
| Heading (12%) | H2 "Before we start" · sub "We need a few permissions to set up your experience." |
| DOB capture (16%) | Date picker — month + year only (DD not stored or required; satisfies DPDP minimisation) + parent-name field that auto-shows when DOB < 18 years |
| Consent toggles (38%) | Three required toggles + one optional toggle, all with inline plain-language explanations |
| Parent consent block (conditional, 14%) | Visible only when declared age < 18: parent email + "Send OTP" button → OTP entry |
| Footer (8%) | `AuroraButton.primary` "I agree, continue" (disabled until all required toggles + DOB + parent OTP (if applicable) are complete) |

### 3.1 Consent toggles (required to proceed)

1. **Personal data processing** (required) — "I agree to ALP processing my name, email, exam preferences, and learning activity to run the app." → DPDP §5–§7 lawful basis.
2. **AI assistance (Lumi)** (required) — "I agree to Lumi, our AI companion, generating responses based on my questions. Lumi follows our [content safety policy](../content-safety-policy.md)." → AI-specific consent per emerging best practice.
3. **Terms & Privacy** (required) — "I have read the [Terms of Use](https://alp.example/terms) and [Privacy Policy](https://alp.example/privacy)." → Generic contract acceptance.

### 3.2 Optional toggle

4. **Behavioural analytics** (optional, default OFF for Kid persona / ON for everyone else) — "Help us improve ALP by sharing anonymous usage analytics." → DPDP §7(8) allows opt-out for non-essential processing.

### 3.3 Parent consent block (DPDP §9)

Triggered automatically when declared DOB < 18 years old. Reveals:

1. **Parent / guardian email** input (required) — server sends OTP to this address.
2. **OTP entry** — 6-digit code, 10-minute TTL, max 3 attempts.
3. **PAN last-4 challenge** (Kid persona only — DPDP §9 best-practice "verifiable" via cross-reference) — parent enters last 4 digits of their PAN; server hashes + compares to a parent-pre-registered hash. For users 13–17 this challenge is skipped (single-factor parent OTP is sufficient per DPDP §9 interim guidance).
4. **Parent declaration** — "I am the parent or legal guardian of this child and I consent to their use of ALP under the linked Privacy Policy."

---

## 4. Wireframe (Compact 360×800 dp · adult, no parent gate)

```
┌────────────────────────────────────────┐
│ ←   Before we start             ⓘ      │
│     We need a few permissions          │
│     to set up your experience.         │
├────────────────────────────────────────┤
│  Date of birth                         │
│  ┌────────────┐ ┌────────────┐         │
│  │  May ▾     │ │  1995 ▾    │         │
│  └────────────┘ └────────────┘         │
│                                        │
├────────────────────────────────────────┤
│  ☐ I agree to ALP processing my name,  │
│    email, exam preferences, learning   │
│    activity to run the app. (required) │
│                                        │
│  ☐ I agree to Lumi, our AI companion,  │
│    generating responses. (required)    │
│    Read content safety policy ›         │
│                                        │
│  ☐ I've read the Terms + Privacy       │
│    Policy. (required)                  │
│                                        │
│  ☑ Help improve ALP with anonymous     │
│    usage analytics. (optional)         │
├────────────────────────────────────────┤
│       ┌────────────────────────┐       │
│       │   I agree, continue    │       │   ← disabled until all required ✓
│       └────────────────────────┘       │
└────────────────────────────────────────┘
```

### Wireframe variant — DOB < 18 (parent block revealed)

```
…above unchanged through DOB + 3 required toggles…
├────────────────────────────────────────┤
│  ⚠ You're under 18                     │
│  We need your parent or guardian to    │
│  approve. Enter their email:           │
│  ┌────────────────────────────────┐    │
│  │  parent@example.com            │    │
│  └────────────────────────────────┘    │
│       ┌─────────────────┐              │
│       │   Send OTP      │              │
│       └─────────────────┘              │
│                                        │
│  OTP sent — check parent's inbox       │
│  ┌─┬─┬─┬─┬─┬─┐                         │
│  │ │ │ │ │ │ │  (6-digit code)         │
│  └─┴─┴─┴─┴─┴─┘                         │
│                                        │
│  ☑ Parent declaration (parent ticks)  │
└────────────────────────────────────────┘
```

---

## 5. States

| State | Visual |
|---|---|
| Idle (no DOB) | All toggles greyed; Continue disabled with helper "Enter your date of birth first" |
| DOB entered (≥18) | Toggles enabled; Continue enabled once 3 required toggles are checked |
| DOB entered (<18) | Toggles enabled; parent block reveals via 280 ms slide-down |
| Parent OTP sent | "OTP sent — check parent's inbox" inline message; resend after 60s |
| Parent OTP entered | Continue enabled once all required toggles + valid OTP + parent declaration |
| Submitting | Continue button shows spinner; rest of screen dims |
| Server rejects (OTP invalid) | Toast `AuroraSnackbar.error` "Couldn't verify that code — try again or resend." |
| Server rejects (PAN mismatch, Kid) | Toast "Parent verification failed. Please contact help@alp.example." + log to moderator queue |

---

## 6. Voice (locale: en-IN)

| Slot | Copy |
|---|---|
| H2 | "Before we start" |
| Sub | "We need a few permissions to set up your experience." |
| DOB label | "Date of birth" |
| Toggle 1 | "I agree to ALP processing my name, email, exam preferences, and learning activity to run the app." |
| Toggle 2 | "I agree to Lumi, our AI companion, generating responses based on my questions." |
| Toggle 2 link | "Read content safety policy" |
| Toggle 3 | "I have read the Terms of Use and Privacy Policy." |
| Toggle 4 | "Help us improve ALP by sharing anonymous usage analytics." |
| Parent block heading | "You're under 18" |
| Parent block body | "We need your parent or guardian to approve. Enter their email:" |
| Parent email label | "Parent / guardian email" |
| OTP sent toast | "OTP sent — check the inbox." |
| Parent declaration | "I am the parent or legal guardian of this child and I consent to their use of ALP under the linked Privacy Policy." |
| Resend OTP | "Resend OTP" (after 60s; disabled until then) |
| CTA enabled | "I agree, continue" |
| CTA disabled helper | "Complete the items above to continue" |

Localised through `AuroraVoice` keyed by `consent.<slot>` — landed in W2.12 / W3.8.

---

## 7. Server interaction

| Trigger | Endpoint | Payload |
|---|---|---|
| Send OTP | `POST /identity/consent/parent-otp/send` | `{user_id, parent_email}` |
| Verify OTP | `POST /identity/consent/parent-otp/verify` | `{user_id, parent_email, otp}` |
| Parent PAN challenge (Kid only) | `POST /identity/consent/parent-pan/verify` | `{user_id, parent_email, pan_last_4_hashed}` |
| Submit consent record | `POST /identity/consent` | `{user_id, dob_month, dob_year, toggles: {personal_data, ai, terms, analytics}, parent_email?, parent_otp_verified?, parent_pan_verified?, app_version, locale}` |

Consent records are immutable — withdrawals (Settings → Privacy → Withdraw consent) create a new record with `withdrawn=true` rather than mutating the original.

---

## 8. Accessibility

- All toggles are `Switch` widgets under `Semantics(label: …, toggled: bool, hint: 'Required to continue' | 'Optional')`.
- DOB pickers expose semantic labels ("Month of birth", "Year of birth"). DD is intentionally not asked (DPDP minimisation).
- Continue button has dynamic `Semantics(enabled: bool, hint: <what's still missing>)`.
- Tab order: Month → Year → Toggle 1 → Toggle 2 → Toggle 3 → Toggle 4 → Parent email (if visible) → OTP → Parent declaration → Continue.
- Contrast on all body copy: WCAG AA verified.
- Reduce Motion: parent block reveal becomes instantaneous (no slide).

---

## 9. Analytics events

Every event carries the standard envelope (master spec §31). Emitted from this screen:

| Event | Trigger |
|---|---|
| `consent_screen_viewed` | Screen mounts |
| `consent_dob_entered` | DOB picker resolves |
| `consent_parent_block_revealed` | DOB <18 triggers reveal |
| `consent_parent_otp_sent` | "Send OTP" tapped |
| `consent_parent_otp_verified` | OTP entry succeeds |
| `consent_parent_pan_verified` | PAN last-4 succeeds (Kid only) |
| `consent_toggle_changed` | Any toggle flipped — `{toggle: "personal_data|ai|terms|analytics", value: bool}` |
| `consent_submitted` | Continue tapped successfully — `{age_band: "<13|13-17|18+", analytics_opt_in: bool, time_on_screen_ms: int}` |

Note: until `consent_submitted` lands, **no other event with this user_id is emitted** — analytics consent is on the consent screen itself.

---

## 10. Edge cases & decisions

1. **What if a user lies about their age?** DPDP §10 places the onus on us as a "Significant Data Fiduciary" to act on reasonable belief. We don't enforce age-proof at signup; if downstream signals (kid-mode usage patterns, parent complaint, voice on audio narration) suggest a minor, we move the account to Kid persona + require parent consent retroactively.
2. **What if the parent email bounces?** Show "We couldn't reach that address. Try another?" inline. Don't lock the user out, but don't progress without verified OTP.
3. **What if the user is in the EU?** Geo-detect at signup; if in the EU and DOB <13, follow COPPA-equivalent flow (same UX). EU-specific GDPR notices in the linked Privacy Policy.
4. **What if the user withdraws consent later?** Settings → Privacy → Withdraw consent. New consent record with `withdrawn=true`; in-app behaviour: Lumi surfaces disable, analytics events stop, but account remains active for the user to re-consent or delete.
5. **What about institutional accounts (school deploys)?** Out of scope here; handled by the corporate-seat flow (W2.10 `corporate-seat.md`) which captures consent at the institution level.

---

## 11. Out-of-scope

- The Kid-mode parent unlock numeric gate (in-app, repeated monthly) is a separate brief — `onboarding-parent-gate.md` (W2.6).
- DPDP §11/§12/§13 rights flows (access, correction, erasure) are in `data-export-deletion.md`.
- Settings → Privacy management UI is in `settings.md`.

---

## 12. Dependencies

- `Persona` enum: shipped W2.0 in [packages/design-tokens-flutter/lib/src/persona.dart](../../packages/design-tokens-flutter/lib/src/persona.dart).
- `AuroraButton`, `AuroraSnackbar`, switch primitive: shipped under [apps/mobile/lib/aurora/widgets/](../../apps/mobile/lib/aurora/widgets/).
- Server endpoints listed in §7: owned by `alp-identity` service; contracts published before W2.0.5 ships.
- Parent OTP delivery: existing SMTP relay (Mailpit local; SendGrid staging+).
- Content safety policy: [`docs/02-design/content-safety-policy.md`](../content-safety-policy.md).

---

## 13. Verification checklist

- [ ] Adult flow: DOB ≥ 18 → 3 toggles → Continue → consent record persisted.
- [ ] Teen flow: DOB 13–17 → 3 toggles → parent email → OTP → parent declaration → Continue.
- [ ] Kid flow: DOB <13 → 3 toggles → parent email → OTP → PAN last-4 → parent declaration → Continue.
- [ ] Withdrawing analytics (toggle off) results in no analytics events post-submit.
- [ ] Resend OTP enforces 60s cooldown.
- [ ] OTP TTL 10 min, max 3 attempts; 4th attempt requires resend.
- [ ] Tab order verified on Android + iOS.
- [ ] Screen-reader walkthrough on TalkBack + VoiceOver passes.
- [ ] Legal sign-off on every string before release.
