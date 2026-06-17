# ADR-0025: Split combined "CBSE (Class 8-9)" exam into two exams

- **Status**: proposed
- **Date**: 2026-05-04
- **Deciders**: CTO, Tech Lead, Content Lead, Product Lead

## Context

Migration `017_seed_cbse_class8_9.py` introduced a single CBSE exam row keyed
on `11111111-0000-0000-0000-000000000005` named `CBSE (Class 8-9)`. The
catalog already attaches both Class 8 and Class 9 subjects to that one exam
(`Class 8 Science`, `Class 9 Science`, `Class 8 Maths`, `Class 9 Maths`, …
14 subjects total after migrations 019 and 020).

Bundling two grades under one exam was acceptable while we had a small
seed (~5 questions / chapter). After migration 034 the CBSE Class 9
slice alone has ~6,800 published questions across 68 chapters, and the
ExamDashboard mixes "Class 8 Maths" and "Class 9 Maths" in the same
"Subject mastery" list, the same readiness ring, and the same trajectory
chart. A student preparing for the **Class 9 final exam** doesn't want
their Class 8 work pulling the readiness number down (or vice versa for
a Class 8 student).

The split is structurally simple — the underlying subject codes already
encode the grade (`C8_*` vs `C9_*`) — but the data migration touches
multiple databases and every test fixture, so it needs a written plan.

## Decision

Replace the single `CBSE (Class 8-9)` exam with two separate exams,
each with its own subjects and topic catalog:

| New exam | Code   | UUID                                           | Owns subjects                |
|----------|--------|------------------------------------------------|------------------------------|
| Class 8  | `CBSE_8` | `11111111-0000-0000-0000-000000000007`         | All `C8_*` subjects          |
| Class 9  | `CBSE_9` | `11111111-0000-0000-0000-000000000008`         | All `C9_*` subjects          |

The original `11111111-…-005` row is renamed to `CBSE (legacy)` and
hidden from `/catalog/exams` via a new `is_active` column (default
`TRUE`, set to `FALSE` for the legacy row). It stays around so existing
mastery rows on legacy topic IDs don't orphan.

## Migration plan (forward-only, no destructive ops)

The migration is split across catalog + content + identity to keep each
step independently reversible. Catalog changes go first, content next
(idempotent reseed via new exam UUIDs), identity last (rebind users).

### Phase 1 — `catalog_schema` (alembic head: 020 → 021)

1. Add `exams.is_active boolean DEFAULT TRUE` (new column).
2. INSERT two new exam rows (`CBSE_8`, `CBSE_9`) with the UUIDs above.
3. UPDATE `subjects SET exam_id = …007 WHERE code LIKE 'C8\\_%'` (escaped underscore).
4. UPDATE `subjects SET exam_id = …008 WHERE code LIKE 'C9\\_%'`.
5. UPDATE `exams SET is_active = FALSE, name = 'CBSE (legacy)' WHERE id = …005`.
6. INSERT exam_question_type_support rows for the two new exam UUIDs
   (mirror the row set already wired for …005).

### Phase 2 — `content_schema` (no change needed)

Topics live in `catalog_schema.topics` and questions reference
`topic_id`, not `exam_id`, so no content migration is required. The
existing seed migrations (021 / 030 / 032 / 034) keep working without
edits because they only touch `topic_id`.

### Phase 3 — `identity_schema.user_exams`

For every user with `exam_id = …005`:

- If at least one mastery row exists on a `C9_*` topic: bind to `CBSE_9`.
- Else if at least one mastery row exists on a `C8_*` topic: bind to `CBSE_8`.
- Else: leave bound to `…005` (legacy) and surface a one-time prompt in
  the next dashboard render asking the student which class they're in.

This `user_exams` rebind goes in a separate alembic head in `identity_schema`
so it can be applied independently.

### Phase 4 — application code

- `apps/web-student/src/pages/Home.tsx` already reads `is_active` once
  the catalog returns it. Add a server-side filter `WHERE is_active`.
- `apps/web-portal` and `apps/web-admin` exam pickers — same filter.
- `apps/mobile/lib/screens/onboarding/exam_select_screen.dart` — same filter.
- Mock-test blueprint references in migration `018_mock_test_blueprints.py`
  need duplication: existing `…005` blueprints become `…007` + `…008`
  blueprints.

## Rollout

1. Land the catalog migration in a single PR. Verify on dev.
2. Land the identity rebind migration second, gated on a `--dry-run`
   alembic flag that prints what would change.
3. Ship the application filter (`is_active`) third. Until this lands,
   the legacy exam still appears in pickers — that's the safety net
   while user rebinds are converging.
4. Monitor `/catalog/exams?include_legacy=1` for one week to confirm
   no users remain bound to `…005`. Then remove the column entirely
   (or mark the migration as terminal).

## Consequences

### Positive

- ExamDashboard readiness is grade-scoped and meaningful.
- Class 8 and Class 9 mock-test blueprints can diverge naturally.
- Future CBSE Class 10 is a third row, not a third bucket inside one row.
- Per-grade analytics (engagement, attempts, mastery) become cohort
  analyses by exam UUID — already supported by the analytics fact tables.

### Negative

- Two more exam UUIDs in test fixtures. The 4 seeded test users
  (`docs/local_test_users.md`) need rebinding scripts; trivial.
- Marketplace product references (`007_seed_e2e_marketplace.py`)
  pinned to `…005` need to choose a target exam (Class 9, given the
  current course content). One-line update.

### Neutral

- No question regeneration. Topic UUIDs do not change.
- No mastery loss. EWA rows on topic IDs are independent of exam UUIDs.

## Out of scope (this ADR)

- Splitting CBSE (Class 10), CBSE (Class 11), CBSE (Class 12) — those
  exams aren't seeded yet; when they are, they go in as separate exam
  UUIDs from day one.
- Cross-grade analytics ("how is Class 8 doing across all institutions")
  — solved later by aggregating across exam UUIDs in the analytics layer.
