# Domain Glossary

**Anchored to:** [Master BRD](../02_master_brd/master_brd.md)

A single source of truth for terms used across the rebuild. When a term has been redefined or sharpened from BRD v2, the **Old → New** column makes the change explicit.

| Term | Definition | Old → New |
|------|-----------|-----------|
| **Adaptive engine** | The intelligence module in the `learning` service that updates per-concept mastery across the 9-dimension substrate (per ADR-0017) after every quiz response. | — |
| **AI Gateway** | Provider-agnostic LLM router (Anthropic / OpenAI / Google / Llama) inside the `learning` service (per ADR-0019). 5 touchpoints: authoring, quality_check, evaluation, translation, vision. | Was planned as separate service; now a module in `learning`. |
| **Aryan** | Primary persona — self-driven 18-yr-old NEET aspirant, mobile-first. | — |
| **Battle** | Real-time 1v1 quiz match served by the `battle` service. | — |
| **Blueprint** | Structured spec that defines item composition for a test (section weights, difficulty distribution, topic coverage). Per ADR-0012. | — |
| **Cohen's kappa** | Inter-rater agreement metric used to monitor AI Gateway evaluator drift. Auto-pause threshold: < 0.7 per criterion (per ADR-0019). | — |
| **Concept** | Atomic unit of learning content. Mastery is tracked at concept grain. | — |
| **Continue-where-left-off** | Home-screen affordance that resumes the user's last in-progress quiz session (server-authoritative session state). | — |
| **DPDPA** | Digital Personal Data Protection Act (India). Drives "download my data" and "delete account" features. | — |
| **Entitlement** | Server-authoritative boolean(s) on the user record indicating which paid features are accessible (e.g. `premium=true`). Set by `payment` service webhook → `identity`. | — |
| **EWA** | Exponentially Weighted Average — used in spaced-repetition scheduling alongside SM-2 (per ADR-0014). | — |
| **Exam blueprint** | See **Blueprint**. | — |
| **Focused Practice** | Practice mode: user picks 1–N topics and N items (5–50). | — |
| **Heuristic θ** | Phase 1 approximation of a learner's ability per subject — `(score − 0.5) × 3` from screening; real Bayesian θ deferred. | Documented as known shortcut, not bug. |
| **IRT** | Item Response Theory. Phase 1 uses heuristic substitutes; per-concept IRT activates when item bank ≥ 30/concept (per ADR-0017). | — |
| **Item** | A single question, with one or more parts. Type determined by the Type Handler Protocol (per ADR-0018). | — |
| **Mock Test** | Full-length, timed, blueprint-driven assessment that simulates exam-day conditions. | — |
| **Multi-parameter assessment** | The 9-dimension substrate (mastery × Bloom-depth × fluency × accuracy × retention × confidence × transfer × procedural × strategic) per ADR-0017. | — |
| **Per-Part** | Within a multi-part item, evaluation result for each part separately. Part of the resolution contract. | — |
| **Priya** | Secondary persona — 17-yr-old institution student, desktop-first in lab. | — |
| **PYQ** | Previous Year Question — past exam items, ingested with year/section metadata. | — |
| **Quick Practice** | 10-item adaptive session; no time pressure. | — |
| **Rank Prediction** | Calibrated forecast of student's exam-day rank within their cohort (per ADR-0015, Phase 2). | — |
| **Readiness Score** | 0–100 composite indicating exam preparedness. Updated within 60 s of any quiz completion. | — |
| **Resolution contract** | The strict 6-field result format returned by the question-type handlers: `status × matched_count × total_count × per_part × evaluation_mode × evaluator_metadata`. **Never includes marks.** Per ADR-0018. | Was implicit "score"; now explicit and load-bearing. |
| **Revision** | Practice mode driven by spaced-repetition queue (SM-2 + EWA). | — |
| **Screening** | 12-item baseline blueprint completed during onboarding to estimate starting θ. Adaptive Phase 1 only via fixed blueprint; Bayesian later. | — |
| **Service ceiling** | Hard cap of 6 services (per ADR-0005). New domains land as modules in existing services unless overridden by a new ADR. | Cap raised from "many" → 6. |
| **SM-2** | Spaced-repetition scheduling algorithm (per ADR-0014). | — |
| **Streak** | Consecutive-day study tracker; engagement primitive. | — |
| **Streak shield** | One missed-day grace per calendar month. | — |
| **Today's Mission** | Single-CTA home-screen entrypoint (per ADR-0024). | Replaces "feed of cards" approach. |
| **Type Handler Protocol** | The interface every question type implements to render + evaluate (per ADR-0018). 22 types + 6 gated stubs. | — |
| **Vidya** | The product brand name (and design system v3 per ADR-0034). Successor to "Aurora" branding. | Aurora → Vidya. |
| **WCAG 2.1 AA** | Accessibility conformance target for all student-facing surfaces. | — |
| **XP** | Experience points; gamification primitive awarded for engagement events. | — |
| **9-dim substrate** | See **Multi-parameter assessment**. | — |

## Acronyms

| | |
|---|---|
| **ADR** | Architecture Decision Record |
| **AI** | Artificial Intelligence (LLM-driven features here) |
| **APNS** | Apple Push Notification service |
| **BFF** | Backend For Frontend |
| **CDN** | Content Delivery Network |
| **CSP** | Content Security Policy |
| **EAP** | Expected A-Posteriori (Bayesian θ estimator) |
| **FCM** | Firebase Cloud Messaging |
| **GST** | Goods & Services Tax (India) |
| **HIBP** | Have I Been Pwned |
| **i18n** | Internationalisation |
| **IST** | Indian Standard Time (UTC+5:30) |
| **JWT** | JSON Web Token |
| **KPI** | Key Performance Indicator |
| **KYC** | Know Your Customer |
| **MAU** | Monthly Active Users |
| **MFA** | Multi-Factor Authentication |
| **NFR** | Non-Functional Requirement |
| **OTP** | One-Time Password |
| **PCI-DSS** | Payment Card Industry Data Security Standard |
| **PII** | Personally Identifiable Information |
| **RBAC** | Role-Based Access Control |
| **RPO** | Recovery Point Objective |
| **RTO** | Recovery Time Objective |
| **RUM** | Real User Monitoring |
| **SES** | Simple Email Service (AWS) |
| **SLA** | Service Level Agreement |
| **SLO** | Service Level Objective |
| **SP** | Story Point |
| **SSO** | Single Sign-On |
| **TBD** | To Be Determined |
| **TOS** | Terms of Service |
| **TOTP** | Time-based One-Time Password |
| **TTL** | Time To Live |
| **WBS** | Work Breakdown Structure |
| **WCAG** | Web Content Accessibility Guidelines |
| **WS** | WebSocket |
