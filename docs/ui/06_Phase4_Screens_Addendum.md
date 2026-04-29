# Phase 4 Screens Addendum — Exam-Prep Depth

**Applies to**: UI Master Catalogue v1.0
**Date**: 2026-04-28
**Status**: DRAFT — gated on Phase 4 strategic decisions
**Parent doc**: extends [`00_MASTER_README.md`](00_MASTER_README.md). Existing 109-screen catalogue stays; Phase 4 adds new screens + extends a few existing ones.

This addendum captures the screens introduced or extended by Phase 4 (Sprints 22 → 36). All screens consume the existing design tokens in `00_design-system.css` — never hardcode hex values.

---

## 1. New screen count

| Portal | Existing | New in P4 | Total at P4 close |
|---|---|---|---|
| Student Web | 16 | +6 | 22 |
| Mobile App | 21 | +6 | 27 |
| Admin Portal | 17 | +2 | 19 |
| Teacher Portal | 27 | +2 | 29 |
| Content Author | 28 | +1 | 29 |
| **Total** | **109** | **+17** | **126** |

Plus extensions to **8 existing screens** (StudyPlan, WeaknessDiagnosis, TopicDetail, ResultPanel, MockTest player, Profile, Notifications, Home).

---

## 2. New screens — Student Web (`01_StudentPortal_Web/`)

### S-W-17 — `MockTest` v2 (exam-mode player)
**Purpose**: Take a real-pattern timed mock with per-section timers, OMR-style answer sheet, marked-for-review queue, exam-mode reliability.
**Layout**: Full-screen overlay; header carries section-tabs + global timer + section-timer; main area is question + 4 choices (OMR-style); right panel is question palette (numbered + colour-coded by state); bottom bar has Mark for Review + Clear + Save & Next.
**States**: Pre-mock instruction screen, in-progress, paused (disconnect), section-locked (Physics expired, cannot return), submitted, reviewing.
**Tokens**: amber for marked-for-review; red for time-pressure (<5 min remaining).
**Sprint**: P4-S23 + P4-S25.

### S-W-18 — `Mocks` (mock series)
**Purpose**: List taken / scheduled / available mocks with predicted AIR + section accuracy + time-taken trend.
**Layout**: Tabbed interface (Available | Scheduled | Taken). Each card: blueprint name, last-taken-date, predicted AIR, section breakdown bars.
**Tokens**: green for "above target", red for "behind", neutral for "available".
**Sprint**: P4-S25.

### S-W-19 — `PYQDrill` (chapter-wise + year-wise PYQ navigator)
**Purpose**: Browse PYQs by chapter + year + paper session; see frequency-by-chapter analysis.
**Layout**: Left sidebar — Subject → Chapter tree. Main pane — year filter pills + question list. Right panel (collapsible) — frequency analysis chart (questions per chapter per year).
**Tokens**: trending-up arrow in green; trending-down in red.
**Sprint**: P4-S24.

### S-W-20 — `Revision` (daily revision queue)
**Purpose**: Show topics due for revision today (top 10), with mastery state + last-attempt date.
**Layout**: Hero card (count + "Topics due for revision today"). List of 10 topics with topic title + chapter + mastery pill + "Practice now" CTA.
**States**: Empty (no topics due), pre-mock-sprint mode (compressed cadence + high-priority badge).
**Sprint**: P4-S27.

### S-W-21 — `SyllabusCoverage` (chapter-level coverage)
**Purpose**: See "you've covered N% of JEE Physics syllabus" with chapter-level breakdown.
**Layout**: Top bar — overall coverage percentage + missing-chapter call-out. Main — Subject → Chapter tree, each chapter row has mastery colour + percent-covered bar.
**Tokens**: green ≥ 70%, blue 40–69%, red < 40%, faint not-started.
**Sprint**: P4-S28.

### S-W-22 — `Goals` (target rank + trajectory + gap analysis)
**Purpose**: Set target AIR + see current trajectory + gap-closer recommendations.
**Layout**: Hero — target rank input + "exam date" picker. Below — trajectory chart (current vs target over weeks). Gap-closer recommendations card lists top 3 actions ("focus Modern Physics", "+2 mocks/week", "+15 min daily revision").
**States**: No goal set, on-track, behind, ahead.
**Sprint**: P4-S33.

---

## 3. Extended screens — Student Web

### S-W-existing — `StudyPlan` v2 extension
**What changes**: Static 7-day card → multi-week view with weekly recalibration. Adds "this week's focus" digest, "you are on track / behind / ahead" pill, mocks-per-week dynamic.
**Sprint**: P4-S30.

### S-W-existing — `WeaknessDiagnosis` extension
**What adds**: "Pattern" panel showing per-error-type counts (silly mistakes, conceptual gaps, time pressure, sign/unit errors, formula errors, unattempted) + per-pattern drill CTA.
**Sprint**: P4-S29.

### S-W-existing — `TopicDetail` extension
**What adds**:
- Time-per-question card (median + percentile vs cohort)
- Peer-percentile card (hidden when cohort < 30)
- Reference materials panel (NCERT chapter, video, derivation, formula sheet)
- Prereq pill ("Master Newton's Laws first" when prereq mastery < 0.3)
**Sprint**: P4-S22 (time card) + P4-S26 (prereq) + P4-S32 (peer percentile) + P4-S34 (references).

### S-W-existing — `ResultPanel` (post-quiz / post-mock)
**What adds**: Per-question time-spent column. Post-mock: section-wise accuracy + time-spent breakdown. Predicted-AIR card with honest source labelling (`cohort` vs `fallback`).
**Sprint**: P4-S22 (time) + P4-S31 (rank).

### S-W-existing — `Home`
**What adds**: "Topics due for revision today" tile (count + CTA to Revision page); "Pre-mock sprint" banner when target_exam_date is within 7 days.
**Sprint**: P4-S27 + P4-S30.

### S-W-existing — `Notifications`
**What adds**: New `revision.due` notification kind; per-user mute toggle in preferences.
**Sprint**: P4-S27.

---

## 4. New screens — Mobile (`02_MobileApp/`)

S35 ships mobile parity. New mobile screens mirror the web set:

| Screen | Source | Sprint |
|---|---|---|
| M-22 — MockTest v2 (exam-mode player) | mirrors S-W-17 | P4-S35 |
| M-23 — Mocks (series) | mirrors S-W-18 | P4-S35 |
| M-24 — PYQDrill | mirrors S-W-19 | P4-S35 |
| M-25 — Revision | mirrors S-W-20 | P4-S35 |
| M-26 — SyllabusCoverage | mirrors S-W-21 | P4-S35 |
| M-27 — Goals | mirrors S-W-22 | P4-S35 |

Mobile-specific design notes:
- Mock-test player uses a single-column layout (question + choices); the question palette becomes a bottom-sheet drawer.
- OMR answer marking is a tap-to-mark interaction with haptic feedback on mark / clear.
- Section-locked transitions show an explicit modal ("Physics time is up. Moving to Chemistry.").
- Revision queue is a swipeable list (swipe-right to defer, swipe-left to "mark mastered").
- Mobile-only feature reserved for P5+: offline mock attempts (start mock, lose connection, complete offline, sync on reconnect).

---

## 5. New screens — Admin Portal (`03_AdminPortal/`)

### A-18 — `ExamBlueprintEditor`
**Purpose**: Admin-only blueprint CRUD. Edit / create / version exam blueprints.
**Layout**: Form view — exam, name, total questions, total minutes, section composition (JSON-edit with validation), per-section time-locked toggle.
**Auth**: PLATFORM_ADMIN only.
**Sprint**: P4-S25.

### A-19 — `PYQIngestStatus`
**Purpose**: Show recent PYQ ingest job runs, success/failure rates, common rejection reasons.
**Layout**: Table view — paper_session, ingested-at, total_rows, success_rows, failure_rows, error log preview.
**Sprint**: P4-S24.

---

## 6. New screens — Teacher Portal (`04_TeacherPortal/`)

### T-28 — `CohortErrorPatterns`
**Purpose**: Per-cohort rollup of error patterns; identify systemic weakness types.
**Layout**: Stat tiles — top error pattern across cohort. Below: per-student error-pattern breakdown table (links to existing student drill-down from S13).
**Sprint**: P4-S29 educator surface.

### T-29 — `CohortSyllabusCoverage`
**Purpose**: Per-cohort syllabus coverage; identify which chapters the cohort hasn't engaged with.
**Layout**: Heatmap — chapters (rows) × students (columns) coloured by mastery. Bottom: aggregate coverage per chapter (mean / median).
**Sprint**: P4-S28 educator surface.

---

## 7. New screen — Content Author Portal (`05_ContentAuthorPortal/`)

### AU-29 — `PYQTagger` (PYQ tagging UI)
**Purpose**: Bulk PYQ tagging from the ingest pipeline. Authors review LLM-tagged questions + confirm topic + chapter assignment.
**Layout**: Question list with proposed tags (topic, chapter, difficulty); per-row Approve / Reject / Edit. Side panel — frequency analysis if topic_id is changed.
**Sprint**: P4-S24.

---

## 8. Design tokens — Phase 4 additions

No new colour tokens. Phase 4 reuses existing tokens; the new screens don't introduce visual primitives outside the existing ALP.* component library.

New component additions to the ALP.* library (in `00_components.js`):

- `ALP.SectionTimer` — circular timer for per-section time budget. Tokens: amber when < 25% remaining, red when < 5%.
- `ALP.OMRChoice` — radio-style answer choice with marked-for-review state.
- `ALP.QuestionPalette` — grid of question numbers with colour-coded state (unanswered / answered / marked / current).
- `ALP.MasteryHeatmap` — chapters × students grid with mastery colour overlay (used in T-29).
- `ALP.PercentilePill` — peer-percentile pill with anonymity-threshold disclosure.
- `ALP.TrajectoryChart` — line chart with current trajectory vs target trajectory + projected end-state marker.

These extend the existing component library; mobile equivalents in `alp_design_tokens` for Flutter ship in P4-S35.

---

## 9. Accessibility considerations (Phase 4 specific)

| Screen | A11y consideration |
|---|---|
| MockTest v2 | Timer announced periodically (5-min, 1-min, 10-sec); section transitions announced; OMR choices keyboard-navigable; marked-for-review state in aria-pressed |
| OMR answer sheet | Each choice carries aria-label "Question N, option X, [marked / answered / unanswered / marked for review]" |
| Question palette | Grid keyboard-navigable with arrow keys; current question announced |
| Revision daily view | List role + state per item; skip-to-content shortcut |
| Goals trajectory | Chart description provides text-equivalent of visual trajectory |
| Reference panel | External-URL links carry `rel="noopener noreferrer"` + aria-labels |

WCAG-AA compliance is required for all new screens per the existing accessibility plan.

---

## 10. Cross-reference

| Screen | Sprint | Requirement | ADR |
|---|---|---|---|
| S-W-17 MockTest v2 | P4-S23 + S25 | FR-P4-02, FR-P4-03, FR-P4-06 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| S-W-18 Mocks | P4-S25 | FR-P4-06 | — |
| S-W-19 PYQDrill | P4-S24 | FR-P4-04 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| S-W-20 Revision | P4-S27 | FR-P4-08, FR-P4-09 | [0014](../adr/0014-spaced-repetition-scheduling.md) |
| S-W-21 SyllabusCoverage | P4-S28 | FR-P4-10 | — |
| S-W-22 Goals | P4-S33 | FR-P4-15 | — |
| A-18 ExamBlueprintEditor | P4-S25 | ADM-REQ-101 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| A-19 PYQIngestStatus | P4-S24 | (admin) | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |
| T-28 CohortErrorPatterns | P4-S29 | TCH-REQ-101 | [0016](../adr/0016-error-pattern-classification.md) |
| T-29 CohortSyllabusCoverage | P4-S28 | TCH-REQ-102 | — |
| AU-29 PYQTagger | P4-S24 | AUT-REQ-101 | [0012](../adr/0012-exam-blueprint-pyq-schema.md) |

Mobile mirrors (M-22..M-27) all map to P4-S35 + their web parents.
