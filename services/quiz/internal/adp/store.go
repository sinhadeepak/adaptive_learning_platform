// ADP storage layer — concept_ability + flow_corridor_events +
// question_calibration. All three live in quiz_schema next to the
// session machinery so the ADP path stays a single-service read.
package adp

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store is the data-access layer for the ADP tables. Initialised once
// per process with a pgxpool.Pool.
type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// ── concept_ability ────────────────────────────────────────────────

// Ability is the persisted θ + SE for a (user, concept).
type Ability struct {
	UserID        uuid.UUID
	ConceptID     uuid.UUID
	Theta         float64
	SE            float64
	NAttempts     int
	NCorrect      int
	LastUpdatedAt time.Time
}

// GetAbility returns the persisted (user, concept) θ. Returns
// (defaultAbility, false, nil) on cold-start so the caller can
// treat the no-row case as "start at θ=0, SE=1".
func (s *Store) GetAbility(
	ctx context.Context, userID, conceptID uuid.UUID,
) (Ability, bool, error) {
	a := Ability{
		UserID:    userID,
		ConceptID: conceptID,
		Theta:     0.0,
		SE:        1.0,
	}
	err := s.pool.QueryRow(ctx, `
		SELECT theta, se, n_attempts, n_correct, last_updated_at
		  FROM quiz_schema.concept_ability
		 WHERE user_id = $1 AND concept_id = $2
	`, userID, conceptID).Scan(
		&a.Theta, &a.SE, &a.NAttempts, &a.NCorrect, &a.LastUpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, false, nil
	}
	if err != nil {
		return a, false, err
	}
	return a, true, nil
}

// UpsertAbility writes the new θ + SE after a question is answered.
// Uses ON CONFLICT so the per-question update is one round-trip.
func (s *Store) UpsertAbility(ctx context.Context, a Ability) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.concept_ability
			(user_id, concept_id, theta, se, n_attempts, n_correct, last_updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (user_id, concept_id) DO UPDATE
		SET theta = EXCLUDED.theta,
		    se = EXCLUDED.se,
		    n_attempts = EXCLUDED.n_attempts,
		    n_correct = EXCLUDED.n_correct,
		    last_updated_at = now()
	`, a.UserID, a.ConceptID, a.Theta, a.SE, a.NAttempts, a.NCorrect)
	return err
}

// ── question_calibration ───────────────────────────────────────────

// Calibration holds the 3PL parameters for one question. The
// session-item history feeds into these via the nightly recalibrate
// job; the read path is hot (every pickNext) so it must stay
// indexed.
type Calibration struct {
	QuestionID uuid.UUID
	B          float64
	A          float64
	C          float64
	NAttempts  int
	NCorrect   int
}

// LoadCalibrations returns the calibration rows for the given
// question IDs. Missing rows get filled with the platform default
// (b=0, a=1, c=0, n=0) — same as a freshly-created item.
func (s *Store) LoadCalibrations(
	ctx context.Context, questionIDs []uuid.UUID,
) (map[uuid.UUID]Calibration, error) {
	out := make(map[uuid.UUID]Calibration, len(questionIDs))
	if len(questionIDs) == 0 {
		return out, nil
	}
	// Default fill first.
	for _, qid := range questionIDs {
		out[qid] = Calibration{
			QuestionID: qid, B: 0.0, A: 1.0, C: 0.0,
		}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT question_id, b_estimate, a_estimate, c_estimate,
		       n_attempts, n_correct
		  FROM quiz_schema.question_calibration
		 WHERE question_id = ANY($1)
	`, questionIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c Calibration
		if err := rows.Scan(
			&c.QuestionID, &c.B, &c.A, &c.C, &c.NAttempts, &c.NCorrect,
		); err != nil {
			return nil, err
		}
		out[c.QuestionID] = c
	}
	return out, rows.Err()
}

// UpsertCalibration writes the refined per-question parameters. Used
// by the nightly recalibrate job + the per-answer fast-path that
// just bumps n_attempts / n_correct.
func (s *Store) UpsertCalibration(ctx context.Context, c Calibration) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.question_calibration
			(question_id, b_estimate, a_estimate, c_estimate,
			 n_attempts, n_correct, last_calibrated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (question_id) DO UPDATE
		SET b_estimate = EXCLUDED.b_estimate,
		    a_estimate = EXCLUDED.a_estimate,
		    c_estimate = EXCLUDED.c_estimate,
		    n_attempts = EXCLUDED.n_attempts,
		    n_correct = EXCLUDED.n_correct,
		    last_calibrated_at = now()
	`, c.QuestionID, c.B, c.A, c.C, c.NAttempts, c.NCorrect)
	return err
}

// BumpCalibrationCounts is the hot-path per-answer update. It only
// touches the counts (n_attempts, n_correct); the IRT params get
// re-fit by the nightly recalibrate job rather than per-answer.
func (s *Store) BumpCalibrationCounts(
	ctx context.Context, questionID uuid.UUID, correct bool,
) error {
	delta := 0
	if correct {
		delta = 1
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.question_calibration
			(question_id, n_attempts, n_correct, last_calibrated_at)
		VALUES ($1, 1, $2, now())
		ON CONFLICT (question_id) DO UPDATE
		SET n_attempts = quiz_schema.question_calibration.n_attempts + 1,
		    n_correct  = quiz_schema.question_calibration.n_correct  + $2
	`, questionID, delta)
	return err
}

// ── flow_corridor_events ───────────────────────────────────────────

// LogFlowEvent records a frustration / boredom transition so the
// ADP debugger can replay why the difficulty was nudged.
func (s *Store) LogFlowEvent(
	ctx context.Context,
	userID, conceptID uuid.UUID,
	eventType, correctionApplied, rationale string,
) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.flow_corridor_events
			(user_id, concept_id, event_type, triggered_at,
			 correction_applied, rationale)
		VALUES ($1, $2, $3, now(), NULLIF($4, ''), $5)
	`, userID, conceptID, eventType, correctionApplied, rationale)
	return err
}
