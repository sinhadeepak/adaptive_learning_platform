// Package domain holds the quiz aggregate types.
package domain

import (
	"time"

	"github.com/google/uuid"
)

type Mode string

const (
	ModePractice Mode = "PRACTICE"
	ModeMock     Mode = "MOCK"
	// Sprint 12 S12-D — assignments published from Content land here.
	// Same FSM as PRACTICE for the play loop; difference is at create
	// time (item set is pinned, not adaptive) and at submit time (the
	// quiz.session.completed payload carries `assignment_id` so
	// Content's subscriber can mirror the score into assignment_progress).
	// The cross-service "from-assignment" creator + Content-side
	// subscriber land in Sprint 13.
	ModeAssignment Mode = "ASSIGNMENT"
	// Sprint 23 (P4-S23) — full-length real-pattern mocks composed from
	// alp-learning's exam_blueprints. Same play-loop machinery as
	// ASSIGNMENT (questions pre-served in order); session_items carry
	// section_id from the blueprint composer so the per-section
	// breakdown surfaces correctly post-submit.
	ModeMockBlueprint Mode = "MOCK_BLUEPRINT"
)

type Strategy string

const (
	StrategyIRT          Strategy = "irt"
	StrategyBinarySearch Strategy = "binary_search"
)

type SessionStatus string

const (
	StatusInProgress SessionStatus = "IN_PROGRESS"
	StatusSubmitted  SessionStatus = "SUBMITTED"
	StatusExpired    SessionStatus = "EXPIRED"
)

type Question struct {
	ID              uuid.UUID
	TopicID         uuid.UUID
	Stem            string
	Choices         []string
	CorrectIdx      int16
	DifficultyB     float32
	DiscriminationA float32
	GuessingC       float32
	Language        string
	Status          string
	Explanation     *string
}

type Session struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	TenantID        string
	TopicID         uuid.UUID
	Mode            Mode
	Strategy        Strategy
	Status          SessionStatus
	TargetCount     int16
	ServedCount     int16
	CorrectCount    int16
	AbilityEstimate float32
	StartedAt       time.Time
	ExpiresAt       time.Time
	SubmittedAt     *time.Time
	// Sprint 12 S12-D — when Mode == ASSIGNMENT, this holds the
	// content_schema.assignments id this session was opened from. The
	// quiz.session.completed payload carries it through so Content's
	// subscriber can mirror the score into assignment_progress.
	AssignmentID *uuid.UUID
	// Sprint 23 (P4-S23) — when Mode == MOCK_BLUEPRINT, this holds the
	// catalog_schema.exam_blueprints id this session was composed from.
	BlueprintID *uuid.UUID
}

func (s Session) IsExpired(now time.Time) bool {
	return now.After(s.ExpiresAt)
}

type SessionItem struct {
	SessionID  uuid.UUID
	ItemIdx    int16
	QuestionID uuid.UUID
	ServedAt   time.Time
	AnswerIdx  *int16
	IsCorrect  *bool
	AnsweredAt *time.Time
}

func (i SessionItem) IsAnswered() bool {
	return i.AnswerIdx != nil
}
