# Product Vision & Personas

**Status:** DRAFT v0.1 · 2026-05-27
**Anchored to:** [Master BRD](../02_master_brd/master_brd.md)

---

## 1. Vision Statement

> "To be the most intelligent and personalised exam-preparation platform in India — one that knows each student as an individual, adapts to their strengths and weaknesses in real time, and guides them confidently from their first practice question to exam day and beyond."

## 2. North Star Metric

**Average readiness-score uplift over a 60-day window.**

- Phase 1 target: +15 pts
- Phase 2 target: +25 pts
- Why this metric: it captures the joint product proof — students using the platform actually get better, measurably.

## 3. Strategic Bets (3-year horizon)

| Bet | What we believe | What we'll see if right |
|-----|-----------------|-------------------------|
| **B-1 Adaptive intelligence wins** | Personalised > one-size-fits-all even with imperfect ML | Higher engagement and readiness uplift vs static-content cohort |
| **B-2 Mobile-first India** | Most learning happens on phones, often offline | ≥ 60% sessions from mobile; offline practice used by ≥ 40% premium |
| **B-3 Creator economy compounds** | Top tutors bring their audience | ≥ 25% of revenue via marketplace by month 18 |
| **B-4 Quality moat via moderation + kappa monitoring** | Strict review → trustworthy item bank | Net-positive item acceptance trend; sub-5% revision rate after Phase 2 |
| **B-5 Institutional B2B unlocks 5x reach** | Schools/coaching are seat-license buyers | 100 institutions by month 18; ARR mix shifts to 30% B2B |

## 4. Anti-Goals (what we are *not* building)

- Not a generic LMS.
- Not a free YouTube competitor (no ad-supported tier).
- Not a course storefront for non-exam topics (Phase 3+ only).
- Not a Zoom replacement (we use Daily.co).
- Not a payment processor (we use Stripe).
- No bespoke per-institution branding in Phase 1 — Aurora/Vidya design is the brand.

## 5. Personas (Detail)

### 5.1 Aryan — Self-Driven NEET Aspirant (B2C Anchor)

| | |
|---|---|
| **Age** | 18 |
| **Goal** | Score ≥ 600/720 on NEET; medical college admission |
| **Device** | Mid-tier Android primary; occasional family desktop |
| **Network** | 4G primary; patchy in tier-2 city |
| **Spend** | ≤ ₹2,000/year on EdTech |
| **Frequency** | 6–8 short sessions/day + 1 long session/weekend |
| **Frustrations** | "I waste time on topics I'm already strong in." · "Apps eat my data." · "I don't know if I'm ready." |
| **What success looks like** | Daily login → mission → ≤ 30 min spent → see weekly score uptick |

**Designed-for journeys (mobile + web-student):** Today's Mission, Quick Practice, Mock Test, Readiness drill-in, Offline practice on commute.

### 5.2 Priya — Institution Student (B2B Anchor)

| | |
|---|---|
| **Age** | 17 |
| **Goal** | Match top of her coaching batch + clear JEE Main |
| **Device** | Desktop in lab + Android at home |
| **Network** | WiFi + 4G |
| **Spend** | ₹0 — paid via institution |
| **Frequency** | Daily 60-min lab time + 30-min self practice |
| **Frustrations** | "I can't see how I compare to my batch." · "Coaching content doesn't target my gaps." |
| **Designed-for journeys** | Batch dashboard view (read-only from teacher), Focused Practice on assigned topics, Mock alignment with coaching schedule |

### 5.3 Dr. Sharma — Expert/Tutor (Creator Anchor)

| | |
|---|---|
| **Age** | 42 |
| **Background** | Physics PhD; coaching faculty + independent author |
| **Device** | Desktop primary; occasional tablet for review |
| **Goal** | Supplemental income (₹40,000+/mo) + reputation |
| **Frustrations** | "Authoring tools elsewhere are clunky." · "Reviews take forever." · "No transparent earnings." |
| **Designed-for journeys** | Single-item author with KaTeX, AI Draft, bulk CSV, quality dashboard, KYC + Connect + weekly payout |

### 5.4 Rahul — Institution Admin (B2B Customer)

| | |
|---|---|
| **Age** | 40 |
| **Role** | Manages 500 students at a coaching centre |
| **Goal** | Identify struggling students early; defend renewal |
| **Frustrations** | "I learn who's failing too late." · "No batch comparisons." |
| **Designed-for journeys** | Institution dashboard (Phase 2), batch progress, drill into individual, CSV export |

### 5.5 Maya — Moderator (Internal)

| | |
|---|---|
| **Role** | Reviews ~80 items/day |
| **Goal** | Clear queue within 24h SLA; give actionable feedback |
| **Designed-for journeys** | Take-next-item, approve/reject/revise, kappa drift surface |

### 5.6 Ravi — Platform Admin (Internal)

| | |
|---|---|
| **Role** | Ops, billing, escalations, health |
| **Goal** | Single pane of glass |
| **Designed-for journeys** | User search, suspend, refund, feature flags, AI Gateway control, audit log |

## 6. Persona-to-Surface Map

| Persona | web-student | mobile | web-portal | web-admin |
|---------|:-----------:|:------:|:----------:|:---------:|
| Aryan | ✅ primary | ✅ **primary** | — | — |
| Priya | ✅ **primary** | ✅ | — | — |
| Dr. Sharma | — | — | ✅ **primary** | — |
| Rahul | — | — | ✅ (cohort view P2) | ✅ (institution mgmt P2) |
| Maya | — | — | — | ✅ **primary** |
| Ravi | — | — | — | ✅ **primary** |

## 7. Brand & Voice

- Brand name: **Vidya** (Hindi: "knowledge"). Design system Vidya v3 per ADR-0034.
- Voice: confident, warm, evidence-based. Never patronising. Never gamified-for-its-own-sake.
- Hindi parity from launch in copy; English default.
