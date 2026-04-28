// Content → Quiz bridge: subscribe to Content's published-question events
// and mirror the row into quiz_schema.questions so the new item is eligible
// for serving in active sessions.
//
// Stream: CONTENT_EVENTS (Content service creates it; we add_stream-idempotent
// here too in case Quiz starts first). Subject: content.question.published.
// Durable consumer: quiz-content-published. AckPolicy = explicit. Idempotent
// upsert by question id, so JetStream's at-least-once redelivery is safe.

package events

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	ContentStreamName               = "CONTENT_EVENTS"
	SubjectContentQuestionPublished = "content.question.published"
	contentDurable                  = "quiz-content-published"
)

// QuestionPublished is the wire payload produced by Content's
// publish_question_published. Field names match the Python emitter.
//
// DiscriminationA / GuessingC are pointers so missing fields (older publishers,
// before Sprint 4) round-trip cleanly to nil — the upsert then falls back to
// the column defaults (1.0 / 0.0).
type QuestionPublished struct {
	ID              string   `json:"id"`
	TopicID         string   `json:"topic_id"`
	Stem            string   `json:"stem"`
	Choices         []string `json:"choices"`
	CorrectIdx      int16    `json:"correct_idx"`
	DifficultyB     float32  `json:"difficulty_b"`
	DiscriminationA *float32 `json:"discrimination_a,omitempty"`
	GuessingC       *float32 `json:"guessing_c,omitempty"`
	Language        string   `json:"language"`
	Explanation     *string  `json:"explanation,omitempty"`
}

// ContentSubscriber owns the JetStream consumer that mirrors content.question.published
// rows into quiz_schema.questions.
type ContentSubscriber struct {
	pool    *pgxpool.Pool
	conn    *nats.Conn
	consCtx jetstream.ConsumeContext
	logger  *slog.Logger
}

// StartContentSubscriber connects to NATS, ensures the stream exists, binds a
// durable consumer, and starts the message handler. On any failure it returns
// nil + an error; main.go logs and continues without the bridge — Content's
// DB row is still the source of truth, so backfill is possible later.
func StartContentSubscriber(natsURL string, pool *pgxpool.Pool, logger *slog.Logger) (*ContentSubscriber, error) {
	conn, err := nats.Connect(natsURL, nats.Timeout(2*time.Second))
	if err != nil {
		return nil, err
	}
	js, err := jetstream.New(conn)
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      ContentStreamName,
		Subjects:  []string{"content.>"},
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
		Replicas:  1,
	})
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}

	cons, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       contentDurable,
		FilterSubject: SubjectContentQuestionPublished,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       60 * time.Second,
		MaxDeliver:    5,
	})
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}

	sub := &ContentSubscriber{pool: pool, conn: conn, logger: logger}
	consCtx, err := cons.Consume(sub.handle)
	if err != nil {
		_ = conn.Drain()
		return nil, err
	}
	sub.consCtx = consCtx
	logger.Info("quiz subscribed to content.question.published", "stream", ContentStreamName, "durable", contentDurable)
	return sub, nil
}

func (s *ContentSubscriber) Close() error {
	if s.consCtx != nil {
		s.consCtx.Stop()
	}
	if s.conn != nil {
		return s.conn.Drain()
	}
	return nil
}

func (s *ContentSubscriber) handle(msg jetstream.Msg) {
	var ev QuestionPublished
	if err := json.Unmarshal(msg.Data(), &ev); err != nil {
		s.logger.Warn("content.question.published bad payload", "err", err)
		// Poison-pill — never redeliver malformed.
		_ = msg.Term()
		return
	}
	if ev.ID == "" || ev.TopicID == "" || ev.Stem == "" || len(ev.Choices) < 2 {
		s.logger.Warn("content.question.published missing fields", "id", ev.ID)
		_ = msg.Term()
		return
	}

	choicesJSON, err := json.Marshal(ev.Choices)
	if err != nil {
		s.logger.Warn("content.question.published choices marshal", "err", err)
		_ = msg.Term()
		return
	}
	lang := ev.Language
	if lang == "" {
		lang = "en"
	}
	// Sprint 4: a/c land in the payload as floats. Pre-Sprint-4 emitters omit
	// them — fall back to neutral defaults (matches the column defaults).
	a := float32(1.0)
	if ev.DiscriminationA != nil {
		a = *ev.DiscriminationA
	}
	c := float32(0.0)
	if ev.GuessingC != nil {
		c = *ev.GuessingC
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Idempotent upsert — same question id may arrive twice under at-least-once.
	// status is forced to PUBLISHED here; Content already gated on its own FSM.
	_, err = s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.questions
		  (id, topic_id, stem, choices, correct_idx, difficulty_b,
		   discrimination_a, guessing_c, language, status, explanation)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PUBLISHED', $10)
		ON CONFLICT (id) DO UPDATE SET
		  stem = EXCLUDED.stem,
		  choices = EXCLUDED.choices,
		  correct_idx = EXCLUDED.correct_idx,
		  difficulty_b = EXCLUDED.difficulty_b,
		  discrimination_a = EXCLUDED.discrimination_a,
		  guessing_c = EXCLUDED.guessing_c,
		  language = EXCLUDED.language,
		  explanation = EXCLUDED.explanation,
		  status = 'PUBLISHED'
	`, ev.ID, ev.TopicID, ev.Stem, choicesJSON, ev.CorrectIdx, ev.DifficultyB, a, c, lang, ev.Explanation)

	if err != nil {
		s.logger.Warn("content.question.published upsert failed", "id", ev.ID, "err", err)
		// Infra failure — nak so JetStream retries with backoff. MaxDeliver caps it.
		if nakErr := msg.NakWithDelay(5 * time.Second); nakErr != nil &&
			!errors.Is(nakErr, nats.ErrConnectionClosed) &&
			!strings.Contains(nakErr.Error(), "msg is no longer valid") {
			s.logger.Warn("content.question.published nak failed", "err", nakErr)
		}
		return
	}

	if err := msg.Ack(); err != nil {
		s.logger.Warn("content.question.published ack failed", "id", ev.ID, "err", err)
	}
	s.logger.Info("quiz mirrored content question", "id", ev.ID, "topic_id", ev.TopicID)
}
