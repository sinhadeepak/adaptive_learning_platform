// Package domain holds the battle aggregate types — matches, players,
// answers, and Glicko-2 ratings. Plain structs; no DB code here.
package domain

import (
	"time"

	"github.com/google/uuid"
)

type MatchMode string

const (
	ModeQuickPlay MatchMode = "QUICK_PLAY"
	ModePrivate  MatchMode = "PRIVATE"
	ModeClan     MatchMode = "CLAN" // F8b
)

type MatchStatus string

const (
	StatusLobby      MatchStatus = "LOBBY"
	StatusStarting   MatchStatus = "STARTING"
	StatusInProgress MatchStatus = "IN_PROGRESS"
	StatusScoring    MatchStatus = "SCORING"
	StatusDone       MatchStatus = "DONE"
	StatusAbandoned  MatchStatus = "ABANDONED"
)

type Match struct {
	ID          uuid.UUID
	Mode        MatchMode
	ExamID      *uuid.UUID
	BlueprintID *uuid.UUID
	Status      MatchStatus
	InviteCode  string
	CreatedAt   time.Time
	StartedAt   *time.Time
	EndedAt     *time.Time
}

type MatchPlayer struct {
	MatchID    uuid.UUID
	UserID     uuid.UUID
	JoinedAt   time.Time
	ReadyAt    *time.Time
	FinalScore *int
	FinalRank  *int16
	EloBefore  *int
	EloAfter   *int
}

type MatchAnswer struct {
	MatchID     uuid.UUID
	UserID      uuid.UUID
	QuestionIdx int16
	PickedIdx   int16
	TimeMs      int
	IsCorrect   bool
	ScoredAt    time.Time
}

// Elo holds the Glicko-2 state for a (user, exam). Stored fields are
// integer rating + RD (Glicko-1 scale); the Glicko-2 algorithm
// converts to/from the µ/φ scale internally.
type Elo struct {
	UserID      uuid.UUID
	ExamID      uuid.UUID
	Rating      int
	RD          int
	Volatility  float64
	NMatches    int
	LastUpdated time.Time
}

// EloBand returns the matchmaking bucket id for a rating. Bands are
// 200 points wide; rating 1500 falls in band 7. Used by the lobby to
// place a queued player into a pool that's likely to match quickly.
func EloBand(rating int) int {
	if rating < 0 {
		rating = 0
	}
	return rating / 200
}
