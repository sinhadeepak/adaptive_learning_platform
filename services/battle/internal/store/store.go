// Package store — persistence layer for battle_schema.
//
// All writes are explicit transactions. Reads can use the pool directly
// because pgxpool implements the Querier interface.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/adaptive-learn/battle/internal/domain"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// ── matches ──────────────────────────────────────────────────────────

func (s *Store) CreateMatch(ctx context.Context, m domain.Match) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO battle_schema.matches
			(id, mode, exam_id, blueprint_id, status, invite_code, created_at)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6,''), $7)`,
		m.ID, string(m.Mode), m.ExamID, m.BlueprintID, string(m.Status), m.InviteCode, m.CreatedAt,
	)
	return err
}

func (s *Store) UpdateMatchStatus(ctx context.Context, id uuid.UUID, status domain.MatchStatus) error {
	now := time.Now().UTC()
	var col string
	switch status {
	case domain.StatusInProgress:
		col = "started_at"
	case domain.StatusDone, domain.StatusAbandoned:
		col = "ended_at"
	}
	q := "UPDATE battle_schema.matches SET status=$1 WHERE id=$2"
	args := []any{string(status), id}
	if col != "" {
		q = fmt.Sprintf("UPDATE battle_schema.matches SET status=$1, %s=$3 WHERE id=$2", col)
		args = append(args, now)
	}
	_, err := s.pool.Exec(ctx, q, args...)
	return err
}

func (s *Store) GetMatch(ctx context.Context, id uuid.UUID) (domain.Match, error) {
	var m domain.Match
	var mode, status, invite string
	err := s.pool.QueryRow(ctx, `
		SELECT id, mode, exam_id, blueprint_id, status,
		       COALESCE(invite_code,''),
		       created_at, started_at, ended_at
		  FROM battle_schema.matches
		 WHERE id=$1`, id).
		Scan(&m.ID, &mode, &m.ExamID, &m.BlueprintID, &status, &invite,
			&m.CreatedAt, &m.StartedAt, &m.EndedAt)
	if err != nil {
		return m, err
	}
	m.Mode = domain.MatchMode(mode)
	m.Status = domain.MatchStatus(status)
	m.InviteCode = invite
	return m, nil
}

// ── match_players ────────────────────────────────────────────────────

func (s *Store) AddPlayer(ctx context.Context, p domain.MatchPlayer) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO battle_schema.match_players (match_id, user_id, joined_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (match_id, user_id) DO NOTHING`,
		p.MatchID, p.UserID, p.JoinedAt,
	)
	return err
}

func (s *Store) FinalizePlayer(ctx context.Context, matchID, userID uuid.UUID, score int, rank int16, eloBefore, eloAfter int) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE battle_schema.match_players
		   SET final_score=$1, final_rank=$2, elo_before=$3, elo_after=$4
		 WHERE match_id=$5 AND user_id=$6`,
		score, rank, eloBefore, eloAfter, matchID, userID,
	)
	return err
}

func (s *Store) ListPlayers(ctx context.Context, matchID uuid.UUID) ([]domain.MatchPlayer, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT match_id, user_id, joined_at, ready_at,
		       final_score, final_rank, elo_before, elo_after
		  FROM battle_schema.match_players
		 WHERE match_id=$1`, matchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.MatchPlayer{}
	for rows.Next() {
		var p domain.MatchPlayer
		if err := rows.Scan(&p.MatchID, &p.UserID, &p.JoinedAt, &p.ReadyAt,
			&p.FinalScore, &p.FinalRank, &p.EloBefore, &p.EloAfter); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── match_answers ────────────────────────────────────────────────────

func (s *Store) RecordAnswer(ctx context.Context, a domain.MatchAnswer) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO battle_schema.match_answers
			(match_id, user_id, question_idx, picked_idx, time_ms, is_correct, scored_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (match_id, user_id, question_idx) DO NOTHING`,
		a.MatchID, a.UserID, a.QuestionIdx, a.PickedIdx, a.TimeMs, a.IsCorrect, a.ScoredAt,
	)
	return err
}

// ── elo ──────────────────────────────────────────────────────────────

func (s *Store) GetElo(ctx context.Context, userID, examID uuid.UUID) (domain.Elo, error) {
	var e domain.Elo
	err := s.pool.QueryRow(ctx, `
		SELECT user_id, exam_id, rating, rd, volatility, n_matches, last_updated
		  FROM battle_schema.elo
		 WHERE user_id=$1 AND exam_id=$2`, userID, examID).
		Scan(&e.UserID, &e.ExamID, &e.Rating, &e.RD, &e.Volatility, &e.NMatches, &e.LastUpdated)
	return e, err
}

// GetOrSeedElo returns the existing ELO or inserts a fresh 1500/350/0.06 row.
func (s *Store) GetOrSeedElo(ctx context.Context, userID, examID uuid.UUID) (domain.Elo, error) {
	e, err := s.GetElo(ctx, userID, examID)
	if err == nil {
		return e, nil
	}
	// Insert default and return.
	_, ierr := s.pool.Exec(ctx, `
		INSERT INTO battle_schema.elo (user_id, exam_id, rating, rd, volatility, n_matches, last_updated)
		VALUES ($1, $2, 1500, 350, 0.06, 0, now())
		ON CONFLICT (user_id, exam_id) DO NOTHING`,
		userID, examID,
	)
	if ierr != nil {
		return e, ierr
	}
	return s.GetElo(ctx, userID, examID)
}

func (s *Store) UpdateElo(ctx context.Context, e domain.Elo) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO battle_schema.elo (user_id, exam_id, rating, rd, volatility, n_matches, last_updated)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (user_id, exam_id) DO UPDATE
		   SET rating=EXCLUDED.rating,
		       rd=EXCLUDED.rd,
		       volatility=EXCLUDED.volatility,
		       n_matches=EXCLUDED.n_matches,
		       last_updated=now()`,
		e.UserID, e.ExamID, e.Rating, e.RD, e.Volatility, e.NMatches,
	)
	return err
}

// ── history (read) ───────────────────────────────────────────────────

type HistoryRow struct {
	MatchID    uuid.UUID
	StartedAt  *time.Time
	EndedAt    *time.Time
	FinalScore *int
	FinalRank  *int16
	EloBefore  *int
	EloAfter   *int
	Opponents  []uuid.UUID
}

func (s *Store) ListUserHistory(ctx context.Context, userID uuid.UUID, limit int) ([]HistoryRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	rows, err := s.pool.Query(ctx, `
		SELECT mp.match_id, m.started_at, m.ended_at,
		       mp.final_score, mp.final_rank, mp.elo_before, mp.elo_after
		  FROM battle_schema.match_players mp
		  JOIN battle_schema.matches m ON m.id = mp.match_id
		 WHERE mp.user_id = $1
		   AND m.status = 'DONE'
		 ORDER BY m.ended_at DESC NULLS LAST
		 LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HistoryRow{}
	for rows.Next() {
		var h HistoryRow
		if err := rows.Scan(&h.MatchID, &h.StartedAt, &h.EndedAt,
			&h.FinalScore, &h.FinalRank, &h.EloBefore, &h.EloAfter); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Hydrate opponents (cheap, one round-trip per match).
	for i := range out {
		opps, _ := s.opponents(ctx, out[i].MatchID, userID)
		out[i].Opponents = opps
	}
	return out, nil
}

func (s *Store) opponents(ctx context.Context, matchID, me uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT user_id FROM battle_schema.match_players
		 WHERE match_id=$1 AND user_id<>$2`, matchID, me)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []uuid.UUID{}
	for rows.Next() {
		var u uuid.UUID
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
