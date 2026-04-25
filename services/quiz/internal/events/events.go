// Package events publishes Quiz domain events to NATS.
//
// Subjects:
//
//	quiz.session.completed — emitted after a session transitions to SUBMITTED.
//	  Consumed by Analytics (EWA mastery + readiness) and Notification (result email).
//
// Best-effort: connection failure logs WARN but never blocks the request — the
// session row is the durable record. Sprint 2 carry-over promotes this to
// JetStream durable streams.
package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
)

const SubjectSessionCompleted = "quiz.session.completed"

// Publisher is the narrow interface SessionService depends on. Tests inject a
// stub; production uses the NATS-backed implementation.
type Publisher interface {
	PublishSessionCompleted(ctx context.Context, ev SessionCompleted) error
	Close() error
}

type SessionCompleted struct {
	SessionID       string    `json:"session_id"`
	UserID          string    `json:"user_id"`
	TenantID        string    `json:"tenant_id,omitempty"`
	TopicID         string    `json:"topic_id"`
	Mode            string    `json:"mode"`
	Strategy        string    `json:"strategy"`
	ServedCount     int16     `json:"served_count"`
	CorrectCount    int16     `json:"correct_count"`
	AbilityEstimate float32   `json:"ability_estimate"`
	Score           float32   `json:"score"`
	SubmittedAt     time.Time `json:"submitted_at"`
	TS              time.Time `json:"ts"`
}

// NATSPublisher publishes to a NATS server. Falls back to no-op if Connect failed.
type NATSPublisher struct {
	conn   *nats.Conn
	logger *slog.Logger
}

// Connect opens a NATS connection. On failure returns a Publisher that logs and
// drops events — the caller should still be able to serve traffic.
func Connect(url string, logger *slog.Logger) Publisher {
	conn, err := nats.Connect(url, nats.Timeout(2*time.Second))
	if err != nil {
		logger.Warn("nats.connect_failed", "err", err, "url", url)
		return &noopPublisher{logger: logger}
	}
	logger.Info("nats.connected", "url", url)
	return &NATSPublisher{conn: conn, logger: logger}
}

func (p *NATSPublisher) PublishSessionCompleted(_ context.Context, ev SessionCompleted) error {
	buf, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	if err := p.conn.Publish(SubjectSessionCompleted, buf); err != nil {
		p.logger.Warn("nats.publish_failed", "subject", SubjectSessionCompleted, "err", err)
		return err
	}
	return nil
}

func (p *NATSPublisher) Close() error {
	return p.conn.Drain()
}

type noopPublisher struct {
	logger *slog.Logger
}

func (n *noopPublisher) PublishSessionCompleted(_ context.Context, ev SessionCompleted) error {
	n.logger.Debug("nats.noop_publish", "subject", SubjectSessionCompleted, "session", ev.SessionID)
	return nil
}

func (n *noopPublisher) Close() error { return nil }
