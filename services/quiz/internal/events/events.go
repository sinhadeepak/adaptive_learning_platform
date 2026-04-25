// Package events publishes Quiz domain events via NATS JetStream.
//
// Subjects:
//
//	quiz.session.completed — emitted after a session transitions to SUBMITTED.
//	  Consumed by durable JetStream consumers in Analytics + Notification, so
//	  events survive subscriber downtime — Sprint 2 originally used core NATS
//	  pub/sub (at-most-once); Sprint 3 promoted to JetStream per SPIKE-07.
//
// Stream: QUIZ_EVENTS, subjects=[quiz.>], FILE storage, R=1 in local single-
// node and R=3 in staging/prod (config injected via env). Auto-created on
// startup; idempotent (NATS returns the existing stream if config matches).
//
// Best-effort: connection failure logs WARN but never blocks the request —
// the session row is the durable record.
package events

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	SubjectSessionCompleted = "quiz.session.completed"
	StreamName              = "QUIZ_EVENTS"
)

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

// JetStreamPublisher publishes to the QUIZ_EVENTS JetStream stream.
type JetStreamPublisher struct {
	conn   *nats.Conn
	js     jetstream.JetStream
	logger *slog.Logger
}

// Connect opens a NATS connection, ensures QUIZ_EVENTS exists, and returns a
// JetStream-backed publisher. On any failure the no-op publisher is returned
// so the service can still serve traffic.
func Connect(url string, logger *slog.Logger) Publisher {
	conn, err := nats.Connect(url, nats.Timeout(2*time.Second))
	if err != nil {
		logger.Warn("nats.connect_failed", "err", err, "url", url)
		return &noopPublisher{logger: logger}
	}
	js, err := jetstream.New(conn)
	if err != nil {
		logger.Warn("jetstream.new_failed", "err", err)
		_ = conn.Drain()
		return &noopPublisher{logger: logger}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      StreamName,
		Subjects:  []string{"quiz.>"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
		Replicas:  1, // single-node local; staging override via Helm values
		// MaxAge intentionally unset — closed-beta volumes are tiny and the
		// nats-py client serializes max_age in a way the server rejects, so
		// keep config aligned across all 3 services until that's fixed.
	}); err != nil {
		logger.Warn("jetstream.stream_create_failed", "err", err, "stream", StreamName)
		_ = conn.Drain()
		return &noopPublisher{logger: logger}
	}
	logger.Info("jetstream.stream_ready", "stream", StreamName, "url", url)

	return &JetStreamPublisher{conn: conn, js: js, logger: logger}
}

func (p *JetStreamPublisher) PublishSessionCompleted(ctx context.Context, ev SessionCompleted) error {
	buf, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	pubCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	ack, err := p.js.Publish(pubCtx, SubjectSessionCompleted, buf)
	if err != nil {
		p.logger.Warn("jetstream.publish_failed", "subject", SubjectSessionCompleted, "err", err)
		return err
	}
	if errors.Is(err, nats.ErrTimeout) {
		// already handled above; retained as defensive guard
		return err
	}
	p.logger.Debug("jetstream.published", "subject", SubjectSessionCompleted, "stream", ack.Stream, "seq", ack.Sequence, "session", ev.SessionID)
	return nil
}

func (p *JetStreamPublisher) Close() error {
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
