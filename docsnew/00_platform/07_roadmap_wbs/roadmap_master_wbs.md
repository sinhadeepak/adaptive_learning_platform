# Platform Roadmap & Master WBS

**Status:** DRAFT v0.1 · 2026-05-27
**Anchored to:** Master BRD §2.3 · all per-surface `04_wbs.md`

---

## 1. Platform Roadmap

| Phase | Window | Theme | Primary Outputs |
|-------|--------|-------|-----------------|
| **Phase 0** | M-2 → M0 | Foundation freeze | Final ADRs, content seed sprint, infra provisioning, team alignment on rebuild docs |
| **Phase 1** | M0 → M6 | **MVP launch** | Vidya web-student + mobile + portal/admin basics, learning core + AI Gateway scaffold + 5 question types, quiz, payment, identity, engagement basics. Freemium live. |
| **Phase 2** | M6 → M12 | **Depth + creator economy** | Battle, full marketplace (KYC + Connect + Daily.co), full web-portal + web-admin, all 22 question types, AI Gateway touchpoints, SM-2, error patterns, rank prediction, community, broadcasts, multi-currency. |
| **Phase 3** | M12 → M18 | **Intelligence** | AI vision (camera scan), full localisation, per-concept IRT, advanced analytics, parent portal, gated stub question types. |
| **Phase 4** | M18 → M36 | **Scale** | Global expansion (2 markets), 5+ languages, white-label, institutional SaaS. |

## 2. Effort Summary by Track

| Track | Phase 1 SP | Phase 2 SP | Phase 3 SP | Total |
|-------|------:|------:|------:|------:|
| **00_platform (foundation work)** | 80 | 30 | 10 | 120 |
| **web-student** | 313 | 152 | 30 | 495 |
| **mobile** | 430 | 165 | 33 | 628 |
| **web-portal** | 180 | 270 | 9 | 459 |
| **web-admin** | 260 | 140 | 16 | 416 |
| **identity** | 290 | 90 | 18 | 398 |
| **learning** | 320 | 210 | 52 | 582 |
| **quiz** | 270 | 76 | — | 346 |
| **battle** | 45 | 247 | — | 292 |
| **marketplace** | 35 | 331 | — | 366 |
| **payment** | 260 | 93 | — | 353 |
| **engagement** | 180 | 128 | — | 308 |
| **TOTAL** | **~2,663** | **~1,932** | **~168** | **~4,763** |

> **Sanity check vs BRD v2 baseline** (113 stories / 782 SP MVP): the rebuild pack is larger because it documents more surfaces (4 apps + 7 services × per-pack breakdown rather than a single rollup). The MVP slice — Phase 1 only — sits at ~2,660 SP, which is comparable on a per-track basis to BRD v2 if we re-aggregated. The growth reflects (a) richer NFRs per surface, (b) explicit hardening + chaos-test work packages, (c) cross-cutting items called out per surface instead of buried in a foundation epic.

## 3. Team Allocation (Master BRD §7 baseline = 12 people)

| Role | Phase 1 Assignment |
|------|--------------------|
| **Tech Lead** | Oversight + Architecture + unblocking |
| **2 BE (Python)** | learning + engagement + payment |
| **1 BE (Go)** | quiz; battle Phase 2 onwards |
| **2 FE** | web-student (primary) + web-admin |
| **0.5 FE** | web-portal (Phase 1 light scope) |
| **2 Mobile** | mobile (Flutter) |
| **1 DevOps** | infra, CI, observability, AWS |
| **1 ML** | learning's adaptive engine + AI Gateway |
| **1 QA Lead** | cross-surface gates, load + chaos tests |
| **1 Designer** | Vidya v3 system + screens |

**Recommendation flagged in mobile WBS:** Add a 3rd mobile engineer to compress mobile Phase 1 from ~10 months to ~6 months. Without it, mobile lags web-student by 3–4 months.

## 4. Phase 1 Critical Path

The longest sequence of dependent work that gates launch:

```
identity foundation
  → identity auth methods (S1–S4)
    → JWT validate library publish (S5)
      → learning catalog + content + 5 type handlers (S5–S10)
        → quiz session + answer + scoring (S6–S11)
          → web-student practice (S9–S14)
            → payment subscribe + entitlement (S12–S15)
              → Phase 1 hardening + launch (S15–S16)
```

~16 sprints = **8 months elapsed**. Tight if any of these slips. Buffer 15% per [BRD v2 baseline](../../../docs/00_requirements/02_BRD_v2_Adaptive_Learning_Platform.docx) → 9 months realistic.

## 5. Cross-Surface Milestones

| Milestone | When | Touches |
|---|---|---|
| **M-PLAT-1: Foundations green** | M1 | All services scaffolded; CI gates live |
| **M-PLAT-2: First end-to-end** | M3 | Signup → home → quick practice → result on web-student (no payment) |
| **M-PLAT-3: Premium unlock works** | M5 | Subscribe → entitlement flips → premium feature visible |
| **M-PLAT-4: Mobile parity (online)** | M6 | Mobile matches web-student top 5 journeys |
| **M-PLAT-5: Public Phase 1 launch** | M7 (after pen-test + 4-week beta) | All 4 apps + 7 services live; freemium live |
| **M-PLAT-6: Battle live** | M9 (Phase 2) | battle service + UI |
| **M-PLAT-7: Marketplace live** | M11 (Phase 2) | marketplace + Daily.co + Connect |
| **M-PLAT-8: Institution onboarding** | M12 (Phase 2) | web-admin institution mgmt + cohort views |
| **M-PLAT-9: AI vision (camera-scan)** | M15 (Phase 3) | learning AI Gateway vision + mobile |
| **M-PLAT-10: Global expansion** | M24+ (Phase 4) | multi-region + multi-currency |

## 6. Gantt Overview (Quarter-Level)

```
Quarter                Q1  Q2  Q3  Q4  Q5  Q6  Q7  Q8  Q9  Q10 Q11 Q12
Phase                   1   1   1   2   2   2   2   3   3   3   3   4
identity                ▓▓▓▓▓▓▓▓░░
learning                ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░
quiz                    ░▓▓▓▓▓▓▓░
battle                  ░░░░░░░░▓▓▓▓▓▓▓
payment                 ░▓▓▓▓▓▓▓░░░░
marketplace             ░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓
engagement              ░░▓▓▓▓▓░░░░░░░░
web-student             ░▓▓▓▓▓▓▓░░░░░░░░
mobile                  ░▓▓▓▓▓▓▓▓▓▓░░░░░
web-portal              ░░▓▓▓▓▓░░░░░▓▓▓▓▓░
web-admin               ░▓▓▓▓▓▓▓▓░░░░░░░░
                            ↑          ↑
                            Phase1     Phase2
                            launch     launch
```

Legend: `▓ active build` · `░ Phase-2 work or pause`

## 7. Phase 1 Sprint Cadence (Recommended)

- 2-week sprints
- Sprint 0: foundations
- Sprints 1–6: per-track build with rolling integration
- Sprint 7: first end-to-end (M-PLAT-2)
- Sprints 8–13: feature build-out + integration
- Sprint 14: hardening + pen-test
- Sprint 15: 4-week beta → fixes → launch (M-PLAT-5)

## 8. Risk-Adjusted Plan

| Risk | Schedule impact | Mitigation already in plan |
|---|---|---|
| identity slip → blocks everything | Up to 4 weeks | 25% buffer + prioritise identity team |
| learning AI Gateway scope creep | 4 weeks | Phase 1 scope = scaffolding + 1 touchpoint only |
| Mobile lag (2-engineer constraint) | 4 months | Recommend 3rd mobile engineer; otherwise launch mobile 2 months after web |
| Stripe India approval | 6 weeks | Razorpay fallback prototype kept |
| Content seed unavailable | 4 weeks | Pre-launch content sprint M-2 |
| OQ-EN-00 unresolved | structural risk | Resolve in Phase 1 Week 2 |
| OQ-WA-01 SSO provider | 2 weeks | Resolve in Phase 1 Week 1 |
| Mobile App Store rejection | 4 weeks | Pre-submission checklist + privacy review |

## 9. Pre-Phase-1 Checklist (M-2 to M0)

- ✅ All 29 ADRs accepted (per memory)
- 🟡 Master BRD signed off (this doc pack) — **PENDING REVIEW**
- 🟡 Vidya v3 design system frozen (per ADR-0034) — **CHECK STATUS**
- ⬜ OQ-EN-00 (service ceiling) — ADR resolution
- ⬜ OQ-WA-01 (SSO provider) — decision
- ⬜ AWS access provisioned
- ⬜ Stripe India merchant approved
- ⬜ Initial content seed delivery plan from content team
- ⬜ FCM/APNS keys
- ⬜ Daily.co contract
- ⬜ LLM provider contracts
- ⬜ Audit log immutable storage provisioned
- ⬜ Team hired/reassigned per §3

## 10. Definition of Phase 1 Launch

Platform is launchable when all of:
- All per-surface `DoD`s green (per each `04_wbs.md` §11/§12)
- Master BRD §11 success criteria met
- Pen-test passed
- DR rehearsal complete
- Compliance attestation (PCI-DSS scope, DPDPA)
- 4-week closed beta with 100 pilot users → < 2 P1 issues outstanding
- Launch checklist (`docs/05_launch/Go-Live_Checklist.docx`) → adapted into `docsnew/30_appendices/launch_checklist.md` (TODO)
- Roll-back plan documented
