// Package store maps the quiz aggregate to Postgres.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/adaptive-learn/quiz/internal/domain"
)

var (
	ErrSessionNotFound  = errors.New("session not found")
	ErrQuestionNotFound = errors.New("question not found")
	ErrItemNotFound     = errors.New("session item not found")
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// CountQuestions returns the number of PUBLISHED questions for a topic.
func (s *Store) CountQuestions(ctx context.Context, topicID uuid.UUID) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM quiz_schema.questions WHERE topic_id = $1 AND status = 'PUBLISHED'`,
		topicID,
	).Scan(&n)
	return n, err
}

// ListUnservedCandidates returns the PUBLISHED questions for a topic that have
// NOT been served in the given session — used by the IRT branch to feed the
// Adaptive Engine's MFI selector. Includes the full IRT triple (a, b, c).
func (s *Store) ListUnservedCandidates(ctx context.Context, sessionID, topicID uuid.UUID) ([]domain.Question, error) {
	// Cross-session freshness: prefer questions this user has never seen,
	// then least-recently seen. The selector ranks by user exposure first
	// (NULL last_seen_at → top), then defers to the IRT-based selection
	// downstream. Limited to 200 to bound the candidate set the engine
	// scores without losing diversity for large topic banks.
	rows, err := s.pool.Query(ctx, `
		SELECT q.id, q.topic_id, q.stem, q.choices, q.correct_idx, q.difficulty_b,
		       q.discrimination_a, q.guessing_c, q.language, q.status, q.explanation
		FROM quiz_schema.questions q
		LEFT JOIN quiz_schema.user_question_exposure e
		       ON e.question_id = q.id
		      AND e.user_id = (SELECT user_id FROM quiz_schema.quiz_sessions WHERE id = $2)
		WHERE q.topic_id = $1 AND q.status = 'PUBLISHED'
		  AND q.id NOT IN (
		    SELECT question_id FROM quiz_schema.quiz_session_items WHERE session_id = $2
		  )
		ORDER BY
		  e.last_seen_at NULLS FIRST,
		  random()
		LIMIT 200`,
		topicID, sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Question
	for rows.Next() {
		var q domain.Question
		var choicesJSON []byte
		if err := rows.Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON,
			&q.CorrectIdx, &q.DifficultyB, &q.DiscriminationA, &q.GuessingC,
			&q.Language, &q.Status, &q.Explanation); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(choicesJSON, &q.Choices)
		out = append(out, q)
	}
	return out, rows.Err()
}

// ListAnsweredItemsWithDifficulty returns answered items joined with the full
// per-question IRT triple, ordered by item_idx — used to rebuild the response
// history for the Adaptive Engine's ability re-estimate.
func (s *Store) ListAnsweredItemsWithDifficulty(ctx context.Context, sessionID uuid.UUID) ([]AnsweredItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT i.item_idx, i.is_correct, q.difficulty_b, q.discrimination_a, q.guessing_c
		FROM quiz_schema.quiz_session_items i
		JOIN quiz_schema.questions q ON q.id = i.question_id
		WHERE i.session_id = $1 AND i.is_correct IS NOT NULL
		ORDER BY i.item_idx ASC`, sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AnsweredItem
	for rows.Next() {
		var ai AnsweredItem
		if err := rows.Scan(&ai.ItemIdx, &ai.IsCorrect, &ai.DifficultyB,
			&ai.DiscriminationA, &ai.GuessingC); err != nil {
			return nil, err
		}
		out = append(out, ai)
	}
	return out, rows.Err()
}

// AnsweredItem is the slim view ListAnsweredItemsWithDifficulty returns —
// the full IRT triple (a, b, c) the engine needs for EAP. Avoids hauling
// stem + choices over the wire for every ability recompute.
type AnsweredItem struct {
	ItemIdx         int16
	IsCorrect       bool
	DifficultyB     float32
	DiscriminationA float32
	GuessingC       float32
}

// AnsweredForConcept is the row shape used by ADP's per-answer
// EAP update — joins session_items across all sessions for a
// given (user, concept) pair so the θ estimate uses the student's
// full history on that concept, not just the current session.
type AnsweredForConcept struct {
	QuestionID  uuid.UUID
	IsCorrect   bool
	DifficultyB float32
	TimeMs      int
}

// ListAnsweredForUserConcept returns the user's most recent answered
// items on the given concept (proxied by topic_id today; will become
// concept_id when Quiz adopts the concept dimension natively).
// Ordered chronologically (oldest first) so the caller can pass
// directly to a tail-of-N flow-corridor regulator.
func (s *Store) ListAnsweredForUserConcept(
	ctx context.Context, userID, conceptID uuid.UUID, limit int,
) ([]AnsweredForConcept, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	// Newest-first inside the SQL window, then reverse client-side
	// so the caller sees oldest-first chronological order.
	rows, err := s.pool.Query(ctx, `
		SELECT i.question_id, i.is_correct, q.difficulty_b,
		       COALESCE(EXTRACT(EPOCH FROM (i.answered_at - i.served_at)) * 1000, 0)::int
		  FROM quiz_schema.quiz_session_items i
		  JOIN quiz_schema.questions q ON q.id = i.question_id
		  JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
		 WHERE s.user_id = $1
		   AND s.topic_id = $2
		   AND i.is_correct IS NOT NULL
		 ORDER BY i.answered_at DESC NULLS LAST
		 LIMIT $3`,
		userID, conceptID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AnsweredForConcept, 0, limit)
	for rows.Next() {
		var a AnsweredForConcept
		if err := rows.Scan(&a.QuestionID, &a.IsCorrect, &a.DifficultyB, &a.TimeMs); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Reverse to oldest-first (caller's expected order).
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// PickNextQuestion picks the next question for a session, excluding any already
// served. PRACTICE mode chooses the closest-difficulty question to the session's
// ability estimate; MOCK mode returns questions in difficulty-ascending order.
// Returns ErrQuestionNotFound when the bank is exhausted for this session.
func (s *Store) PickNextQuestion(ctx context.Context, sess domain.Session) (domain.Question, error) {
	var q domain.Question
	var choicesJSON []byte
	var query string
	// Both modes prefer questions this user has never seen, then
	// least-recently seen, before applying mode-specific ordering.
	// `random()` breaks remaining ties so two sessions with identical
	// theta + identical exposure won't pick the same item.
	// Phase 5/7 — include question_type + payload so the /next response
	// can render polymorphic question shapes on first serve. Without
	// these, the freshly-picked CASE_STUDY / NUMERIC / ESSAY items
	// would ship to the client missing their type discriminator and
	// renderer payload, falling back to the legacy MCQ ol+choices path.
	switch sess.Mode {
	case domain.ModeMock:
		query = `
			SELECT q.id, q.topic_id, q.stem, q.choices, q.correct_idx, q.difficulty_b,
			       q.discrimination_a, q.guessing_c, q.language, q.status, q.explanation,
			       COALESCE(q.question_type, 'MCQ_SINGLE'), q.payload
			FROM quiz_schema.questions q
			LEFT JOIN quiz_schema.user_question_exposure e
			       ON e.question_id = q.id
			      AND e.user_id = (SELECT user_id FROM quiz_schema.quiz_sessions WHERE id = $2)
			WHERE q.topic_id = $1 AND q.status = 'PUBLISHED'
			  AND q.id NOT IN (
			    SELECT question_id FROM quiz_schema.quiz_session_items WHERE session_id = $2
			  )
			ORDER BY
			  e.last_seen_at NULLS FIRST,
			  q.difficulty_b ASC,
			  random()
			LIMIT 1`
	default:
		query = `
			SELECT q.id, q.topic_id, q.stem, q.choices, q.correct_idx, q.difficulty_b,
			       q.discrimination_a, q.guessing_c, q.language, q.status, q.explanation,
			       COALESCE(q.question_type, 'MCQ_SINGLE'), q.payload
			FROM quiz_schema.questions q
			LEFT JOIN quiz_schema.user_question_exposure e
			       ON e.question_id = q.id
			      AND e.user_id = (SELECT user_id FROM quiz_schema.quiz_sessions WHERE id = $2)
			WHERE q.topic_id = $1 AND q.status = 'PUBLISHED'
			  AND q.id NOT IN (
			    SELECT question_id FROM quiz_schema.quiz_session_items WHERE session_id = $2
			  )
			ORDER BY
			  e.last_seen_at NULLS FIRST,
			  abs(q.difficulty_b - $3) ASC,
			  random()
			LIMIT 1`
	}

	var row pgx.Row
	if sess.Mode == domain.ModeMock {
		row = s.pool.QueryRow(ctx, query, sess.TopicID, sess.ID)
	} else {
		row = s.pool.QueryRow(ctx, query, sess.TopicID, sess.ID, sess.AbilityEstimate)
	}
	err := row.Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON, &q.CorrectIdx, &q.DifficultyB,
		&q.DiscriminationA, &q.GuessingC, &q.Language, &q.Status, &q.Explanation,
		&q.QuestionType, &q.Payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return q, ErrQuestionNotFound
	}
	if err != nil {
		return q, fmt.Errorf("pick next question: %w", err)
	}
	if err := json.Unmarshal(choicesJSON, &q.Choices); err != nil {
		return q, fmt.Errorf("decode choices: %w", err)
	}
	return q, nil
}

// UserAnsweredItem joins a quiz_session_item with its question + parent session
// for cross-topic analysis. Slimmed to the fields the LLM needs to find patterns.
type UserAnsweredItem struct {
	SessionID   uuid.UUID
	ItemIdx     int16
	QuestionID  uuid.UUID
	TopicID     uuid.UUID
	Stem        string
	AnswerIdx   int16
	CorrectIdx  int16
	IsCorrect   bool
	DifficultyB float32
	AnsweredAt  *time.Time
}

// UserAnsweredItems returns the most recent answered items for a user across
// all their sessions. Used by Adaptive Engine for cross-topic weakness
// diagnosis. Items where answer_idx is NULL (not yet answered) are excluded.
func (s *Store) UserAnsweredItems(ctx context.Context, userID uuid.UUID, limit int) ([]UserAnsweredItem, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT i.session_id, i.item_idx, i.question_id, s.topic_id,
		       q.stem, COALESCE(i.answer_idx, -1) AS answer_idx, q.correct_idx,
		       COALESCE(i.is_correct, false) AS is_correct,
		       q.difficulty_b, i.answered_at
		FROM quiz_schema.quiz_session_items i
		JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
		JOIN quiz_schema.questions q ON q.id = i.question_id
		WHERE s.user_id = $1 AND i.answer_idx IS NOT NULL
		ORDER BY i.answered_at DESC NULLS LAST, i.item_idx DESC
		LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("user answered items: %w", err)
	}
	defer rows.Close()
	var out []UserAnsweredItem
	for rows.Next() {
		var ai UserAnsweredItem
		if err := rows.Scan(
			&ai.SessionID, &ai.ItemIdx, &ai.QuestionID, &ai.TopicID,
			&ai.Stem, &ai.AnswerIdx, &ai.CorrectIdx, &ai.IsCorrect,
			&ai.DifficultyB, &ai.AnsweredAt,
		); err != nil {
			return nil, err
		}
		out = append(out, ai)
	}
	return out, rows.Err()
}

// UserMockSummary aggregates a user's submitted MOCK / MOCK_BLUEPRINT
// sessions into a simple {avgScorePct, nMocks} pair. Used by national-
// rank leaderboard to avoid N HTTP fan-outs.
type UserMockSummary struct {
	UserID      uuid.UUID
	AvgScorePct float64
	NMocks      int
}

// BatchUserMockSummaries returns per-user mock summaries for the given
// list of user IDs. Empty list returns nil immediately.
func (s *Store) BatchUserMockSummaries(
	ctx context.Context,
	userIDs []uuid.UUID,
) ([]UserMockSummary, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT user_id,
		       AVG(correct_count::float / NULLIF(served_count, 0))::float * 100.0 AS avg_pct,
		       COUNT(*)::int AS n_mocks
		  FROM quiz_schema.quiz_sessions
		 WHERE user_id = ANY($1::uuid[])
		   AND mode IN ('MOCK', 'MOCK_BLUEPRINT')
		   AND status = 'SUBMITTED'
		   AND served_count > 0
		 GROUP BY user_id`,
		userIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("batch user mock summaries: %w", err)
	}
	defer rows.Close()
	var out []UserMockSummary
	for rows.Next() {
		var s UserMockSummary
		if err := rows.Scan(&s.UserID, &s.AvgScorePct, &s.NMocks); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SessionItemDetail is the row used by the post-test session deep-dive.
// Carries per-question time + correctness + section so the frontend can
// build a heatmap and section scatter without a second round-trip.
type SessionItemDetail struct {
	ItemIdx     int16
	QuestionID  uuid.UUID
	SectionID   *string
	TimeSeconds *float32
	IsCorrect   *bool
	AnswerIdx   *int16
	CorrectIdx  int16
	DifficultyB float32
	TopicID     uuid.UUID
}

// SessionItemDetails returns the full per-question detail for a session,
// in `item_idx` order. Items not yet answered are included with NULL
// correctness so the heatmap can dim them.
func (s *Store) SessionItemDetails(
	ctx context.Context,
	sessionID uuid.UUID,
) ([]SessionItemDetail, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT i.item_idx, i.question_id, i.section_id,
		       (i.time_spent_ms::real / 1000.0) AS time_seconds,
		       i.is_correct, i.answer_idx,
		       q.correct_idx, q.difficulty_b, q.topic_id
		  FROM quiz_schema.quiz_session_items i
		  JOIN quiz_schema.questions q ON q.id = i.question_id
		 WHERE i.session_id = $1
		 ORDER BY i.item_idx ASC`,
		sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("session item details: %w", err)
	}
	defer rows.Close()
	var out []SessionItemDetail
	for rows.Next() {
		var d SessionItemDetail
		if err := rows.Scan(
			&d.ItemIdx, &d.QuestionID, &d.SectionID,
			&d.TimeSeconds, &d.IsCorrect, &d.AnswerIdx,
			&d.CorrectIdx, &d.DifficultyB, &d.TopicID,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// UserWrongQuestionItem is a flat row used by the mistake-replay flow.
// We only need the question_id (to pre-serve into a new session) and the
// topic_id (to choose a representative topic for the session).
type UserWrongQuestionItem struct {
	QuestionID uuid.UUID
	TopicID    uuid.UUID
}

// UserWrongQuestions returns the most-recent unique wrong-answered questions
// for a user, optionally scoped to a topic. Distinct on question_id so the
// same question doesn't appear twice when the student got it wrong in
// multiple sessions.
//
// sinceDays > 0 filters to mistakes answered within the last N days; 0 is
// "no time filter" (all-time most recent). Used by the Mistake Replay UI's
// "Last 7 days" tab.
func (s *Store) UserWrongQuestions(
	ctx context.Context,
	userID uuid.UUID,
	topicID uuid.UUID,
	limit int,
	sinceDays int,
) ([]UserWrongQuestionItem, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	args := []any{userID, limit}
	topicClause := ""
	sinceClause := ""
	if topicID != uuid.Nil {
		topicClause = " AND s.topic_id = $" + strconv.Itoa(len(args)+1)
		args = append(args, topicID)
	}
	if sinceDays > 0 {
		sinceClause = " AND i.answered_at >= NOW() - ($" + strconv.Itoa(len(args)+1) + " * INTERVAL '1 day')"
		args = append(args, sinceDays)
	}
	q := `
		SELECT DISTINCT ON (i.question_id)
		       i.question_id, s.topic_id
		  FROM quiz_schema.quiz_session_items i
		  JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
		 WHERE s.user_id = $1
		   AND i.is_correct = false
		   AND i.answered_at IS NOT NULL` + topicClause + sinceClause + `
		 ORDER BY i.question_id, i.answered_at DESC
		 LIMIT $2`
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("user wrong questions: %w", err)
	}
	defer rows.Close()
	var out []UserWrongQuestionItem
	for rows.Next() {
		var it UserWrongQuestionItem
		if err := rows.Scan(&it.QuestionID, &it.TopicID); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// SessionListRow is a slim summary row for the user's session history page.
// Topic title is left to the catalog service to resolve client-side; here we
// only return the topic_id so the quiz service stays decoupled.
type SessionListRow struct {
	ID           uuid.UUID
	TopicID      uuid.UUID
	Mode         string
	Strategy     string
	Status       string
	TargetCount  int16
	ServedCount  int16
	CorrectCount int16
	StartedAt    time.Time
	SubmittedAt  *time.Time
	// Sprint 25 (P4-S25) — non-NULL only when Mode == 'MOCK_BLUEPRINT'.
	// Lets the Mocks series page join with /catalog/exam-blueprints
	// client-side without a Quiz→Learning fan-out.
	BlueprintID *uuid.UUID
}

// ListSessionsForUser returns the user's most recent sessions, newest first.
// Default limit 50, capped at 200 — pagination can land later if usage warrants.
//
// Sprint 25 (P4-S25): optional `mode` filter narrows to a single mode
// (e.g. MOCK_BLUEPRINT for the Mocks series view). Empty string preserves
// the historical "all modes" behaviour.
func (s *Store) ListSessionsForUser(
	ctx context.Context,
	userID uuid.UUID,
	limit int,
	mode string,
) ([]SessionListRow, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := `
		SELECT id, topic_id, mode, strategy, status, target_count,
		       served_count, correct_count, started_at, submitted_at,
		       blueprint_id
		FROM quiz_schema.quiz_sessions
		WHERE user_id = $1`
	args := []any{userID}
	if mode != "" {
		query += ` AND mode = $2 ORDER BY started_at DESC LIMIT $3`
		args = append(args, mode, limit)
	} else {
		query += ` ORDER BY started_at DESC LIMIT $2`
		args = append(args, limit)
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	out := make([]SessionListRow, 0, limit)
	for rows.Next() {
		var r SessionListRow
		if err := rows.Scan(
			&r.ID, &r.TopicID, &r.Mode, &r.Strategy, &r.Status,
			&r.TargetCount, &r.ServedCount, &r.CorrectCount,
			&r.StartedAt, &r.SubmittedAt, &r.BlueprintID,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListQuestionsByTopic returns up to `limit` PUBLISHED questions for a topic,
// ordered by id so the result set is stable across calls. Used by Adaptive
// Engine's photo-doubt flow to surface similar problems after OCR.
func (s *Store) ListQuestionsByTopic(ctx context.Context, topicID uuid.UUID, limit int) ([]domain.Question, error) {
	if limit <= 0 {
		limit = 5
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
		       discrimination_a, guessing_c, language, status, explanation
		FROM quiz_schema.questions
		WHERE topic_id = $1 AND status = 'PUBLISHED'
		ORDER BY id ASC
		LIMIT $2`,
		topicID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list questions by topic: %w", err)
	}
	defer rows.Close()
	var out []domain.Question
	for rows.Next() {
		var q domain.Question
		var choicesJSON []byte
		if err := rows.Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON,
			&q.CorrectIdx, &q.DifficultyB, &q.DiscriminationA, &q.GuessingC,
			&q.Language, &q.Status, &q.Explanation); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(choicesJSON, &q.Choices)
		out = append(out, q)
	}
	return out, rows.Err()
}

// CreateSession persists a new session.
func (s *Store) CreateSession(ctx context.Context, sess domain.Session) error {
	// F4 — source_share_slug is NULL for organic sessions; set only when
	// the session was launched from a shared link via the receiver flow.
	var slug any
	if sess.SourceShareSlug != "" {
		slug = sess.SourceShareSlug
	}
	// P6-S54 — intent_anchor defaults to 'match' DB-side; falling
	// through to the column DEFAULT keeps legacy callers safe but the
	// Start handler always normalises this before reaching the store.
	intentAnchor := sess.IntentAnchor
	if intentAnchor == "" {
		intentAnchor = "match"
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.quiz_sessions
		  (id, user_id, tenant_id, topic_id, mode, strategy, status, target_count,
		   served_count, correct_count, ability_estimate, started_at, expires_at,
		   assignment_id, blueprint_id, source_share_slug, intent_anchor, content_language)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
		sess.ID, sess.UserID, sess.TenantID, sess.TopicID, sess.Mode, sess.Strategy,
		sess.Status, sess.TargetCount, sess.ServedCount, sess.CorrectCount,
		sess.AbilityEstimate, sess.StartedAt, sess.ExpiresAt,
		sess.AssignmentID, sess.BlueprintID, slug, intentAnchor, sess.ContentLanguage,
	)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// SetCalibrationFeedback writes the P6-S54 post-session feedback
// (one of "too_easy" | "right" | "too_hard"; the CHECK constraint
// rejects anything else). Caller-side normalisation must run first.
func (s *Store) SetCalibrationFeedback(ctx context.Context, id uuid.UUID, feedback string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE quiz_schema.quiz_sessions
		   SET calibration_feedback = $1
		 WHERE id = $2`,
		feedback, id,
	)
	if err != nil {
		return fmt.Errorf("update calibration_feedback: %w", err)
	}
	return nil
}

// CountSessionsByShareSlug — F4. Used by the Learning service's
// /catalog/exam-blueprints/mine/{id}/stats endpoint to surface
// "N friends took your test" on the author's MyTests row.
func (s *Store) CountSessionsByShareSlug(ctx context.Context, slug string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM quiz_schema.quiz_sessions
		 WHERE source_share_slug = $1`, slug,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count sessions by share slug: %w", err)
	}
	return n, nil
}

// GetSession returns a session by id, or ErrSessionNotFound.
func (s *Store) GetSession(ctx context.Context, id uuid.UUID) (domain.Session, error) {
	var sess domain.Session
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id, COALESCE(tenant_id,''), topic_id, mode, strategy, status,
		       target_count, served_count, correct_count, ability_estimate,
		       started_at, expires_at, submitted_at, assignment_id, blueprint_id,
		       COALESCE(content_language, 'en')
		FROM quiz_schema.quiz_sessions WHERE id = $1`, id,
	).Scan(&sess.ID, &sess.UserID, &sess.TenantID, &sess.TopicID, &sess.Mode, &sess.Strategy,
		&sess.Status, &sess.TargetCount, &sess.ServedCount, &sess.CorrectCount, &sess.AbilityEstimate,
		&sess.StartedAt, &sess.ExpiresAt, &sess.SubmittedAt, &sess.AssignmentID, &sess.BlueprintID,
		&sess.ContentLanguage)
	if errors.Is(err, pgx.ErrNoRows) {
		return sess, ErrSessionNotFound
	}
	return sess, err
}

// ServeQuestionWithSection records (idempotently) that a question has been
// served at itemIdx, with an optional section_id (Sprint 23, P4-S23 — used
// when the session was created from a blueprint composer). Pass empty
// sectionID for the legacy non-blueprint path.
func (s *Store) ServeQuestionWithSection(
	ctx context.Context,
	sessionID uuid.UUID,
	itemIdx int16,
	questionID uuid.UUID,
	sectionID string,
	servedAt time.Time,
) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var sectionArg any
	if sectionID == "" {
		sectionArg = nil
	} else {
		sectionArg = sectionID
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO quiz_schema.quiz_session_items (session_id, item_idx, question_id, served_at, section_id)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (session_id, item_idx) DO NOTHING`,
		sessionID, itemIdx, questionID, servedAt, sectionArg,
	)
	if err != nil {
		return fmt.Errorf("insert item: %w", err)
	}
	if tag.RowsAffected() > 0 {
		if _, err := tx.Exec(ctx,
			`UPDATE quiz_schema.quiz_sessions SET served_count = served_count + 1 WHERE id = $1`,
			sessionID,
		); err != nil {
			return fmt.Errorf("bump served_count: %w", err)
		}
		if err := s.recordExposureTx(ctx, tx, sessionID, questionID, servedAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ServeQuestion records (idempotently) that a question has been served at
// itemIdx. If a row already exists at (session, itemIdx) it is a no-op.
// Bumps served_count when a new row is inserted.
func (s *Store) ServeQuestion(ctx context.Context, sessionID uuid.UUID, itemIdx int16, questionID uuid.UUID, servedAt time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		INSERT INTO quiz_schema.quiz_session_items (session_id, item_idx, question_id, served_at)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (session_id, item_idx) DO NOTHING`,
		sessionID, itemIdx, questionID, servedAt,
	)
	if err != nil {
		return fmt.Errorf("insert item: %w", err)
	}
	if tag.RowsAffected() > 0 {
		if _, err := tx.Exec(ctx,
			`UPDATE quiz_schema.quiz_sessions SET served_count = served_count + 1 WHERE id = $1`,
			sessionID,
		); err != nil {
			return fmt.Errorf("bump served_count: %w", err)
		}
		if err := s.recordExposureTx(ctx, tx, sessionID, questionID, servedAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// recordExposureTx upserts the (user, question) exposure record so the
// cross-session selector can deprioritise items the user has already seen.
// Looks up user_id from the session row; absorbs an absent session
// gracefully (the calling tx is the source of truth).
func (s *Store) recordExposureTx(ctx context.Context, tx pgx.Tx, sessionID, questionID uuid.UUID, servedAt time.Time) error {
	var userID uuid.UUID
	if err := tx.QueryRow(ctx,
		`SELECT user_id FROM quiz_schema.quiz_sessions WHERE id = $1`,
		sessionID,
	).Scan(&userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("lookup session user: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO quiz_schema.user_question_exposure
		  (user_id, question_id, served_count, last_seen_at, first_seen_at)
		VALUES ($1, $2, 1, $3, $3)
		ON CONFLICT (user_id, question_id)
		DO UPDATE SET
		  served_count = quiz_schema.user_question_exposure.served_count + 1,
		  last_seen_at = EXCLUDED.last_seen_at`,
		userID, questionID, servedAt,
	); err != nil {
		return fmt.Errorf("upsert exposure: %w", err)
	}
	return nil
}

// GetItem fetches a specific (session, itemIdx) row.
func (s *Store) GetItem(ctx context.Context, sessionID uuid.UUID, itemIdx int16) (domain.SessionItem, error) {
	var it domain.SessionItem
	err := s.pool.QueryRow(ctx, `
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		FROM quiz_schema.quiz_session_items
		WHERE session_id = $1 AND item_idx = $2`, sessionID, itemIdx,
	).Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID, &it.ServedAt, &it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return it, ErrItemNotFound
	}
	return it, err
}

// GetCurrentItem returns the most recently served, unanswered item, if any.
func (s *Store) GetCurrentItem(ctx context.Context, sessionID uuid.UUID) (domain.SessionItem, bool, error) {
	var it domain.SessionItem
	err := s.pool.QueryRow(ctx, `
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		FROM quiz_schema.quiz_session_items
		WHERE session_id = $1 AND answer_idx IS NULL
		ORDER BY item_idx DESC LIMIT 1`, sessionID,
	).Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID, &it.ServedAt, &it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return it, false, nil
	}
	return it, err == nil, err
}

// ListSessionItems returns every served item for a session, ordered
// by item_idx. Used by Items() to ship the whole pre-served paper
// to the UI in one round-trip.
func (s *Store) ListSessionItems(ctx context.Context, sessionID uuid.UUID) ([]domain.SessionItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		FROM quiz_schema.quiz_session_items
		WHERE session_id = $1
		ORDER BY item_idx ASC`, sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.SessionItem{}
	for rows.Next() {
		var it domain.SessionItem
		if err := rows.Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID,
			&it.ServedAt, &it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// GetFirstUnansweredItem returns the lowest-indexed unanswered item.
// Used by pre-served modes (MOCK_BLUEPRINT / ASSIGNMENT) where the
// player walks the question list in order rather than getting a newly
// served item each tap.
func (s *Store) GetFirstUnansweredItem(ctx context.Context, sessionID uuid.UUID) (domain.SessionItem, bool, error) {
	var it domain.SessionItem
	err := s.pool.QueryRow(ctx, `
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		FROM quiz_schema.quiz_session_items
		WHERE session_id = $1 AND answer_idx IS NULL
		ORDER BY item_idx ASC LIMIT 1`, sessionID,
	).Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID, &it.ServedAt, &it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return it, false, nil
	}
	return it, err == nil, err
}

// GetItemByIdx returns the session_item at position itemIdx, if any.
// Used by pre-served modes so the player can navigate freely via the
// answer-sheet palette ("jump to question 12") without polling /next.
func (s *Store) GetItemByIdx(ctx context.Context, sessionID uuid.UUID, idx int16) (domain.SessionItem, bool, error) {
	var it domain.SessionItem
	err := s.pool.QueryRow(ctx, `
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		FROM quiz_schema.quiz_session_items
		WHERE session_id = $1 AND item_idx = $2`, sessionID, idx,
	).Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID, &it.ServedAt, &it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return it, false, nil
	}
	return it, err == nil, err
}

// GetQuestion fetches a question by id.
func (s *Store) GetQuestion(ctx context.Context, id uuid.UUID) (domain.Question, error) {
	var q domain.Question
	var choicesJSON []byte
	// COALESCE handles environments where the question_type column
	// hasn't been migrated yet (defensive — pre-S38 backfill assumed
	// MCQ_SINGLE for all 480 rows; the column default also handles this).
	// Phase 7 — payload column added in migration 013; NULL for legacy
	// MCQ rows where it carries no extra info.
	err := s.pool.QueryRow(ctx, `
		SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
		       discrimination_a, guessing_c, language, status, explanation,
		       COALESCE(question_type, 'MCQ_SINGLE'),
		       payload
		FROM quiz_schema.questions WHERE id = $1`, id,
	).Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON, &q.CorrectIdx, &q.DifficultyB,
		&q.DiscriminationA, &q.GuessingC, &q.Language, &q.Status, &q.Explanation,
		&q.QuestionType, &q.Payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return q, ErrQuestionNotFound
	}
	if err != nil {
		return q, err
	}
	return q, json.Unmarshal(choicesJSON, &q.Choices)
}

// RecordAnswer stores the answer and (re-)derives session aggregates atomically.
// Idempotent: if an answer already exists for (session, itemIdx) with the same
// answerIdx, returns the prior row unchanged. If a different answerIdx is sent
// for the same item, the original wins (GAP-21 AC-05 — first-write wins).
func (s *Store) RecordAnswer(
	ctx context.Context,
	sessionID uuid.UUID,
	itemIdx int16,
	answerIdx int16,
	isCorrect bool,
	answeredAt time.Time,
	abilityEstimate float32,
) (domain.SessionItem, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return domain.SessionItem{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// CTE returns either the freshly-updated row (with did_update=true) or the
	// pre-existing already-answered row (did_update=false). The sentinel keys
	// the aggregate bump — earlier versions compared answered_at timestamps,
	// which silently broke because Postgres truncates to microseconds while
	// Go's time.Now() is nanoseconds.
	var it domain.SessionItem
	var didUpdate bool
	row := tx.QueryRow(ctx, `
		WITH updated AS (
		  UPDATE quiz_schema.quiz_session_items
		     SET answer_idx = $3, is_correct = $4, answered_at = $5
		   WHERE session_id = $1 AND item_idx = $2 AND answer_idx IS NULL
		   RETURNING session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		)
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at, true AS did_update
		  FROM updated
		UNION ALL
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at, false AS did_update
		  FROM quiz_schema.quiz_session_items
		 WHERE session_id = $1 AND item_idx = $2 AND NOT EXISTS (SELECT 1 FROM updated)
		LIMIT 1`,
		sessionID, itemIdx, answerIdx, isCorrect, answeredAt,
	)
	if err := row.Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID, &it.ServedAt, &it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt, &didUpdate); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return it, ErrItemNotFound
		}
		return it, fmt.Errorf("record answer: %w", err)
	}

	// First-write wins: only bump aggregates when this call actually performed
	// the UPDATE. Re-submissions land in the false branch and are no-ops.
	if didUpdate {
		delta := int16(0)
		if isCorrect {
			delta = 1
		}
		if _, err := tx.Exec(ctx, `
			UPDATE quiz_schema.quiz_sessions
			   SET correct_count = correct_count + $2,
			       ability_estimate = $3
			 WHERE id = $1`,
			sessionID, delta, abilityEstimate,
		); err != nil {
			return it, fmt.Errorf("bump session aggregates: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return it, err
	}
	return it, nil
}

// MarkSubmitted closes a session.
func (s *Store) MarkSubmitted(ctx context.Context, sessionID uuid.UUID, submittedAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE quiz_schema.quiz_sessions
		   SET status = 'SUBMITTED', submitted_at = $2
		 WHERE id = $1 AND status = 'IN_PROGRESS'`,
		sessionID, submittedAt,
	)
	return err
}

// WriteItemDurations computes time_spent_ms for every answered item in a
// session and persists it (Sprint 22, P4-S22). Idempotent: rows already
// carrying a non-NULL time_spent_ms are left alone.
//
// Server-computed (NFR-P4-02 — clients can't tamper). Items where
// answered_at is NULL stay NULL; aggregators skip them.
func (s *Store) WriteItemDurations(ctx context.Context, sessionID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE quiz_schema.quiz_session_items
		   SET time_spent_ms = GREATEST(
		     0,
		     CAST(EXTRACT(EPOCH FROM (answered_at - served_at)) * 1000 AS INTEGER)
		   )
		 WHERE session_id = $1
		   AND answered_at IS NOT NULL
		   AND time_spent_ms IS NULL`,
		sessionID,
	)
	return err
}

// SessionItemEvent is the per-item slice of the NATS payload (Sprint 22).
// Keep the field set narrow — downstream consumers are expected to read
// only what they need.
type SessionItemEvent struct {
	ItemIdx     int16
	QuestionID  uuid.UUID
	TopicID     uuid.UUID
	SectionID   *string
	IsCorrect   bool
	TimeSpentMs int32
}

// LoadItemEvents returns the per-item rows for a session, joining onto
// questions for topic_id (the items table doesn't carry topic_id directly).
// Used by the submit handler to build the NATS payload.
func (s *Store) LoadItemEvents(ctx context.Context, sessionID uuid.UUID) ([]SessionItemEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT i.item_idx, i.question_id, q.topic_id, i.section_id,
		       COALESCE(i.is_correct, false), COALESCE(i.time_spent_ms, 0)
		  FROM quiz_schema.quiz_session_items i
		  JOIN quiz_schema.questions q ON q.id = i.question_id
		 WHERE i.session_id = $1
		 ORDER BY i.item_idx`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SessionItemEvent
	for rows.Next() {
		var ev SessionItemEvent
		if err := rows.Scan(&ev.ItemIdx, &ev.QuestionID, &ev.TopicID, &ev.SectionID, &ev.IsCorrect, &ev.TimeSpentMs); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

// MarkExpired closes any in-progress sessions whose expires_at has passed.
// Useful as a sweeper, and called inline when /next or /submit hits an expired session.
func (s *Store) MarkExpired(ctx context.Context, sessionID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE quiz_schema.quiz_sessions
		   SET status = 'EXPIRED'
		 WHERE id = $1 AND status = 'IN_PROGRESS'`,
		sessionID,
	)
	return err
}

// ListItems returns the served items for a session, ordered by item_idx.
func (s *Store) ListItems(ctx context.Context, sessionID uuid.UUID) ([]domain.SessionItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT session_id, item_idx, question_id, served_at, answer_idx, is_correct, answered_at
		FROM quiz_schema.quiz_session_items
		WHERE session_id = $1
		ORDER BY item_idx ASC`, sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.SessionItem
	for rows.Next() {
		var it domain.SessionItem
		if err := rows.Scan(&it.SessionID, &it.ItemIdx, &it.QuestionID, &it.ServedAt,
			&it.AnswerIdx, &it.IsCorrect, &it.AnsweredAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
