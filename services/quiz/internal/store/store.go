// Package store maps the quiz aggregate to Postgres.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	rows, err := s.pool.Query(ctx, `
		SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
		       discrimination_a, guessing_c, language, status, explanation
		FROM quiz_schema.questions
		WHERE topic_id = $1 AND status = 'PUBLISHED'
		  AND id NOT IN (
		    SELECT question_id FROM quiz_schema.quiz_session_items WHERE session_id = $2
		  )`,
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

// PickNextQuestion picks the next question for a session, excluding any already
// served. PRACTICE mode chooses the closest-difficulty question to the session's
// ability estimate; MOCK mode returns questions in difficulty-ascending order.
// Returns ErrQuestionNotFound when the bank is exhausted for this session.
func (s *Store) PickNextQuestion(ctx context.Context, sess domain.Session) (domain.Question, error) {
	var q domain.Question
	var choicesJSON []byte
	var query string
	switch sess.Mode {
	case domain.ModeMock:
		query = `
			SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
			       discrimination_a, guessing_c, language, status, explanation
			FROM quiz_schema.questions
			WHERE topic_id = $1 AND status = 'PUBLISHED'
			  AND id NOT IN (
			    SELECT question_id FROM quiz_schema.quiz_session_items WHERE session_id = $2
			  )
			ORDER BY difficulty_b ASC, id ASC
			LIMIT 1`
	default:
		query = `
			SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
			       discrimination_a, guessing_c, language, status, explanation
			FROM quiz_schema.questions
			WHERE topic_id = $1 AND status = 'PUBLISHED'
			  AND id NOT IN (
			    SELECT question_id FROM quiz_schema.quiz_session_items WHERE session_id = $2
			  )
			ORDER BY abs(difficulty_b - $3) ASC, id ASC
			LIMIT 1`
	}

	var row pgx.Row
	if sess.Mode == domain.ModeMock {
		row = s.pool.QueryRow(ctx, query, sess.TopicID, sess.ID)
	} else {
		row = s.pool.QueryRow(ctx, query, sess.TopicID, sess.ID, sess.AbilityEstimate)
	}
	err := row.Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON, &q.CorrectIdx, &q.DifficultyB,
		&q.DiscriminationA, &q.GuessingC, &q.Language, &q.Status, &q.Explanation)
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
}

// ListSessionsForUser returns the user's most recent sessions, newest first.
// Default limit 50, capped at 200 — pagination can land later if usage warrants.
func (s *Store) ListSessionsForUser(ctx context.Context, userID uuid.UUID, limit int) ([]SessionListRow, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, topic_id, mode, strategy, status, target_count,
		       served_count, correct_count, started_at, submitted_at
		FROM quiz_schema.quiz_sessions
		WHERE user_id = $1
		ORDER BY started_at DESC
		LIMIT $2`,
		userID, limit,
	)
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
			&r.StartedAt, &r.SubmittedAt,
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
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.quiz_sessions
		  (id, user_id, tenant_id, topic_id, mode, strategy, status, target_count,
		   served_count, correct_count, ability_estimate, started_at, expires_at,
		   assignment_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		sess.ID, sess.UserID, sess.TenantID, sess.TopicID, sess.Mode, sess.Strategy,
		sess.Status, sess.TargetCount, sess.ServedCount, sess.CorrectCount,
		sess.AbilityEstimate, sess.StartedAt, sess.ExpiresAt,
		sess.AssignmentID,
	)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// GetSession returns a session by id, or ErrSessionNotFound.
func (s *Store) GetSession(ctx context.Context, id uuid.UUID) (domain.Session, error) {
	var sess domain.Session
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id, COALESCE(tenant_id,''), topic_id, mode, strategy, status,
		       target_count, served_count, correct_count, ability_estimate,
		       started_at, expires_at, submitted_at, assignment_id
		FROM quiz_schema.quiz_sessions WHERE id = $1`, id,
	).Scan(&sess.ID, &sess.UserID, &sess.TenantID, &sess.TopicID, &sess.Mode, &sess.Strategy,
		&sess.Status, &sess.TargetCount, &sess.ServedCount, &sess.CorrectCount, &sess.AbilityEstimate,
		&sess.StartedAt, &sess.ExpiresAt, &sess.SubmittedAt, &sess.AssignmentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return sess, ErrSessionNotFound
	}
	return sess, err
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
	}
	return tx.Commit(ctx)
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

// GetQuestion fetches a question by id.
func (s *Store) GetQuestion(ctx context.Context, id uuid.UUID) (domain.Question, error) {
	var q domain.Question
	var choicesJSON []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
		       discrimination_a, guessing_c, language, status, explanation
		FROM quiz_schema.questions WHERE id = $1`, id,
	).Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON, &q.CorrectIdx, &q.DifficultyB,
		&q.DiscriminationA, &q.GuessingC, &q.Language, &q.Status, &q.Explanation)
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
