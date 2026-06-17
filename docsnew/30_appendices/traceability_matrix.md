# Traceability Matrix

**Status:** DRAFT v0.1 · 2026-05-27 · structure-complete, content-populating

This matrix links every FR → Story → WBS work package → planned test. Initially populated at a **summary level**; per-surface deep traceability lives inside each surface's `02_requirements.md` and `03_user_stories.md` headers.

---

## How To Read

| Column | Source |
|---|---|
| FR-ID | from `02_requirements.md` in each surface |
| Story | from `03_user_stories.md` |
| WBS | from `04_wbs.md` |
| Test | TC ID — to be filled by QA in `30_appendices/qa_test_register.md` (TBD) |

ID prefixes:
- `WS` web-student · `MB` mobile · `WP` web-portal · `WA` web-admin
- `ID` identity · `LR` learning · `QZ` quiz · `BT` battle · `MK` marketplace · `PY` payment · `EN` engagement

---

## Cross-Surface Critical-Path Traceability

The 5 invariants the platform depends on:

| Invariant | FR | Story | WBS | Test |
|---|---|---|---|---|
| **Auth + JWT validate lib** | FR-ID-03-07 | S-ID-03.07 | WP-ID-1.4 | TC-ID-03.07 |
| **Resolution contract — no marks from learning** | FR-LR-02-09 + FR-QZ-03-04 | S-LR-02.01 + S-QZ-03.04 | WP-LR-1.3 + WP-QZ-1.4 | TC-CONTRACT-01 (CI gate) |
| **Entitlement flip < 60 s** | FR-WS-10-10 + FR-PY-05-04 | S-PY-05.04 | WP-PY-1.6 | TC-PY-05.04 |
| **Audit log tamper-evident** | FR-ID-07-03 + FR-WA-11-05 | S-ID-07.02 + S-WA-11.05 | WP-ID-1.8 + WP-WA-1.8 | TC-ID-07.02 |
| **Booking inventory race-safe** | FR-MK-05-02 | S-MK-05.02 | WP-MK-1.5 | TC-MK-05.02 |

## Per-Surface Story Counts (cross-check)

| Surface | Stories | SP | Coverage in this matrix |
|---------|--------:|---:|--------------------|
| web-student | 111 | 495 | Headers + critical-path; deep matrix per epic in 03_user_stories.md |
| mobile | 125 | 628 | Same |
| web-portal | 117 | 459 | Same |
| web-admin | 109 | 416 | Same |
| identity | 88 | 398 | Same |
| learning | 114 | 582 | Same |
| quiz | 74 | 346 | Same |
| battle | 63 | 292 | Same |
| marketplace | 91 | 366 | Same |
| payment | 81 | 353 | Same |
| engagement | 77 | 308 | Same |
| **TOTAL** | **1,050** | **4,643** | |

Note: total is slightly less than the WBS roll-up (4,763) because the platform-wide overhead (foundation work documented at platform level) sits outside per-surface story counts.

## NFR Traceability (Platform-wide)

| NFR-ID | Requirement | Surfaces verifying | Verification |
|---|---|---|---|
| NFR-PLAT-01..08 | Performance budgets | all | Lighthouse / k6 / Firebase Perf |
| NFR-PLAT-13..18 | Availability + RPO/RTO | all | DR rehearsal + chaos tests |
| NFR-PLAT-19..32 | Security | all | Pen-test + dependency scan |
| NFR-PLAT-33..40 | Compliance | identity + payment + marketplace + engagement | Audits |
| NFR-PLAT-41..48 | Usability + a11y | apps | WCAG audit + manual screen reader |
| NFR-PLAT-49..54 | Maintainability | all | Code coverage gates + lint + ADR coverage |
| NFR-PLAT-55..61 | Observability | all | Dashboard sign-off |
| NFR-PLAT-62..64 | Cost | all | Monthly finance review |
| NFR-PLAT-65..67 | Compatibility | apps | Browser + OS matrix tests |

## Open Question (OQ) Traceability

| OQ-ID | Question | Owner | Surface |
|---|---|---|---|
| OQ-LR-01 | Embedding model | ML | learning |
| OQ-LR-04 | Translation auto-publish floor | Compliance + ML | learning |
| OQ-WP-01 | Editor: TipTap vs Slate | FE Lead | web-portal |
| OQ-WA-01 | SSO provider | DevOps + Security | web-admin |
| OQ-WA-02 | Audit retention floor | Compliance | web-admin + identity |
| OQ-WA-04 | Impersonation: read-only vs full | Security + Product | web-admin + identity |
| OQ-MB-01 | iOS payments: Stripe vs StoreKit | Product + Legal + Finance | mobile + payment |
| OQ-MB-02 | Offline sync conflict | Mobile + Backend | mobile + quiz |
| OQ-PY-05 | Razorpay fallback activation | Eng leadership | payment |
| OQ-MK-01 | KYC re-verify cadence | Compliance | marketplace |
| OQ-MK-03 | India TDS 194O | Finance + Legal | marketplace + payment |
| OQ-EN-00 | **Service ceiling** (fold engagement) | Architecture | engagement (impacts all) |
| OQ-EN-01 | Email provider | DevOps + Finance | engagement |
| OQ-QZ-01 | Session storage Redis-vs-Postgres | Backend Lead | quiz |
| OQ-BT-01 | Rating algo: Glicko-2 vs ELO | ML + Product | battle |
| OQ-ID-01 | Password breach check | Security | identity |
| OQ-ID-03 | Refresh-token rotation strategy | Backend Lead | identity |

(See per-surface `01_brd.md` §12 for the full list of OQs — over 60 total.)

## Test Coverage Plan

A complete QA test register (`qa_test_register.md`) will be authored separately, modelled on:

```
TC-<SURFACE>-<FA>-<NN>: One test per Acceptance Criterion in 03_user_stories.md
```

Approx expected count: **~3,000 test cases** across automated + manual + load + chaos + security.

## Next Steps (Traceability Maintenance)

1. Convert this DRAFT into a live spreadsheet (export from CI / OpenAPI / story IDs) for sprint planning.
2. Add TC IDs once QA test register written.
3. Add Implementation status column once dev starts.
4. Add Test status column once tests run.
