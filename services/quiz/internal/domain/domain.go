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
