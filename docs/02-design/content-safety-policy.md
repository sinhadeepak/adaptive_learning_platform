# Aurora v3 — Content Safety + Compliance Policy

**Part of:** [Design System v2 — "Aurora"](design-system-v2-aurora-mobile.md) §29
**Status:** Proposed (ratification needed by Legal + Trust & Safety leads before any Lumi surface ships)
**Date:** 2026-05-14
**Plan:** [Wave 2 W2.0.5](../../.claude/plans/the-mobile-app-ui-cheerful-codd.md)

This document is the **single source of truth** for content safety on the mobile app. No Lumi surface, no AI-tutor doubt response, no user-generated content surface ships without satisfying every section below. The matching client-side code lives at [`apps/mobile/lib/aurora/safety.dart`](../../apps/mobile/lib/aurora/safety.dart) and the matching server-side pipeline is owned by the `alp-learning` AI Gateway plus the new `alp-moderation` service.

---

## 1. Scope

In scope:

- AI-generated text shown to any user (Lumi greetings, doubt answers, current-affairs annotations, mains-essay feedback, celebration copy).
- User-generated text submitted to AI surfaces (doubt prompts, mains essays, feedback on Lumi answers).
- User-generated text shared with other users (kid-friends invitations, study-group chat, cohort-leaderboard comments).
- Photo-doubt OCR'd image content.

Out of scope (handled by other policies):

- Editorial / authored content in the catalog (covered by content-moderation pipeline owned by `alp-learning.authoring`).
- Payment and billing interactions (covered by PCI-DSS and Razorpay/Stripe terms).

---

## 2. Pipeline architecture

```
User input  ────────►  [L1: Input Filter]  ────►  alp-tutor server  ────►  LLM
                          (client + server)              │                    │
                                                          ▼                    │
                                          [Persona-aware prompt template] ─────┘
                                                          │
   ◄─────────  Rendered by LumiSpeechBubble  ◄────  [L2: Output Filter]  ◄────
                                                          (server + client)
```

Two filter layers; each runs on both client and server. The client side is best-effort latency optimisation (catch obvious cases before a network round-trip and surface helplines instantly); the server side is the **enforcement** layer.

### 2.1 L1 — Input Filter

| Category | Detection | Action | Persona |
|---|---|---|---|
| Profanity / slurs | Server blocklist + Perspective API `TOXICITY` ≥ 0.85; client-side static blocklist of high-confidence terms | Block + show soft refusal via `LumiSpeechBubble` | All; Kid threshold lowered to ≥ 0.70 |
| Self-harm signals | Custom classifier trained on iCall + Vandrevala intake patterns; client-side keyword preflight ("kms", "want to die", "end it all", localised variants) | **Special path** — never sent to LLM, never silently dropped. Immediately surface the self-harm escalation flow (§4) | Kid + Teen mandatory; Aspirant + Learner enabled by default with opt-out via Settings → Privacy |
| Sexual content | OpenAI Moderation API `sexual` ≥ 0.50 (or `sexual/minors` ≥ 0.10) | Block all personas; flag account for review if repeated | All |
| Violence / threats | Moderation API `violence` ≥ 0.50; `harassment/threatening` ≥ 0.50 | Block + soft refusal | All |
| Doxxing / PII request | Regex: Indian phone (`(\+?91[-\s]?)?[6789]\d{9}`), email, Aadhaar pattern (`\d{4}\s?\d{4}\s?\d{4}`), PAN, address keywords | Block + show "I can't share contact details" refusal | All |
| Exam cheating during live test | Server-side schedule check: is the user enrolled in a test series with an active window? | Block + show "Lumi can't help during a live test" refusal | Teen + Aspirant only |
| Political stance solicitation | Server-side topic classifier on Aspirant doubts: queries asking Lumi to take a stand on partisan politics | Refuse with neutrality statement: "I summarise positions; I don't endorse them." | Aspirant |
| Illegal activity | Moderation API `illegal` ≥ 0.50; custom classifier for drug-purchase / weapon-acquisition / piracy keywords | Block + log + flag account | All |

Server-side L1 wins on disagreement with client-side L1.

### 2.2 L2 — Output Filter

| Category | Detection | Action |
|---|---|---|
| Hallucination | Confidence self-eval prompt; if model confidence < 0.7 on any factual claim, output filter rewrites to "I'm not sure — here's the relevant chapter to check." | Server enforces. |
| Age-appropriate language (Kid) | Run `textstat.flesch_reading_ease` on every Kid-persona response; require ≥ 70 (Grade 4 reading level). Reject + regenerate up to 2× then fall back to a static safe response. | Server enforces. |
| Refusal consistency | Server enforces the persona's refusal templates from §3 of the Lumi Coaching Model spec. | Server enforces. |
| PII leak in output | Same regexes as L1 input filter, applied to model output | Server enforces; client also redacts as defense in depth. |
| Source citation (Aspirant current-affairs) | Every factual claim in current-affairs annotations carries `[source: URL, indexed_at: ISO-8601]` metadata | Server enforces; client renders citation footer. |
| Disallowed self-reference | Lumi never refers to itself as an AI / language model / Claude / GPT — voice is "Lumi" only | Server-side post-processing string-replacement; client doesn't see "I'm an AI". |

---

## 3. Refusal patterns

When L1 blocks an input or L2 blocks an output, the user sees a persona-tuned refusal via `LumiSpeechBubble`. No raw error message; no error code; no API-internal explanation.

| Category | Encourager (Kid) | Buddy (Teen) | Mentor (Aspirant) | Coach (Learner) |
|---|---|---|---|---|
| Profanity | "Let's keep our words kind — try asking again? 💜" | "Hey — let's keep it clean. Try rephrasing?" | "Please rephrase without the language." | "Please rephrase." |
| Self-harm | **Special** — see §4 escalation flow, not a refusal |
| Sexual content | "I can't talk about that. Want to do a math question instead? 🌟" | "Not a topic I'll go into. Try another question." | "I can't engage with that topic." | "I can't engage with that topic." |
| Violence / threats | "Let's keep things friendly. What are you working on? 💜" | "Not a topic I'll go into." | "I can't engage with that topic." | "I can't engage with that topic." |
| Doxxing / PII | "I don't share phone numbers or addresses." | "I can't share contact info." | "I won't share contact details." | "I won't share contact details." |
| Exam cheating | "Lumi can't help during a live test — see you after! 💪" | "Can't help during a live test. Catch me after." | "Cannot assist during an active test window." | n/a |
| Political stance | n/a | n/a | "I summarise positions; I don't endorse one. Want sources for both sides?" | n/a |
| Illegal activity | "That's not something I can help with." | "Can't help with that." | "I can't engage with that." | "I can't engage with that." |
| Out-of-syllabus | "That's outside what I know — let's stick to your map?" | "Outside the syllabus — want me to find related?" | "Out of syllabus scope. Want a related concept?" | "Outside the course. Useful to cover anyway?" |

Refusal messages are localised through `AuroraVoice` keyed by `safety.refusal.<category>`.

---

## 4. Self-harm escalation flow

Triggered by L1 self-harm classifier ≥ 0.5 OR client-side keyword preflight match.

1. **Immediately**: replace the chat surface with the helpline sheet ([`AuroraSafetyHelplineSheet`](../../apps/mobile/lib/aurora/widgets/aurora_safety_helpline_sheet.dart)).
2. The sheet shows:
   - "It sounds like you're going through a really tough time. You don't have to go through this alone."
   - **iCall**: tap-to-call `9152987821` (10 AM – 8 PM, Mon–Sat).
   - **Vandrevala Foundation**: tap-to-call `18602662345` (24/7).
   - **iCall WhatsApp**: tap-to-open `+91 9152987821`.
   - International (for users outside India): link to `findahelpline.com`.
3. **Suppress further AI responses for this session** — the session-context flag `safety_session_locked=true` is set on the server and any subsequent LLM call returns the helpline sheet, not an AI response.
4. **Notify moderator queue** with priority `P0_SELF_HARM` — moderator review within 1 hour (24/7 SLA).
5. **For Kid + Teen personas under 18**: notify parent (if parent contact is on file from W2.6 parent-gate) via email + push within 4 hours. The notification is non-detailed: "We surfaced a wellbeing resource to your child today. Please check in with them."
6. **Do not log the user's input text** in plaintext to any system other than the moderator review queue (which is access-controlled and audit-logged); telemetry records only `event=safety_self_harm_triggered` + `persona` + `hashed_user_id`.

The session lock is released when:
- The user explicitly taps "I'm OK — continue learning" on a confirmation prompt that appears 24 hours after the trigger, OR
- A moderator clears the lock after review.

---

## 5. User-initiated abuse report

Every Lumi message and every user-generated message in social surfaces (Friends chat, study groups) has a long-press → Report action.

1. Long-press → context menu with `Report`.
2. Tap Report → [`AuroraSafetyReportSheet`](../../apps/mobile/lib/aurora/widgets/aurora_safety_report_sheet.dart) opens with reason picker:
   - Inappropriate language
   - Wrong / misleading answer
   - Talking about something off-topic
   - Asking for personal information
   - Self-harm or distress
   - Something else (free-text 200 chars)
3. On submit: client `POST /moderation/reports` with `{message_id, reason, free_text?, persona, locale, app_version}`. Server returns `{report_id}`.
4. User sees confirmation: "Thanks, we'll review this. You'll hear back within 24 hours." + report id.
5. Moderator reviews within 24 hours (P1_USER_REPORT priority). User receives a follow-up notification with the outcome: "Reviewed: <message removed | left up with note | banned reporter for false reports>."

---

## 6. Moderation team SLAs

| Priority | Trigger | Response time | Resolution time |
|---|---|---|---|
| P0_SELF_HARM | L1 self-harm classifier or keyword preflight | 1 hour | 4 hours |
| P1_USER_REPORT | User-initiated abuse report | 24 hours | 72 hours |
| P2_AUTO_FLAG | L1/L2 hit, no user report | 72 hours | 7 days |
| P3_PATTERN | Repeated low-grade hits from one account | 7 days | 14 days |

Logged in `alp-moderation` service; audit trail retained 5 years per DPDP §10.

---

## 7. Legal compliance matrix

| Requirement | Source | Implementation |
|---|---|---|
| Verifiable Parental Consent (VPC) for users <18 | DPDP Act 2023 §9 | Onboarding consent screen captures parent email; OTP-link delivered to parent; parent confirms via OTP + PAN-last-4 challenge. For Kid persona, the parent-unlock numeric gate (W2.6) is an additional in-app challenge. |
| Right to access | DPDP §11 | Settings → Privacy → "Download my data" → ZIP export within 30 days. See [`data-export-deletion.md`](redesign/data-export-deletion.md). |
| Right to correction | DPDP §12 | Settings → Profile → editable fields. |
| Right to erasure | DPDP §13 | Settings → Privacy → "Delete account" → 30-day cooling period → permanent erasure. See [`data-export-deletion.md`](redesign/data-export-deletion.md). |
| Significant Data Fiduciary obligations | DPDP §10 | Annual DPIA; appointed Data Protection Officer; published DPDP-compliance report. |
| Cross-border transfer | DPDP §16 | Default: data stays in AWS ap-south-1. Cross-border to US/EU only with explicit user consent in the consent screen for international study programs. |
| COPPA equivalence (international minors <13) | US 15 U.S.C. §6501 et seq. | Same parent-consent flow + content restrictions; geo-detected at signup. |
| ASCI edtech advertising compliance | ASCI Guidelines for Education Advertising 2022 | All marketing claims (rank guarantee, score improvement %) backed by audited data. Onboarding marketing copy reviewed by legal before each release. |
| IT Rules 2021 intermediary obligations | India IT (Intermediary Guidelines) Rules 2021 | Grievance officer publicly named on website + in Settings → Help. 24h acknowledgement, 15-day resolution. Quarterly compliance report. |

---

## 8. Audit & accountability

- Every L1/L2 hit is logged with `{timestamp, event, hashed_user_id, persona, locale, category, score, action}` — no plaintext message content except in the moderator queue (access-controlled).
- Moderator decisions logged with `{moderator_id, decision, rationale, escalations}`.
- Quarterly review by the DPO of false-positive / false-negative rates; thresholds tuned.
- Annual independent audit per DPDP §10 obligations.

---

## 9. Release gate

A new Lumi surface ships only when these are all green:

- [ ] L1 input filter live for the categories above (server-side mandatory, client-side preferred).
- [ ] L2 output filter live for the categories above.
- [ ] Refusal copy localised through `AuroraVoice` for all in-scope locales.
- [ ] Self-harm helpline sheet + session-lock + moderator-notify wired.
- [ ] Abuse-report flow live with 24h moderator response SLA dashboard.
- [ ] DPDP consent screen captures parent OTP for users <18.
- [ ] Onboarding consent text reviewed by Legal (signed-off in PR).
- [ ] Quarterly DPIA scheduled.
- [ ] Grievance officer named in Settings → Help.
