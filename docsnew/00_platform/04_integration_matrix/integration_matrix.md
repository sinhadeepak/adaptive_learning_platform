# Integration Matrix — App ↔ Service Contracts

**Status:** DRAFT v0.1 · 2026-05-27
**Anchored to:** Master BRD §4.3 · all per-app + per-service `01_brd.md`

This file is the **single authoritative summary** of which surface talks to which service for what. Every per-app BRD's "Dependencies" section maps here.

---

## 1. Coarse Matrix (app → service)

| App | identity | learning | quiz | battle | marketplace | payment | engagement |
|---|---|---|---|---|---|---|---|
| **web-student** | ✅ auth + me + delete | ✅ catalog + content + screening + adaptive + analytics + recommend + AI-vision (P3) | ✅ practice + mock + PYQ + history + flag | ✅ matchmake + WS + replay (P2) | ✅ browse + book + join + rate (P2) | ✅ subscribe + invoices + cancel | ✅ notif + community + XP + streak |
| **web-portal** | ✅ auth + me + role-escalation | ✅ authoring + AI Draft + quality + cohort (P2) | — | — | ✅ profile + availability + sessions + earnings + KYC | ✅ Connect onboarding + payouts | ✅ notif + tutor↔student msg (P2) |
| **web-admin** | ✅ SSO + admin user mgmt + impersonate + audit | ✅ moderation queue + AI Gateway control + exam config | ✅ blueprint mgmt + history view | ✅ ops view + leaderboards | ✅ tutor approval + KYC review + bands + disputes | ✅ refunds + MRR/ARR + disputes | ✅ broadcasts + templates |
| **mobile** | ✅ auth + biometric + me + delete | ✅ catalog + offline content + adaptive + analytics + recommend + vision (P3) | ✅ practice + mock + PYQ + offline-sync + history | ✅ matchmake + WS (P2) | ✅ browse + book + join + rate (P2) | ✅ subscribe (Stripe WebView; iOS OQ-MB-01) + invoices | ✅ push + in-app notif + community (P2) + XP |

---

## 2. Service ↔ Service (Inter-Service Calls)

The other half of the integration matrix: which services call each other.

| Caller → | identity | learning | quiz | battle | marketplace | payment | engagement |
|---|---|---|---|---|---|---|---|
| **identity** | self | — | — | — | — | (receives PUT entitlement) | (emits user.created → engagement) |
| **learning** | (validates JWT via shared lib) | self | (called by quiz `resolve`) | (called by battle for item pool) | (called by marketplace for content tags) | — | (publishes `kappa.paused` event) |
| **quiz** | (JWT validate) | ✅ resolve · blueprint · sm2 | self | — (battle delegates here for scoring via `/internal/battle/score`) | — | — | publishes `quiz.session.completed` |
| **battle** | (JWT validate) | ✅ items by topic+difficulty | ✅ `/internal/battle/score` | self | — | — | publishes `battle.match.completed`, `battle.rating.updated` |
| **marketplace** | ✅ role escalation; KYC unlocks entitlement | (cross-attribution for tutor-as-author) | — | — | self | ✅ `/internal/checkout-marketplace` for booking; webhooks back | publishes `marketplace.session.completed` |
| **payment** | ✅ `PUT /entitlements/{user_id}` | — | — | — | (issues Connect via marketplace's request) | self | publishes `payment.invoice.failed`, etc. |
| **engagement** | (JWT validate; user-pref read) | (notification on kappa events) | (consumes `quiz.session.completed`) | (consumes `battle.match.completed`) | (consumes `marketplace.session.completed`) | (consumes `payment.invoice.failed`) | self |

---

## 3. Authentication Patterns

| Pattern | Used by | Mechanism |
|---|---|---|
| **End-user JWT** | apps → services | identity issues RS256 JWT; consumers verify via shared `libs/auth-{go,py,ts,dart}` lib + JWKS |
| **Service-to-service** | inter-service `/internal/...` | mTLS or shared-secret bearer in cluster network; never exposed publicly |
| **Admin re-auth** | admin endpoints | regular JWT + ephemeral `X-Admin-Reauth` proof (re-prompted MFA) |
| **Webhook signatures** | Stripe / Daily.co / Stripe Identity / SendGrid | per-provider HMAC signing key in KMS |
| **WS auth** | battle | JWT in upgrade headers; signed `ws_token` for session join |
| **SSO** | web-admin (Phase 2) | OIDC/SAML (Okta or Google Workspace per OQ-WA-01) |

## 4. Cross-Cutting Standards

| Standard | Where enforced |
|---|---|
| `Idempotency-Key` header on all mutating endpoints | every service |
| Cursor-based pagination | every service |
| Error shape `{ code, message, details, request_id }` | every service |
| Versioned `/v1/...` path prefix | every service |
| OpenAPI 3.1 spec published | every service (`/openapi/<service>.yaml`) |
| OTel tracing + structured JSON logs | every service |
| `/health` + `/ready` endpoints | every service |
| Migrations append-only + reversible | every service |
| No cross-schema FK | enforced via review |
| Audit events on sensitive actions | identity (centralised), each service contributes |

## 5. Event Stream (NATS JetStream)

The async-event spine. Subjects + producers + consumers:

| Subject | Producer | Primary Consumer(s) | Purpose |
|---|---|---|---|
| `user.created` | identity | engagement, learning | Welcome notif; create learning profile shell |
| `user.purged` | identity | learning, quiz, marketplace, payment, engagement | Cross-service purge per DPDPA |
| `user.entitlement.changed` | identity | learning (analytics — premium feature gating), web (next JWT refresh) | Premium flip |
| `quiz.session.completed` | quiz | engagement (XP/streak), learning (mastery delta) | Post-quiz |
| `quiz.flag.submitted` | quiz | learning (forwards to author) | Item issue report |
| `battle.match.completed` | battle | engagement (XP/badge), payment (none) | Battle done |
| `battle.rating.updated` | battle | engagement (leaderboards) | Rating change |
| `learning.item.accepted` | learning | engagement (notify author) | Moderation outcome |
| `learning.item.rejected` | learning | engagement | Moderation outcome |
| `learning.kappa.paused` | learning | engagement (admin alert), web-admin | AI Gateway auto-pause |
| `payment.checkout.completed` | payment | (already handled by direct PUT to identity) marketplace (booking confirm), engagement | Subscribe success |
| `payment.invoice.failed` | payment | engagement (dunning notif), identity (entitlement off after 3 fails) | Dunning |
| `payment.dispute.opened` | payment | engagement (admin alert), web-admin | Chargeback |
| `marketplace.session.completed` | marketplace | engagement (rating prompt), payment (earnings line) | Live session done |
| `marketplace.booking.confirmed` | marketplace | engagement (confirmation notif) | Booking |
| `marketplace.payout.failed` | marketplace | engagement (admin alert), web-admin | Connect issue |

All events:
- include `delivery_id` (UUID) for consumer dedupe
- carry `actor_user_id` where applicable
- serialised as JSON (Phase 1) — protobuf migration possible Phase 3+
- have a deadletter queue per consumer

## 6. External Integrations

| Vendor | Used by | What |
|---|---|---|
| **Stripe** | payment | Checkout, subs, invoices, refunds |
| **Stripe Connect (Express)** | payment, marketplace | Tutor payouts |
| **Stripe Identity** | marketplace | KYC |
| **Daily.co** | marketplace | Live video |
| **FCM** | engagement → mobile | Android push |
| **APNS** | engagement → mobile | iOS push |
| **Twilio** | engagement, identity | SMS OTP + fallback notifs |
| **SendGrid or SES** | engagement | Email |
| **Anthropic / OpenAI / Google / Llama** | learning (AI Gateway) | LLM provider |
| **OpenAI embeddings (or Cohere)** | learning | Content embeddings |
| **OpenSearch** | learning, marketplace | Search |
| **AWS KMS** | identity, payment, engagement | Signing keys, secrets |
| **AWS S3** | learning, marketplace | Media + exports |
| **AWS CloudFront** | learning | CDN |

## 7. Failure Modes & Degradation

| Failure | Surface impact | Fallback |
|---|---|---|
| **identity down** | Total outage (auth gates everything) | NFR-PLAT-14 → 99.95% target; multi-AZ + read replicas |
| **learning down** | quiz can't resolve; recommendations stale; analytics frozen | Phase 2: cache deterministic-type resolutions in quiz for graceful degrade |
| **quiz down** | No new sessions; existing sessions held in Redis | Active sessions resumable when service returns |
| **battle down** | Battle CTA hidden via feature flag | Other surfaces unaffected |
| **marketplace down** | Marketplace CTA hidden | Other surfaces unaffected |
| **payment down** | Upgrade CTA hidden; webhook arrears Stripe-retried | Stripe retries up to 3 days; reconciliation job catches |
| **engagement down** | No notifications; XP/streak frozen | Re-sync from NATS dead-letter on recovery |
| **NATS down** | Cross-service events queue locally; eventual delivery | Producer retains with bounded retention |
| **AI provider down** | Falls back to next provider; graceful degrade for AI-only features | Per ADR-0019 multi-provider |
| **Stripe down** | No new payments; UI shows "try again in a few min" | Sub-day outage tolerated; longer → Razorpay fallback prototype |
| **Daily.co down** | Sessions cannot start; reschedule policy | Session refund + reschedule flow |
| **FCM/APNS down** | Push drops; in-app + email still work | Best-effort |

---

This matrix is **load-bearing** for sprint planning: a sprint touching app X and service Y must consult the relevant row + column.
