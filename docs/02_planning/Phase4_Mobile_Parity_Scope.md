# Phase 4 Mobile Parity — Scope Catalog

**Status**: scope-only. Implementation runs as a standalone Phase-4-Mobile sprint after staging cutover, per the [Phase 4 plan](53_Phase4_ExamPrepDepth_SprintPlan.md) (which named S35 mobile parity but reasonably defers it given the magnitude).

## Purpose

Catalogue every Flutter screen + API call that needs to ship for the mobile app to reach feature-parity with web on the Phase 4 surfaces (S22–S34). The standalone sprint can pick this catalog up cleanly.

## Surfaces to mirror

### Exam-mode + mocks (S23 + S25)

| Web | Mobile | Backend dependency |
|---|---|---|
| `apps/web-student/src/pages/MockExam.tsx` | `apps/mobile/lib/screens/mock_exam_screen.dart` | `POST /quiz/sessions/from-blueprint` (S23), `GET /catalog/exam-blueprints` |
| Section navigation strip + global timer + marked-for-review queue | Mirror state machine; reuse existing `mock_state.ts` logic in Dart | — |
| OMR-style answer-sheet palette (S25) | `lib/widgets/omr_palette.dart` — port `mock_palette.ts` to Dart | — |
| `apps/web-student/src/pages/Mocks.tsx` (Available + Taken tabs) | `lib/screens/mocks_screen.dart` | `GET /quiz/sessions?mode=MOCK_BLUEPRINT`, `GET /catalog/exam-blueprints` |

### PYQ catalog + drill (S24)

| Web | Mobile |
|---|---|
| `PYQDrill.tsx` (chapter sidebar + year filter + click-to-reveal) | `lib/screens/pyq_drill_screen.dart` |
| `pyq_frequency.ts` helpers | port to Dart |

### Concept prereq pill (S26)

| Web | Mobile |
|---|---|
| Pill render in `TopicDetail.tsx` | extend `lib/screens/topic_detail_screen.dart` with the same gate fetch |
| `prereq_gate.ts` summariseGate | port to Dart |

### Daily revision queue (S27)

| Web | Mobile |
|---|---|
| `Revision.tsx` (top-N due + mastery pills) | `lib/screens/revision_screen.dart` |
| `revision_queue.ts` (formatInterval + masteryBucket + summariseRevisionList) | port to Dart |

### Syllabus coverage (S28)

| Web | Mobile |
|---|---|
| `SyllabusCoverage.tsx` (subject tabs + chapter cards) | `lib/screens/syllabus_coverage_screen.dart` |
| `syllabus_coverage.ts` (chapterStatusColour + chaptersRemaining) | port to Dart |

### Goals + trajectory (S33)

| Web | Mobile |
|---|---|
| `Goals.tsx` (form + trajectory pill + weekly actions panel) | `lib/screens/goals_screen.dart` |
| `goals.ts` (trajectoryColour + weeklyActionsCopy) | port to Dart |

### Topic detail consolidated panel (S26 + S32 + S34)

| Web | Mobile |
|---|---|
| Prereq pill + percentile pill + reference panel | extend `topic_detail_screen.dart` with all three |
| `peer_percentile.ts`, `references.ts`, `prereq_gate.ts` | port to Dart |

## Backend dependencies (already shipped)

Every endpoint the mobile sprint needs is live in `development`:

- `POST /quiz/sessions/from-blueprint` (S23)
- `GET /catalog/exam-blueprints` (S23)
- `GET /catalog/syllabus-tree` (S28)
- `GET /catalog/topics/{id}/prereqs` + `/gate` (S26)
- `GET /catalog/topics/{id}/references` (S34)
- `GET /content/pyqs` + `/pyqs/frequency` (S24)
- `GET /quiz/sessions?mode=MOCK_BLUEPRINT` (S25)
- `GET /analytics/sessions/{id}/breakdown` (S22)
- `GET /analytics/student/{id}/time-stats` (S22)
- `GET /analytics/student/{id}/error-patterns` (S29)
- `GET /analytics/syllabus-coverage/{id}` (S28)
- `GET /analytics/revision/{id}` (S27)
- `GET /analytics/peer-percentile/{id}` (S32)
- `GET /analytics/cohort-distribution` (S31)
- `PATCH /profile/me/goals` (S30)

## Implementation order (proposed)

1. **TopicDetail consolidation** (S26 + S32 + S34) — highest reuse, single screen extension.
2. **Revision** (S27) — high daily-engagement signal; low surface area.
3. **PYQDrill** (S24) — content-heavy; reuse existing topic-detail navigation.
4. **SyllabusCoverage** (S28) — read-only, no state machine.
5. **Mocks + MockExam** (S23 + S25) — biggest screen; deepest state machine. Save for last so the simpler ports stabilise the Dart helper utilities first.
6. **Goals** (S33) — small form; bundle with other settings screens.

## Test coverage

Mirror the web pure-helper tests in Dart. Each ported helper from `apps/web-student/src/lib/*.ts` should have a matching `test/{helper}_test.dart` with the same boundary cases.

Estimated effort: ~3-4 sessions of focused Flutter work to ship the 6 screens + 7 helper ports + parity tests.
