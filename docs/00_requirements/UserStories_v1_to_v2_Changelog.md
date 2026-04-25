# User Stories v1 → v2 Changelog (GAP-13)

**Purpose**: tell engineering, QA, and design exactly what changed between [User Stories v1](04_UserStories_v1_Adaptive_Learning_Platform.docx) and the current authoritative [User Stories v2](05_UserStories_v2_Adaptive_Learning_Platform.docx) so the diff is understood before Sprint 1 planning. This is a GAP-24 Sprint 1 Start Gate item — Tech Lead distributes, 10 engineers acknowledge.

**Status**: ready for distribution.
**Owner**: Tech Lead.
**Date**: 2026-04-22.

---

## 1. One-paragraph summary

v2 is a structural rewrite, not a content edit. v1 was a flat list of 68 uniquely-ID'd requirements (with roughly 113 requirements total, most un-ID'd). v2 introduces a three-level **Epic → Feature → Story** hierarchy with 120 concrete backlog stories (`ST-EE-FF-SS`) that collectively reference 120 requirement IDs — the original 68 plus 52 new ones, with `MOD-REQ-02` merged into its sibling. Each v2 story carries Gherkin acceptance criteria, business rules, FR/NFR fields, UI/UX notes, dependencies, edge cases, DoD, data model snippets, API contracts, QA test case pointers, and a story-point estimate. **v2 is the only source engineers should read going forward.** v1 is retained for historical traceability and RTM lineage.

---

## 2. Structural changes

### 2.1 ID scheme

| Aspect | v1 | v2 |
|---|---|---|
| Primary backlog ID | `{STU,EXP,MOD,ADM}-REQ-NN` | `ST-EE-FF-SS` (Epic-Feature-Story) |
| Role/requirement ID | Same | Retained, now a field on each `ST-` story (one or more) |
| Epic ID | `Epic 1..10` narrative | `EPIC-01..10` with canonical names (see §3) |
| Feature ID | (absent) | `FT-EE-FF` new grouping level |

**For engineering**: quote **`ST-` IDs** in branch names, commit messages, and PR titles. Quote **`-REQ-NN` IDs** in RTM and contract tests for traceability back to BRD v2. Neither is interchangeable.

### 2.2 Fields added per story

v2 adds the following fields to every story. v1 had only the acceptance-criteria bullet list.

- **Story Points** (1 / 3 / 5 / 8 / 13)
- **Gherkin Acceptance Criteria** (Given/When/Then, replacing free-text AC)
- **Business Rules (BR)** — invariants the implementation must uphold
- **Functional Requirements (FR)** — behaviour list
- **Non-Functional Requirements (NFR)** — latency, availability, accessibility per story
- **UI / UX Notes** — wireframe references
- **Dependencies** — upstream stories that must ship first
- **Edge Cases (EC)** — negative paths with expected behaviour
- **Definition of Done** — per-story DoD in addition to the project DoD
- **Data Model** — DB tables / columns touched
- **API Contract** — endpoint + method + request/response shape
- **QA Test Cases** — references into [QA Test Case Register](../03_qa_testing/02_QA_TestCaseRegister_AdaptiveLearningPlatform.docx)

**For engineering**: a v2 story is stand-alone readable. You should rarely need to cross-reference to an LLD to begin implementation.

### 2.3 Epic restructuring

Epic numbering and names are preserved 1:1. Renames are cosmetic.

| # | v1 name | v2 name | Stories |
|---|---|---|---|
| 01 | Guest Screening Test | Guest Experience & Acquisition | 8 |
| 02 | Registration and Authentication | Registration & Authentication | 11 |
| 03 | Profile Setup | Profile Setup | 9 |
| 04 | Content Discovery | Content Discovery | 10 |
| 05 | Daily Practice and Quizzes | Daily Practice & Quizzes | 14 |
| 06 | Progress and Analytics | Progress & Analytics | 11 |
| 07 | Post-Exam Experience | Post-Exam Experience | 8 |
| 08 | Expert and Teacher | Expert & Teacher Workflows | 18 |
| 09 | Moderation | Moderation System | 11 |
| 10 | Platform Administration | Platform Administration | 20 |
| | | **Total** | **120** |

---

## 3. Requirement-ID changes

### 3.1 Removed / merged (1)

| v1 ID | Fate in v2 |
|---|---|
| `MOD-REQ-02` (Moderation dashboard) | **Merged** into `ST-09-01-01  Login & dashboard (MOD-REQ-01 + 02)`. Not a loss of scope — dashboard is covered under the combined login/dashboard story. |

### 3.2 Added (52 new requirement IDs, now appearing as standalone stories)

Listed here so owners can see at a glance which teams gained new scope.

**Student (19 new REQ-IDs)** — EPICs 05, 06, 07:

- `STU-REQ-34` Answer questions | `STU-REQ-35` Timer
- `STU-REQ-38` Retry wrong questions
- `STU-REQ-41..44` Discussion thread, upvote, leaderboard, report content
- `STU-REQ-46` Score history | `STU-REQ-48` Activity summary | `STU-REQ-49` Exam countdown | `STU-REQ-50` Study streak
- `STU-REQ-52` Topic detail | `STU-REQ-53` Quick practice from topic | `STU-REQ-55` Institution visibility
- `STU-REQ-57` Certificate | `STU-REQ-58` Log actual result | `STU-REQ-59` Predicted vs actual | `STU-REQ-60` What's next prompt
- `STU-REQ-61` Add new exam | `STU-REQ-62` Skill-based courses

**Expert / Teacher (11 new)** — EPIC 08:

- `EXP-REQ-02` Direct invite | `EXP-REQ-03` Institution path
- `EXP-REQ-06..09` Create / preview / submit / edit course
- `EXP-REQ-11..13` Bulk upload, submit question, review pending
- `EXP-REQ-15` Community participation | `EXP-REQ-16` View assigned students | `EXP-REQ-18` Batch analytics

**Moderator (6 new)** — EPIC 09:

- `MOD-REQ-04` Approve | `MOD-REQ-06` Reject | `MOD-REQ-07` Review course
- `MOD-REQ-08` Review flagged posts | `MOD-REQ-09` Remove live post | `MOD-REQ-11` Review behaviour reports

**Admin (15 new)** — EPIC 10 (largest expansion):

- `ADM-REQ-02` Drill-down dashboards | `ADM-REQ-03` Search/view user
- `ADM-REQ-06` Merge accounts | `ADM-REQ-07` Approve creators | `ADM-REQ-08` Grant/revoke admin access
- `ADM-REQ-09` Create/manage institutions | `ADM-REQ-10` Institution performance
- `ADM-REQ-11..13` Revenue / subscription / institution billing dashboards
- `ADM-REQ-15..18` Exam config, screening config, plans & pricing, moderation team
- `ADM-REQ-20` Platform announcements

### 3.3 Kept (67 preserved REQ-IDs)

All other v1 requirement IDs are preserved in v2 with the same semantic scope. Where scope expanded or wording tightened, it is reflected inside the v2 story's Gherkin AC; no ID-level surprise.

---

## 4. What this means for each team

### 4.1 Engineering

- Read v2 story top-to-bottom before starting work; v1 AC is superseded.
- API contract and data model sections are indicative — the [OpenAPI 3.1 spec](../01_design/03_OpenAPI_v3.1_AdaptiveLearningPlatform.docx) and [DB Schema/ERD](../01_design/02_DBSchema_ERD_AdaptiveLearningPlatform.docx) remain authoritative in case of conflict. Escalate any conflict to Tech Lead.
- Branch names: `<type>/<ST-id>-<short-slug>` e.g. `feat/ST-02-01-01-register-email`.

### 4.2 QA

- v2 story's QA Test Cases field points into the [QA Test Case Register](../03_qa_testing/02_QA_TestCaseRegister_AdaptiveLearningPlatform.docx). The 280-case register is unchanged in count; v2 adds the pointer from story to case.
- Gherkin AC in v2 can be lifted directly into test specs — no translation layer needed.

### 4.3 Product / Design

- Dependencies field is new — use it to sequence Sprint-level acceptance walkthroughs.
- Edge Cases field is new — include in design reviews.

### 4.4 RTM (Requirements Traceability Matrix)

- RTM continues to key off `-REQ-NN` IDs. The `ST-` layer is backlog-tracking, not traceability. [RTM](06_RTM_Adaptive_Learning_Platform.docx) needs a column for `ST-` mapping in the next revision — tracked as a minor doc action on the Tech Lead (not a gate item).

---

## 5. Sprint-scope implications

No Sprint 0 or Sprint 1 scope changes flow from v2 itself — v2 was authored before the sprint plan was finalised and the sprint plan's story-ID references are already v2-compatible.

Minor adjustments the Tech Lead should verify at Sprint 1 planning:
- Sprint 1's Auth + Profile + Catalog + Search stories (`STU-REQ-01..08, 53..58, 24..27, 28..30`) are all v1-lineage IDs, unchanged in scope.
- The 52 newly-IDed stories are concentrated in EPIC-08 (Teacher), EPIC-09 (Moderator), EPIC-10 (Admin) — i.e. Sprint 3 scope and beyond. Sprint 1 and Sprint 2 are minimally affected.

---

## 6. Distribution record (GAP-13 + GAP-24 row 2 gate evidence)

Ten engineering acknowledgements required before the gate row can be ☑.

| Role | Name | Ack method | Date |
|---|---|---|---|
| Backend Lead Python (Auth) | _______________________ | _______________________ | _________ |
| Backend Lead Python (Profile / Institution) | _______________________ | _______________________ | _________ |
| Backend Lead Python (Catalog / Search / Content / Notification) | _______________________ | _______________________ | _________ |
| Backend Lead Go (Quiz) | _______________________ | _______________________ | _________ |
| ML Engineer (Adaptive Engine / Analytics) | _______________________ | _______________________ | _________ |
| Frontend Lead (Web) | _______________________ | _______________________ | _________ |
| Frontend Lead (Web) | _______________________ | _______________________ | _________ |
| Mobile Lead (iOS) | _______________________ | _______________________ | _________ |
| Mobile Lead (Android) | _______________________ | _______________________ | _________ |
| DevOps Lead | _______________________ | _______________________ | _________ |
| QA Lead | _______________________ | _______________________ | _________ |

Gate row 2 (GAP-13) signs off when all acks are recorded.
