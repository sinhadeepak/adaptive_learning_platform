# Phase 2 Sprint Development Plan

**Project**: Adaptive Learning Platform — Phase 2 (Global Expansion)
**Planning horizon**: 12 weeks (4 feature sprints + 1 launch sprint, ~6 months after Phase 1c full launch).
**Target launch**: Q4 2026 (per [Release Plan / MVP §1.1](04_ReleasePlan_MVPScope_AdaptiveLearningPlatform.docx)).
**Team**: same 12 as Phase 1, plus a 13th hire — **Localization PM** — needed for RTL/Arabic and translation operations. ML Engineer is freed up after Phase 1 cool-down to lead recommendations work in P2-S4.
**Status**: **DRAFT** — written 2026-04-25, awaiting Tech Lead + Head of Product sign-off. Not yet executable; produced for capacity planning. Will be re-baselined once Phase 1c full launch closes (per [Phase 1 Sprint Plan §4](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md), retrospective collects learnings for Phase 2 scope).
**Authoritative inputs**: [Release Plan / MVP §1.1](04_ReleasePlan_MVPScope_AdaptiveLearningPlatform.docx) (Phase 2 scope: RTL/Arabic, global payments, live sessions, native video, advanced institution analytics, B2B API), [Phase 1 Closure docs](.) (carry-over items move into P2-S0), [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) (residual P0/P1 items).

---

## Why a separate plan

Phase 1 shipped a focused India-only product. Phase 2 changes three things at once:
1. **Markets** — international English-speaking and RTL/Arabic.
2. **Modes** — live tutor sessions and native video alongside async quizzes.
3. **Surfaces** — first B2B API for partner integrations.

These are large enough that bolting them onto Phase 1 sprint cadence would miss commitments. This plan re-uses Phase 1's sprint shape (one foundation sprint, 3 feature sprints, one launch sprint) but with explicit gates between each.

---

## Timeline at a glance

| Week | Sprint | Theme | Key events |
|---|---|---|---|
| 1–2 | P2-S0 | Foundation + Phase 1 carry-over closure | i18n framework, Stripe global mode, video infra spike, B2B-API design ADR. P1 retrospective. |
| 3–5 | P2-S1 | Internationalization | RTL/Arabic UI flips, Arabic content authoring, multi-currency payments, localized OTP/email. |
| 6–8 | P2-S2 | Live sessions + native video | WebRTC tutor sessions, recording, native MP4 upload + adaptive bitrate playback. |
| 9–11 | P2-S3 | Advanced institution analytics + B2B API | Cohort comparative analytics, institution dashboards, B2B REST API + OAuth2 client-credentials grant, partner sandbox. |
| 12 | P2-S4 | Stabilization + global launch | Drills, soft launch in 1 international market, full Phase 2 launch. Recommendations engine MVP if capacity permits. |

---

## P2-S0 — Foundation + Phase 1 carry-over closure (Weeks 1–2)

**Goal**: Phase 1 retrospective complete. Phase 2 prerequisites in place. Decisions made.

**Capacity**: 90 SP. The first 3 days of the sprint are reserved for Phase 1 carry-over closure (residual P0/P1 from Gap Register, post-launch PIR follow-ups).

### Deliverables

1. **Phase 1 retrospective** — published as `docs/02_planning/20_Phase1_Retrospective.md`. Captures what slipped, what landed early, what should be different in Phase 2.
2. **Phase 1 carry-over closure**:
   - Outstanding `Phase 1.5 deferred` items from Sprint 3+4 closure (revenue/plans/announcements admin epics, batch teacher analytics if descoped).
   - Outstanding gap items still marked open in Gap Register v1.2.
   - Documentation refresh: `runbook/` updates from PIRs, monitoring runbook gaps.
3. **i18n framework spike** — output: an ADR. Decisions to make:
   - Translation source-of-truth (lokalise / phrase / Crowdin / in-house JSON).
   - RTL strategy in `@alp/design-system` — CSS logical properties? `dir="rtl"` body attr? Per-component overrides?
   - Backend message keys vs. translated strings (push translation to FE, keep BE language-neutral).
   - Date/number/currency formatting library (Intl API vs. polyfill).
4. **Global payments spike** — ADR on multi-currency support. Decisions:
   - Stripe single-account-multi-currency vs. per-region accounts (impacts compliance + payouts).
   - Alternative providers per market (Razorpay India already in; consider Adyen / dLocal for LATAM, Paystack for Africa).
   - Tax/VAT handling (Stripe Tax vs. Avalara vs. manual).
   - Display currency vs. settlement currency UX.
5. **Video infrastructure spike** — ADR on native video stack. Decisions:
   - Storage + encoding (S3 + MediaConvert vs. Mux vs. Cloudflare Stream).
   - Adaptive bitrate (HLS via MediaConvert; latency vs. cost).
   - DRM scope (signed URLs only vs. Widevine for premium content).
   - Captions/transcripts (auto-generated via Whisper vs. paid service).
6. **Live session infrastructure spike** — ADR on WebRTC stack. Decisions:
   - Provider (LiveKit Cloud / Daily / 100ms / AWS Chime SDK / build on top of LiveKit OSS).
   - Recording strategy (server-side vs. client uploaded).
   - Capacity: max concurrent participants per session, max concurrent sessions per cluster.
   - Pricing model — per-minute charge passthrough vs. flat-tier.
7. **B2B API design ADR** — auth model (OAuth2 client-credentials grant), rate-limiting strategy, billing meters, versioning policy (e.g. `/v1/...`), partner-sandbox tenancy.
8. **Localization PM hire** — onboard. Vendor selection for translation (RFP if applicable).
9. **CI matrix expansion** — add `ar` and 1 international English locale to mobile + web E2E tests as smoke jobs.

### Gap closure gating P2-S1
Same shape as Phase 1's `Sprint 1 Start Gate` (GAP-24). Concrete items:

| Item | Owner | Must be YES before P2-S1 starts |
|---|---|---|
| 4 ADRs accepted (i18n, payments, video, live-sessions) | Tech Lead | All four merged into `docs/adr/` and approved by CTO |
| Localization PM onboarded | HoP | Vendor selected; first 100 strings translated as a sample |
| Phase 1 retrospective published | Tech Lead | All slip causes have a "what we'll do differently" entry |
| Phase 1 P0/P1 carry-overs at 0 | Tech Lead | Gap Register clean |
| Stripe sandbox account in target Phase 2 markets | Payment BE Lead | At least 2 markets (e.g. UAE, Singapore) ready for sandbox transactions |

### Exit criteria
- 4 ADRs merged.
- Phase 1 carry-overs closed.
- Capacity confirmed for P2-S1.

### Risks
- **Translation vendor selection slips** → P2-S1 start delayed. Mitigation: pick a default vendor (lokalise) on Day 5 if RFP isn't decided; switch if better option emerges in Sprint.
- **Live-session vendor lock-in concerns** → CTO may direct OSS-only path. Build cost grows. Mitigation: time-box decision to 5 days; default to managed LiveKit Cloud.

---

## P2-S1 — Internationalization (Weeks 3–5)

**Goal**: First international market live in staging with full RTL support. Closed beta opens for a single Arabic-speaking market (UAE preferred) at end of sprint.

**Capacity**: ~135 SP (3-week sprint vs. Phase 1's 2-week sprints — Phase 2 expands sprint length to absorb the larger feature surface; team capacity ~45 SP/week stays constant).

### Feature work (~110 SP)

| Epic | Stories | Notes |
|---|---|---|
| **i18n framework rollout** — `@alp/design-system` gains `dir`-aware components; web-student/portal/admin all consume the locale provider | new INT-REQ-01..05 | Extracted once; reused by every component. Owner: Designer + FE Lead A |
| **Arabic translations** — wire translation source-of-truth (per ADR), translate Phase 1 student-facing strings (~800 strings) | INT-REQ-06..09 | Owner: Localization PM |
| **RTL UI verification** — visual regression tests, manual RTL pass on every screen | INT-REQ-10..12 | Owner: QA Lead + Designer |
| **Multi-currency Payment** — Stripe accepts AED, EUR, GBP, USD. Display-currency UX (shows local; settlement still AED via Stripe converter) | STU-REQ-01..13 amendments | Owner: BE Lead Python A |
| **Localized Auth** — OTP email + reset-password email translated. SMS provider for Arabic markets (Twilio MENA region) | STU-REQ-14..18 | Owner: BE Lead Python B |
| **Localized Notification** — `notification.payload` shape gains `locale`; templates per locale | NOTIF-REQ amendments | Owner: BE Lead Python B |
| **Catalog content i18n** — `topics.title_ar`, `subtitle_ar` columns; `topics_v2` index gains `alp_arabic` analyzer; bilingual queries land Arabic + English | CAT-REQ amendments | Owner: BE Lead Python C — pairs with SPIKE-02-style work |
| **Mobile RTL** — Flutter `Directionality.rtl` end-to-end; date/number/currency formatters; locale selection on first launch | MOB-REQ-INTL-01..06 | Owner: Mobile Leads |

### Gap closure (~25 SP)

- **OI-XX privacy compliance** — GDPR data-subject rights (export, delete) for EU users likely to register in soft launch.
- **OI-XX cookie consent banner** for EEA + UK web traffic.
- **OI-XX terms-of-service per region** — Legal owns; Tech Lead wires gating into registration flow.
- **GAP-XX Arabic search** — re-run SPIKE-02-style analyzer evaluation with Arabic. New gap registered if recall < 75% on a 12-row test matrix.

### Exit criteria

- Web-student in staging serves Arabic correctly RTL with all Phase 1 student flows working.
- Mobile in staging supports both LTR (English) and RTL (Arabic) — language picker on first launch.
- A test user can register, take a quiz, upgrade to premium, and pay in AED.
- All Sprint 2-due gap items closed (privacy, ToS, cookie consent).
- Arabic search test matrix passes ≥ 75% recall.

### Risks

- **Translation quality issues surface late** — beta users find embarrassing translations. Mitigation: hire a native Arabic reviewer for a final sweep at Day 12.
- **Stripe multi-currency complications** (3DS friction in MENA, rejection rates higher than India). Mitigation: budget 3 days of payment debugging late in sprint; have a fallback to manual checkout with PayPal as a kill-switch.
- **RTL UI bugs in design system** propagate to every screen. Mitigation: visual regression suite (Chromatic) as a Day-1 deliverable, not Day-15 verification.

---

## P2-S2 — Live sessions + native video (Weeks 6–8)

**Goal**: First live tutor session runs end-to-end in staging with 5 students. First native video lesson plays in adaptive bitrate.

**Capacity**: ~140 SP.

### Feature work (~115 SP)

| Epic | Stories | Notes |
|---|---|---|
| **Live session service (new)** — booking, scheduling, instructor approval workflow, capacity management | LIVE-REQ-01..15 | New service. Owner: BE Lead Go (Quiz pattern reuse for FSM) |
| **WebRTC integration** — managed provider per ADR (P2-S0). Tokenized join links, recording trigger, post-session artifact storage | LIVE-REQ-16..22 | Owner: BE Lead Go + DevOps |
| **Recording + transcript pipeline** — server-side recording → S3 → MediaConvert → Whisper transcript → CDN | LIVE-REQ-23..26 | Owner: ML Engineer (transcripts) + BE Lead Python A (orchestration) |
| **Native video service (extends Content)** — instructor uploads MP4 → MediaConvert → HLS variants → CDN. Authoring UI in web-portal | VID-REQ-01..12 | Owner: BE Lead Python C + FE Lead B |
| **web-student player** — video.js + HLS, captions, playback speed, watch progress | STU-REQ-VID-01..06 | Owner: FE Lead A |
| **Mobile player** — native AVPlayer (iOS) / ExoPlayer (Android) wrappers, offline download (Premium-gated) | STU-REQ-VID-07..10 | Owner: Mobile Leads |
| **Premium-gating updates** — both live sessions and native video are premium-tier features | PAYMENT-REQ amendments | Owner: BE Lead Python A |

### Gap closure (~25 SP)

- **GAP-XX content moderation** for instructor-uploaded video (manual review queue in web-portal).
- **GAP-XX bandwidth budget for low-tier devices** — adaptive bitrate floor + degraded mode for cellular.
- **OI-XX DMCA / takedown procedure** for video content.

### Exit criteria

- Test instructor schedules a live session, students join, recording posts to S3, transcript appears within 30 min.
- Test instructor uploads a 100MB MP4, students play it back at 480p / 720p / 1080p with adaptive switching working on a throttled connection.
- Mobile offline download works for a single video on iOS + Android.
- Premium gate enforced — non-premium users see a paywall on both surfaces.

### Risks

- **WebRTC quality issues on weaker mobile networks** in target Phase 2 markets. Mitigation: enable LiveKit's adaptive simulcast; document fallback to audio-only.
- **MediaConvert costs underestimated** at scale. Mitigation: cap encoding queue per instructor in P2-S2; revisit pricing during P2-S4 stabilization.
- **App-store review for live video** (iOS especially) may flag content moderation as inadequate. Mitigation: ship moderation queue as part of P2-S2, not P2-S3.

---

## P2-S3 — Advanced institution analytics + B2B API (Weeks 9–11)

**Goal**: Institution admins have a real comparative-analytics dashboard. First two B2B partners onboarded in sandbox.

**Capacity**: ~135 SP.

### Feature work (~110 SP)

| Epic | Stories | Notes |
|---|---|---|
| **Cohort comparative analytics** — Analytics service surfaces cohort vs. cohort, cohort vs. global, time-series readiness/mastery trajectories | INST-REQ-15..22 | Owner: BE Lead Python A — extends Sprint 1's mastery/readiness pipeline |
| **Institution dashboard** in web-portal — drill-down from institution → cohort → student → topic. Export to CSV/PDF. | INST-REQ-23..28 | Owner: FE Lead B |
| **B2B API gateway** — new service routing partner traffic with auth + rate-limiting + billing meter | API-REQ-01..08 | Owner: BE Lead Go (gateway pattern; partner traffic is low concurrency, OK to use Go HTTP server) |
| **OAuth2 client-credentials issuer** — Auth service gains client registration flow + token endpoint per RFC 6749 §4.4 | API-REQ-09..12 | Owner: BE Lead Python A — reuses JWT signing infra |
| **Partner-facing API (v1)** — read endpoints (catalog, student progress, attestations); writes deferred to Phase 2.5 | API-REQ-13..20 | Owner: BE Lead Python C |
| **Partner sandbox tenancy** — separate tenant scope so partners can experiment without touching production data | API-REQ-21..24 | Owner: BE Lead Python B + DevOps |
| **API documentation site** — OpenAPI 3.1 spec → Redoc / Stoplight published at developers.adaptivelearn.in | API-REQ-25..28 | Owner: Tech Lead + DevOps |
| **Per-API-key dashboards** in web-admin — admin sees usage per partner, can revoke keys | ADM-REQ-30..34 | Owner: FE Lead B |

### Gap closure (~25 SP)

- **GAP-XX rate-limit observability** — Grafana dashboards per API key.
- **GAP-XX API SLA documentation** — what we promise partners (99.5% availability, 5xx error budget, etc.).
- **GAP-XX partner-onboarding runbook** — `runbook/partner_onboarding.md` (provisioning, key rotation, off-boarding).
- **OI-XX data-export legal review** for B2B usage (DPA template, data-residency commitments).

### Exit criteria

- Two pilot partners (TBD by HoP) make 100+ successful API calls each in sandbox.
- Institution admin can produce a cohort comparative report in < 30 seconds.
- API rate limits enforced + visible in admin panel.
- API documentation published.

### Risks

- **Partner integration takes longer than expected** — partners change requirements mid-sprint. Mitigation: lock spec at start of sprint; changes go to Phase 2.5.
- **Rate-limit storage in Redis becomes a bottleneck** at higher partner load. Mitigation: design uses sliding-window-counter pattern (proven up to ~10k req/s); commit to load-test in P2-S4.

---

## P2-S4 — Stabilization + global launch (Week 12)

**Goal**: Soft launch in 2 international markets. Full launch in 4 international markets by end of week.

**Capacity**: ~50 SP (1-week sprint).

### Week 12 stages

#### T-7 review and Drills (Drills 5 + 6, extending Phase 1's drill series)
- **Drill 5: live session failover** — kill the WebRTC provider for 5 min, verify graceful degradation (session pauses, students see "reconnecting", recording resumes on reconnect).
- **Drill 6: global outage spike** — Stripe in one Phase 2 market goes down; checkout falls back to manual + clear messaging in that locale.

#### Translation QA pass
- Native reviewer signs off on every Phase 1 + Phase 2 user-facing string in each new locale.
- Crowdsourced QA cohort (50 invited users per locale) walks through register → quiz → upgrade for 48 h before soft launch.

#### Phase 2a soft launch (Week 12 Day 4)
- Open registration in **UAE + Singapore** (invite-list of ~500 per market).
- All other Phase 1 features available; live sessions limited to 5 instructors per market for the first week.

#### Phase 2b full launch (Week 12 Day 7)
- Full registration in UAE + Singapore + UK + Saudi Arabia.
- Press + marketing release.
- 24/7 on-call rotation expanded to cover MENA + APAC time zones (NEW — Phase 1 was India-only on-call).

### Recommendations engine MVP (if capacity)
- ML Engineer is unblocked from Phase 1; if P2-S4 stabilization runs ahead, ML can ship a 1-week MVP of "you might also study" recommendations using existing mastery + topic embeddings. **Stretch goal — not required for launch.**

### Exit criteria
- All four Phase 2 launch markets serving traffic with locale-correct UX.
- No P0 defects open.
- 24/7 on-call rotation has at least one full handoff cycle complete.
- Phase 2 closure doc published.

### Risks
- **MENA time-zone coverage gap** — current team is India-time-shifted. Mitigation: contract for 8-hour overnight on-call coverage from a vendor for the first 2 weeks post-launch.

---

## What this plan deliberately does NOT cover

These are explicit Phase 3 (2027) items, not Phase 2:

- **Live tutor marketplace** (instructor discovery, booking, ratings — beyond institution-affiliated instructors).
- **Native video commerce** (creator-led courses sold individually).
- **Advanced institution analytics — predictive** (forecasting student drop-out, intervention triggers — currently descriptive only).
- **B2B API write endpoints** (creating cohorts, issuing assignments via API). Phase 2 is read-only.
- **B2B API webhooks** for partner-side event notifications.

---

## Open questions blocking finalization

1. **Phase 2 markets** — UAE + Singapore + UK + KSA proposed; HoP confirms by P2-S0 Day 3.
2. **Localization vendor** — RFP or pick lokalise default; CTO decides P2-S0 Day 5.
3. **Live-session provider** — managed (LiveKit Cloud) vs. OSS self-hosted; CTO decides P2-S0 Day 5.
4. **Recommendations engine scope** — stretch in P2-S4 vs. dedicated Phase 2.5 sprint; ML Engineer + HoP decide P2-S2 retrospective.

---

## Sprint count summary

**Phase 2 has 5 sprints** (P2-S0 + 4 feature sprints), 12 weeks total. Same shape as Phase 1 except:
- P2-S0 doubles as a P1 carry-over closure sprint (3 days reserved).
- P2-S1, P2-S2, P2-S3 are 3-week sprints (vs. Phase 1's 2-week) — the international/live/video work needs more contiguous time per epic.
- P2-S4 stays 1-week launch shape, mirroring Phase 1's S4b.

**Phase 3 (2027)** has no sprint plan yet. Scope per Release Plan §1.1 (live tutor marketplace, content marketplace, B2B writes, predictive analytics) — drafted as a separate doc when Phase 2 closure retrospective surfaces concrete requirements.

---

## Authoring note

This plan is intentionally pessimistic on novel-tech sprints (live sessions, video, B2B API) — Phase 1's PRs #25–#35 mostly came in as "supplemental hardening" work AFTER Sprint 4 was meant to close, suggesting our actual delivery cadence was 1.5× the planned cadence on green-field features. P2 sprint sizing applies that 1.5× factor up-front instead of carrying it into a Phase 2.5 supplemental sprint.
