# Task 6 Report: GetQuestion Language-Awareness + Translation Delivery

## Status: COMPLETE

## Files Changed

1. `services/quiz/internal/store/store.go` — signature changed + LEFT JOIN query
2. `services/quiz/internal/server/sessions.go` — all 7 call sites threaded with `sess.ContentLanguage`
3. `services/quiz/internal/server/sessions_pg_test.go` — 2 existing calls updated to pass `"en"`
4. `services/quiz/internal/store/store_translation_pg_test.go` — NEW: store-level TDD test

## GetQuestion Signature Change

```go
// Before
func (s *Store) GetQuestion(ctx context.Context, id uuid.UUID) (domain.Question, error)

// After
func (s *Store) GetQuestion(ctx context.Context, id uuid.UUID, language string) (domain.Question, error)
```

The body now issues a LEFT JOIN onto `quiz_schema.question_translations t ON t.question_id = q.id AND t.language = $2` with per-field `COALESCE(t.stem, q.stem)` etc. For `language="en"` or unknown, the JOIN matches no row → all COALESCE calls return canonical English. No special-casing needed.

## Call Sites Found and How Each Got Its Language

| File | Line | Call site | Language source |
|------|------|-----------|-----------------|
| sessions.go | 863 | `/next` pre-served (first unanswered) | `sess.ContentLanguage` |
| sessions.go | 900 | `/next` resume current item | `sess.ContentLanguage` |
| sessions.go | 1006 | `/items` loop | `sess.ContentLanguage` |
| sessions.go | 1053 | `/answer` grading | `sess.ContentLanguage` |
| sessions.go | 1388 | `pickNextADP` tail return | `sess.ContentLanguage` (sess already in scope) |
| sessions.go | 1469 | `pickNext`/IRT tail return | `sess.ContentLanguage` (sess already in scope) |
| sessions.go | 1654 | `Get()` review/hydrate path | `sess.ContentLanguage` |
| sessions_pg_test.go | 374 | helper `newPGFixture` step | `"en"` (no session context) |
| sessions_pg_test.go | 451 | `correctAnswerFor` helper | `"en"` (no session context) |

## Helper Signatures Changed

None. Both `pickNextADP` and `pickNext` already receive `sess domain.Session` as a parameter, so `sess.ContentLanguage` was available directly at the call site. No new parameters needed.

## TDD Evidence

### RED Phase
Before the signature change, the test file used `st.GetQuestion(ctx, qid, "hi")` (3 args) while the implementation had 2 args — this caused a compile failure (RED confirmed by the brief's instructions).

### GREEN Phase
After the signature change and JOIN query:
```
=== RUN   TestPG_GetQuestion_OverlaysTranslation
--- PASS: TestPG_GetQuestion_OverlaysTranslation (0.03s)
PASS
ok  github.com/adaptive-learn/quiz/internal/store	0.032s
```

Three assertions all passed:
- `hi` → HI stem, choices=["क","ख"] (translated)  
- `en` → EN stem (canonical English)
- `zz` → EN stem (unknown lang → English fallback)

Test RAN against live DB, NOT skipped.

## Build and Regression

```
go build ./...          → clean (no output)
go test ./internal/server/... -run RoundTrip -v → PASS (0.09s)
```

## Self-Review

- The LEFT JOIN approach is correct: for any language without a translation row the COALESCE always falls to the `q.*` column. No special-casing for "en" needed.
- `correct_idx` (used for grading in `/answer`) comes from `q.correct_idx` — not COALESCEd — which is correct: translations don't change the answer key.
- `q.language` (the question's base language column) is still returned as-is; `ContentLanguage` only controls which overlay is selected, not what `q.Language` reports.
- Test cleanup uses `defer` so rows are removed even on test failure.

## Concerns

None. All call sites had `sess` in scope. The two test helpers that call `GetQuestion` outside a session context correctly pass `"en"`. The build is clean and the regression suite passes.
